/**
 * Shield Types - Runtime LLM Protection
 */

export type ThreatLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export type AnalyzerType = 'heuristic' | 'llm-judge';

export interface ThreatDetection {
  /** Whether a threat was detected */
  detected: boolean;
  /** Severity level of the threat */
  level: ThreatLevel;
  /** Confidence score 0-1 */
  confidence: number;
  /** Which analyzer detected the threat */
  analyzer: AnalyzerType;
  /** Human-readable reason */
  reason: string;
  /** Specific patterns or indicators found */
  indicators: string[];
  /** Time taken to analyze in ms */
  latencyMs: number;
}

export interface AnalysisResult {
  /** Unique request ID for tracing */
  requestId: string;
  /** The input that was analyzed */
  input: string;
  /** Combined threat assessment */
  threat: ThreatDetection;
  /** Individual analyzer results */
  analyzerResults: ThreatDetection[];
  /** Whether the request should be blocked */
  blocked: boolean;
  /** Total analysis time in ms */
  totalLatencyMs: number;
  /** Timestamp */
  timestamp: string;
}

export interface ShieldConfig {
  /** Enable/disable the shield */
  enabled: boolean;
  /** Minimum threat level to block (default: 'high') */
  blockThreshold: ThreatLevel;
  /** Which analyzers to use */
  analyzers: AnalyzerType[];
  /** Log all requests (for debugging) */
  logAll: boolean;
  /** Custom callback when threat detected */
  onThreat?: (result: AnalysisResult) => void | Promise<void>;
  /** Custom callback when request blocked */
  onBlock?: (result: AnalysisResult) => void | Promise<void>;
  /** LLM configuration for llm-judge analyzer */
  llm?: {
    provider: 'openai' | 'anthropic' | 'custom';
    model?: string;
    apiKey?: string;
    endpoint?: string;
  };
  /** Heuristic analyzer options */
  heuristic?: {
    /** Custom patterns to detect (regex strings) */
    customPatterns?: string[];
    /** Sensitivity: 'low' | 'medium' | 'high' */
    sensitivity?: 'low' | 'medium' | 'high';
  };
}

export interface Analyzer {
  name: AnalyzerType;
  analyze(input: string, config: ShieldConfig): Promise<ThreatDetection>;
}

/** Request context passed to middleware */
export interface RequestContext {
  /** The user's input/prompt */
  input: string;
  /** Optional user ID for rate limiting */
  userId?: string;
  /** Optional session ID */
  sessionId?: string;
  /** Any additional metadata */
  metadata?: Record<string, unknown>;
}
