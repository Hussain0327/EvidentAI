/**
 * LLM Router
 *
 * Routes requests to the appropriate LLM provider (OpenAI, Anthropic, Azure)
 * and converts between different API formats.
 */

import { nanoid } from 'nanoid';
import type {
  LLMProviderConfig,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
} from '../types.js';
import { ProviderError } from '../types.js';

// =============================================================================
// Provider Configuration
// =============================================================================

const PROVIDER_DEFAULTS = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-haiku-20240307',
    version: '2023-06-01',
    maxTokens: 4096,
  },
  azure: {
    apiVersion: '2024-02-01',
    defaultModel: 'gpt-4o',
  },
};

const TIMEOUT_MS = 60000;

// =============================================================================
// OpenAI Response Types
// =============================================================================

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// =============================================================================
// Anthropic Response Types
// =============================================================================

interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{ type: string; text: string }>;
  model: string;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// =============================================================================
// Main Router Function
// =============================================================================

export async function routeToLLM(
  config: LLMProviderConfig,
  request: ChatCompletionRequest
): Promise<ChatCompletionResponse> {
  switch (config.name) {
    case 'openai':
      return routeToOpenAI(config, request);
    case 'anthropic':
      return routeToAnthropic(config, request);
    case 'azure':
      return routeToAzure(config, request);
    default:
      throw new ProviderError(`Unsupported provider: ${config.name}`, config.name);
  }
}

// =============================================================================
// OpenAI Router
// =============================================================================

async function routeToOpenAI(
  config: LLMProviderConfig,
  request: ChatCompletionRequest
): Promise<ChatCompletionResponse> {
  const baseUrl = config.baseUrl || PROVIDER_DEFAULTS.openai.baseUrl;
  const url = `${baseUrl}/chat/completions`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: request.model || PROVIDER_DEFAULTS.openai.defaultModel,
        messages: request.messages,
        temperature: request.temperature,
        top_p: request.top_p,
        n: request.n,
        stop: request.stop,
        max_tokens: request.max_tokens,
        presence_penalty: request.presence_penalty,
        frequency_penalty: request.frequency_penalty,
        logit_bias: request.logit_bias,
        user: request.user,
        functions: request.functions,
        function_call: request.function_call,
        tools: request.tools,
        tool_choice: request.tool_choice,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new ProviderError(`OpenAI API error: ${response.status} - ${error}`, 'openai', response.status);
    }

    const data = (await response.json()) as OpenAIResponse;

    return {
      id: data.id,
      object: 'chat.completion',
      created: data.created,
      model: data.model,
      choices: data.choices.map((choice) => ({
        index: choice.index,
        message: {
          role: choice.message.role as ChatMessage['role'],
          content: choice.message.content,
        },
        finish_reason: choice.finish_reason as any,
      })),
      usage: data.usage,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ProviderError('OpenAI request timed out', 'openai', 408);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// =============================================================================
// Anthropic Router
// =============================================================================

async function routeToAnthropic(
  config: LLMProviderConfig,
  request: ChatCompletionRequest
): Promise<ChatCompletionResponse> {
  const baseUrl = config.baseUrl || PROVIDER_DEFAULTS.anthropic.baseUrl;
  const url = `${baseUrl}/messages`;

  // Convert OpenAI messages format to Anthropic format
  const { systemMessage, messages } = convertToAnthropicMessages(request.messages);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': PROVIDER_DEFAULTS.anthropic.version,
      },
      body: JSON.stringify({
        model: request.model || PROVIDER_DEFAULTS.anthropic.defaultModel,
        max_tokens: request.max_tokens || PROVIDER_DEFAULTS.anthropic.maxTokens,
        messages,
        system: systemMessage,
        temperature: request.temperature,
        top_p: request.top_p,
        stop_sequences: Array.isArray(request.stop) ? request.stop : request.stop ? [request.stop] : undefined,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new ProviderError(`Anthropic API error: ${response.status} - ${error}`, 'anthropic', response.status);
    }

    const data = (await response.json()) as AnthropicResponse;

    // Convert Anthropic response to OpenAI format
    return {
      id: `chatcmpl-${nanoid()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: data.model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: data.content.map((c) => c.text).join(''),
          },
          finish_reason: mapAnthropicStopReason(data.stop_reason),
        },
      ],
      usage: {
        prompt_tokens: data.usage.input_tokens,
        completion_tokens: data.usage.output_tokens,
        total_tokens: data.usage.input_tokens + data.usage.output_tokens,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ProviderError('Anthropic request timed out', 'anthropic', 408);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// =============================================================================
// Azure OpenAI Router
// =============================================================================

async function routeToAzure(
  config: LLMProviderConfig,
  request: ChatCompletionRequest
): Promise<ChatCompletionResponse> {
  if (!config.endpoint) {
    throw new ProviderError('Azure endpoint is required (X-Azure-Endpoint header)', 'azure');
  }
  if (!config.deployment) {
    throw new ProviderError('Azure deployment is required (X-Azure-Deployment header)', 'azure');
  }

  const apiVersion = config.apiVersion || PROVIDER_DEFAULTS.azure.apiVersion;
  const url = `${config.endpoint}/openai/deployments/${config.deployment}/chat/completions?api-version=${apiVersion}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': config.apiKey,
      },
      body: JSON.stringify({
        messages: request.messages,
        temperature: request.temperature,
        top_p: request.top_p,
        n: request.n,
        stop: request.stop,
        max_tokens: request.max_tokens,
        presence_penalty: request.presence_penalty,
        frequency_penalty: request.frequency_penalty,
        user: request.user,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new ProviderError(`Azure OpenAI API error: ${response.status} - ${error}`, 'azure', response.status);
    }

    const data = (await response.json()) as OpenAIResponse;

    return {
      id: data.id,
      object: 'chat.completion',
      created: data.created,
      model: data.model,
      choices: data.choices.map((choice) => ({
        index: choice.index,
        message: {
          role: choice.message.role as ChatMessage['role'],
          content: choice.message.content,
        },
        finish_reason: choice.finish_reason as any,
      })),
      usage: data.usage,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ProviderError('Azure OpenAI request timed out', 'azure', 408);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function convertToAnthropicMessages(messages: ChatMessage[]): {
  systemMessage: string | undefined;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
} {
  let systemMessage: string | undefined;
  const converted: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      // Combine all system messages
      systemMessage = systemMessage
        ? `${systemMessage}\n\n${msg.content}`
        : msg.content || '';
    } else if (msg.role === 'user' || msg.role === 'assistant') {
      converted.push({
        role: msg.role,
        content: msg.content || '',
      });
    }
    // Skip function/tool messages for now
  }

  // Anthropic requires alternating user/assistant messages
  // If first message is assistant, prepend a user message
  if (converted.length > 0 && converted[0]?.role === 'assistant') {
    converted.unshift({ role: 'user', content: 'Continue' });
  }

  return { systemMessage, messages: converted };
}

function mapAnthropicStopReason(
  reason: string | null
): 'stop' | 'length' | 'content_filter' | null {
  if (!reason) return null;

  switch (reason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'stop';
    case 'max_tokens':
      return 'length';
    default:
      return 'stop';
  }
}
