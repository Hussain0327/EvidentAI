import type { ProviderConfig } from '../../config/types';
import { type LLMProvider, makeLLMCall, PROVIDER_DEFAULTS } from './base';

interface AnthropicResponse {
  content: Array<{ text?: string }>;
}

export function createAnthropicProvider(
  config: ProviderConfig & { name: 'anthropic' },
  timeoutMs: number
): LLMProvider {
  const apiKey = config.api_key || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      `Anthropic API key not found.

Set the environment variable:
  export ANTHROPIC_API_KEY=your-key-here

Or add to your config file:
  provider:
    api_key: your-key-here

Get a key at: https://console.anthropic.com/settings/keys`
    );
  }

  return {
    call: (input: string) => makeLLMCall<AnthropicResponse>(
      {
        url: 'https://api.anthropic.com/v1/messages',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': PROVIDER_DEFAULTS.anthropicVersion,
        },
        body: {
          model: config.model || PROVIDER_DEFAULTS.anthropicModel,
          max_tokens: config.max_tokens || 1024,
          messages: [{ role: 'user', content: input }],
        },
        timeoutMs,
        provider: 'Anthropic',
      },
      (data) => data.content[0]?.text || ''
    ),
  };
}
