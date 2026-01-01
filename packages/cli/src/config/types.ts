/**
 * Configuration Types for ReleaseGate CLI
 *
 * These types define the mental model for users configuring their GenAI evals.
 * The YAML config maps directly to these types.
 */

// =============================================================================
// Evaluator Types - The core differentiator
// =============================================================================

export type EvaluatorType =
  | 'exact-match'
  | 'contains'
  | 'llm-judge'
  | 'pii'
  | 'prompt-injection'
  | 'custom';

export type PIIEntityType =
  | 'email'
  | 'phone'
  | 'ssn'
  | 'credit_card'
  | 'ip_address'
  | 'address'
  | 'name'
  | 'date_of_birth';

export interface ExactMatchConfig {
  case_sensitive?: boolean;
  trim_whitespace?: boolean;
}

export interface ContainsConfig {
  case_sensitive?: boolean;
  match_all?: boolean; // true = AND, false = OR
}

export interface LLMJudgeConfig {
  model?: string; // Override judge model
  criteria: string; // Natural language evaluation criteria
  score_range?: [number, number]; // e.g., [1, 5]
  pass_threshold?: number; // Minimum score to pass
  chain_of_thought?: boolean; // Enable CoT reasoning
}

export interface PIIConfig {
  fail_on: PIIEntityType[];
  allow?: PIIEntityType[]; // Explicit allowlist
  redact?: boolean; // Redact in output instead of failing
}

export interface PromptInjectionConfig {
  detection_methods?: ('heuristic' | 'canary' | 'llm')[];
  canary_tokens?: string[];
  sensitivity?: 'low' | 'medium' | 'high';
  check_input?: boolean;
  check_output?: boolean;
  llm_config?: {
    model?: string;
    api_key?: string;
  };
}

export interface CustomEvaluatorConfig {
  script: string; // Path to custom evaluator script
  timeout_ms?: number;
}

// =============================================================================
// Test Case Configuration
// =============================================================================

export interface TestCaseBase {
  name: string;
  input: string;
  description?: string;
  tags?: string[];
  timeout_ms?: number;
}

export interface ExactMatchTestCase extends TestCaseBase {
  evaluator: 'exact-match';
  expected: string;
  config?: ExactMatchConfig;
}

export interface ContainsTestCase extends TestCaseBase {
  evaluator: 'contains';
  expected: string[];
  config?: ContainsConfig;
}

export interface LLMJudgeTestCase extends TestCaseBase {
  evaluator: 'llm-judge';
  criteria: string;
  config?: Omit<LLMJudgeConfig, 'criteria'>;
}

export interface PIITestCase extends TestCaseBase {
  evaluator: 'pii';
  config: PIIConfig;
}

export interface PromptInjectionTestCase extends TestCaseBase {
  evaluator: 'prompt-injection';
  config?: PromptInjectionConfig;
}

export interface CustomTestCase extends TestCaseBase {
  evaluator: 'custom';
  config: CustomEvaluatorConfig;
}

export type TestCase =
  | ExactMatchTestCase
  | ContainsTestCase
  | LLMJudgeTestCase
  | PIITestCase
  | PromptInjectionTestCase
  | CustomTestCase;

// =============================================================================
// Suite Configuration
// =============================================================================

export interface Suite {
  name: string;
  description?: string;
  tags?: string[];
  cases: TestCase[];
}

// =============================================================================
// Provider Configuration
// =============================================================================

export type ProviderName = 'openai' | 'anthropic' | 'azure' | 'custom';

export interface OpenAIProviderConfig {
  name: 'openai';
  model: string;
  api_key?: string; // Falls back to OPENAI_API_KEY
  base_url?: string;
  temperature?: number;
  max_tokens?: number;
  timeout_ms?: number;
}

export interface AnthropicProviderConfig {
  name: 'anthropic';
  model: string;
  api_key?: string; // Falls back to ANTHROPIC_API_KEY
  temperature?: number;
  max_tokens?: number;
  timeout_ms?: number;
}

export interface AzureProviderConfig {
  name: 'azure';
  deployment: string;
  endpoint: string;
  api_key?: string; // Falls back to AZURE_OPENAI_API_KEY
  api_version?: string;
  temperature?: number;
  max_tokens?: number;
  timeout_ms?: number;
}

export interface CustomProviderConfig {
  name: 'custom';
  endpoint: string; // Custom API endpoint
  headers?: Record<string, string>;
  config?: Record<string, unknown>;
}

export type ProviderConfig =
  | OpenAIProviderConfig
  | AnthropicProviderConfig
  | AzureProviderConfig
  | CustomProviderConfig;

// =============================================================================
// Thresholds Configuration
// =============================================================================

export interface SuiteThreshold {
  pass_rate?: number;
  average_score?: number;
}

export interface Thresholds {
  pass_rate?: number; // 0.0 - 1.0, e.g., 0.95 = 95%
  average_score?: number; // 0.0 - 1.0
  per_suite?: Record<string, SuiteThreshold>;
  max_pii_incidents?: number; // 0 = zero tolerance
  max_prompt_injection_attempts?: number;
  max_latency_ms?: number;
  max_cost_usd?: number;
  max_tokens?: number;
}

// =============================================================================
// Output Configuration
// =============================================================================

export type OutputFormat = 'json' | 'yaml' | 'junit' | 'markdown';

export interface OutputConfig {
  format?: OutputFormat;
  path?: string;
  verbose?: boolean;
}

// =============================================================================
// Upload Configuration
// =============================================================================

export interface UploadConfig {
  enabled?: boolean;
  api_url?: string;
  api_key?: string; // Falls back to RELEASEGATE_API_KEY
}

// =============================================================================
// Project Configuration
// =============================================================================

export interface ProjectConfig {
  id?: string; // From dashboard
  name: string;
  description?: string;
}

// =============================================================================
// Root Configuration
// =============================================================================

export interface Config {
  version: '1';
  project: ProjectConfig;
  provider: ProviderConfig;
  suites: Suite[];
  thresholds?: Thresholds;
  output?: OutputConfig;
  upload?: UploadConfig;
}

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
