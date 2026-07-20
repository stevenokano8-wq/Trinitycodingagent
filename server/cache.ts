import { AppEnv, KVNamespace, resolveEnvWithOverrides } from "./env.js";

// ── Upstash Redis REST helpers (fetch-based — works in Node & CF Workers) ─────
// Upstash exposes a plain HTTPS REST API so no TCP socket / ioredis is needed.

async function upstashGet(url: string, token: string, key: string): Promise<string | null> {
  try {
    const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    // Upstash REST returns { result: <value> } or { result: null }
    return json.result !== undefined && json.result !== null ? String(json.result) : null;
  } catch {
    return null;
  }
}

async function upstashSet(
  url: string,
  token: string,
  key: string,
  value: string,
  ttlSeconds?: number
): Promise<void> {
  const path = ttlSeconds
    ? `/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}?ex=${Math.max(1, ttlSeconds)}`
    : `/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`;
  await fetch(`${url}${path}`, {
    method: "GET", // Upstash REST supports GET for simple set
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function upstashDel(url: string, token: string, key: string): Promise<void> {
  await fetch(`${url}/del/${encodeURIComponent(key)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function upstashFlush(url: string, token: string): Promise<void> {
  await fetch(`${url}/flushall`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function upstashPing(url: string, token: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/ping`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const json: any = await res.json();
    return json.result === "PONG";
  } catch {
    return false;
  }
}

// ── State ─────────────────────────────────────────────────────────────────────

type CacheMode = "kv" | "upstash" | "local";

let kv: KVNamespace | null = null;
let upstashUrl: string | null = null;
let upstashToken: string | null = null;
let cacheMode: CacheMode = "local";
const localCache = new Map<string, string>();

export async function initCache(
  env?: Partial<AppEnv>
): Promise<{ status: "connected" | "local_fallback" | "error"; mode: CacheMode }> {
  const resolved = resolveEnvWithOverrides(env);

  // ── Tier 1: Cloudflare Workers KV (production only — binding injected by wrangler)
  if (resolved.CACHE_KV) {
    try {
      kv = resolved.CACHE_KV;
      // KV has no ping; a lightweight list() confirms the binding is reachable.
      await kv.list({ prefix: "__healthcheck__" });
      cacheMode = "kv";
      console.log("[Cache] ✅ Connected to Cloudflare Workers KV.");
      return { status: "connected", mode: "kv" };
    } catch (err: any) {
      console.error("[Cache] Workers KV failed, trying Upstash:", err.message);
      kv = null;
    }
  }

  // ── Tier 2: Upstash Redis REST (local dev + any non-KV environment)
  const rUrl = (resolved as any).UPSTASH_REDIS_REST_URL as string | undefined;
  const rToken = (resolved as any).UPSTASH_REDIS_REST_TOKEN as string | undefined;

  if (rUrl && rToken) {
    const ok = await upstashPing(rUrl, rToken);
    if (ok) {
      upstashUrl = rUrl;
      upstashToken = rToken;
      cacheMode = "upstash";
      console.log("[Cache] ✅ Connected to Upstash Redis REST.");
      return { status: "connected", mode: "upstash" };
    } else {
      console.error("[Cache] Upstash ping failed, falling back to in-memory.");
    }
  }

  // ── Tier 3: In-memory fallback
  kv = null;
  upstashUrl = null;
  upstashToken = null;
  cacheMode = "local";
  console.log("[Cache] ⚠️  No KV or Upstash binding available. Using in-memory fallback.");
  return { status: "local_fallback", mode: "local" };
}

export async function cacheGet(key: string): Promise<string | null> {
  if (cacheMode === "kv" && kv) {
    try {
      return (await kv.get(key, { type: "text" })) ?? null;
    } catch (err) {
      console.error(`[Cache/KV] GET error for key ${key}:`, err);
      return localCache.get(key) ?? null;
    }
  }
  if (cacheMode === "upstash" && upstashUrl && upstashToken) {
    const val = await upstashGet(upstashUrl, upstashToken, key);
    if (val !== null) return val;
    return localCache.get(key) ?? null;
  }
  return localCache.get(key) ?? null;
}

export async function cacheSet(
  key: string,
  value: string,
  ttlSeconds?: number
): Promise<void> {
  if (cacheMode === "kv" && kv) {
    try {
      // Workers KV requires a minimum TTL of 60 seconds; shorter values are rounded up.
      const options = ttlSeconds ? { expirationTtl: Math.max(60, ttlSeconds) } : undefined;
      await kv.put(key, value, options);
      return;
    } catch (err) {
      console.error(`[Cache/KV] PUT error for key ${key}:`, err);
      localCache.set(key, value);
      return;
    }
  }
  if (cacheMode === "upstash" && upstashUrl && upstashToken) {
    await upstashSet(upstashUrl, upstashToken, key, value, ttlSeconds);
    return;
  }
  localCache.set(key, value);
}

export async function cacheDel(key: string): Promise<void> {
  if (cacheMode === "kv" && kv) {
    try {
      await kv.delete(key);
      return;
    } catch (err) {
      console.error(`[Cache/KV] DELETE error for key ${key}:`, err);
      localCache.delete(key);
      return;
    }
  }
  if (cacheMode === "upstash" && upstashUrl && upstashToken) {
    await upstashDel(upstashUrl, upstashToken, key);
    return;
  }
  localCache.delete(key);
}

export async function cacheFlush(): Promise<void> {
  if (cacheMode === "kv" && kv) {
    try {
      const { keys } = await kv.list();
      await Promise.all(keys.map((k) => kv!.delete(k.name)));
      return;
    } catch (err) {
      console.error("[Cache/KV] Flush error:", err);
      localCache.clear();
      return;
    }
  }
  if (cacheMode === "upstash" && upstashUrl && upstashToken) {
    await upstashFlush(upstashUrl, upstashToken);
    return;
  }
  localCache.clear();
}

/** Returns the active cache backend for health/status endpoints. */
export function getCacheMode(): CacheMode {
  return cacheMode;
}
