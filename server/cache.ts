/**
 * Cache layer — 3-tier priority chain:
 *   1. Cloudflare Workers KV  (CACHE_KV binding — production Worker only)
 *   2. Upstash Redis SDK       (@upstash/redis — local dev + any non-KV env)
 *   3. In-memory Map           (fallback when no credentials are present)
 *
 * Redis is the "pressure-release valve": durable state that survives Worker
 * restarts and CPU-limit boundaries, without requiring the KV binding.
 */

import { AppEnv, KVNamespace, resolveEnvWithOverrides } from "./env.js";

// ── Lazy Redis client (tree-shakeable in CF Worker bundles) ───────────────────

type RedisLike = {
  ping(): Promise<string>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: { ex?: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
  keys(pattern: string): Promise<string[]>;
  flushall(): Promise<unknown>;
};

let _redisClient: RedisLike | null = null;

async function getRedisClient(url: string, token: string): Promise<RedisLike | null> {
  if (_redisClient) return _redisClient;
  try {
    const { Redis } = await import("@upstash/redis");
    _redisClient = new Redis({ url, token }) as unknown as RedisLike;
    return _redisClient;
  } catch {
    return null;
  }
}

// ── State ─────────────────────────────────────────────────────────────────────

type CacheMode = "kv" | "upstash" | "local";

let kv: KVNamespace | null = null;
let upstashUrl: string | null = null;
let upstashToken: string | null = null;
let cacheMode: CacheMode = "local";
const localCache = new Map<string, string>();

// ── Init ──────────────────────────────────────────────────────────────────────

export async function initCache(
  env?: Partial<AppEnv>,
): Promise<{ status: "connected" | "local_fallback" | "error"; mode: CacheMode }> {
  const resolved = resolveEnvWithOverrides(env);

  // Tier 1 — Cloudflare Workers KV (production binding injected by wrangler)
  if (resolved.CACHE_KV) {
    try {
      kv = resolved.CACHE_KV;
      await kv.list({ prefix: "__healthcheck__" });
      cacheMode = "kv";
      console.log("[Cache] ✅ Connected to Cloudflare Workers KV.");
      return { status: "connected", mode: "kv" };
    } catch (err: any) {
      console.error("[Cache] KV failed, trying Upstash:", err.message);
      kv = null;
    }
  }

  // Tier 2 — Upstash Redis via @upstash/redis SDK
  const rUrl   = (resolved as any).UPSTASH_REDIS_REST_URL   as string | undefined;
  const rToken = (resolved as any).UPSTASH_REDIS_REST_TOKEN as string | undefined;

  if (rUrl && rToken) {
    const client = await getRedisClient(rUrl, rToken);
    if (client) {
      try {
        if ((await client.ping()) === "PONG") {
          upstashUrl   = rUrl;
          upstashToken = rToken;
          cacheMode    = "upstash";
          console.log("[Cache] ✅ Connected to Upstash Redis (SDK).");
          return { status: "connected", mode: "upstash" };
        }
      } catch (err: any) {
        console.error("[Cache] Upstash ping failed:", err.message);
      }
    }
  }

  // Tier 3 — In-memory fallback
  kv = upstashUrl = upstashToken = null;
  cacheMode = "local";
  console.log("[Cache] ⚠️  No KV or Upstash binding. Using in-memory fallback.");
  return { status: "local_fallback", mode: "local" };
}

export function getCacheMode(): CacheMode { return cacheMode; }

// ── Operations ────────────────────────────────────────────────────────────────

export async function cacheGet(key: string): Promise<string | null> {
  if (cacheMode === "kv" && kv) {
    try { return (await kv.get(key, { type: "text" })) ?? null; }
    catch { return localCache.get(key) ?? null; }
  }
  if (cacheMode === "upstash" && upstashUrl && upstashToken) {
    const c = await getRedisClient(upstashUrl, upstashToken);
    if (c) { try { return await c.get(key); } catch { /* fall through */ } }
  }
  return localCache.get(key) ?? null;
}

export async function cacheSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
  if (cacheMode === "kv" && kv) {
    try {
      await kv.put(key, value, ttlSeconds ? { expirationTtl: Math.max(60, ttlSeconds) } : undefined);
      return;
    } catch { /* fall through */ }
  }
  if (cacheMode === "upstash" && upstashUrl && upstashToken) {
    const c = await getRedisClient(upstashUrl, upstashToken);
    if (c) {
      try { await c.set(key, value, ttlSeconds ? { ex: ttlSeconds } : undefined); return; }
      catch { /* fall through */ }
    }
  }
  localCache.set(key, value);
}

export async function cacheDel(key: string): Promise<void> {
  if (cacheMode === "kv" && kv) {
    try { await kv.delete(key); return; } catch { /* fall through */ }
  }
  if (cacheMode === "upstash" && upstashUrl && upstashToken) {
    const c = await getRedisClient(upstashUrl, upstashToken);
    if (c) { try { await c.del(key); return; } catch { /* fall through */ } }
  }
  localCache.delete(key);
}

export async function cacheFlush(): Promise<void> {
  if (cacheMode === "kv" && kv) {
    try {
      const { keys } = await kv.list();
      await Promise.all(keys.map((k) => kv!.delete(k.name)));
      return;
    } catch { /* fall through */ }
  }
  if (cacheMode === "upstash" && upstashUrl && upstashToken) {
    const c = await getRedisClient(upstashUrl, upstashToken);
    if (c) { try { await c.flushall(); return; } catch { /* fall through */ } }
  }
  localCache.clear();
}
