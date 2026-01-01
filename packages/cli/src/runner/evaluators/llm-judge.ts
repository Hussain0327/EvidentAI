/**
 * LLM-as-Judge Evaluator
 *
 * Uses a secondary LLM to evaluate the quality of responses.
 * Implements best practices from research:
 * - Chain-of-thought reasoning for accuracy
 * - Binary or 5-point scoring (no high-precision scales)
 * - Single-criterion evaluation per call
 * - Bias mitigation instructions
 *
 * References:
 * - G-Eval (Liu et al., EMNLP 2023)
 * - LLM-as-a-Judge best practices (Monte Carlo Data, 2025)
 */

import type { EvaluatorResult } from '../../config/types';
import type { Evaluator, EvaluatorContext } from './index';

export interface LLMJudgeConfig {
  model?: string;
  criteria?: string;
  score_range?: [number, number];
  pass_threshold?: number;
  chain_of_thought?: boolean;
  api_key?: string;
}

interface JudgeResponse {
  reasoning: string;
  score: number;
  passed: boolean;
}

/**
 * Build the evaluation prompt using best practices
 */
function buildJudgePrompt(
  input: string,
  output: string,
  criteria: string,
  scoreRange: [number, number],
  useCoT: boolean
): string {
  const [minScore, maxScore] = scoreRange;

  return `You are an expert evaluator assessing the quality of an AI assistant's response.

## Evaluation Criteria
${criteria}

## Scoring Scale
- Score ${minScore}: Completely fails to meet the criteria
- Score ${Math.floor((minScore + maxScore) / 2)}: Partially meets the criteria with significant issues
- Score ${maxScore}: Fully meets all aspects of the criteria

## Important Instructions
- Evaluate based ONLY on the criteria provided
- Do NOT favor longer responses over shorter ones if both are correct
- Do NOT consider response order or position
- Focus on correctness, completeness, and adherence to criteria
- Be objective and consistent

## Input (User Query)
${input}

## Response to Evaluate
${output}

${useCoT ? `## Your Evaluation
First, analyze the response step by step:
1. Identify the key requirements from the criteria
2. Check if each requirement is met
3. Note any issues or strengths
4. Determine the appropriate score

Then provide your final evaluation.` : ''}

Respond in the following JSON format:
{
  "reasoning": "Your step-by-step analysis explaining why you gave this score",
  "score": <number between ${minScore} and ${maxScore}>,
  "passed": <true if score >= pass_threshold, false otherwise>
}

Only respond with valid JSON.`;
}

export class LLMJudgeEvaluator implements Evaluator {
  name = 'llm-judge' as const;

  private async callLLM(
    prompt: string,
    config: LLMJudgeConfig
  ): Promise<string> {
    // For now, use OpenAI. In production, this would support multiple providers.
    const apiKey = config.api_key || process.env.OPENAI_API_KEY;
    const model = config.model || 'gpt-4o-mini';

    if (!apiKey) {
      throw new Error(
        'No API key provided for LLM judge. Set OPENAI_API_KEY or provide api_key in config.'
      );
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert AI evaluator. Always respond with valid JSON.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1, // Low temperature for consistency
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LLM API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content || '';
  }

  private parseJudgeResponse(
    response: string,
    passThreshold: number,
    scoreRange: [number, number]
  ): JudgeResponse {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const score = Number(parsed.score);
      const [minScore, maxScore] = scoreRange;

      // Validate and clamp score
      const clampedScore = Math.max(minScore, Math.min(maxScore, score));

      return {
        reasoning: parsed.reasoning || 'No reasoning provided',
        score: clampedScore,
        passed: clampedScore >= passThreshold,
      };
    } catch (error) {
      // Fallback: try to extract a score from the text
      const scoreMatch = response.match(/score[:\s]+(\d+(?:\.\d+)?)/i);
      if (scoreMatch) {
        const scoreText = scoreMatch[1];
        if (scoreText !== undefined) {
          const score = parseFloat(scoreText);
          return {
            reasoning: 'Failed to parse structured response',
            score,
            passed: score >= passThreshold,
          };
        }
      }

      throw new Error(`Failed to parse judge response: ${error}`);
    }
  }

  async evaluate(ctx: EvaluatorContext): Promise<EvaluatorResult> {
    const config = (ctx.config || {}) as LLMJudgeConfig;
    const criteria = ctx.criteria || config.criteria;

    if (!criteria) {
      return {
        passed: false,
        score: 0,
        reason: 'No evaluation criteria provided for llm-judge',
      };
    }

    const scoreRange = config.score_range || [1, 5];
    const passThreshold = config.pass_threshold ?? 3;
    const useCoT = config.chain_of_thought ?? true;

    try {
      const prompt = buildJudgePrompt(
        ctx.input,
        ctx.output,
        criteria,
        scoreRange,
        useCoT
      );

      const llmResponse = await this.callLLM(prompt, config);
      const judgeResult = this.parseJudgeResponse(
        llmResponse,
        passThreshold,
        scoreRange
      );

      // Normalize score to 0-1 for consistency
      const [minScore, maxScore] = scoreRange;
      const normalizedScore =
        (judgeResult.score - minScore) / (maxScore - minScore);

      return {
        passed: judgeResult.passed,
        score: normalizedScore,
        reason: judgeResult.reasoning,
        details: {
          raw_score: judgeResult.score,
          score_range: scoreRange,
          pass_threshold: passThreshold,
          criteria,
          model: config.model || 'gpt-4o-mini',
        },
      };
    } catch (error) {
      return {
        passed: false,
        score: 0,
        reason: `LLM judge error: ${error instanceof Error ? error.message : String(error)}`,
        details: { error: String(error) },
      };
    }
  }
}

// Legacy export
export function llmJudge(): EvaluatorResult {
  return {
    passed: false,
    score: 0,
    reason: 'Use LLMJudgeEvaluator.evaluate() instead',
  };
}
