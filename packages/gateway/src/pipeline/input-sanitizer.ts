/**
 * Input Sanitization Pipeline
 *
 * Detects prompt injection attempts and sanitizes input using:
 * 1. Heuristic pattern matching (from CLI evaluator)
 * 2. LLM-based rephrasing to extract legitimate intent
 *
 * Based on patterns from @evidentai/cli prompt-injection evaluator.
 */

import type { ChatMessage, InputSanitizationResult, InjectionMatch } from '../types.js';
import { rephraseWithLLM } from '../sanitizers/injection-rephraser.js';

// =============================================================================
// Injection Detection Patterns (from CLI)
// =============================================================================

interface PatternDef {
  name: string;
  pattern: RegExp;
  confidence: 'high' | 'medium' | 'low';
}

// High confidence patterns - very likely injection attempts
const HIGH_CONFIDENCE_PATTERNS: PatternDef[] = [
  {
    name: 'ignore_instructions',
    pattern: /ignore\s+(?:all\s+)?(?:previous|prior|above|earlier|my|your|the)\s+(?:instructions?|prompts?|rules?|guidelines?|constraints?)/gi,
    confidence: 'high',
  },
  {
    name: 'disregard_instructions',
    pattern: /disregard\s+(?:all\s+)?(?:previous|prior|above|earlier|my|your|the)\s+(?:instructions?|prompts?|rules?|guidelines?|constraints?)/gi,
    confidence: 'high',
  },
  {
    name: 'forget_instructions',
    pattern: /forget\s+(?:all\s+)?(?:previous|prior|above|earlier|everything|what)\s+(?:instructions?|prompts?|i\s+said|you\s+were\s+told)?/gi,
    confidence: 'high',
  },
  {
    name: 'new_instructions',
    pattern: /(?:new|real|actual|true)\s+instructions?\s*[:=]/gi,
    confidence: 'high',
  },
  {
    name: 'system_prompt_override',
    pattern: /\[?\s*system\s*\]?\s*[:=]?\s*(?:you\s+are|your\s+(?:new\s+)?(?:instructions?|role|purpose))/gi,
    confidence: 'high',
  },
  {
    name: 'jailbreak_dan',
    pattern: /\bDAN\s*(?:mode|prompt|jailbreak)|\bDo\s+Anything\s+Now\b/gi,
    confidence: 'high',
  },
  {
    name: 'jailbreak_developer_mode',
    pattern: /developer\s+mode\s+enabled|enable\s+developer\s+mode/gi,
    confidence: 'high',
  },
  {
    name: 'roleplay_evil',
    pattern: /(?:pretend|act|behave)\s+(?:to\s+be|as\s+if\s+you(?:'re|\s+are)?|like\s+you(?:'re|\s+are)?)\s+(?:an?\s+)?(?:evil|malicious|unethical|unrestricted|uncensored)/gi,
    confidence: 'high',
  },
  {
    name: 'override_safety',
    pattern: /(?:bypass|disable|ignore|remove|turn\s+off)\s+(?:your\s+)?(?:safety|filter|guard|restriction|ethical)/gi,
    confidence: 'high',
  },
  {
    name: 'injection_delimiter',
    pattern: /(?:---+|===+|\*\*\*+)\s*(?:ignore|disregard|forget|new\s+instructions?)/gi,
    confidence: 'high',
  },
];

// Medium confidence patterns - suspicious but may have legitimate uses
const MEDIUM_CONFIDENCE_PATTERNS: PatternDef[] = [
  {
    name: 'context_switch',
    pattern: /(?:---+|===+|\*\*\*+)\s*(?:new|end|start|begin)\s+(?:conversation|context|session|instructions?)/gi,
    confidence: 'medium',
  },
  {
    name: 'hypothetical_bypass',
    pattern: /(?:hypothetically|theoretically|for\s+(?:educational|research)\s+purposes?|in\s+a\s+fictional\s+(?:scenario|world))\s*,?\s*(?:how\s+(?:would|could|can)|what\s+if)/gi,
    confidence: 'medium',
  },
  {
    name: 'roleplay_character',
    pattern: /(?:you\s+are\s+now|from\s+now\s+on\s+you\s+are|pretend\s+(?:to\s+be|you\s+are)|act\s+as\s+(?:if\s+you\s+are)?|roleplay\s+as)\s+(?:a\s+)?[a-z]+/gi,
    confidence: 'medium',
  },
  {
    name: 'admin_override',
    pattern: /(?:admin|administrator|root|sudo|superuser)\s+(?:mode|access|override|privileges?|commands?)/gi,
    confidence: 'medium',
  },
  {
    name: 'prompt_leak_attempt',
    pattern: /(?:show|display|print|output|reveal|tell\s+me|what\s+is)\s+(?:your|the)\s+(?:system\s+)?(?:prompt|instructions?|rules?|guidelines?)/gi,
    confidence: 'medium',
  },
  {
    name: 'base64_injection',
    pattern: /(?:decode|interpret|run)\s+(?:this\s+)?base64\s*[:=]?\s*[A-Za-z0-9+/=]{20,}/gi,
    confidence: 'medium',
  },
  {
    name: 'hidden_text_injection',
    pattern: /(?:hidden|invisible|secret)\s+(?:text|message|instruction)/gi,
    confidence: 'medium',
  },
];

