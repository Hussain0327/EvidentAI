/**
 * Exact Match Evaluator Unit Tests
 *
 * Tests the ExactMatchEvaluator with various edge cases.
 */

import { describe, it, expect } from 'vitest';
import { runEvaluator } from '../../runner/evaluators';

describe('ExactMatchEvaluator', () => {
  describe('Basic Matching', () => {
    it('should pass when output exactly matches expected', async () => {
      const result = await runEvaluator('exact-match', {
        input: 'test',
        output: 'hello world',
        expected: 'hello world',
      });

      expect(result.passed).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should fail when output does not match expected', async () => {
      const result = await runEvaluator('exact-match', {
        input: 'test',
        output: 'hello world',
        expected: 'goodbye world',
      });

      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
    });

    it('should include reason in result', async () => {
      const result = await runEvaluator('exact-match', {
        input: 'test',
        output: 'hello',
        expected: 'world',
      });

      expect(result.reason).toBeDefined();
      expect(result.reason).toContain('not match');
    });
  });

  describe('Case Sensitivity', () => {
    it('should be case-sensitive by default', async () => {
      const result = await runEvaluator('exact-match', {
        input: 'test',
        output: 'Hello World',
        expected: 'hello world',
      });

      expect(result.passed).toBe(false);
    });

    it('should ignore case when case_sensitive is false', async () => {
      const result = await runEvaluator('exact-match', {
        input: 'test',
        output: 'Hello World',
        expected: 'hello world',
        config: { case_sensitive: false },
      });

      expect(result.passed).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should respect case when case_sensitive is true', async () => {
      const result = await runEvaluator('exact-match', {
        input: 'test',
        output: 'Hello World',
        expected: 'hello world',
        config: { case_sensitive: true },
      });

      expect(result.passed).toBe(false);
    });
  });

  describe('Whitespace Handling', () => {
    it('should trim whitespace by default', async () => {
      const result = await runEvaluator('exact-match', {
        input: 'test',
        output: '  hello world  ',
        expected: 'hello world',
      });

      expect(result.passed).toBe(true);
    });

    it('should not trim when trim_whitespace is false', async () => {
      const result = await runEvaluator('exact-match', {
        input: 'test',
        output: '  hello world  ',
        expected: 'hello world',
        config: { trim_whitespace: false },
      });

      expect(result.passed).toBe(false);
    });

    it('should handle leading and trailing newlines', async () => {
      const result = await runEvaluator('exact-match', {
        input: 'test',
        output: '\nhello world\n',
        expected: 'hello world',
      });

      expect(result.passed).toBe(true);
    });

    it('should preserve internal whitespace', async () => {
      const result = await runEvaluator('exact-match', {
        input: 'test',
        output: 'hello  world',
        expected: 'hello world',
      });

      expect(result.passed).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strings', async () => {
      const result = await runEvaluator('exact-match', {
        input: 'test',
        output: '',
        expected: '',
      });

      expect(result.passed).toBe(true);
    });

    it('should fail when expected is empty but output is not', async () => {
      const result = await runEvaluator('exact-match', {
        input: 'test',
        output: 'hello',
        expected: '',
      });

      expect(result.passed).toBe(false);
    });

    it('should fail when output is empty but expected is not', async () => {
      const result = await runEvaluator('exact-match', {
        input: 'test',
        output: '',
        expected: 'hello',
      });

      expect(result.passed).toBe(false);
    });

    it('should handle special characters', async () => {
      const result = await runEvaluator('exact-match', {
        input: 'test',
        output: 'hello! @#$% world?',
        expected: 'hello! @#$% world?',
      });

      expect(result.passed).toBe(true);
    });

    it('should handle unicode characters', async () => {
      const result = await runEvaluator('exact-match', {
        input: 'test',
        output: 'Hello 世界 🌍',
        expected: 'Hello 世界 🌍',
      });

      expect(result.passed).toBe(true);
    });

    it('should handle multiline strings', async () => {
      const result = await runEvaluator('exact-match', {
        input: 'test',
        output: 'line1\nline2\nline3',
        expected: 'line1\nline2\nline3',
      });

      expect(result.passed).toBe(true);
    });

    it('should fail when no expected value provided', async () => {
      const result = await runEvaluator('exact-match', {
        input: 'test',
        output: 'hello',
      });

      expect(result.passed).toBe(false);
      expect(result.reason).toContain('Expected value must be a string');
    });
  });

  describe('Details Object', () => {
    it('should include details in result', async () => {
      const result = await runEvaluator('exact-match', {
        input: 'test',
        output: 'hello',
        expected: 'world',
      });

      expect(result.details).toBeDefined();
      expect(result.details?.expected).toBe('world');
      expect(result.details?.actual).toBe('hello');
    });

    it('should include config options in details', async () => {
      const result = await runEvaluator('exact-match', {
        input: 'test',
        output: 'HELLO',
        expected: 'hello',
        config: { case_sensitive: false },
      });

      expect(result.details?.case_sensitive).toBe(false);
    });
  });

  describe('Array Expected Values', () => {
    it('should fail when expected is an array (requires string)', async () => {
      const result = await runEvaluator('exact-match', {
        input: 'test',
        output: 'hello',
        expected: ['hello', 'world'],
      });

      // exact-match requires a string, not an array
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('string');
    });
  });
});
