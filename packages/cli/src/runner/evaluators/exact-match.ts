/**
 * Exact Match Evaluator
 *
 * Compares LLM output against an expected string.
 * Useful for deterministic responses.
 */

import type { EvaluatorResult } from '../../config/types';
import type { Evaluator, EvaluatorContext } from './index';

export interface ExactMatchConfig {
  case_sensitive?: boolean;
  trim_whitespace?: boolean;
}

export class ExactMatchEvaluator implements Evaluator {
  name = 'exact-match' as const;

  async evaluate(ctx: EvaluatorContext): Promise<EvaluatorResult> {
    const config = (ctx.config || {}) as ExactMatchConfig;
    const caseSensitive = config.case_sensitive ?? true;
    const trimWhitespace = config.trim_whitespace ?? true;

    if (typeof ctx.expected !== 'string') {
      return {
        passed: false,
        score: 0,
        reason: 'Expected value must be a string for exact-match evaluator',
      };
    }

    let output = ctx.output;
    let expected = ctx.expected;

    // Apply transformations
    if (trimWhitespace) {
      output = output.trim();
      expected = expected.trim();
    }

    if (!caseSensitive) {
      output = output.toLowerCase();
      expected = expected.toLowerCase();
    }

    const passed = output === expected;

    return {
      passed,
      score: passed ? 1.0 : 0.0,
      reason: passed
        ? 'Output matches expected value'
        : `Output does not match. Expected: "${ctx.expected.substring(0, 100)}..."`,
      details: {
        expected: ctx.expected,
        actual: ctx.output,
        case_sensitive: caseSensitive,
        trim_whitespace: trimWhitespace,
      },
    };
  }
}

// Legacy export for backwards compatibility
export function exactMatch(
  output: string,
  expected: string,
  config?: ExactMatchConfig
): EvaluatorResult {
  void output;
  void expected;
  void config;
  // Note: This is synchronous but we return a resolved promise for consistency
  return {
    passed: false,
    score: 0,
    reason: 'Use ExactMatchEvaluator.evaluate() instead',
  };
}
