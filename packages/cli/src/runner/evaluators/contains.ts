/**
 * Contains Evaluator
 *
 * Checks if LLM output contains expected substrings.
 * Supports AND/OR logic for multiple terms.
 */

import type { EvaluatorResult } from '../../config/types';
import type { Evaluator, EvaluatorContext } from './index';

export interface ContainsConfig {
  case_sensitive?: boolean;
  match_all?: boolean; // true = AND (all terms must match), false = OR (any term)
}

export class ContainsEvaluator implements Evaluator {
  name = 'contains' as const;

  async evaluate(ctx: EvaluatorContext): Promise<EvaluatorResult> {
    const config = (ctx.config || {}) as ContainsConfig;
    const caseSensitive = config.case_sensitive ?? false;
    const matchAll = config.match_all ?? false;

    // Ensure expected is an array
    const expectedTerms = Array.isArray(ctx.expected)
      ? ctx.expected
      : typeof ctx.expected === 'string'
      ? [ctx.expected]
      : [];

    if (expectedTerms.length === 0) {
      return {
        passed: false,
        score: 0,
        reason: 'No expected terms provided for contains evaluator',
      };
    }

    const output = caseSensitive ? ctx.output : ctx.output.toLowerCase();
    const matches: { term: string; found: boolean }[] = [];

    for (const term of expectedTerms) {
      const searchTerm = caseSensitive ? term : term.toLowerCase();
      const found = output.includes(searchTerm);
      matches.push({ term, found });
    }

    const matchedCount = matches.filter((m) => m.found).length;
    const totalTerms = expectedTerms.length;

    // Calculate pass/fail based on match_all setting
    const passed = matchAll
      ? matchedCount === totalTerms // AND: all must match
      : matchedCount > 0; // OR: at least one must match

    // Score is the proportion of matched terms
    const score = totalTerms > 0 ? matchedCount / totalTerms : 0;

    // Build reason message
    let reason: string;
    if (passed) {
      reason = matchAll
        ? `All ${totalTerms} expected terms found in output`
        : `Found ${matchedCount} of ${totalTerms} expected terms`;
    } else {
      const missing = matches.filter((m) => !m.found).map((m) => m.term);
      reason = matchAll
        ? `Missing terms: ${missing.join(', ')}`
        : `None of the expected terms found: ${expectedTerms.join(', ')}`;
    }

    return {
      passed,
      score,
      reason,
      details: {
        expected_terms: expectedTerms,
        matches,
        match_mode: matchAll ? 'all' : 'any',
        case_sensitive: caseSensitive,
      },
    };
  }
}

// Legacy export
export function contains(
  output: string,
  expected: string[],
  config?: ContainsConfig
): EvaluatorResult {
  void output;
  void expected;
  void config;
  return {
    passed: false,
    score: 0,
    reason: 'Use ContainsEvaluator.evaluate() instead',
  };
}
