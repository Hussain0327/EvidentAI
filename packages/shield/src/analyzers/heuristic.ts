import type { Analyzer, ThreatDetection, ShieldConfig, ThreatLevel } from '../types.js';

/**
 * Heuristic Analyzer - Layer 1
 *
 * Fast pattern-based detection for common prompt injection attacks.
 * Runs in <1ms, no external API calls.
 */

interface PatternMatch {
  pattern: string;
  category: string;
  severity: ThreatLevel;
  description: string;
}

// Injection patterns organized by category and severity
const INJECTION_PATTERNS: PatternMatch[] = [
  // === CRITICAL: Direct instruction override ===
  {
    pattern: 'ignore.{0,30}(instructions|prompts|rules|guidelines|directions|above)',
    category: 'instruction_override',
    severity: 'critical',
    description: 'Direct instruction override attempt',
  },
  {
    pattern: 'disregard.{0,30}(instructions|prompts|rules|guidelines|programming|everything)',
    category: 'instruction_override',
    severity: 'critical',
    description: 'Direct instruction override attempt',
  },
  {
    pattern: 'forget.{0,30}(instructions|prompts|rules|guidelines|told|everything|previous)',
    category: 'instruction_override',
    severity: 'critical',
    description: 'Direct instruction override attempt',
  },
  {
    pattern: 'override.{0,30}(system|prompt|instructions|rules|safety|guidelines)',
    category: 'instruction_override',
    severity: 'critical',
    description: 'Direct instruction override attempt',
  },
  {
    pattern: 'nevermind.{0,20}(all|that|previous|everything)',
    category: 'instruction_override',
    severity: 'critical',
    description: 'Instruction dismissal attempt',
  },
  {
    pattern: '(instructions|rules).{0,20}(cancel|void|null|invalid)',
    category: 'instruction_override',
    severity: 'critical',
    description: 'Instruction cancellation attempt',
  },
  {
    pattern: 'stop being.{0,20}(an? )?(ai|assistant|chatbot)',
    category: 'instruction_override',
    severity: 'critical',
    description: 'Identity override attempt',
  },

  // === HIGH: Role manipulation ===
  {
    pattern: 'you are (now |actually )?(?:a |an )?(?:new |different )?(?:assistant|ai|bot|system|hacker)',
    category: 'role_manipulation',
    severity: 'high',
    description: 'Role manipulation attempt',
  },
  {
    pattern: 'pretend (to be|you are|you\'re)',
    category: 'role_manipulation',
    severity: 'high',
    description: 'Role play injection',
  },
  {
    pattern: 'act as (if )?(you |you\'re|a |an )',
    category: 'role_manipulation',
    severity: 'high',
    description: 'Role play injection',
  },
  {
    pattern: 'roleplay as',
    category: 'role_manipulation',
    severity: 'high',
    description: 'Role play injection',
  },
  {
    pattern: 'imagine you are',
    category: 'role_manipulation',
    severity: 'high',
    description: 'Role play injection',
  },
  {
    pattern: 'from now on.{0,30}(respond|you will|act)',
    category: 'role_manipulation',
    severity: 'high',
    description: 'Persistent role change attempt',
  },
  {
    pattern: 'playing the role',
    category: 'role_manipulation',
    severity: 'high',
    description: 'Role play injection',
  },
  {
    pattern: 'simulate being',
    category: 'role_manipulation',
    severity: 'high',
    description: 'Simulation injection',
  },
  {
    pattern: 'adopt the persona',
    category: 'role_manipulation',
    severity: 'high',
    description: 'Persona adoption attempt',
  },
  {
    pattern: 'jailbreak',
    category: 'role_manipulation',
    severity: 'critical',
    description: 'Explicit jailbreak attempt',
  },
  {
    pattern: 'DAN( mode)?|do anything now',
    category: 'role_manipulation',
    severity: 'critical',
    description: 'Known jailbreak technique (DAN)',
  },
  {
    pattern: 'no (content |safety )?policy',
    category: 'role_manipulation',
    severity: 'high',
    description: 'Policy bypass attempt',
  },
  {
    pattern: 'without (any )?(restrictions|limits|limitations|boundaries)',
    category: 'role_manipulation',
    severity: 'high',
    description: 'Restriction bypass attempt',
  },
  {
    pattern: 'unrestricted (mode|access|ai)',
    category: 'role_manipulation',
    severity: 'high',
    description: 'Unrestricted mode attempt',
  },
  {
    pattern: '(disable|turn off|remove).{0,20}(filter|safety|content|restriction)',
    category: 'role_manipulation',
    severity: 'high',
    description: 'Filter disable attempt',
  },
  {
    pattern: 'no ethical (boundaries|guidelines|limits)',
    category: 'role_manipulation',
    severity: 'high',
    description: 'Ethics bypass attempt',
  },

  // === HIGH: System prompt extraction ===
  {
    pattern: '(show|tell|reveal|display|print|output).{0,15}(your |my |the )?(system |initial |original )?(prompt|instructions|rules|guidelines|programming)',
    category: 'prompt_extraction',
    severity: 'high',
    description: 'System prompt extraction attempt',
  },
  {
    pattern: 'what (is|are) your.{0,15}(system |initial |original )?(prompt|instructions|rules|guidelines)',
    category: 'prompt_extraction',
    severity: 'high',
    description: 'System prompt extraction attempt',
  },
  {
    pattern: 'what were you (told|instructed|programmed|given)',
    category: 'prompt_extraction',
    severity: 'high',
    description: 'System prompt extraction attempt',
  },
  {
    pattern: 'repeat.{0,20}(initial |system |first |original )?(message|prompt|instructions)',
    category: 'prompt_extraction',
    severity: 'high',
    description: 'System prompt extraction attempt',
  },
  {
    pattern: 'reveal your (programming|configuration|instructions)',
    category: 'prompt_extraction',
    severity: 'high',
    description: 'System prompt extraction attempt',
  },
  {
    pattern: '(print|output|display) your.{0,10}(system |)(message|configuration)',
    category: 'prompt_extraction',
    severity: 'high',
    description: 'System prompt extraction attempt',
  },
  {
    pattern: '(what|where).{0,10}(hidden|secret).{0,10}instructions',
    category: 'prompt_extraction',
    severity: 'high',
    description: 'Hidden instruction extraction attempt',
  },
  {
    pattern: 'repeat.{0,15}everything before this',
    category: 'prompt_extraction',
    severity: 'high',
    description: 'Context extraction attempt',
  },
  {
    pattern: 'what did.{0,15}(developer|creator|programmer).{0,10}tell you',
    category: 'prompt_extraction',
    severity: 'high',
    description: 'Developer instruction extraction',
  },
  {
    pattern: 'share your.{0,10}(base|core|original).{0,10}instructions',
    category: 'prompt_extraction',
    severity: 'high',
    description: 'Base instruction extraction',
  },
  {
    pattern: "what'?s (in )?your.{0,15}(system )?(prompt|instructions)",
    category: 'prompt_extraction',
    severity: 'high',
    description: 'Prompt content extraction',
  },

  // === HIGH: Delimiter injection ===
  {
    pattern: '\\[(\\/?)(system|assistant|user|human|ai|inst)\\]',
    category: 'delimiter_injection',
    severity: 'high',
    description: 'Chat delimiter injection',
  },
  {
    pattern: '<(\\/?)(system|assistant|user|human|ai|s)>',
    category: 'delimiter_injection',
    severity: 'high',
    description: 'Chat delimiter injection',
  },
  {
    pattern: '\\{(system|assistant|user)\\}',
    category: 'delimiter_injection',
    severity: 'high',
    description: 'Chat delimiter injection',
  },
  {
    pattern: '<\\|[^|]+\\|>',
    category: 'delimiter_injection',
    severity: 'high',
    description: 'Special token injection attempt',
  },
  {
    pattern: '### .*(SYSTEM|PROMPT|INSTRUCTION)',
    category: 'delimiter_injection',
    severity: 'high',
    description: 'Section header injection',
  },
  {
    pattern: '<<\\/?SYS>>',
    category: 'delimiter_injection',
    severity: 'high',
    description: 'Llama-style system tag injection',
  },
  {
    pattern: '</s><s>',
    category: 'delimiter_injection',
    severity: 'high',
    description: 'Token boundary injection',
  },
  {
    pattern: '\\[INST\\]|\\[/INST\\]',
    category: 'delimiter_injection',
    severity: 'high',
    description: 'Instruction tag injection',
  },
  {
    pattern: '```(system|prompt|instructions)',
    category: 'delimiter_injection',
    severity: 'high',
    description: 'Code block system injection',
  },
  {
    pattern: '---+\\s*(END|BEGIN|NEW).*(SYSTEM|PROMPT|INSTRUCTION)',
    category: 'delimiter_injection',
    severity: 'high',
    description: 'Section boundary injection',
  },

  // === MEDIUM: Encoding/obfuscation ===
  {
    pattern: 'base64|rot13|hex encode|url encode',
    category: 'obfuscation',
    severity: 'medium',
    description: 'Encoding reference detected',
  },
  {
    pattern: '\\\\x[0-9a-fA-F]{2}',
    category: 'obfuscation',
    severity: 'medium',
    description: 'Hex escape sequence detected',
  },
  {
    pattern: '\\\\u[0-9a-fA-F]{4}',
    category: 'obfuscation',
    severity: 'medium',
    description: 'Unicode escape sequence detected',
  },

  // === HIGH: Context manipulation ===
  {
    pattern: '(new|start|begin).{0,20}conversation',
    category: 'context_manipulation',
    severity: 'high',
    description: 'Context reset attempt',
  },
  {
    pattern: '(reset|clear).{0,20}(context|memory|instructions)',
    category: 'context_manipulation',
    severity: 'high',
    description: 'Context reset attempt',
  },
  {
    pattern: 'end of.{0,20}(system|initial|previous|old)?.{0,10}(prompt|instructions|message|context)',
    category: 'context_manipulation',
    severity: 'high',
    description: 'Prompt boundary manipulation',
  },
  {
    pattern: 'begin.{0,20}(new |real |actual )?(instructions|prompt|task)',
    category: 'context_manipulation',
    severity: 'high',
    description: 'Instruction injection attempt',
  },
  {
    pattern: '(above|previous|that) (was|were).{0,20}(just |only )?(a |an )?(test|example)',
    category: 'context_manipulation',
    severity: 'high',
    description: 'Context invalidation attempt',
  },
  {
    pattern: 'previous (message|messages|text).{0,15}(example|test|demo)',
    category: 'context_manipulation',
    severity: 'high',
    description: 'Message invalidation attempt',
  },
  {
    pattern: 'real (conversation|task|instructions).{0,15}(start|begin)',
    category: 'context_manipulation',
    severity: 'high',
    description: 'Context switch attempt',
  },
  {
    pattern: '(ignore|forget).{0,15}(training|previous|above)',
    category: 'context_manipulation',
    severity: 'critical',
    description: 'Training data override attempt',
  },
  {
    pattern: '(old|previous|that).{0,10}(prompt|instructions).{0,10}(new|real)',
    category: 'context_manipulation',
    severity: 'high',
    description: 'Prompt replacement attempt',
  },
  {
    pattern: 'system (reboot|restart|reset)',
    category: 'context_manipulation',
    severity: 'high',
    description: 'System reset attempt',
  },
  {
    pattern: 'new (parameters|settings|config)',
    category: 'context_manipulation',
    severity: 'high',
    description: 'Configuration injection attempt',
  },

  // === MEDIUM: Suspicious patterns ===
  {
    pattern: 'sudo|admin mode|developer mode|debug mode|maintenance mode',
    category: 'privilege_escalation',
    severity: 'medium',
    description: 'Privilege escalation attempt',
  },
  {
    pattern: '(access|enter|enable).{0,10}(admin|root|super)',
    category: 'privilege_escalation',
    severity: 'high',
    description: 'Admin access attempt',
  },
  {
    pattern: 'grant.{0,15}(superuser|admin|root|elevated)',
    category: 'privilege_escalation',
    severity: 'high',
    description: 'Privilege grant attempt',
  },
  {
    pattern: 'unlock.{0,15}(hidden|secret|admin|full)',
    category: 'privilege_escalation',
    severity: 'high',
    description: 'Unlock attempt',
  },
  {
    pattern: '(god|root|admin) (mode|access|privileges)',
    category: 'privilege_escalation',
    severity: 'high',
    description: 'Elevated access attempt',
  },
  {
    pattern: 'bypass|circumvent|workaround|get around',
    category: 'bypass_attempt',
    severity: 'low',
    description: 'Potential bypass language',
  },
];

