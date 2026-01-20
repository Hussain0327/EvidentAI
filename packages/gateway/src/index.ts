/**
 * EvidentAI Gateway
 *
 * Enterprise LLM security gateway that provides:
 * - OpenAI-compatible API endpoint
 * - Prompt injection detection and sanitization
 * - PII detection and redaction
 * - Request/response logging for compliance
 *
 * @example
 * ```ts
 * import { createGateway } from '@evidentai/gateway';
 *
 * const gateway = await createGateway({
 *   port: 3000,
 *   input: {
 *     detectInjection: true,
 *     injectionAction: 'rephrase',
 *   },
 *   output: {
 *     detectPII: true,
 *     piiAction: 'redact',
 *   },
 * });
 *
 * await gateway.start();
 * ```
 */

import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import { nanoid } from 'nanoid';
import type { GatewayConfig } from './types.js';
import { AuthenticationError, GatewayError } from './types.js';
import { registerChatCompletionsRoute } from './routes/chat-completions.js';

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: GatewayConfig = {
  port: 3000,
  host: '0.0.0.0',
  cors: true,
  logging: true,
  input: {
    detectInjection: true,
    injectionSensitivity: 'medium',
    injectionAction: 'rephrase',
    logInput: true,
  },
  output: {
    detectPII: true,
    piiTypes: ['email', 'phone', 'ssn', 'credit_card'],
    piiAction: 'redact',
    logOutput: true,
  },
};

// =============================================================================
// Gateway Class
// =============================================================================

export class Gateway {
  private server: FastifyInstance;
  private config: GatewayConfig;

  constructor(config: Partial<GatewayConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      input: { ...DEFAULT_CONFIG.input, ...config.input },
      output: { ...DEFAULT_CONFIG.output, ...config.output },
    };

