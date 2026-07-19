/**
 * AI_GATEWAY — Durable Object
 *
 * Single responsibility: all Workers AI calls flow through here.
 *   • Model routing by task type (reasoning / code_gen / fast / vision)
 *   • KV response caching with configurable TTL
 *   • Per-user token-usage tracking and soft rate-limit enforcement
 *   • Audit log in DO storage (last 200 entries)
 *
 * All inference uses Cloudflare Workers AI — no external API keys.
 */

import { AppEnv, AiChatMessage, extractCfAiText } from "../env.js";

// ── Model catalogue ───────────────────────────────────────────────────────────
export const MODELS = {
  /** Multi-step reasoning, planning, architecture decisions */
  REASONING: "@cf/deepseek-ai/deepseek-r1-distill-llama-70b",
  /** Code generation, synthesis, refactoring */
  CODE: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  /** Classification, extraction, quick Q&A — sub-100 ms */
  FAST: "@cf/meta/llama-3.1-8b-instruct-fast",
  /** Vision + reasoning for UI screenshot analysis */
  VISION: "@cf/meta/llama-3.2-11b-vision-instruct",
} as const;
type ModelKey = keyof typeof MODELS;

const TASK_TO_MODEL: Record<string, ModelKey> = {
  reasoning: "REASONING",
  planning:  "REASONING",
  code_gen:  "CODE",
  code:      "CODE",
  fast:      "FAST",
  classify:  "FAST",
  vision:    "VISION",
};

// ── Interfaces ────────────────────────────────────────────────────────────────
interface GatewayRequest {
  taskType: string;
  messages: AiChatMessage[];
  maxTokens?: number;
  userId?: string;
  noCache?: boolean;
  cacheTtl?: number;
}
interface GatewayResponse {
  text: string;
  model: string;
  cached: boolean;
  tokens?: number;
}
interface UsageRecord {
  userId: string;
  requests: number;
  resetAt: number; // unix ms, hourly window
}
interface AuditEntry {
  ts: string;
  userId?: string;
  taskType: string;
  model: string;
  cached: boolean;
  promptLen: number;
}

const RATE_LIMIT = 200; // requests per hour per user
const AUDIT_MAX  = 200;

// ── DO class ──────────────────────────────────────────────────────────────────
export class AiGateway {
  private state: DurableObjectState;
  private env: AppEnv;

  constructor(state: DurableObjectState, env: AppEnv) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/run") {
      return this.handleRun(request);
    }
    if (request.method === "GET" && url.pathname === "/stats") {
      return this.handleStats(request);
    }
    return new Response("Not found", { status: 404 });
  }

  // ── /run ─────────────────────────────────────────────────────────────────────
  private async handleRun(request: Request): Promise<Response> {
    const body = await request.json() as GatewayRequest;
    const { taskType, messages, maxTokens = 2048, userId = "anonymous",
            noCache = false, cacheTtl = 300 } = body;

    // Rate limit
    const limitErr = await this.checkRateLimit(userId);
    if (limitErr) return new Response(JSON.stringify({ error: limitErr }), { status: 429 });

    // Model selection
    const key = TASK_TO_MODEL[taskType] ?? "REASONING";
    const model = MODELS[key];

    // Cache check
    const cacheKey = this.cacheKey(model, messages);
    if (!noCache && this.env.CACHE_KV) {
      const cached = await this.env.CACHE_KV.get(cacheKey);
      if (cached) {
        const resp: GatewayResponse = { text: cached, model, cached: true };
        await this.appendAudit({ ts: new Date().toISOString(), userId, taskType, model, cached: true, promptLen: JSON.stringify(messages).length });
        return Response.json(resp);
      }
    }

    // Inference via Workers AI
    if (!this.env.AI) {
      return new Response(JSON.stringify({ error: "AI binding not available" }), { status: 503 });
    }
    const result = await this.env.AI.run(model, { messages, max_tokens: maxTokens });
    const text = extractCfAiText(result);

    // Cache the response
    if (!noCache && this.env.CACHE_KV) {
      await this.env.CACHE_KV.put(cacheKey, text, { expirationTtl: cacheTtl });
    }

    // Track usage
    await this.incrementUsage(userId);
    await this.appendAudit({ ts: new Date().toISOString(), userId, taskType, model, cached: false, promptLen: JSON.stringify(messages).length });

    const resp: GatewayResponse = { text, model, cached: false };
    return Response.json(resp);
  }

  // ── /stats ────────────────────────────────────────────────────────────────────
  private async handleStats(request: Request): Promise<Response> {
    const userId = new URL(request.url).searchParams.get("userId") ?? "anonymous";
    const usage  = await this.state.storage.get<UsageRecord>(`usage:${userId}`);
    const audit  = await this.state.storage.get<AuditEntry[]>("audit") ?? [];
    return Response.json({ usage, recentCalls: audit.slice(-20) });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  private cacheKey(model: string, messages: AiChatMessage[]): string {
    const raw = model + JSON.stringify(messages);
    // Simple djb2 hash (no crypto needed for cache key)
    let h = 5381;
    for (let i = 0; i < raw.length; i++) h = ((h << 5) + h) ^ raw.charCodeAt(i);
    return `ai:${(h >>> 0).toString(16)}`;
  }

  private async checkRateLimit(userId: string): Promise<string | null> {
    const now = Date.now();
    const stored = await this.state.storage.get<UsageRecord>(`usage:${userId}`);
    if (!stored || stored.resetAt < now) return null; // window expired
    if (stored.requests >= RATE_LIMIT) {
      const secs = Math.ceil((stored.resetAt - now) / 1000);
      return `Rate limit exceeded. Resets in ${secs}s.`;
    }
    return null;
  }

  private async incrementUsage(userId: string): Promise<void> {
    const now = Date.now();
    const stored = await this.state.storage.get<UsageRecord>(`usage:${userId}`) ??
      { userId, requests: 0, resetAt: now + 3_600_000 };
    if (stored.resetAt < now) {
      stored.requests = 0;
      stored.resetAt = now + 3_600_000;
    }
    stored.requests++;
    await this.state.storage.put(`usage:${userId}`, stored);
  }

  private async appendAudit(entry: AuditEntry): Promise<void> {
    const log = await this.state.storage.get<AuditEntry[]>("audit") ?? [];
    log.push(entry);
    if (log.length > AUDIT_MAX) log.splice(0, log.length - AUDIT_MAX);
    await this.state.storage.put("audit", log);
  }
}
