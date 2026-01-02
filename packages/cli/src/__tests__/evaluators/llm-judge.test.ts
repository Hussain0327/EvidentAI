/**
 * LLM Judge Evaluator Unit Tests
 *
 * Tests the JSON parsing and response handling logic.
 * Real API tests are in integration tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LLMJudgeEvaluator } from '../../runner/evaluators/llm-judge';

describe('LLMJudgeEvaluator', () => {
  let evaluator: LLMJudgeEvaluator;
  let originalFetch: typeof global.fetch;
  let originalApiKey: string | undefined;

  beforeEach(() => {
    evaluator = new LLMJudgeEvaluator();
    originalFetch = global.fetch;
    originalApiKey = process.env.OPENAI_API_KEY;
    // Set a mock API key for tests that need it
    process.env.OPENAI_API_KEY = 'test-api-key-for-mocking';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiKey !== undefined) {
      process.env.OPENAI_API_KEY = originalApiKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
    vi.restoreAllMocks();
  });

  // Helper to mock fetch with a specific response
  function mockFetchResponse(content: string) {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content } }],
      }),
    });
  }

  describe('JSON Parsing', () => {
    it('should parse clean JSON response', async () => {
      mockFetchResponse('{"reasoning": "Good response", "score": 4, "passed": true}');

      const result = await evaluator.evaluate({
        input: 'test input',
        output: 'test output',
        criteria: 'Be helpful',
      });

      expect(result.passed).toBe(true);
      expect(result.details?.raw_score).toBe(4);
    });

    it('should parse JSON with markdown code block', async () => {
      mockFetchResponse(`Here is my evaluation:

\`\`\`json
{
  "reasoning": "The response is clear and accurate",
  "score": 5,
  "passed": true
}
\`\`\`

This meets all criteria.`);

      const result = await evaluator.evaluate({
        input: 'test input',
        output: 'test output',
        criteria: 'Be accurate',
      });

      expect(result.passed).toBe(true);
      expect(result.details?.raw_score).toBe(5);
    });

    it('should parse JSON embedded in text', async () => {
      mockFetchResponse(`After careful evaluation, my assessment is:
{"reasoning": "Response is adequate", "score": 3, "passed": true}
That concludes my evaluation.`);

      const result = await evaluator.evaluate({
        input: 'test input',
        output: 'test output',
        criteria: 'Be adequate',
      });

      expect(result.passed).toBe(true);
      expect(result.details?.raw_score).toBe(3);
    });

    it('should handle nested JSON objects', async () => {
      mockFetchResponse(`{
  "reasoning": "The response contains valid data: {\\"key\\": \\"value\\"}",
  "score": 4,
  "passed": true
}`);

      const result = await evaluator.evaluate({
        input: 'test input',
        output: 'test output',
        criteria: 'Be valid',
      });

      expect(result.passed).toBe(true);
    });

    it('should fallback to score extraction from text', async () => {
      mockFetchResponse('The response is good. Score: 4. This meets the criteria.');

      const result = await evaluator.evaluate({
        input: 'test input',
        output: 'test output',
        criteria: 'Be good',
      });

      expect(result.passed).toBe(true);
      expect(result.details?.raw_score).toBe(4);
    });

    it('should handle "X out of Y" format', async () => {
      mockFetchResponse('I would rate this response 4 out of 5 points.');

      const result = await evaluator.evaluate({
        input: 'test input',
        output: 'test output',
        criteria: 'Be good',
      });

      expect(result.passed).toBe(true);
      expect(result.details?.raw_score).toBe(4);
    });

    it('should infer pass from positive language', async () => {
      mockFetchResponse('This response is excellent and meets all criteria perfectly.');

      const result = await evaluator.evaluate({
        input: 'test input',
        output: 'test output',
        criteria: 'Be excellent',
      });

      expect(result.passed).toBe(true);
    });

    it('should infer fail from negative language', async () => {
      mockFetchResponse('This response failed to meet the criteria and is poor quality.');

      const result = await evaluator.evaluate({
        input: 'test input',
        output: 'test output',
        criteria: 'Be good',
      });

      expect(result.passed).toBe(false);
    });
  });

  describe('Score Normalization', () => {
    it('should normalize score to 0-1 range', async () => {
      mockFetchResponse('{"reasoning": "Good", "score": 4, "passed": true}');

      const result = await evaluator.evaluate({
        input: 'test',
        output: 'test',
        criteria: 'Be good',
        config: { score_range: [1, 5] },
      });

      // Score 4 on 1-5 scale = (4-1)/(5-1) = 0.75
      expect(result.score).toBe(0.75);
    });

    it('should clamp scores above max', async () => {
      mockFetchResponse('{"reasoning": "Perfect", "score": 10, "passed": true}');

      const result = await evaluator.evaluate({
        input: 'test',
        output: 'test',
        criteria: 'Be good',
        config: { score_range: [1, 5] },
      });

      // Clamped to 5, normalized = (5-1)/(5-1) = 1.0
      expect(result.score).toBe(1);
      expect(result.details?.raw_score).toBe(5);
    });

    it('should clamp scores below min', async () => {
      mockFetchResponse('{"reasoning": "Terrible", "score": -5, "passed": false}');

      const result = await evaluator.evaluate({
        input: 'test',
        output: 'test',
        criteria: 'Be good',
        config: { score_range: [1, 5] },
      });

      // Clamped to 1, normalized = (1-1)/(5-1) = 0
      expect(result.score).toBe(0);
      expect(result.details?.raw_score).toBe(1);
    });

    it('should handle custom score ranges', async () => {
      mockFetchResponse('{"reasoning": "Great", "score": 8, "passed": true}');

      const result = await evaluator.evaluate({
        input: 'test',
        output: 'test',
        criteria: 'Be good',
        config: { score_range: [0, 10] },
      });

      // Score 8 on 0-10 scale = (8-0)/(10-0) = 0.8
      expect(result.score).toBe(0.8);
    });
  });

  describe('Pass Threshold', () => {
    it('should pass when score meets threshold', async () => {
      mockFetchResponse('{"reasoning": "Adequate", "score": 3, "passed": true}');

      const result = await evaluator.evaluate({
        input: 'test',
        output: 'test',
        criteria: 'Be adequate',
        config: { pass_threshold: 3 },
      });

      expect(result.passed).toBe(true);
    });

    it('should fail when score below threshold', async () => {
      mockFetchResponse('{"reasoning": "Below standard", "score": 2, "passed": false}');

      const result = await evaluator.evaluate({
        input: 'test',
        output: 'test',
        criteria: 'Be adequate',
        config: { pass_threshold: 3 },
      });

      expect(result.passed).toBe(false);
    });

    it('should use custom threshold', async () => {
      mockFetchResponse('{"reasoning": "Good enough", "score": 4, "passed": true}');

      const result = await evaluator.evaluate({
        input: 'test',
        output: 'test',
        criteria: 'Be good',
        config: { pass_threshold: 4.5 },
      });

      // Score 4 < threshold 4.5
      expect(result.passed).toBe(false);
    });
  });

  describe('Missing Criteria', () => {
    it('should fail when no criteria provided', async () => {
      const result = await evaluator.evaluate({
        input: 'test',
        output: 'test',
      });

      expect(result.passed).toBe(false);
      expect(result.reason).toContain('criteria');
    });

    it('should use criteria from config if not in context', async () => {
      mockFetchResponse('{"reasoning": "Good", "score": 4, "passed": true}');

      const result = await evaluator.evaluate({
        input: 'test',
        output: 'test',
        config: { criteria: 'Be helpful' },
      });

      expect(result.passed).toBe(true);
    });
  });

  describe('API Errors', () => {
    it('should handle missing API key', async () => {
      // Remove the API key that was set in beforeEach
      delete process.env.OPENAI_API_KEY;

      const result = await evaluator.evaluate({
        input: 'test',
        output: 'test',
        criteria: 'Be good',
      });

      expect(result.passed).toBe(false);
      expect(result.reason).toContain('API key');
    });

    it('should handle API errors', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      });

      const result = await evaluator.evaluate({
        input: 'test',
        output: 'test',
        criteria: 'Be good',
      });

      expect(result.passed).toBe(false);
      expect(result.reason).toContain('429');
    });
  });

  describe('Chain of Thought', () => {
    it('should include reasoning in result', async () => {
      mockFetchResponse('{"reasoning": "Step 1: Check accuracy. Step 2: Check completeness. The response is accurate and complete.", "score": 5, "passed": true}');

      const result = await evaluator.evaluate({
        input: 'test',
        output: 'test',
        criteria: 'Be accurate',
        config: { chain_of_thought: true },
      });

      expect(result.reason).toContain('Step 1');
      expect(result.reason).toContain('accurate');
    });
  });

  describe('Details Object', () => {
    it('should include all details', async () => {
      mockFetchResponse('{"reasoning": "Good response", "score": 4, "passed": true}');

      const result = await evaluator.evaluate({
        input: 'test',
        output: 'test',
        criteria: 'Be helpful',
        config: {
          score_range: [1, 5],
          pass_threshold: 3,
          model: 'gpt-4o-mini',
        },
      });

      expect(result.details).toBeDefined();
      expect(result.details?.raw_score).toBe(4);
      expect(result.details?.score_range).toEqual([1, 5]);
      expect(result.details?.pass_threshold).toBe(3);
      expect(result.details?.criteria).toBe('Be helpful');
      expect(result.details?.model).toBe('gpt-4o-mini');
    });
  });
});
