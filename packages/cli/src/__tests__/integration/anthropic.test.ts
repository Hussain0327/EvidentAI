/**
 * Anthropic Provider Integration Tests
 *
 * These tests make real API calls to Anthropic.
 * They are skipped if ANTHROPIC_API_KEY is not set.
 *
 * Run with: ANTHROPIC_API_KEY=xxx pnpm test
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execute } from '../../index';
import {
  describeWithAnthropic,
  hasAnthropicKey,
  createTestConfig,
  createTestSuite,
  TEST_INPUTS,
  withTimeout,
} from '../helpers';
import type { Config } from '../../config/types';

// Increase timeout for real API calls
const API_TIMEOUT = 30000;

describeWithAnthropic('Anthropic Provider Integration', () => {
  beforeAll(() => {
    if (!hasAnthropicKey()) {
      console.log('Skipping Anthropic tests - ANTHROPIC_API_KEY not set');
    }
  });

  describe('Basic API Calls', () => {
    it('should successfully call Anthropic API and get a response', async () => {
      const config: Config = {
        ...createTestConfig({
          provider: {
            name: 'anthropic' as const,
            model: 'claude-3-haiku-20240307',
          },
        }),
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
        'Anthropic API call timed out'
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
        ...createTestConfig({
          provider: {
            name: 'anthropic' as const,
            model: 'claude-3-haiku-20240307',
          },
        }),
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
        'Anthropic API call timed out'
      );

      const testResult = result.suites[0].testCases[0];
      expect(testResult.output).toContain('4');
      expect(testResult.result.passed).toBe(true);
    }, API_TIMEOUT + 5000);
  });

  describe('Error Handling', () => {
    it('should fail gracefully with invalid API key', async () => {
      // Temporarily override the API key
      const originalKey = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'invalid-key-12345';

      try {
        const config: Config = {
          ...createTestConfig({
            provider: {
              name: 'anthropic' as const,
              model: 'claude-3-haiku-20240307',
            },
          }),
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
          'Anthropic API call timed out'
        );

        // Should complete but test should fail due to API error
        const testResult = result.suites[0].testCases[0];
        expect(testResult.result.passed).toBe(false);
        expect(testResult.result.reason).toContain('API error');
      } finally {
        // Restore the original key
        process.env.ANTHROPIC_API_KEY = originalKey;
      }
    }, API_TIMEOUT + 5000);
  });

  describe('Model Configuration', () => {
    it('should work with claude-3-haiku model', async () => {
      const config: Config = {
        ...createTestConfig({
          provider: {
            name: 'anthropic' as const,
            model: 'claude-3-haiku-20240307',
            max_tokens: 100,
          },
        }),
        suites: [
          createTestSuite('model-test', {
            name: 'haiku-test',
            input: 'What is 1+1? Reply with just the number.',
            evaluator: 'contains',
            expected: ['2'],
          }),
        ],
      };

      const result = await withTimeout(
        execute(config),
        API_TIMEOUT,
        'Anthropic API call timed out'
      );

      expect(result.suites[0].testCases[0].result.passed).toBe(true);
    }, API_TIMEOUT + 5000);
  });

  describe('Response Format', () => {
    it('should correctly parse Anthropic response format', async () => {
      const config: Config = {
        ...createTestConfig({
          provider: {
            name: 'anthropic' as const,
            model: 'claude-3-haiku-20240307',
          },
        }),
        suites: [
          createTestSuite('format', {
            name: 'format-test',
            input: 'Reply with exactly: "Hello World"',
            evaluator: 'contains',
            expected: ['Hello', 'World'],
          }),
        ],
      };

      const result = await withTimeout(
        execute(config),
        API_TIMEOUT,
        'Anthropic API call timed out'
      );

      const testResult = result.suites[0].testCases[0];
      // Anthropic returns content[0].text - verify it's parsed correctly
      expect(typeof testResult.output).toBe('string');
      expect(testResult.output.length).toBeGreaterThan(0);
    }, API_TIMEOUT + 5000);
  });

  describe('Concurrent Execution', () => {
    it('should handle multiple concurrent requests', async () => {
      const config: Config = {
        ...createTestConfig({
          provider: {
            name: 'anthropic' as const,
            model: 'claude-3-haiku-20240307',
          },
        }),
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
        'Concurrent Anthropic API calls timed out'
      );

      expect(result.suites[0].testCases).toHaveLength(3);
      expect(result.suites[0].passed).toBeGreaterThanOrEqual(2); // Allow 1 flaky result
    }, API_TIMEOUT * 2 + 5000);
  });
});
