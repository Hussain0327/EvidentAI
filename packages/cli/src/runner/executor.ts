/**
 * Test Executor
 *
 * Orchestrates the execution of test suites:
 * 1. Loads configuration and test cases
 * 2. Calls LLM providers to generate responses
 * 3. Runs evaluators on responses
 * 4. Aggregates results and determines pass/fail
 *
 * Features:
 * - Concurrent test execution with configurable parallelism
 * - Retry logic for transient failures
 * - Progress reporting
 * - Result aggregation and threshold checking
 */

import type {
  Config,
  Suite,
  TestCase,
  ProviderConfig,
  EvaluatorResult,
} from '../config/types';
import { runEvaluator, type EvaluatorContext } from './evaluators';
import { APIError, createProvider, type LLMProvider } from './providers';

// =============================================================================
// Types
// =============================================================================

export interface TestCaseResult {
  id: string;
  name: string;
  input: string;
  output: string;
  expected?: string | string[];
  evaluator: string;
  result: EvaluatorResult;
  latencyMs: number;
  timestamp: string;
  retries: number;
}

export interface SuiteResult {
  name: string;
  description?: string;
  testCases: TestCaseResult[];
  passed: number;
  failed: number;
  total: number;
  passRate: number;
  averageScore: number;
  averageLatencyMs: number;
  durationMs: number;
}

export interface RunResult {
  project: string;
  runId: string;
  suites: SuiteResult[];
  passed: number;
  failed: number;
  total: number;
  passRate: number;
  averageScore: number;
  thresholdsResult: ThresholdsResult;
  durationMs: number;
  timestamp: string;
}

export interface ThresholdsResult {
  passed: boolean;
  checks: {
    name: string;
    threshold: number;
    actual: number;
    passed: boolean;
  }[];
}

export interface ExecutorOptions {
  concurrency?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  verbose?: boolean;
  onProgress?: (progress: ProgressEvent) => void;
}

export interface ProgressEvent {
  type: 'suite_start' | 'suite_end' | 'test_start' | 'test_end';
  suite?: string;
  testCase?: string;
  current: number;
  total: number;
  passed?: boolean;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate a unique run ID
 */
function generateRunId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `run_${timestamp}_${random}`;
}

/**
 * Add jitter to delay to prevent thundering herd
 * Returns delay +/- 25% randomization
 */
function addJitter(delayMs: number): number {
  const jitterFactor = 0.5; // +/- 25%
  const jitter = delayMs * jitterFactor * (Math.random() - 0.5);
  return Math.max(0, delayMs + jitter);
}

/**
 * Execute with enhanced retry logic
 * - Exponential backoff with jitter
 * - Non-retryable error detection (400, 401, 403, 404)
 * - Extended delay for rate limits (429)
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  delayMs: number,
  context?: string
): Promise<{ result: T; retries: number }> {
  let lastError: Error | null = null;
  let retries = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      return { result, retries };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      retries = attempt + 1;

      // Check if error is retryable
      if (lastError instanceof APIError && !lastError.isRetryable()) {
        // Non-retryable error (400, 401, 403, 404) - fail fast
        const contextStr = context ? ` [${context}]` : '';
        throw new Error(
          `${lastError.message}${contextStr} (non-retryable, attempt ${retries}/${maxRetries + 1})`
        );
      }

      if (attempt < maxRetries) {
        // Calculate delay with exponential backoff and jitter
        let delay = delayMs * Math.pow(2, attempt);

        let retryAfterMs: number | undefined;
        if (lastError instanceof APIError) {
          delay *= lastError.getDelayMultiplier();
          retryAfterMs = lastError.retryAfterMs;
        }

        // Add jitter to prevent thundering herd
        const baseDelay = retryAfterMs ? Math.max(delay, retryAfterMs) : delay;
        const jittered = addJitter(baseDelay);
        const finalDelay = retryAfterMs ? Math.max(jittered, retryAfterMs) : jittered;

        await sleep(finalDelay);
      }
    }
  }

  // Enhance error message with retry context
  const contextStr = context ? ` [${context}]` : '';
  const message = lastError?.message || 'Unknown error';
  throw new Error(`${message}${contextStr} (after ${retries} attempts)`);
}

/**
 * Run promises with limited concurrency
 */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = [];
  const executing: Promise<void>[] = [];

  for (const task of tasks) {
    const promise = task().then((result) => {
      results.push(result);
    });

    executing.push(promise);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
      // Remove completed promises
      executing.splice(
        0,
        executing.length,
        ...executing.filter((p) => {
          // This is a bit hacky but works for Promise.race cleanup
          let resolved = false;
          p.then(() => (resolved = true)).catch(() => (resolved = true));
          return !resolved;
        })
      );
    }
  }

  await Promise.all(executing);
  return results;
}

