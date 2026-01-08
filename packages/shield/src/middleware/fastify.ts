import type { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginCallback } from 'fastify';
import { Shield } from '../index.js';
import type { ShieldConfig, AnalysisResult } from '../types.js';

export interface FastifyShieldOptions extends Partial<ShieldConfig> {
  /**
   * Function to extract the input to analyze from the request.
   * Default: req.body.prompt || req.body.message || req.body.input
   */
  getInput?: (req: FastifyRequest) => string | undefined;

  /**
   * Function to extract user ID for logging/rate limiting.
   * Default: req.headers['x-user-id'] || req.ip
   */
  getUserId?: (req: FastifyRequest) => string | undefined;

  /**
   * Custom response when request is blocked.
   * Default: 403 with JSON error message
   */
  onBlockResponse?: (reply: FastifyReply, result: AnalysisResult) => void;

  /**
   * Skip analysis for certain requests.
   * Return true to skip.
   */
  skip?: (req: FastifyRequest) => boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    shieldResult?: AnalysisResult;
  }
}

/**
 * Fastify plugin for runtime prompt injection protection.
 *
 * @example
 * ```ts
 * import Fastify from 'fastify';
 * import { shieldPlugin } from '@evidentai/shield/fastify';
 *
 * const app = Fastify();
 *
 * app.register(shieldPlugin, {
 *   blockThreshold: 'high',
 *   analyzers: ['heuristic', 'llm-judge'],
 *   llm: { provider: 'openai' }
 * });
 *
 * app.post('/api/chat', async (req, reply) => {
 *   // req.shieldResult contains the analysis
 *   return { message: 'Hello!' };
 * });
 * ```
 */
export const shieldPlugin: FastifyPluginCallback<FastifyShieldOptions> = (
  fastify: FastifyInstance,
  options: FastifyShieldOptions,
  done: (err?: Error) => void
) => {
  const shield = new Shield({
    enabled: options.enabled ?? true,
    blockThreshold: options.blockThreshold ?? 'high',
    analyzers: options.analyzers ?? ['heuristic'],
    logAll: options.logAll ?? false,
    onThreat: options.onThreat,
    onBlock: options.onBlock,
    llm: options.llm,
    heuristic: options.heuristic,
  });

  const getInput =
    options.getInput ??
    ((req: FastifyRequest) => {
      const body = req.body as Record<string, unknown> | undefined;
      if (!body) return undefined;
      return (body.prompt ?? body.message ?? body.input ?? body.content) as
        | string
        | undefined;
    });

  const getUserId =
    options.getUserId ??
    ((req: FastifyRequest) => {
      return (req.headers['x-user-id'] as string) || req.ip;
    });

  const onBlockResponse =
    options.onBlockResponse ??
    ((reply: FastifyReply, result: AnalysisResult) => {
      reply.status(403).send({
        error: 'Request blocked',
        reason: 'Potential prompt injection detected',
        requestId: result.requestId,
        threat: {
          level: result.threat.level,
          confidence: result.threat.confidence,
        },
      });
    });

  // Add preHandler hook
  fastify.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    // Skip if disabled or skip function returns true
    if (!shield.isEnabled() || options.skip?.(req)) {
      return;
    }

    const input = getInput(req);

    // No input to analyze
    if (!input || typeof input !== 'string') {
      return;
    }

    try {
      const result = await shield.analyze({
        input,
        userId: getUserId(req),
        metadata: {
          path: req.url,
          method: req.method,
          userAgent: req.headers['user-agent'],
        },
      });

      // Attach result to request for downstream use
      req.shieldResult = result;

      if (result.blocked) {
        onBlockResponse(reply, result);
        return reply;
      }
    } catch (error) {
      // Log error but don't block on shield failure
      fastify.log.error({ err: error }, '[Shield] Analysis error');
    }
  });

  done();
};

export { Shield } from '../index.js';
export type { ShieldConfig, AnalysisResult, ThreatDetection, ThreatLevel } from '../types.js';
