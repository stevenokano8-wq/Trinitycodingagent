import { AppEnv, KVNamespace, resolveEnvWithOverrides } from "./env.js";
import { logger } from "./logger.js";

// Local Node dev (`pnpm dev`) has no KV binding available outside `wrangler
// dev`, so it always uses this in-memory Map as the cache emulation.
let kv: KVNamespace | null = null;
let useLocalCache = true;
const localCache = new Map<string, string>();

export async function initCache(env?: Partial<AppEnv>): Promise<{ status: "connected" | "local_fallback" | "error" }> {
  const resolved = resolveEnvWithOverrides(env);

  if (!resolved.CACHE_KV) {
    logger.info(`No KV binding (CACHE_KV) present, falling back to in-memory cache emulation`);
    useLocalCache = true;
    kv = null;
    return { status: "local_fallback" };
  }

  try {
    kv = resolved.CACHE_KV;
    // KV has no ping/health endpoint; a cheap list() call confirms the
    // binding is actually reachable before we trust it for the session.
    await kv.list({ prefix: "__healthcheck__" });
    useLocalCache = false;
    logger.info(`Successfully connected to Cloudflare Workers KV`);
    return { status: "connected" };
  } catch (err: any) {
    logger.error(`Workers KV connection failed, falling back to in-memory cache`, { err: err.message });
    useLocalCache = true;
    kv = null;
    return { status: "error" };
  }
}

export async function cacheGet(key: string): Promise<string | null> {
  if (useLocalCache || !kv) {
    return localCache.get(key) ?? null;
  }
  try {
    const val = await kv.get(key, { type: "text" });
    return val ?? null;
  } catch (err) {
    logger.error(`KV GET error`, { key, err: String(err) });
    return localCache.get(key) ?? null;
  }
}

export async function cacheSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
  if (useLocalCache || !kv) {
    localCache.set(key, value);
    return;
  }
  try {
    // Workers KV requires a minimum TTL of 60 seconds; anything shorter is
    // rounded up rather than rejected outright.
    const options = ttlSeconds ? { expirationTtl: Math.max(60, ttlSeconds) } : undefined;
    await kv.put(key, value, options);
  } catch (err) {
    logger.error(`KV PUT error`, { key, err: String(err) });
    localCache.set(key, value);
  }
}

export async function cacheDel(key: string): Promise<void> {
  if (useLocalCache || !kv) {
    localCache.delete(key);
    return;
  }
  try {
    await kv.delete(key);
  } catch (err) {
    logger.error(`KV DELETE error`, { key, err: String(err) });
    localCache.delete(key);
  }
}

export async function cacheFlush(): Promise<void> {
  if (useLocalCache || !kv) {
    localCache.clear();
    return;
  }
  try {
    const { keys } = await kv.list();
    await Promise.all(keys.map((k) => kv!.delete(k.name)));
  } catch (err) {
    logger.error(`KV flush error`, { err: String(err) });
    localCache.clear();
  }
}
