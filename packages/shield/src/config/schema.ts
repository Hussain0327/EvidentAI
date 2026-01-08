import { z } from 'zod';

export const ThreatLevelSchema = z.enum(['none', 'low', 'medium', 'high', 'critical']);

export const AnalyzerTypeSchema = z.enum(['heuristic', 'llm-judge']);

export const LLMConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'custom']),
  model: z.string().optional(),
  apiKey: z.string().optional(),
  endpoint: z.string().url().optional(),
});

export const HeuristicConfigSchema = z.object({
  customPatterns: z.array(z.string()).optional(),
  sensitivity: z.enum(['low', 'medium', 'high']).optional().default('medium'),
});

export const ShieldConfigSchema = z.object({
  enabled: z.boolean().default(true),
  blockThreshold: ThreatLevelSchema.default('high'),
  analyzers: z.array(AnalyzerTypeSchema).default(['heuristic']),
  logAll: z.boolean().default(false),
  // Callbacks are typed at runtime, use passthrough for Zod
  onThreat: z.any().optional(),
  onBlock: z.any().optional(),
  llm: LLMConfigSchema.optional(),
  heuristic: HeuristicConfigSchema.optional(),
});

export type ShieldConfigInput = z.input<typeof ShieldConfigSchema>;
export type ShieldConfigParsed = z.output<typeof ShieldConfigSchema>;

export function parseConfig(config: ShieldConfigInput): ShieldConfigParsed {
  return ShieldConfigSchema.parse(config);
}

export function validateConfig(config: unknown): { valid: boolean; errors?: string[] } {
  const result = ShieldConfigSchema.safeParse(config);
  if (result.success) {
    return { valid: true };
  }
  return {
    valid: false,
    errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
  };
}
