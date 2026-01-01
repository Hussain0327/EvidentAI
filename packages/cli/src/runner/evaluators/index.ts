/**
 * Evaluators Module
 *
 * This is the core differentiator of ReleaseGate.
 * Each evaluator takes LLM output and determines if it passes quality/safety checks.
 */

import type { EvaluatorResult, EvaluatorType } from '../../config/types';

// =============================================================================
// Base Evaluator Interface
// =============================================================================

export interface EvaluatorContext {
  input: string;
  output: string;
  expected?: string | string[];
  criteria?: string;
  config?: Record<string, unknown>;
}

export interface Evaluator {
  name: EvaluatorType;
  evaluate(ctx: EvaluatorContext): Promise<EvaluatorResult>;
}

// =============================================================================
// Evaluator Registry
// =============================================================================

import { ExactMatchEvaluator } from './exact-match';
import { ContainsEvaluator } from './contains';
import { LLMJudgeEvaluator } from './llm-judge';
import { PIIDetectorEvaluator } from './pii-detector';
import { PromptInjectionEvaluator } from './prompt-injection';
import { CustomEvaluator } from './custom';

const evaluatorRegistry: Record<EvaluatorType, new () => Evaluator> = {
  'exact-match': ExactMatchEvaluator,
  'contains': ContainsEvaluator,
  'llm-judge': LLMJudgeEvaluator,
  'pii': PIIDetectorEvaluator,
  'prompt-injection': PromptInjectionEvaluator,
  'custom': CustomEvaluator,
};

/**
 * Get an evaluator instance by type
 */
export function getEvaluator(type: EvaluatorType): Evaluator {
  const EvaluatorClass = evaluatorRegistry[type];
  if (!EvaluatorClass) {
    throw new Error(`Unknown evaluator type: ${type}`);
  }
  return new EvaluatorClass();
}

/**
 * Run an evaluator with the given context
 */
export async function runEvaluator(
  type: EvaluatorType,
  ctx: EvaluatorContext
): Promise<EvaluatorResult> {
  const evaluator = getEvaluator(type);
  return evaluator.evaluate(ctx);
}

// =============================================================================
// Re-exports
// =============================================================================

export { ExactMatchEvaluator } from './exact-match';
export { ContainsEvaluator } from './contains';
export { LLMJudgeEvaluator } from './llm-judge';
export { PIIDetectorEvaluator } from './pii-detector';
export { PromptInjectionEvaluator } from './prompt-injection';
export { CustomEvaluator } from './custom';
