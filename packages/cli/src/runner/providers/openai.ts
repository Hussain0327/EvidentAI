import type { ProviderConfig } from '../../config/types';
import { type LLMProvider, makeLLMCall, PROVIDER_DEFAULTS } from './base';

interface OpenAIResponse {
  choices: Array<{ message?: { content?: string } }>;
}

export function createOpenAIProvider(
  config: ProviderConfig & { name: 'openai' },
  timeoutMs: number
): LLMProvider {
  const apiKey = config.api_key || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      `OpenAI API key not found.

Set the environment variable:
  export OPENAI_API_KEY=your-key-here

Or add to your config file:
  provider:
    api_key: your-key-here

Get a key at: https://platform.openai.com/api-keys`
    );
  }

  return {
    call: (input: string) => makeLLMCall<OpenAIResponse>(
      {
        url: 'https://api.openai.com/v1/chat/completions',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: {
          model: config.model || PROVIDER_DEFAULTS.openaiModel,
          messages: [{ role: 'user', content: input }],
          temperature: config.temperature ?? PROVIDER_DEFAULTS.temperature,
          max_tokens: config.max_tokens,
        },
        timeoutMs,
        provider: 'OpenAI',
      },
      (data) => data.choices[0]?.message?.content || ''
    ),
  };
}