// Compile patterns for performance
// Using 'is' flags: i=case insensitive, s=dotAll (. matches newlines)
const COMPILED_PATTERNS = INJECTION_PATTERNS.map((p) => ({
  ...p,
  regex: new RegExp(p.pattern, 'is'),
}));

// Sensitivity thresholds
const SENSITIVITY_THRESHOLDS: Record<string, ThreatLevel[]> = {
  low: ['critical'],
  medium: ['critical', 'high'],
  high: ['critical', 'high', 'medium', 'low'],
};

export class HeuristicAnalyzer implements Analyzer {
  name: 'heuristic' = 'heuristic';

  async analyze(input: string, config: ShieldConfig): Promise<ThreatDetection> {
    const startTime = performance.now();
    const sensitivity = config.heuristic?.sensitivity ?? 'medium';
    const allowedSeverities = SENSITIVITY_THRESHOLDS[sensitivity];

    const indicators: string[] = [];
    let highestSeverity: ThreatLevel = 'none';
    let highestReason = '';

    // Check built-in patterns
    for (const { regex, category, severity, description } of COMPILED_PATTERNS) {
      if (!allowedSeverities.includes(severity)) continue;

      if (regex.test(input)) {
        indicators.push(`${category}: ${description}`);
        if (this.severityRank(severity) > this.severityRank(highestSeverity)) {
          highestSeverity = severity;
          highestReason = description;
        }
      }
    }

    // Check custom patterns
    if (config.heuristic?.customPatterns) {
      for (const pattern of config.heuristic.customPatterns) {
        try {
          const regex = new RegExp(pattern, 'i');
          if (regex.test(input)) {
            indicators.push(`custom: Pattern "${pattern}" matched`);
            if (this.severityRank('high') > this.severityRank(highestSeverity)) {
              highestSeverity = 'high';
              highestReason = `Custom pattern matched: ${pattern}`;
            }
          }
        } catch {
          // Invalid regex, skip
        }
      }
    }

    const latencyMs = performance.now() - startTime;

    return {
      detected: indicators.length > 0,
      level: highestSeverity,
      confidence: this.calculateConfidence(indicators.length, highestSeverity),
      analyzer: 'heuristic',
      reason: highestReason || 'No threats detected',
      indicators,
      latencyMs,
    };
  }

  private severityRank(level: ThreatLevel): number {
    const ranks: Record<ThreatLevel, number> = {
      none: 0,
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };
    return ranks[level];
  }

  private calculateConfidence(indicatorCount: number, severity: ThreatLevel): number {
    if (indicatorCount === 0) return 1.0; // Confident there's no threat

    // More indicators = higher confidence in detection
    const baseConfidence = Math.min(0.5 + indicatorCount * 0.15, 0.95);

    // Higher severity patterns are more reliable
    const severityBoost: Record<ThreatLevel, number> = {
      none: 0,
      low: 0,
      medium: 0.05,
      high: 0.1,
      critical: 0.15,
    };

    return Math.min(baseConfidence + severityBoost[severity], 0.99);
  }
}

export const heuristicAnalyzer = new HeuristicAnalyzer();