/**
 * Extract expected value from a test case (handles discriminated union)
 */
function getExpected(testCase: TestCase): string | string[] | undefined {
  if ('expected' in testCase) {
    return testCase.expected;
  }
  return undefined;
}

/**
 * Extract criteria from a test case (handles discriminated union)
 */
function getCriteria(testCase: TestCase): string | undefined {
  if ('criteria' in testCase) {
    return testCase.criteria;
  }
  return undefined;
}

/**
 * Extract config from a test case
 */
function getConfig(testCase: TestCase): Record<string, unknown> | undefined {
  if ('config' in testCase && testCase.config) {
    return testCase.config as Record<string, unknown>;
  }
  return undefined;
}

// =============================================================================
// Test Executor Class
// =============================================================================

export class Executor {
  private config: Config;
  private provider: LLMProvider;
  private options: Required<ExecutorOptions>;

  constructor(config: Config, options: ExecutorOptions = {}) {
    this.config = config;
    this.options = {
      concurrency: options.concurrency ?? 5,
      maxRetries: options.maxRetries ?? 3,
      retryDelayMs: options.retryDelayMs ?? 1000,
      timeoutMs: options.timeoutMs ?? 60000,
      verbose: options.verbose ?? false,
      onProgress: options.onProgress ?? (() => {}),
    };
    // Pass timeout to provider so fetch calls respect it
    this.provider = createProvider(config.provider, this.options.timeoutMs);
  }

