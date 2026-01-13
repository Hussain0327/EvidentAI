import type { ProviderConfig } from '../../config/types';
import { type LLMProvider, makeLLMCall } from './base';

export function createCustomProvider(
  config: ProviderConfig & { name: 'custom' },
  timeoutMs: number
): LLMProvider {
  if (!config.endpoint) {
    throw new Error('Custom provider endpoint is required.');
  }

  return {
    call: (input: string) => makeLLMCall<Record<string, unknown>>(
      {
        url: config.endpoint,
        headers: config.headers || {},
        body: { input },
        timeoutMs,
        provider: 'Custom provider',
      },
      (data) => {
        const output = data.output ?? data.response ?? data.text ?? data.content;
        return typeof output === 'string' ? output : JSON.stringify(data);
      }
    ),
  };
}
