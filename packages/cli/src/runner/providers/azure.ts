import type { ProviderConfig } from '../../config/types';
import { type LLMProvider, makeLLMCall, PROVIDER_DEFAULTS } from './base';

interface OpenAIResponse {
  choices: Array<{ message?: { content?: string } }>;
}

export function createAzureProvider(
  config: ProviderConfig & { name: 'azure' },
  timeoutMs: number
): LLMProvider {
  const apiKey = config.api_key || process.env.AZURE_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Azure OpenAI API key not found. Set AZURE_OPENAI_API_KEY or provide api_key in config.');
  }
  if (!config.endpoint) {
    throw new Error('Azure OpenAI endpoint is required.');
  }
  if (!config.deployment) {
    throw new Error('Azure OpenAI deployment name is required.');
  }

  const url = `${config.endpoint}/openai/deployments/${config.deployment}/chat/completions?api-version=${config.api_version || PROVIDER_DEFAULTS.azureApiVersion}`;

  return {
    call: (input: string) => makeLLMCall<OpenAIResponse>(
      {
        url,
        headers: { 'api-key': apiKey },
        body: {
          messages: [{ role: 'user', content: input }],
          temperature: config.temperature ?? PROVIDER_DEFAULTS.temperature,
          max_tokens: config.max_tokens,
        },
        timeoutMs,
        provider: 'Azure OpenAI',
      },
      (data) => data.choices[0]?.message?.content || ''
    ),
  };
}
