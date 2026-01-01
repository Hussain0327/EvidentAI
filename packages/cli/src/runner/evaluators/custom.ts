/**
 * Custom Evaluator
 *
 * Allows users to define their own evaluation logic.
 * Supports multiple execution modes:
 * 1. Inline JavaScript function (sandboxed)
 * 2. External script file (.js or .ts)
 * 3. HTTP webhook endpoint
 *
 * Security considerations:
 * - Inline functions run in a restricted VM context
 * - External scripts have timeout limits
 * - Webhooks require HTTPS in production
 */

import type { EvaluatorResult } from '../../config/types';
import type { Evaluator, EvaluatorContext } from './index';
import * as vm from 'vm';
import * as path from 'path';
import * as fs from 'fs';

export interface CustomConfig {
  // Inline function as string
  function?: string;
  // Path to external script
  script?: string;
  // Webhook URL
  webhook?: string;
  // Timeout in ms
  timeout?: number;
  // Additional context to pass
  context?: Record<string, unknown>;
}

interface CustomEvalContext {
  input: string;
  output: string;
  expected?: string | string[];
  config: Record<string, unknown>;
}

interface CustomEvalResult {
  passed: boolean;
  score?: number;
  reason?: string;
  details?: Record<string, unknown>;
}

// =============================================================================
// Execution Modes
// =============================================================================

/**
 * Execute an inline JavaScript function in a sandboxed VM
 */
async function executeInlineFunction(
  functionCode: string,
  evalContext: CustomEvalContext,
  timeout: number
): Promise<CustomEvalResult> {
  // Create a sandboxed context with limited globals
  const sandbox: vm.Context = {
    input: evalContext.input,
    output: evalContext.output,
    expected: evalContext.expected,
    config: evalContext.config,
    // Safe globals
    console: {
      log: () => {},
      warn: () => {},
      error: () => {},
    },
    JSON,
    Math,
    String,
    Number,
    Boolean,
    Array,
    Object,
    Date,
    RegExp,
    // Result placeholder
    __result__: null as CustomEvalResult | null,
  };

  vm.createContext(sandbox);

  // Wrap the function code in an async IIFE that sets the result
  const wrappedCode = `
    (async () => {
      const evaluateFunction = ${functionCode};
      __result__ = await evaluateFunction({ input, output, expected, config });
    })();
  `;

  try {
    const script = new vm.Script(wrappedCode, {
      filename: 'custom-evaluator.vm',
    });

    // Run with timeout
    await script.runInContext(sandbox, {
      timeout,
      displayErrors: true,
    });

    // Small delay for async completion
    await new Promise((resolve) => setTimeout(resolve, 10));

    const result = sandbox.__result__;

    if (!result || typeof result.passed !== 'boolean') {
      throw new Error('Custom function must return { passed: boolean, ... }');
    }

    return {
      passed: result.passed,
      score: typeof result.score === 'number' ? result.score : (result.passed ? 1.0 : 0.0),
      reason: result.reason || (result.passed ? 'Custom evaluation passed' : 'Custom evaluation failed'),
      details: result.details,
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('Script execution timed out')) {
      throw new Error(`Custom function timed out after ${timeout}ms`);
    }
    throw error;
  }
}

/**
 * Execute an external script file
 */
async function executeScriptFile(
  scriptPath: string,
  evalContext: CustomEvalContext,
  timeout: number
): Promise<CustomEvalResult> {
  // Resolve path relative to cwd
  const absolutePath = path.isAbsolute(scriptPath)
    ? scriptPath
    : path.resolve(process.cwd(), scriptPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Custom evaluator script not found: ${absolutePath}`);
  }

  // Check file extension
  const ext = path.extname(absolutePath);
  if (!['.js', '.mjs', '.cjs'].includes(ext)) {
    throw new Error(`Unsupported script extension: ${ext}. Use .js, .mjs, or .cjs`);
  }

  try {
    // Dynamic import with timeout
    const importPromise = import(absolutePath);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Script import timed out after ${timeout}ms`)), timeout);
    });

    const module = await Promise.race([importPromise, timeoutPromise]);

    // Find the evaluate function
    const evaluate = module.evaluate || module.default?.evaluate || module.default;

    if (typeof evaluate !== 'function') {
      throw new Error('Script must export an evaluate function');
    }

    // Execute with timeout
    const evalPromise = Promise.resolve(evaluate(evalContext));
    const evalTimeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Evaluation timed out after ${timeout}ms`)), timeout);
    });

    const result = await Promise.race([evalPromise, evalTimeoutPromise]);

    if (!result || typeof result.passed !== 'boolean') {
      throw new Error('Script evaluate function must return { passed: boolean, ... }');
    }

    return {
      passed: result.passed,
      score: typeof result.score === 'number' ? result.score : (result.passed ? 1.0 : 0.0),
      reason: result.reason || 'Custom script evaluation',
      details: result.details,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Script execution error: ${error}`);
  }
}