// Low confidence patterns - could be injection but often false positives
const LOW_CONFIDENCE_PATTERNS: PatternDef[] = [
  {
    name: 'code_block_injection',
    pattern: /```(?:system|instructions?|prompt)\n[\s\S]*?```/gi,
    confidence: 'low',
  },
  {
    name: 'xml_tag_injection',
    pattern: /<\/?(?:system|instructions?|prompt|rules?|guidelines?)>/gi,
    confidence: 'low',
  },
  {
    name: 'special_tokens',
    pattern: /\[\/?(?:INST|SYS|SYSTEM|ASSISTANT|USER)\]|\<\|(?:im_start|im_end|system|assistant|user)\|?\>/gi,
    confidence: 'low',
  },
  {
    name: 'separator_flood',
    pattern: /(?:[-=_*#]{10,}|\.{10,}|\n{5,})/g,
    confidence: 'low',
  },
];

// =============================================================================
// Configuration
// =============================================================================

export interface InputSanitizerConfig {
  /** Sensitivity level for injection detection */
  sensitivity: 'low' | 'medium' | 'high';
  /** Action to take on detection */
  action: 'block' | 'rephrase' | 'log';
  /** Internal LLM configuration for rephrasing */
  internalLLM?: {
    apiKey?: string;
    model?: string;
  };
}

// =============================================================================
// Detection Function
// =============================================================================

function detectInjection(
  text: string,
  sensitivity: 'low' | 'medium' | 'high'
): InjectionMatch[] {
  const matches: InjectionMatch[] = [];

  // Select patterns based on sensitivity
  let patterns: PatternDef[] = [...HIGH_CONFIDENCE_PATTERNS];
  if (sensitivity === 'medium' || sensitivity === 'high') {
    patterns = [...patterns, ...MEDIUM_CONFIDENCE_PATTERNS];
  }
  if (sensitivity === 'high') {
    patterns = [...patterns, ...LOW_CONFIDENCE_PATTERNS];
  }

  for (const { name, pattern, confidence } of patterns) {
    // Reset regex lastIndex
    pattern.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      // Avoid duplicate matches at same position
      const isDuplicate = matches.some(
        (m) => m.technique === name && m.position === match!.index
      );

      if (!isDuplicate) {
        matches.push({
          technique: name,
          pattern: pattern.source.substring(0, 50) + '...',
          matched: match[0].substring(0, 100),
          position: match.index,
          confidence,
          inInput: true,
        });
      }
    }
  }

  return matches;
}

// =============================================================================
// Main Sanitization Function
// =============================================================================

export async function sanitizeInput(
  messages: ChatMessage[],
  config: InputSanitizerConfig
): Promise<InputSanitizationResult> {
  const startTime = Date.now();
  const allMatches: InjectionMatch[] = [];

  // Check each message for injection patterns
  for (const message of messages) {
    if (message.content && message.role === 'user') {
      const matches = detectInjection(message.content, config.sensitivity);
      allMatches.push(...matches);
    }
  }

  const injectionDetected = allMatches.length > 0;

  // Determine action
  let blocked = false;
  let blockReason: string | undefined;
  let sanitizedMessages = messages;

  if (injectionDetected) {
    switch (config.action) {
      case 'block': {
        blocked = true;
        const highConfidence = allMatches.filter((m) => m.confidence === 'high');
        blockReason = highConfidence.length > 0
          ? `Blocked due to high-confidence injection: ${highConfidence.map((m) => m.technique).join(', ')}`
          : `Blocked due to injection patterns: ${allMatches.map((m) => m.technique).join(', ')}`;
        break;
      }

      case 'rephrase': {
        // Only rephrase if we have an LLM configured
        if (config.internalLLM?.apiKey) {
          sanitizedMessages = await rephraseMessages(messages, config.internalLLM);
        } else {
          // Fall back to basic cleanup if no LLM available
          sanitizedMessages = basicCleanup(messages, allMatches);
        }
        break;
      }

      case 'log':
        // Just log, don't modify
        break;
    }
  }

  return {
    original: messages,
    sanitized: sanitizedMessages,
    injectionDetected,
    injectionMatches: allMatches,
    blocked,
    blockReason,
    latencyMs: Date.now() - startTime,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

async function rephraseMessages(
  messages: ChatMessage[],
  llmConfig: { apiKey?: string; model?: string }
): Promise<ChatMessage[]> {
  const result: ChatMessage[] = [];

  for (const message of messages) {
    if (message.role === 'user' && message.content) {
      // Check if this message has injection patterns
      const matches = detectInjection(message.content, 'medium');

      if (matches.length > 0) {
        // Rephrase this message using LLM
        const rephrased = await rephraseWithLLM(message.content, {
          apiKey: llmConfig.apiKey || process.env.OPENAI_API_KEY || '',
          model: llmConfig.model || 'gpt-4o-mini',
        });

        result.push({
          ...message,
          content: rephrased,
        });
      } else {
        result.push(message);
      }
    } else {
      result.push(message);
    }
  }

  return result;
}

function basicCleanup(
  messages: ChatMessage[],
  matches: InjectionMatch[]
): ChatMessage[] {
  // Create a map of positions to remove
  const removals = new Map<string, Array<{ start: number; end: number }>>();

  for (const match of matches) {
    // Only remove high confidence matches in basic cleanup
    if (match.confidence !== 'high') continue;

    const key = messages.findIndex(
      (m) => m.role === 'user' && m.content?.includes(match.matched)
    );
    if (key === -1) continue;

    if (!removals.has(key.toString())) {
      removals.set(key.toString(), []);
    }
    removals.get(key.toString())!.push({
      start: match.position,
      end: match.position + match.matched.length,
    });
  }

  return messages.map((message, index) => {
    const messageRemovals = removals.get(index.toString());
    if (!messageRemovals || !message.content) {
      return message;
    }

    // Sort removals by position (descending) to preserve positions during removal
    messageRemovals.sort((a, b) => b.start - a.start);

    let content = message.content;
    for (const removal of messageRemovals) {
      content = content.slice(0, removal.start) + content.slice(removal.end);
    }

    return {
      ...message,
      content: content.trim(),
    };
  });
}
