import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { Shield } from '../index.js';
import type { ShieldConfig, AnalysisResult } from '../types.js';

export interface StandaloneShieldOptions extends Partial<ShieldConfig> {
  /** Port to listen on (default: 3000) */
  port?: number;
  /** Host to bind to (default: '0.0.0.0') */
  host?: string;
  /** Target URL to proxy requests to */
  target?: string;
  /**
   * Function to extract the input to analyze from the request body.
   * Default: body.prompt || body.message || body.input
   */
  getInput?: (body: Record<string, unknown>) => string | undefined;
}

/**
 * Standalone proxy server for runtime prompt injection protection.
 *
 * Use this when you can't modify your application code but want to add
 * protection in front of it.
 *
 * @example
 * ```ts
 * import { createShieldProxy } from '@evidentai/shield/standalone';
 *
 * const proxy = createShieldProxy({
 *   port: 3000,
 *   target: 'http://localhost:8080', // Your LLM API
 *   blockThreshold: 'high',
 *   analyzers: ['heuristic'],
 * });
 *
 * proxy.start();
 * // Proxy running on http://localhost:3000
 * // Forwarding to http://localhost:8080
 * ```
 */
export class ShieldProxy {
  private shield: Shield;
  private options: Required<Pick<StandaloneShieldOptions, 'port' | 'host'>> &
    StandaloneShieldOptions;
  private server: ReturnType<typeof createServer> | null = null;

  constructor(options: StandaloneShieldOptions = {}) {
    this.options = {
      port: 3000,
      host: '0.0.0.0',
      ...options,
    };

    this.shield = new Shield({
      enabled: options.enabled ?? true,
      blockThreshold: options.blockThreshold ?? 'high',
      analyzers: options.analyzers ?? ['heuristic'],
      logAll: options.logAll ?? false,
      onThreat: options.onThreat,
      onBlock: options.onBlock,
      llm: options.llm,
      heuristic: options.heuristic,
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = createServer(this.handleRequest.bind(this));
      this.server.listen(this.options.port, this.options.host, () => {
        console.log(
          `[Shield] Proxy running on http://${this.options.host}:${this.options.port}`
        );
        if (this.options.target) {
          console.log(`[Shield] Forwarding to ${this.options.target}`);
        }
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Health check endpoint
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', shield: this.shield.isEnabled() }));
      return;
    }

    // Only analyze POST/PUT/PATCH requests (likely to have prompts)
    if (!['POST', 'PUT', 'PATCH'].includes(req.method || '')) {
      await this.proxyRequest(req, res);
      return;
    }

    try {
      const body = await this.parseBody(req);

      if (body) {
        const input = this.getInput(body);

        if (input) {
          const result = await this.shield.analyze({
            input,
            userId: req.headers['x-user-id'] as string,
            metadata: {
              path: req.url,
              method: req.method,
              userAgent: req.headers['user-agent'],
            },
          });

          if (result.blocked) {
            this.sendBlockedResponse(res, result);
            return;
          }
        }
      }

      // Forward to target or return success
      await this.proxyRequest(req, res, body);
    } catch (error) {
      console.error('[Shield] Error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  private getInput(body: Record<string, unknown>): string | undefined {
    if (this.options.getInput) {
      return this.options.getInput(body);
    }
    return (body.prompt ?? body.message ?? body.input ?? body.content) as
      | string
      | undefined;
  }

  private async parseBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];

      req.on('data', (chunk: Buffer) => chunks.push(chunk));

      req.on('end', () => {
        if (chunks.length === 0) {
          resolve(null);
          return;
        }

        try {
          const body = JSON.parse(Buffer.concat(chunks).toString());
          resolve(body);
        } catch {
          resolve(null);
        }
      });

      req.on('error', () => resolve(null));
    });
  }

  private sendBlockedResponse(res: ServerResponse, result: AnalysisResult): void {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'Request blocked',
        reason: 'Potential prompt injection detected',
        requestId: result.requestId,
        threat: {
          level: result.threat.level,
          confidence: result.threat.confidence,
        },
      })
    );
  }

  private async proxyRequest(
    req: IncomingMessage,
    res: ServerResponse,
    _body?: Record<string, unknown> | null
  ): Promise<void> {
    if (!this.options.target) {
      // No target - just acknowledge the request passed
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'allowed', message: 'Request passed shield' }));
      return;
    }

    // Proxy to target
    const targetUrl = new URL(req.url || '/', this.options.target);

    try {
      const proxyRes = await fetch(targetUrl.toString(), {
        method: req.method,
        headers: {
          ...Object.fromEntries(
            Object.entries(req.headers)
              .filter(([key]) => !['host', 'connection'].includes(key.toLowerCase()))
              .map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value || ''])
          ),
        },
        body: _body ? JSON.stringify(_body) : undefined,
      });

      // Forward response headers
      res.writeHead(proxyRes.status, Object.fromEntries(proxyRes.headers.entries()));

      // Forward response body
      const responseBody = await proxyRes.text();
      res.end(responseBody);
    } catch (error) {
      console.error('[Shield] Proxy error:', error);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad gateway', message: 'Failed to reach target' }));
    }
  }
}

export function createShieldProxy(options?: StandaloneShieldOptions): ShieldProxy {
  return new ShieldProxy(options);
}

export { Shield } from '../index.js';
export type { ShieldConfig, AnalysisResult, ThreatDetection, ThreatLevel } from '../types.js';
