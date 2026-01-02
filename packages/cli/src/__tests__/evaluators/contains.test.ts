/**
 * Contains Evaluator Unit Tests
 *
 * Tests the ContainsEvaluator with various edge cases.
 */

import { describe, it, expect } from 'vitest';
import { runEvaluator } from '../../runner/evaluators';

describe('ContainsEvaluator', () => {
  describe('Basic Matching', () => {
    it('should pass when output contains expected term', async () => {
      const result = await runEvaluator('contains', {
        input: 'test',
        output: 'hello world, how are you?',
        expected: 'world',
      });

      expect(result.passed).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should fail when output does not contain expected term', async () => {
      const result = await runEvaluator('contains', {
        input: 'test',
        output: 'hello world',
        expected: 'goodbye',
      });

      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
    });
  });

  describe('Array of Expected Terms', () => {
    it('should pass when output contains any term (default OR mode)', async () => {
      const result = await runEvaluator('contains', {
        input: 'test',
        output: 'hello world',
        expected: ['goodbye', 'world', 'universe'],
      });

      expect(result.passed).toBe(true);
    });

    it('should calculate score as proportion of matches', async () => {
      const result = await runEvaluator('contains', {
        input: 'test',
        output: 'hello world',
        expected: ['hello', 'world', 'goodbye', 'universe'],
      });

      // 2 out of 4 terms match
      expect(result.score).toBe(0.5);
    });

    it('should fail when no terms match', async () => {
      const result = await runEvaluator('contains', {
        input: 'test',
        output: 'hello world',
        expected: ['goodbye', 'farewell', 'adieu'],
      });

      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
    });
  });

  describe('Match All Mode (AND)', () => {
    it('should pass when all terms are found with match_all=true', async () => {
      const result = await runEvaluator('contains', {
        input: 'test',
        output: 'hello world and goodbye',
        expected: ['hello', 'world', 'goodbye'],
        config: { match_all: true },
      });

      expect(result.passed).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should fail when not all terms found with match_all=true', async () => {
      const result = await runEvaluator('contains', {
        input: 'test',
        output: 'hello world',
        expected: ['hello', 'world', 'goodbye'],
        config: { match_all: true },
      });

      expect(result.passed).toBe(false);
    });

    it('should pass with single term and match_all=true', async () => {
      const result = await runEvaluator('contains', {
        input: 'test',
        output: 'hello world',
        expected: ['world'],
        config: { match_all: true },
      });

      expect(result.passed).toBe(true);
    });
  });

  describe('Case Sensitivity', () => {
    it('should be case-insensitive by default', async () => {
      const result = await runEvaluator('contains', {
        input: 'test',
        output: 'Hello World',
        expected: 'hello',
      });

      expect(result.passed).toBe(true);
    });

    it('should respect case when case_sensitive=true', async () => {
      const result = await runEvaluator('contains', {
        input: 'test',
        output: 'Hello World',
        expected: 'hello',
        config: { case_sensitive: true },
      });

      expect(result.passed).toBe(false);
    });

    it('should match case exactly when case_sensitive=true', async () => {
      const result = await runEvaluator('contains', {
        input: 'test',
        output: 'Hello World',
        expected: 'Hello',
        config: { case_sensitive: true },
      });

      expect(result.passed).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty output', async () => {
      const result = await runEvaluator('contains', {
        input: 'test',
        output: '',
        expected: 'hello',
      });

      expect(result.passed).toBe(false);
    });

    it('should handle single character matches', async () => {
      const result = await runEvaluator('contains', {
        input: 'test',
        output: 'abc',
        expected: 'b',
      });

      expect(result.passed).toBe(true);
    });

    it('should handle special regex characters as literals', async () => {
      const result = await runEvaluator('contains', {
        input: 'test',
        output: 'hello. how are you?',
        expected: '.',
      });

      expect(result.passed).toBe(true);
    });

    it('should handle partial word matches', async () => {
      const result = await runEvaluator('contains', {
        input: 'test',
        output: 'unhappy',
        expected: 'happy',
      });

      expect(result.passed).toBe(true);
    });

    it('should handle whitespace in expected terms', async () => {
      const result = await runEvaluator('contains', {
        input: 'test',
        output: 'hello world',
        expected: 'hello world',
      });

      expect(result.passed).toBe(true);
    });

    it('should handle unicode characters', async () => {
      const result = await runEvaluator('contains', {
        input: 'test',
        output: 'Hello 世界!',
        expected: '世界',
      });

      expect(result.passed).toBe(true);
    });

    it('should handle emoji', async () => {
      const result = await runEvaluator('contains', {
        input: 'test',
        output: 'Hello 👋 World 🌍',
        expected: '🌍',
      });

      expect(result.passed).toBe(true);
    });

    it('should handle missing expected value', async () => {
      const result = await runEvaluator('contains', {
        input: 'test',
        output: 'hello world',
      });

      expect(result.passed).toBe(false);
      expect(result.reason).toBeDefined();
    });
  });

  describe('Details Object', () => {
    it('should include match details', async () => {
      const result = await runEvaluator('contains', {
        input: 'test',
        output: 'hello world',
        expected: ['hello', 'goodbye'],
      });

      expect(result.details).toBeDefined();
      expect(result.details?.matches).toBeDefined();
      expect(Array.isArray(result.details?.matches)).toBe(true);
    });

    it('should show which terms matched', async () => {
      const result = await runEvaluator('contains', {
        input: 'test',
        output: 'hello world',
        expected: ['hello', 'goodbye', 'world'],
      });

      const matches = result.details?.matches as Array<{ term: string; found: boolean }>;
      expect(matches).toContainEqual({ term: 'hello', found: true });
      expect(matches).toContainEqual({ term: 'goodbye', found: false });
      expect(matches).toContainEqual({ term: 'world', found: true });
    });

    it('should include match_mode in details', async () => {
      const result = await runEvaluator('contains', {
        input: 'test',
        output: 'hello',
        expected: ['hello'],
        config: { match_all: true },
      });

      expect(result.details?.match_mode).toBe('all');
    });
  });

  describe('Large Arrays', () => {
    it('should handle many expected terms', async () => {
      const terms = Array.from({ length: 100 }, (_, i) => `term${i}`);
      const output = terms.slice(0, 50).join(' '); // First 50 terms

      const result = await runEvaluator('contains', {
        input: 'test',
        output,
        expected: terms,
      });

      expect(result.score).toBe(0.5);
      expect(result.passed).toBe(true); // Any match passes in OR mode
    });
  });

  describe('Reason Messages', () => {
    it('should provide helpful reason on pass', async () => {
      const result = await runEvaluator('contains', {
        input: 'test',
        output: 'hello world',
        expected: ['hello', 'world'],
      });

      expect(result.reason).toContain('2');
      expect(result.reason).toContain('2');
    });

    it('should list missing terms on fail', async () => {
      const result = await runEvaluator('contains', {
        input: 'test',
        output: 'hello',
        expected: ['hello', 'world', 'goodbye'],
        config: { match_all: true },
      });

      expect(result.reason).toContain('world');
      expect(result.reason).toContain('goodbye');
    });
  });
});
