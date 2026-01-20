/**
 * Output Processing Pipeline
 *
 * Detects and redacts PII from LLM responses.
 * Uses patterns from @evidentai/cli pii-detector evaluator.
 *
 * Supported PII types:
 * - email: Email addresses
 * - phone: Phone numbers (US and international)
 * - ssn: Social Security Numbers
 * - credit_card: Credit card numbers (with Luhn validation)
 * - ip_address: IPv4 and IPv6 addresses
 * - address: Street addresses
 * - name: Person names (basic heuristic)
 * - date_of_birth: Birthdates with context
 */

import type { PIIEntityType, PIIMatch, OutputProcessingResult } from '../types.js';

// =============================================================================
// PII Detection Patterns (from CLI)
// =============================================================================

const PII_PATTERNS: Record<PIIEntityType, { pattern: RegExp; confidence: 'high' | 'medium' | 'low' }[]> = {
  email: [
    {
      pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      confidence: 'high',
    },
  ],

  phone: [
    // US formats
    { pattern: /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, confidence: 'high' },
    // Parentheses format
    { pattern: /(?<![A-Za-z0-9])\(\d{3}\)\s*\d{3}[-.\s]?\d{4}\b/g, confidence: 'high' },
    // +1 format
    { pattern: /(?<![A-Za-z0-9])\+1[-.\s]?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, confidence: 'high' },
    // International
    { pattern: /(?<![A-Za-z0-9])\+\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}\b/g, confidence: 'medium' },
  ],

  ssn: [
    // With context words
    { pattern: /(?:ssn|social\s*security(?:\s*number)?)[:\s]*\d{3}[-\s]?\d{2}[-\s]?\d{4}/gi, confidence: 'high' },
    // Standard SSN format with separators
    { pattern: /\b(?!000|666|9\d\d)\d{3}[-\s]\d{2}[-\s]\d{4}\b/g, confidence: 'medium' },
    // Without separators - only with context
    { pattern: /(?:ssn|social)[:\s#]*(\d{9})\b/gi, confidence: 'medium' },
  ],

  credit_card: [
    // Visa
    { pattern: /\b4\d{3}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, confidence: 'high' },
    // Mastercard
    { pattern: /\b5[1-5]\d{2}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, confidence: 'high' },
    // Amex
    { pattern: /\b3[47]\d{2}[-\s]?\d{6}[-\s]?\d{5}\b/g, confidence: 'high' },
    // Discover
    { pattern: /\b6(?:011|5\d{2})[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, confidence: 'high' },
    // Generic 16-digit
    { pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, confidence: 'medium' },
  ],

  ip_address: [
    // IPv4
    { pattern: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g, confidence: 'high' },
    // IPv6 (simplified)
    { pattern: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g, confidence: 'high' },
  ],

  address: [
    // US street address pattern
    { pattern: /\b\d+\s+[A-Za-z]+(?:\s+[A-Za-z]+)*\s+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl)\.?\s*(?:,?\s*(?:Apt|Suite|Unit|#)\s*\d+)?/gi, confidence: 'medium' },
    // With zip code
    { pattern: /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,?\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?\b/g, confidence: 'high' },
  ],

  name: [
    // Names with salutations
    { pattern: /\b(?:Mr\.?|Mrs\.?|Ms\.?|Dr\.?|Prof\.?)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g, confidence: 'medium' },
  ],

  date_of_birth: [
    // With context
    { pattern: /(?:born|dob|date\s*of\s*birth|birthday)[:\s]*\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/gi, confidence: 'high' },
    { pattern: /(?:born|dob|date\s*of\s*birth|birthday)[:\s]*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{1,2},?\s*\d{4}/gi, confidence: 'high' },
  ],
};

// =============================================================================
// Configuration
// =============================================================================

export interface OutputProcessorConfig {
  /** PII types to detect */
  piiTypes: PIIEntityType[];
  /** Action to take on detection */
  action: 'block' | 'redact' | 'log';
}

// =============================================================================
// Luhn Algorithm for Credit Card Validation
// =============================================================================

function isValidCreditCard(number: string): boolean {
  const digits = number.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let isEven = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i]!, 10);
    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}

// =============================================================================
// PII Detection
// =============================================================================

function detectPII(text: string, typesToDetect: PIIEntityType[]): PIIMatch[] {
  const matches: PIIMatch[] = [];

  for (const type of typesToDetect) {
    const patterns = PII_PATTERNS[type] || [];

    for (const { pattern, confidence } of patterns) {
      // Reset regex lastIndex for global patterns
      pattern.lastIndex = 0;

      let regexMatch: RegExpExecArray | null;
      while ((regexMatch = pattern.exec(text)) !== null) {
        const value = regexMatch[0];

        // Additional validation for credit cards
        if (type === 'credit_card' && !isValidCreditCard(value)) {
          continue;
        }

        // Avoid duplicate matches
        const isDuplicate = matches.some(
          (m) => m.type === type && m.start === regexMatch!.index
        );
        if (!isDuplicate) {
          matches.push({
            type,
            value,
            start: regexMatch.index,
            end: regexMatch.index + value.length,
            confidence,
          });
        }
      }
    }
  }

  // Sort by position
  return matches.sort((a, b) => a.start - b.start);
}

// =============================================================================
// PII Redaction
// =============================================================================

function redactPII(text: string, matches: PIIMatch[]): string {
  let result = text;
  // Process in reverse order to maintain positions
  const sortedMatches = [...matches].sort((a, b) => b.start - a.start);

  for (const piiMatch of sortedMatches) {
    // Use type-specific placeholder as specified in the plan
    const redacted = `[PII:${piiMatch.type.toUpperCase()}]`;
    result = result.slice(0, piiMatch.start) + redacted + result.slice(piiMatch.end);
  }

  return result;
}

// =============================================================================
// Main Processing Function
// =============================================================================

export async function processOutput(
  content: string,
  config: OutputProcessorConfig
): Promise<OutputProcessingResult> {
  const startTime = Date.now();

  // Detect PII
  const matches = detectPII(content, config.piiTypes);
  const piiDetected = matches.length > 0;

  // Determine action
  let blocked = false;
  let blockReason: string | undefined;
  let processed = content;

  if (piiDetected) {
    switch (config.action) {
      case 'block': {
        blocked = true;
        const types = [...new Set(matches.map((m) => m.type))];
        blockReason = `Response blocked due to PII: ${types.join(', ')}`;
        break;
      }

      case 'redact': {
        processed = redactPII(content, matches);
        break;
      }

      case 'log':
        // Just log, don't modify
        break;
    }
  }

  return {
    original: content,
    processed,
    piiDetected,
    piiMatches: matches,
    blocked,
    blockReason,
    latencyMs: Date.now() - startTime,
  };
}

// =============================================================================
// Utility Exports
// =============================================================================

export { detectPII, redactPII };
