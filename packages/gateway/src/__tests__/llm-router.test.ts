import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { routeToLLM } from '../router/llm-router.js';
import type { ChatCompletionRequest, LLMProviderConfig } from '../types.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('LLM Router', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const baseRequest: ChatCompletionRequest = {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'Hello' }],
  };

  describe('OpenAI Routing', () => {
    const openaiConfig: LLMProviderConfig = {
      name: 'openai',
      apiKey: 'test-key',
    };

    it('sends correct headers and body to OpenAI', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'chatcmpl-123',
            object: 'chat.completion',
            created: 1234567890,
            model: 'gpt-4o-mini',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Hi!' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
      });

      await routeToLLM(openaiConfig, baseRequest);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-key',
          },
        })
      );
    });

    it('returns OpenAI-compatible response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'chatcmpl-123',
            object: 'chat.completion',
            created: 1234567890,
            model: 'gpt-4o-mini',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Hello!' },
                finish_reason: 'stop',
              },
            ],
          }),
      });

      const result = await routeToLLM(openaiConfig, baseRequest);

      expect(result.id).toBe('chatcmpl-123');
      expect(result.object).toBe('chat.completion');
      expect(result.choices[0]?.message.content).toBe('Hello!');
    });

    it('throws ProviderError on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      await expect(routeToLLM(openaiConfig, baseRequest)).rejects.toThrow(
        'OpenAI API error: 401'
      );
    });
  });

  describe('Anthropic Routing', () => {
    const anthropicConfig: LLMProviderConfig = {
      name: 'anthropic',
      apiKey: 'test-key',
    };

    const anthropicRequest: ChatCompletionRequest = {
      model: 'claude-3-haiku-20240307',
      messages: [{ role: 'user', content: 'Hello' }],
    };

    it('converts OpenAI format to Anthropic format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'msg_123',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'Hi there!' }],
            model: 'claude-3-haiku-20240307',
            stop_reason: 'end_turn',
            usage: { input_tokens: 10, output_tokens: 5 },
          }),
      });

      await routeToLLM(anthropicConfig, anthropicRequest);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'test-key',
            'anthropic-version': '2023-06-01',
          }),
        })
      );
    });

    it('converts Anthropic response to OpenAI format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'msg_123',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello from Claude!' }],
            model: 'claude-3-haiku-20240307',
            stop_reason: 'end_turn',
            usage: { input_tokens: 10, output_tokens: 5 },
          }),
      });

      const result = await routeToLLM(anthropicConfig, anthropicRequest);

      expect(result.object).toBe('chat.completion');
      expect(result.choices[0]?.message.role).toBe('assistant');
      expect(result.choices[0]?.message.content).toBe('Hello from Claude!');
      expect(result.choices[0]?.finish_reason).toBe('stop');
      expect(result.usage?.total_tokens).toBe(15);
    });

    it('handles system messages for Anthropic', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'msg_123',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'Response' }],
            model: 'claude-3-haiku-20240307',
            stop_reason: 'end_turn',
            usage: { input_tokens: 10, output_tokens: 5 },
          }),
      });

      const requestWithSystem: ChatCompletionRequest = {
        model: 'claude-3-haiku-20240307',
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hi' },
        ],
      };

      await routeToLLM(anthropicConfig, requestWithSystem);

      const calledBody = JSON.parse(
        mockFetch.mock.calls[0]?.[1]?.body as string
      );
      expect(calledBody.system).toBe('You are helpful.');
    });
  });

  describe('Azure Routing', () => {
    const azureConfig: LLMProviderConfig = {
      name: 'azure',
      apiKey: 'test-key',
      endpoint: 'https://myinstance.openai.azure.com',
      deployment: 'gpt-4o',
    };

    it('sends correct Azure endpoint and headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'chatcmpl-123',
            object: 'chat.completion',
            created: 1234567890,
            model: 'gpt-4o',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Azure response' },
                finish_reason: 'stop',
              },
            ],
          }),
      });

      await routeToLLM(azureConfig, baseRequest);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('myinstance.openai.azure.com'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'api-key': 'test-key',
          }),
        })
      );
    });

    it('throws error if endpoint is missing', async () => {
      const badConfig: LLMProviderConfig = {
        name: 'azure',
        apiKey: 'test-key',
        deployment: 'gpt-4o',
      };

      await expect(routeToLLM(badConfig, baseRequest)).rejects.toThrow(
        'Azure endpoint is required'
      );
    });

    it('throws error if deployment is missing', async () => {
      const badConfig: LLMProviderConfig = {
        name: 'azure',
        apiKey: 'test-key',
        endpoint: 'https://test.openai.azure.com',
      };

      await expect(routeToLLM(badConfig, baseRequest)).rejects.toThrow(
        'Azure deployment is required'
      );
    });
  });

  describe('Provider Detection', () => {
    it('throws error for unsupported provider', async () => {
      const badConfig = {
        name: 'unsupported' as any,
        apiKey: 'test-key',
      };

      await expect(routeToLLM(badConfig, baseRequest)).rejects.toThrow(
        'Unsupported provider'
      );
    });
  });
});