    this.server = Fastify({
      logger: this.config.logging
        ? {
            level: 'info',
            transport: {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'HH:MM:ss',
                ignore: 'pid,hostname',
              },
            },
          }
        : false,
      genReqId: () => nanoid(),
    });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandler();
  }

  private setupMiddleware(): void {
    // CORS
    if (this.config.cors) {
      this.server.register(cors, {
        origin: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
          'Content-Type',
          'Authorization',
          'X-LLM-Provider',
          'X-LLM-API-Key',
          'X-LLM-Model',
          'X-Request-ID',
        ],
      });
    }

    // API Key authentication (if configured)
    if (this.config.apiKey) {
      this.server.addHook('preHandler', async (request: FastifyRequest, _reply: FastifyReply) => {
        // Skip auth for health check
        if (request.url === '/health' || request.url === '/v1/models') {
          return;
        }

        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
          throw new AuthenticationError('Missing Authorization header');
        }

        const token = authHeader.slice(7);
        if (token !== this.config.apiKey) {
          throw new AuthenticationError('Invalid API key');
        }
      });
    }

    // Request ID decorator
    this.server.decorateRequest('requestId', '');
    this.server.addHook('preHandler', async (request: FastifyRequest) => {
      (request as FastifyRequest & { requestId: string }).requestId =
        (request.headers['x-request-id'] as string) || request.id;
    });
  }

  private setupRoutes(): void {
    // Health check
    this.server.get('/health', async () => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
      config: {
        injection: {
          enabled: this.config.input.detectInjection,
          action: this.config.input.injectionAction,
        },
        pii: {
          enabled: this.config.output.detectPII,
          action: this.config.output.piiAction,
        },
      },
    }));

    // Models endpoint (for OpenAI compatibility)
    this.server.get('/v1/models', async () => ({
      object: 'list',
      data: [
        { id: 'gpt-4o', object: 'model', created: Date.now(), owned_by: 'openai' },
        { id: 'gpt-4o-mini', object: 'model', created: Date.now(), owned_by: 'openai' },
        { id: 'gpt-4-turbo', object: 'model', created: Date.now(), owned_by: 'openai' },
        { id: 'claude-3-opus-20240229', object: 'model', created: Date.now(), owned_by: 'anthropic' },
        { id: 'claude-3-sonnet-20240229', object: 'model', created: Date.now(), owned_by: 'anthropic' },
        { id: 'claude-3-haiku-20240307', object: 'model', created: Date.now(), owned_by: 'anthropic' },
      ],
    }));

    // Register chat completions route
    registerChatCompletionsRoute(this.server, this.config);
  }

  private setupErrorHandler(): void {
    this.server.setErrorHandler(
      async (error: Error, request: FastifyRequest, reply: FastifyReply) => {
        if (error instanceof GatewayError) {
          return reply.status(error.statusCode).send({
            error: {
              message: error.message,
              type: error.code,
              code: error.code,
              details: error.details,
            },
          });
        }

        // Fastify validation errors
        if ('validation' in error) {
          return reply.status(400).send({
            error: {
              message: error.message,
              type: 'validation_error',
              code: 'invalid_request',
            },
          });
        }

        // Log unexpected errors
        console.error('Unexpected error:', error);
        request.log.error(error, 'Unexpected error');

        return reply.status(500).send({
          error: {
            message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
            type: 'internal_error',
            code: 'internal_error',
          },
        });
      }
    );
  }

  async start(): Promise<void> {
    try {
      await this.server.listen({
        port: this.config.port,
        host: this.config.host,
      });
      console.log(`[Gateway] Running on http://${this.config.host}:${this.config.port}`);
      console.log(`[Gateway] POST /v1/chat/completions - OpenAI-compatible chat API`);
      console.log(`[Gateway] GET /health - Health check endpoint`);
    } catch (err) {
      this.server.log.error(err);
      throw err;
    }
  }

  async stop(): Promise<void> {
    await this.server.close();
  }

  getServer(): FastifyInstance {
    return this.server;
  }

  getConfig(): Readonly<GatewayConfig> {
    return this.config;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export async function createGateway(config: Partial<GatewayConfig> = {}): Promise<Gateway> {
  return new Gateway(config);
}

// =============================================================================
// CLI Entry Point
// =============================================================================

async function main(): Promise<void> {
  const config: Partial<GatewayConfig> = {
    port: parseInt(process.env.GATEWAY_PORT || '3000', 10),
    host: process.env.GATEWAY_HOST || '0.0.0.0',
    apiKey: process.env.GATEWAY_API_KEY,
    logging: process.env.GATEWAY_LOGGING !== 'false',
    internalLLM: {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.GATEWAY_REPHRASE_MODEL || 'gpt-4o-mini',
    },
    input: {
      detectInjection: process.env.GATEWAY_DETECT_INJECTION !== 'false',
      injectionSensitivity: (process.env.GATEWAY_INJECTION_SENSITIVITY as 'low' | 'medium' | 'high') || 'medium',
      injectionAction: (process.env.GATEWAY_INJECTION_ACTION as 'block' | 'rephrase' | 'log') || 'rephrase',
      logInput: process.env.GATEWAY_LOG_INPUT !== 'false',
    },
    output: {
      detectPII: process.env.GATEWAY_DETECT_PII !== 'false',
      piiTypes: (process.env.GATEWAY_PII_TYPES?.split(',') as any) || ['email', 'phone', 'ssn', 'credit_card'],
      piiAction: (process.env.GATEWAY_PII_ACTION as 'block' | 'redact' | 'log') || 'redact',
      logOutput: process.env.GATEWAY_LOG_OUTPUT !== 'false',
    },
  };

  const gateway = await createGateway(config);
  await gateway.start();

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[Gateway] Shutting down...');
    await gateway.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Failed to start gateway:', err);
    process.exit(1);
  });
}

// =============================================================================
// Exports
// =============================================================================

export { Gateway as default };
export type {
  GatewayConfig,
  InputPipelineConfig,
  OutputPipelineConfig,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
  LLMProviderConfig,
  PIIEntityType,
  PIIMatch,
  InjectionMatch,
  InputSanitizationResult,
  OutputProcessingResult,
  GatewayRequest,
  GatewayResponse,
  Incident,
} from './types.js';

export {
  GatewayError,
  AuthenticationError,
  ValidationError,
  InjectionBlockedError,
  PIIBlockedError,
  ProviderError,
} from './types.js';
