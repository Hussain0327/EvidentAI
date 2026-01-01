/**
 * Run Command
 *
 * The main CLI entrypoint for executing test suites.
 * Usage: releasegate run [options]
 *
 * Features:
 * - Config file discovery and loading
 * - Test execution with progress reporting
 * - Multiple output formats (JSON, TAP, JUnit)
 * - CI/CD integration with exit codes
 * - Result uploading to ReleaseGate cloud
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from '../config/loader';
import { execute, type RunResult, type ProgressEvent } from '../runner/executor';

// =============================================================================
// Types
// =============================================================================

interface RunOptions {
  config?: string;
  suite?: string[];
  concurrency?: string;
  timeout?: string;
  verbose?: boolean;
  quiet?: boolean;
  output?: string;
  format?: 'json' | 'tap' | 'junit' | 'pretty';
  upload?: boolean;
  noThresholds?: boolean;
  dryRun?: boolean;
}

// =============================================================================
// Output Formatters
// =============================================================================

/**
 * Format results as JSON
 */
function formatJSON(result: RunResult): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Format results as TAP (Test Anything Protocol)
 */
function formatTAP(result: RunResult): string {
  const lines: string[] = [];
  lines.push(`TAP version 14`);
  lines.push(`1..${result.total}`);

  let testNum = 1;
  for (const suite of result.suites) {
    lines.push(`# Suite: ${suite.name}`);
    for (const testCase of suite.testCases) {
      const status = testCase.result.passed ? 'ok' : 'not ok';
      lines.push(`${status} ${testNum} - ${suite.name}::${testCase.name}`);
      if (!testCase.result.passed) {
        lines.push(`  ---`);
        lines.push(`  reason: ${testCase.result.reason}`);
        lines.push(`  score: ${testCase.result.score}`);
        lines.push(`  ...`);
      }
      testNum++;
    }
  }

  lines.push(`# Tests: ${result.total}`);
  lines.push(`# Pass: ${result.passed}`);
  lines.push(`# Fail: ${result.failed}`);
  lines.push(`# Pass Rate: ${(result.passRate * 100).toFixed(1)}%`);

  return lines.join('\n');
}

/**
 * Format results as JUnit XML
 */
function formatJUnit(result: RunResult): string {
  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(`<testsuites name="${result.project}" tests="${result.total}" failures="${result.failed}" time="${(result.durationMs / 1000).toFixed(3)}">`);

  for (const suite of result.suites) {
    const failures = suite.testCases.filter((t) => !t.result.passed).length;
    lines.push(`  <testsuite name="${escapeXml(suite.name)}" tests="${suite.total}" failures="${failures}" time="${(suite.durationMs / 1000).toFixed(3)}">`);

    for (const testCase of suite.testCases) {
      lines.push(`    <testcase name="${escapeXml(testCase.name)}" classname="${escapeXml(suite.name)}" time="${(testCase.latencyMs / 1000).toFixed(3)}">`);
      if (!testCase.result.passed) {
        lines.push(`      <failure message="${escapeXml(testCase.result.reason)}">`);
        lines.push(`Score: ${testCase.result.score}`);
        if (testCase.result.details) {
          lines.push(`Details: ${JSON.stringify(testCase.result.details)}`);
        }
        lines.push(`      </failure>`);
      }
      lines.push(`    </testcase>`);
    }

    lines.push(`  </testsuite>`);
  }

  lines.push(`</testsuites>`);
  return lines.join('\n');
}

/**
 * Format results as pretty console output
 */
