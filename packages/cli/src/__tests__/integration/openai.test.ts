/**
 * OpenAI Provider Integration Tests
 *
 * These tests make real API calls to OpenAI.
 * They are skipped if OPENAI_API_KEY is not set.
 *
 * Run with: OPENAI_API_KEY=xxx pnpm test
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execute } from '../../index';
import {
  describeWithOpenAI,
  hasOpenAIKey,
  createTestConfig,
  createTestSuite,
  TEST_INPUTS,
  withTimeout,
} from '../helpers';
import type { Config } from '../../config/types';

// Increase timeout for real API calls
const API_TIMEOUT = 30000;

describeWithOpenAI('OpenAI Provider Integration', () => {
  beforeAll(() => {
    if (!hasOpenAIKey()) {
      console.log('Skipping OpenAI tests - OPENAI_API_KEY not set');
    }
  });

  describe('Basic API Calls', () => {
    it('should successfully call OpenAI API and get a response', async () => {
      const config: Config = {
        ...createTestConfig(),
        suites: [
          createTestSuite('basic', {
            name: 'greeting-test',
            input: TEST_INPUTS.greeting,
            evaluator: 'contains',
            expected: ['hello', 'hi', 'hey', 'Hello', 'Hi', 'Hey'],
          }),
        ],
      };

      const result = await withTimeout(
        execute(config),
        API_TIMEOUT,
        'OpenAI API call timed out'
      );

      expect(result).toBeDefined();
      expect(result.suites).toHaveLength(1);
      expect(result.suites[0].testCases).toHaveLength(1);

      const testResult = result.suites[0].testCases[0];
      expect(testResult.output).toBeTruthy();
      expect(testResult.output.length).toBeGreaterThan(0);
      expect(testResult.latencyMs).toBeGreaterThan(0);
    }, API_TIMEOUT + 5000);

    it('should handle simple math problem', async () => {
      const config: Config = {
        ...createTestConfig(),
        suites: [
          createTestSuite('math', {
            name: 'math-test',
            input: TEST_INPUTS.mathProblem,
            evaluator: 'contains',
            expected: ['4'],
          }),
        ],
      };

      const result = await withTimeout(
        execute(config),
        API_TIMEOUT,
        'OpenAI API call timed out'
      );

      const testResult = result.suites[0].testCases[0];
      expect(testResult.output).toContain('4');
      expect(testResult.result.passed).toBe(true);
    }, API_TIMEOUT + 5000);
  });

  describe('Error Handling', () => {
    it('should fail gracefully with invalid API key', async () => {
      // Temporarily override the API key
      const originalKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'invalid-key-12345';

      try {
        const config: Config = {
          ...createTestConfig(),
          suites: [
            createTestSuite('error', {
              name: 'error-test',
              input: 'Hello',
              evaluator: 'contains',
              expected: ['hello'],
            }),
          ],
        };

        const result = await withTimeout(
          execute(config),
          API_TIMEOUT,
          'OpenAI API call timed out'
        );

        // Should complete but test should fail due to API error
        const testResult = result.suites[0].testCases[0];
        expect(testResult.result.passed).toBe(false);
        expect(testResult.result.reason).toContain('API error');
      } finally {
        // Restore the original key
        process.env.OPENAI_API_KEY = originalKey;
      }
    }, API_TIMEOUT + 5000);
  });

  describe('Model Configuration', () => {
    it('should work with gpt-4o-mini model', async () => {
      const config: Config = {
        ...createTestConfig({
          provider: {
            name: 'openai' as const,
            model: 'gpt-4o-mini',
            temperature: 0.3, // Lower for more consistent results
          },
        }),
        suites: [
          createTestSuite('model-test', {
            name: 'mini-test',
            input: 'What is 1+1? Reply with just the number.',
            evaluator: 'contains',
            expected: ['2'],
          }),
        ],
      };

      const result = await withTimeout(
        execute(config),
        API_TIMEOUT,
        'OpenAI API call timed out'
      );

      expect(result.suites[0].testCases[0].result.passed).toBe(true);
    }, API_TIMEOUT + 5000);
  });

  describe('Retry Logic', () => {
    it('should track retry count on success', async () => {
      const config: Config = {
        ...createTestConfig(),
        suites: [
          createTestSuite('retry', {
            name: 'retry-test',
            input: 'Say "ok"',
            evaluator: 'contains',
            expected: ['ok', 'OK', 'Ok'],
          }),
        ],
      };

      const result = await withTimeout(
        execute(config, { maxRetries: 3 }),
        API_TIMEOUT,
        'OpenAI API call timed out'
      );

      const testResult = result.suites[0].testCases[0];
      // On success, retries should be 0
      expect(testResult.retries).toBe(0);
    }, API_TIMEOUT + 5000);
  });

  describe('Concurrent Execution', () => {
    it('should handle multiple concurrent requests', async () => {
      const config: Config = {
        ...createTestConfig(),
        suites: [
          {
            name: 'concurrent',
            cases: [
              {
                name: 'test-1',
                input: 'Say "one"',
                evaluator: 'contains' as const,
                expected: ['one', 'One'],
              },
              {
                name: 'test-2',
                input: 'Say "two"',
                evaluator: 'contains' as const,
                expected: ['two', 'Two'],
              },
              {
                name: 'test-3',
                input: 'Say "three"',
                evaluator: 'contains' as const,
                expected: ['three', 'Three'],
              },
            ],
          },
        ],
      };

      const result = await withTimeout(
        execute(config, { concurrency: 3 }),
        API_TIMEOUT * 2,
        'Concurrent OpenAI API calls timed out'
      );

      expect(result.suites[0].testCases).toHaveLength(3);
      expect(result.suites[0].passed).toBeGreaterThanOrEqual(2); // Allow 1 flaky result
    }, API_TIMEOUT * 2 + 5000);
  });
});