/**
 * Call a webhook endpoint for evaluation
 */
async function callWebhook(
  webhookUrl: string,
  evalContext: CustomEvalContext,
  timeout: number
): Promise<CustomEvalResult> {
  // Validate URL
  let url: URL;
  try {
    url = new URL(webhookUrl);
  } catch {
    throw new Error(`Invalid webhook URL: ${webhookUrl}`);
  }

  // Require HTTPS in production
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('Webhook must use HTTPS in production');
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ReleaseGate/1.0',
      },
      body: JSON.stringify({
        input: evalContext.input,
        output: evalContext.output,
        expected: evalContext.expected,
        config: evalContext.config,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}: ${await response.text()}`);
    }

    const result = (await response.json()) as Record<string, unknown>;
    const passed = result.passed;

    if (typeof passed !== 'boolean') {
      throw new Error('Webhook must return { passed: boolean, ... }');
    }

    return {
      passed,
      score: typeof result.score === 'number' ? result.score : (passed ? 1.0 : 0.0),
      reason: typeof result.reason === 'string' ? result.reason : 'Webhook evaluation',
      details: result.details as Record<string, unknown> | undefined,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Webhook timed out after ${timeout}ms`);
    }
    throw error;
  }
}

// =============================================================================
// Main Evaluator
// =============================================================================

export class CustomEvaluator implements Evaluator {
  name = 'custom' as const;

  async evaluate(ctx: EvaluatorContext): Promise<EvaluatorResult> {
    const config = (ctx.config || {}) as CustomConfig;
    const timeout = config.timeout || 30000; // 30 second default

    // Build evaluation context
    const evalContext: CustomEvalContext = {
      input: ctx.input,
      output: ctx.output,
      expected: ctx.expected,
      config: config.context || {},
    };

    // Determine execution mode
    const modes = [
      config.function ? 'function' : null,
      config.script ? 'script' : null,
      config.webhook ? 'webhook' : null,
    ].filter(Boolean);

    if (modes.length === 0) {
      return {
        passed: false,
        score: 0,
        reason: 'No custom evaluation mode specified. Provide function, script, or webhook.',
      };
    }

    if (modes.length > 1) {
      return {
        passed: false,
        score: 0,
        reason: `Multiple evaluation modes specified (${modes.join(', ')}). Use only one.`,
      };
    }

    try {
      let result: CustomEvalResult;

      if (config.function) {
        result = await executeInlineFunction(config.function, evalContext, timeout);
      } else if (config.script) {
        result = await executeScriptFile(config.script, evalContext, timeout);
      } else if (config.webhook) {
        result = await callWebhook(config.webhook, evalContext, timeout);
      } else {
        // This shouldn't happen given the checks above
        throw new Error('No evaluation mode specified');
      }

      return {
        passed: result.passed,
        score: result.score ?? (result.passed ? 1.0 : 0.0),
        reason: result.reason || (result.passed ? 'Custom evaluation passed' : 'Custom evaluation failed'),
        details: {
          mode: config.function ? 'inline_function' : config.script ? 'script_file' : 'webhook',
          timeout,
          ...result.details,
        },
      };
    } catch (error) {
      return {
        passed: false,
        score: 0,
        reason: `Custom evaluator error: ${error instanceof Error ? error.message : String(error)}`,
        details: {
          error: String(error),
          mode: config.function ? 'inline_function' : config.script ? 'script_file' : 'webhook',
        },
      };
    }
  }
}

// Legacy export
export function custom(): EvaluatorResult {
  return {
    passed: false,
    score: 0,
    reason: 'Use CustomEvaluator.evaluate() instead',
  };
}