function formatPretty(result: RunResult): string {
  const lines: string[] = [];
  const passed = result.thresholdsResult.passed;
  const statusEmoji = passed ? '✅' : '❌';
  const statusText = passed ? 'PASSED' : 'FAILED';

  lines.push('');
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`  ${statusEmoji} ReleaseGate Results: ${statusText}`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push('');

  // Summary
  lines.push(`  Project:    ${result.project}`);
  lines.push(`  Run ID:     ${result.runId}`);
  lines.push(`  Duration:   ${(result.durationMs / 1000).toFixed(2)}s`);
  lines.push('');

  // Overall stats
  lines.push(`  Tests:      ${result.passed}/${result.total} passed (${(result.passRate * 100).toFixed(1)}%)`);
  lines.push(`  Avg Score:  ${(result.averageScore * 100).toFixed(1)}%`);
  lines.push('');

  // Suite breakdown
  lines.push(`  Suites:`);
  for (const suite of result.suites) {
    const suiteStatus = suite.failed === 0 ? '✓' : '✗';
    lines.push(`    ${suiteStatus} ${suite.name}: ${suite.passed}/${suite.total} passed`);

    // Show failed tests
    const failedTests = suite.testCases.filter((t) => !t.result.passed);
    for (const test of failedTests) {
      lines.push(`      ✗ ${test.name}`);
      lines.push(`        Reason: ${test.result.reason}`);
    }
  }
  lines.push('');

  // Thresholds
  if (result.thresholdsResult.checks.length > 0) {
    lines.push(`  Thresholds:`);
    for (const check of result.thresholdsResult.checks) {
      const checkStatus = check.passed ? '✓' : '✗';
      lines.push(`    ${checkStatus} ${check.name}: ${(check.actual * 100).toFixed(1)}% (threshold: ${(check.threshold * 100).toFixed(1)}%)`);
    }
    lines.push('');
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// =============================================================================
// Progress Reporter
// =============================================================================

class ProgressReporter {
  private verbose: boolean;
  private quiet: boolean;
  private startTime: number;

  constructor(verbose: boolean, quiet: boolean) {
    this.verbose = verbose;
    this.quiet = quiet;
    this.startTime = Date.now();
  }

  onProgress(event: ProgressEvent): void {
    if (this.quiet) return;

    switch (event.type) {
      case 'suite_start':
        console.log(`\n▶ Suite: ${event.suite}`);
        break;

      case 'test_end':
        if (this.verbose || !event.passed) {
          const status = event.passed ? '✓' : '✗';
          const color = event.passed ? '\x1b[32m' : '\x1b[31m';
          const reset = '\x1b[0m';
          console.log(`  ${color}${status}${reset} ${event.testCase} (${event.current}/${event.total})`);
        } else {
          // Simple progress indicator
          process.stdout.write('.');
        }
        break;

      case 'suite_end':
        if (!this.verbose) {
          console.log(''); // New line after dots
        }
        break;
    }
  }

  log(message: string): void {
    if (!this.quiet) {
      console.log(message);
    }
  }

  error(message: string): void {
    console.error(`\x1b[31m✗ ${message}\x1b[0m`);
  }

  warn(message: string): void {
    if (!this.quiet) {
      console.warn(`\x1b[33m⚠ ${message}\x1b[0m`);
    }
  }
}

// =============================================================================
// Result Uploader
// =============================================================================

async function uploadResults(result: RunResult, apiKey?: string): Promise<boolean> {
  const key = apiKey || process.env.RELEASEGATE_API_KEY;
  if (!key) {
    console.warn('⚠ No API key found. Set RELEASEGATE_API_KEY to upload results.');
    return false;
  }

  const endpoint = process.env.RELEASEGATE_API_URL || 'https://api.releasegate.dev';

  try {
    const response = await fetch(`${endpoint}/api/v1/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(result),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`✗ Upload failed: ${response.status} - ${error}`);
      return false;
    }

    const data = await response.json();
    console.log(`✓ Results uploaded: ${endpoint}/runs/${data.id}`);
    return true;
  } catch (error) {
    console.error(`✗ Upload failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

// =============================================================================
// Main Run Command
// =============================================================================

export function createRunCommand(): Command {
  const command = new Command('run')
    .description('Run test suites against your LLM application')
    .option('-c, --config <path>', 'Path to configuration file')
    .option('-s, --suite <names...>', 'Run specific suites only')
    .option('--concurrency <number>', 'Max concurrent test executions', '5')
    .option('--timeout <ms>', 'Timeout per test in milliseconds', '60000')
    .option('-v, --verbose', 'Show detailed output')
    .option('-q, --quiet', 'Suppress all output except errors')
    .option('-o, --output <path>', 'Write results to file')
    .option('-f, --format <format>', 'Output format: json, tap, junit, pretty', 'pretty')
    .option('--upload', 'Upload results to ReleaseGate cloud')
    .option('--no-thresholds', 'Skip threshold checks (always exit 0)')
    .option('--dry-run', 'Load config and show what would run without executing')
    .action(async (options: RunOptions) => {
      await runCommand(options);
    });

  return command;
}

async function runCommand(options: RunOptions): Promise<void> {
  const reporter = new ProgressReporter(
    options.verbose ?? false,
    options.quiet ?? false
  );

  try {
    // Load configuration
    reporter.log('Loading configuration...');
    const { config, configPath, warnings } = loadConfig({
      configPath: options.config,
    });

    reporter.log(`Using config: ${configPath}`);
    for (const warning of warnings) {
      reporter.warn(warning);
    }

    // Filter suites if specified
    if (options.suite && options.suite.length > 0) {
      const suiteSet = new Set(options.suite);
      config.suites = config.suites.filter((s) => suiteSet.has(s.name));
      if (config.suites.length === 0) {
        reporter.error(`No matching suites found for: ${options.suite.join(', ')}`);
        process.exit(1);
      }
      reporter.log(`Running ${config.suites.length} suite(s): ${config.suites.map((s) => s.name).join(', ')}`);
    }

    // Dry run - just show what would run
    if (options.dryRun) {
      reporter.log('\n--- Dry Run Mode ---\n');
      reporter.log(`Project: ${config.project.name}`);
      reporter.log(`Provider: ${config.provider.name} (${(config.provider as { model?: string }).model || 'default model'})`);
      reporter.log(`\nSuites:`);
      for (const suite of config.suites) {
        reporter.log(`  - ${suite.name} (${suite.cases.length} tests)`);
        for (const testCase of suite.cases) {
          reporter.log(`    • ${testCase.name} [${testCase.evaluator}]`);
        }
      }
      reporter.log(`\nThresholds:`);
      if (config.thresholds) {
        if (config.thresholds.pass_rate) {
          reporter.log(`  - pass_rate: ${(config.thresholds.pass_rate * 100).toFixed(0)}%`);
        }
        if (config.thresholds.average_score) {
          reporter.log(`  - average_score: ${(config.thresholds.average_score * 100).toFixed(0)}%`);
        }
      } else {
        reporter.log('  (none configured)');
      }
      reporter.log('\n--- End Dry Run ---');
      return;
    }

    // Execute tests
    reporter.log(`\nRunning ${config.suites.reduce((sum, s) => sum + s.cases.length, 0)} tests across ${config.suites.length} suite(s)...\n`);

    const result = await execute(config, {
      concurrency: parseInt(options.concurrency || '5', 10),
      timeoutMs: parseInt(options.timeout || '60000', 10),
      verbose: options.verbose,
      onProgress: (event) => reporter.onProgress(event),
    });

    // Format output
    let output: string;
    switch (options.format) {
      case 'json':
        output = formatJSON(result);
        break;
      case 'tap':
        output = formatTAP(result);
        break;
      case 'junit':
        output = formatJUnit(result);
        break;
      case 'pretty':
      default:
        output = formatPretty(result);
        break;
    }

    // Write to file or console
    if (options.output) {
      const outputPath = path.isAbsolute(options.output)
        ? options.output
        : path.resolve(process.cwd(), options.output);

      // Ensure directory exists
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(outputPath, output, 'utf-8');
      reporter.log(`Results written to: ${outputPath}`);
    }

    // Always show pretty output to console unless quiet
    if (!options.quiet) {
      console.log(formatPretty(result));
    }

    // Upload if requested
    if (options.upload || config.upload?.enabled) {
      await uploadResults(result, config.upload?.api_key);
    }

    // Exit with appropriate code
    if (!options.noThresholds && !result.thresholdsResult.passed) {
      process.exit(1);
    }
  } catch (error) {
    reporter.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Legacy export for backwards compatibility
export function run(): void {
  console.error('Use createRunCommand() with Commander.js instead');
}

// Direct execution support
export { runCommand };
