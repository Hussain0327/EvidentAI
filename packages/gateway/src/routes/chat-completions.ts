/**
 * Chat Completions Route Handler
 *
 * Implements the OpenAI-compatible /v1/chat/completions endpoint with:
 * - Input sanitization (injection detection + rephrasing)
 * - LLM routing (OpenAI, Anthropic)
 * - Output processing (PII detection + redaction)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import type {
  GatewayConfig,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
  LLMProviderName,
  LLMProviderConfig,
} from '../types.js';
import { ValidationError, InjectionBlockedError, PIIBlockedError, ProviderError } from '../types.js';
import { sanitizeInput } from '../pipeline/input-sanitizer.js';
import { processOutput } from '../pipeline/output-processor.js';
import { routeToLLM } from '../router/llm-router.js';

// =============================================================================
// Request Validation Schema
// =============================================================================

const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'function', 'tool']),
  content: z.string().nullable(),
  name: z.string().optional(),
  function_call: z
    .object({
      name: z.string(),
      arguments: z.string(),
    })
    .optional(),
  tool_calls: z
    .array(
      z.object({
        id: z.string(),
        type: z.literal('function'),
        function: z.object({
          name: z.string(),
          arguments: z.string(),
        }),
      })
    )
    .optional(),
});

const ChatCompletionRequestSchema = z.object({
  model: z.string(),
  messages: z.array(ChatMessageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  n: z.number().int().min(1).max(10).optional(),
  stream: z.boolean().optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  max_tokens: z.number().int().positive().optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  logit_bias: z.record(z.number()).optional(),
  user: z.string().optional(),
});

// =============================================================================
// Route Handler
// =============================================================================

export function registerChatCompletionsRoute(server: FastifyInstance, config: GatewayConfig): void {
  server.post<{
    Body: ChatCompletionRequest;
  }>('/v1/chat/completions', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    const requestId = (request as FastifyRequest & { requestId?: string }).requestId || nanoid();

    // =======================================================================
    // 1. Parse and validate request
    // =======================================================================
    const parseResult = ChatCompletionRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid request body', {
        errors: parseResult.error.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      });
    }

    const body = parseResult.data as ChatCompletionRequest;

    // Streaming not yet supported
    if (body.stream) {
      throw new ValidationError('Streaming is not yet supported. Set stream: false');
    }

    // =======================================================================
    // 2. Extract LLM provider configuration from headers
    // =======================================================================
    const providerConfig = extractProviderConfig(request, body.model);

    // Log incoming request
    if (config.input.logInput) {
      request.log.info(
        {
          requestId,
          provider: providerConfig.name,
          model: body.model,
          messageCount: body.messages.length,
        },
        'Incoming chat completion request'
      );
    }

    // =======================================================================
    // 3. Input sanitization pipeline
    // =======================================================================
    let messagesToSend = body.messages;
    let inputResult = null;

    if (config.input.detectInjection) {
      inputResult = await sanitizeInput(body.messages, {
        sensitivity: config.input.injectionSensitivity,
        action: config.input.injectionAction,
        internalLLM: config.internalLLM,
      });

      // Handle based on action
      if (inputResult.injectionDetected) {
        request.log.warn(
          {
            requestId,
            matches: inputResult.injectionMatches.length,
            techniques: [...new Set(inputResult.injectionMatches.map((m) => m.technique))],
          },
          'Prompt injection detected'
        );

        if (inputResult.blocked) {
          throw new InjectionBlockedError(inputResult.injectionMatches);
        }

        // Use sanitized messages (rephrased)
        messagesToSend = inputResult.sanitized;
      }
    }

    // =======================================================================
    // 4. Route to LLM provider
    // =======================================================================
    let llmResponse: ChatCompletionResponse;
    try {
      llmResponse = await routeToLLM(providerConfig, {
        ...body,
        messages: messagesToSend,
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new ProviderError(error.message, providerConfig.name);
      }
      throw error;
    }

    // =======================================================================
    // 5. Output processing pipeline
    // =======================================================================
    let finalResponse = llmResponse;
    let outputResult = null;
    let originalContent: string | null = null;

    if (config.output.detectPII && llmResponse.choices.length > 0) {
      originalContent = llmResponse.choices[0]?.message?.content ?? null;

      if (originalContent) {
        outputResult = await processOutput(originalContent, {
          piiTypes: config.output.piiTypes,
          action: config.output.piiAction,
        });

        // Handle based on action
        if (outputResult.piiDetected) {
          request.log.warn(
            {
              requestId,
              matches: outputResult.piiMatches.length,
              types: [...new Set(outputResult.piiMatches.map((m) => m.type))],
            },
            'PII detected in response'
          );

          if (outputResult.blocked) {
            throw new PIIBlockedError(outputResult.piiMatches);
          }

          // Use processed content (redacted)
          if (outputResult.processed !== originalContent) {
            finalResponse = {
              ...llmResponse,
              choices: llmResponse.choices.map((choice, index) =>
                index === 0
                  ? {
                      ...choice,
                      message: {
                        ...choice.message,
                        content: outputResult!.processed,
                      },
                    }
                  : choice
              ),
            };
          }
        }
      }
    }

    // =======================================================================
    // 6. Log and return response
    // =======================================================================
    const latencyMs = Date.now() - startTime;

    if (config.output.logOutput) {
      request.log.info(
        {
          requestId,
          latencyMs,
          injectionDetected: inputResult?.injectionDetected ?? false,
          piiDetected: outputResult?.piiDetected ?? false,
          tokens: finalResponse.usage?.total_tokens,
        },
        'Request completed'
      );
    }

    // Add gateway metadata headers
    reply.header('X-Request-ID', requestId);
    reply.header('X-Gateway-Latency-Ms', latencyMs.toString());
    if (inputResult?.injectionDetected) {
      reply.header('X-Injection-Detected', 'true');
    }
    if (outputResult?.piiDetected) {
      reply.header('X-PII-Detected', 'true');
      reply.header('X-PII-Redacted', (outputResult.processed !== originalContent).toString());
    }

    return finalResponse;
  });
}

// =============================================================================
// Helper Functions
// =============================================================================

function extractProviderConfig(
  request: FastifyRequest,
  model: string
): LLMProviderConfig {
  const headers = request.headers;

  // Get provider from header or infer from model
  const providerHeader = headers['x-llm-provider'] as string | undefined;
  const provider = inferProvider(providerHeader, model);

  // Get API key from header
  const apiKey = headers['x-llm-api-key'] as string;
  if (!apiKey) {
    throw new ValidationError('Missing X-LLM-API-Key header');
  }

  // Build config based on provider
  const config: LLMProviderConfig = {
    name: provider,
    apiKey,
    model,
  };

  // Azure-specific headers
  if (provider === 'azure') {
    config.endpoint = headers['x-azure-endpoint'] as string;
    config.deployment = headers['x-azure-deployment'] as string;
    config.apiVersion = headers['x-azure-api-version'] as string;
  }

  return config;
}

function inferProvider(
  providerHeader: string | undefined,
  model: string
): LLMProviderName {
  if (providerHeader) {
    const normalized = providerHeader.toLowerCase();
    if (['openai', 'anthropic', 'azure'].includes(normalized)) {
      return normalized as LLMProviderName;
    }
  }

  // Infer from model name
  if (model.startsWith('claude')) {
    return 'anthropic';
  }
  if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3')) {
    return 'openai';
  }

  // Default to OpenAI
  return 'openai';
}
