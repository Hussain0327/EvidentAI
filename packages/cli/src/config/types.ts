/**
 * Configuration Types for ReleaseGate CLI
 *
 * Types are consolidated here for convenience. Config-related types that are
 * validated by Zod are re-exported from schema.ts (single source of truth).
 * Runtime types (like EvaluatorResult) are defined here directly.
 */

// =============================================================================
// Re-exports from Zod Schema (source of truth for validated types)
// =============================================================================

import type {
  Config as ZodConfig,
  Suite as ZodSuite,
  TestCase as ZodTestCase,
  ProviderConfig as ZodProviderConfig,
  Thresholds as ZodThresholds,
  PIIEntityType as ZodPIIEntityType,
  ProjectConfig as ZodProjectConfig,
} from './schema';

export type Config = ZodConfig;
export type Suite = ZodSuite;
export type TestCase = ZodTestCase;
export type ProviderConfig = ZodProviderConfig;
export type Thresholds = ZodThresholds;
export type PIIEntityType = ZodPIIEntityType;
export type ProjectConfig = ZodProjectConfig;

// =============================================================================
// Evaluator Types (not Zod-validated, defined here)
// =============================================================================

export type EvaluatorType =
  | 'exact-match'
  | 'contains'
  | 'llm-judge'
  | 'pii'
  | 'prompt-injection'
  | 'custom';

// =============================================================================
// Result Types
// =============================================================================

export interface EvaluatorResult {
  passed: boolean;
  score: number; // 0.0 - 1.0
  reason?: string;
  details?: Record<string, unknown>;
}

export interface TestCaseResult {
  name: string;
  input: string;
  output: string;
  passed: boolean;
  score: number;
  evaluator: EvaluatorType;
  evaluator_result: EvaluatorResult;
  latency_ms: number;
  tokens_used?: number;
  cost_usd?: number;
  error?: string;
}

export interface SuiteResult {
  name: string;
  total: number;
  passed: number;
  failed: number;
  pass_rate: number;
  cases: TestCaseResult[];
}

export interface RunResult {
  project: ProjectConfig;
  git?: {
    sha?: string;
    ref?: string;
    message?: string;
    pr_number?: number;
  };
  config_hash: string;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  status: 'passed' | 'failed' | 'error';
  total: number;
  passed: number;
  failed: number;
  pass_rate: number;
  suites: SuiteResult[];
  metrics: {
    pii_detected: number;
    prompt_injection_attempts: number;
    avg_latency_ms: number;
    total_tokens: number;
    total_cost_usd: number;
  };
  thresholds_met: boolean;
  threshold_violations?: string[];
}
