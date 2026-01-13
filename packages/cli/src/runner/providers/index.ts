import type { ProviderConfig } from '../../config/types';
import { APIError, type LLMProvider, PROVIDER_DEFAULTS } from './base';
import { createOpenAIProvider } from './openai';
import { createAnthropicProvider } from './anthropic';
import { createAzureProvider } from './azure';
import { createCustomProvider } from './custom';

export function createProvider(
  config: ProviderConfig,
  timeoutMs: number = PROVIDER_DEFAULTS.timeoutMs
): LLMProvider {
  switch (config.name) {
    case 'openai':
      return createOpenAIProvider(config, timeoutMs);
    case 'anthropic':
      return createAnthropicProvider(config, timeoutMs);
    case 'azure':
      return createAzureProvider(config, timeoutMs);
    case 'custom':
      return createCustomProvider(config, timeoutMs);
    default:
      throw new Error(`Unknown provider: ${(config as ProviderConfig).name}`);
  }
}

export { APIError, PROVIDER_DEFAULTS };
export type { LLMProvider } from './base';
export { createOpenAIProvider } from './openai';
export { createAnthropicProvider } from './anthropic';
export { createAzureProvider } from './azure';
export { createCustomProvider } from './custom';