  /**
   * Execute all test suites
   */
  async run(): Promise<RunResult> {
    const startTime = Date.now();
    const runId = generateRunId();
    const suiteResults: SuiteResult[] = [];

    let totalPassed = 0;
    let totalFailed = 0;
    let totalTests = 0;

    for (const suite of this.config.suites) {
      const suiteResult = await this.runSuite(suite);
      suiteResults.push(suiteResult);

      totalPassed += suiteResult.passed;
      totalFailed += suiteResult.failed;
      totalTests += suiteResult.total;
    }

    const passRate = totalTests > 0 ? totalPassed / totalTests : 0;
    const averageScore =
      suiteResults.reduce((sum, s) => sum + s.averageScore * s.total, 0) / totalTests || 0;

    // Check thresholds
    const thresholdsResult = this.checkThresholds(
      passRate,
      averageScore,
      suiteResults
    );

    return {
      project: this.config.project.name,
      runId,
      suites: suiteResults,
      passed: totalPassed,
      failed: totalFailed,
      total: totalTests,
      passRate,
      averageScore,
      thresholdsResult,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Execute a single test suite
   */
  private async runSuite(suite: Suite): Promise<SuiteResult> {
    const startTime = Date.now();

    this.options.onProgress({
      type: 'suite_start',
      suite: suite.name,
      current: 0,
      total: suite.cases.length,
    });

    // Create tasks for concurrent execution
    const tasks = suite.cases.map((testCase, index) => async () => {
      this.options.onProgress({
        type: 'test_start',
        suite: suite.name,
        testCase: testCase.name,
        current: index + 1,
        total: suite.cases.length,
      });

      const result = await this.runTestCase(testCase, suite);

      this.options.onProgress({
        type: 'test_end',
        suite: suite.name,
        testCase: testCase.name,
        current: index + 1,
        total: suite.cases.length,
        passed: result.result.passed,
      });

      return result;
    });

    // Run with concurrency limit
    const testResults = await runWithConcurrency(tasks, this.options.concurrency);

    const passed = testResults.filter((r) => r.result.passed).length;
    const failed = testResults.length - passed;
    const passRate = testResults.length > 0 ? passed / testResults.length : 0;
    const averageScore =
      testResults.reduce((sum, r) => sum + r.result.score, 0) / testResults.length || 0;
    const averageLatencyMs =
      testResults.reduce((sum, r) => sum + r.latencyMs, 0) / testResults.length || 0;

    this.options.onProgress({
      type: 'suite_end',
      suite: suite.name,
      current: suite.cases.length,
      total: suite.cases.length,
    });

    return {
      name: suite.name,
      description: suite.description,
      testCases: testResults,
      passed,
      failed,
      total: testResults.length,
      passRate,
      averageScore,
      averageLatencyMs,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Execute a single test case
   */
  private async runTestCase(testCase: TestCase, suite: Suite): Promise<TestCaseResult> {
    const id = `${suite.name}::${testCase.name}`.replace(/\s+/g, '_').toLowerCase();
    const startTime = Date.now();
    const expected = getExpected(testCase);

    let output: string;
    let retries = 0;

    try {
      // Call LLM provider with retry logic
      // Context includes test name for better error messages
      const llmResult = await withRetry(
        () => this.provider.call(testCase.input),
        this.options.maxRetries,
        this.options.retryDelayMs,
        testCase.name || `test-${id}`
      );
      output = llmResult.result;
      retries = llmResult.retries;
    } catch (error) {
      // LLM call failed after retries
      return {
        id,
        name: testCase.name,
        input: testCase.input,
        output: '',
        expected,
        evaluator: testCase.evaluator,
        result: {
          passed: false,
          score: 0,
          reason: `LLM call failed: ${error instanceof Error ? error.message : String(error)}`,
        },
        latencyMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        retries: this.options.maxRetries,
      };
    }

    // Build evaluator context
    const evalContext: EvaluatorContext = {
      input: testCase.input,
      output,
      expected,
      criteria: getCriteria(testCase),
      config: getConfig(testCase),
    };

    // Run evaluator
    let result: EvaluatorResult;
    try {
      result = await runEvaluator(testCase.evaluator, evalContext);
    } catch (error) {
      result = {
        passed: false,
        score: 0,
        reason: `Evaluator error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    return {
      id,
      name: testCase.name,
      input: testCase.input,
      output,
      expected,
      evaluator: testCase.evaluator,
      result,
      latencyMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      retries,
    };
  }

  /**
   * Check if results meet configured thresholds
   */
  private checkThresholds(
    passRate: number,
    averageScore: number,
    suiteResults: SuiteResult[]
  ): ThresholdsResult {
    const thresholds = this.config.thresholds;
    const checks: ThresholdsResult['checks'] = [];

    if (!thresholds) {
      return { passed: true, checks: [] };
    }

    // Global pass rate
    if (thresholds.pass_rate !== undefined) {
      checks.push({
        name: 'pass_rate',
        threshold: thresholds.pass_rate,
        actual: passRate,
        passed: passRate >= thresholds.pass_rate,
      });
    }

    // Global average score
    if (thresholds.average_score !== undefined) {
      checks.push({
        name: 'average_score',
        threshold: thresholds.average_score,
        actual: averageScore,
        passed: averageScore >= thresholds.average_score,
      });
    }

    // Per-suite thresholds
    if (thresholds.per_suite) {
      for (const [suiteName, suiteThreshold] of Object.entries(thresholds.per_suite)) {
        const suiteResult = suiteResults.find((s) => s.name === suiteName);
        if (suiteResult && suiteThreshold) {
          if (suiteThreshold.pass_rate !== undefined) {
            checks.push({
              name: `${suiteName}.pass_rate`,
              threshold: suiteThreshold.pass_rate,
              actual: suiteResult.passRate,
              passed: suiteResult.passRate >= suiteThreshold.pass_rate,
            });
          }
          if (suiteThreshold.average_score !== undefined) {
            checks.push({
              name: `${suiteName}.average_score`,
              threshold: suiteThreshold.average_score,
              actual: suiteResult.averageScore,
              passed: suiteResult.averageScore >= suiteThreshold.average_score,
            });
          }
        }
      }
    }

    return {
      passed: checks.length === 0 || checks.every((c) => c.passed),
      checks,
    };
  }
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Execute tests from a config object
 */
export async function execute(
  config: Config,
  options?: ExecutorOptions
): Promise<RunResult> {
  const executor = new Executor(config, options);
  return executor.run();
}

/**
 * Execute a single test case directly (for testing/debugging)
 */
export async function executeSingleTest(
  provider: ProviderConfig,
  testCase: TestCase
): Promise<TestCaseResult | undefined> {
  const config: Config = {
    version: '1',
    project: { name: 'single-test' },
    provider,
    suites: [
      {
        name: 'single',
        cases: [testCase],
      },
    ],
  };

  const result = await execute(config);
  return result.suites[0]?.testCases[0];
}
