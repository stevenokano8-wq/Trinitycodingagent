import { Redis } from "@upstash/redis";
import { AppEnv, resolveEnvWithOverrides } from "./env.js";

// ioredis opens a raw TCP socket, which Cloudflare Workers cannot do.
// @upstash/redis is a fetch/HTTPS-based REST client — the standard
// Workers-compatible way to talk to a Redis-protocol store.
let redisClient: Redis | null = null;
let useLocalCache = true;
const localCache = new Map<string, string>();

export async function initRedis(env?: Partial<AppEnv>): Promise<{ status: "connected" | "local_fallback" | "error"; url?: string }> {
  const resolved = resolveEnvWithOverrides(env);
  const url = resolved.UPSTASH_REDIS_REST_URL;
  const token = resolved.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.log("No UPSTASH_REDIS_REST_URL/TOKEN configured. Falling back to in-memory cache emulation.");
    useLocalCache = true;
    redisClient = null;
    return { status: "local_fallback" };
  }

  try {
    redisClient = new Redis({ url, token });
    await redisClient.ping();
    useLocalCache = false;
    console.log("Successfully connected to Upstash Redis!");
    return { status: "connected", url };
  } catch (err: any) {
    console.error("Upstash Redis connection failed, falling back to in-memory cache:", err.message);
    useLocalCache = true;
    redisClient = null;
    return { status: "error", url };
  }
}

export async function redisGet(key: string): Promise<string | null> {
  if (useLocalCache || !redisClient) {
    return localCache.get(key) ?? null;
  }
  try {
    const val = await redisClient.get<string>(key);
    return val ?? null;
  } catch (err) {
    console.error(`Redis GET error for key ${key}:`, err);
    return localCache.get(key) ?? null;
  }
}

export async function redisSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
  if (useLocalCache || !redisClient) {
    localCache.set(key, value);
    return;
  }
  try {
    if (ttlSeconds) {
      await redisClient.set(key, value, { ex: ttlSeconds });
    } else {
      await redisClient.set(key, value);
    }
  } catch (err) {
    console.error(`Redis SET error for key ${key}:`, err);
    localCache.set(key, value);
  }
}

export async function redisDel(key: string): Promise<void> {
  if (useLocalCache || !redisClient) {
    localCache.delete(key);
    return;
  }
  try {
    await redisClient.del(key);
  } catch (err) {
    console.error(`Redis DEL error for key ${key}:`, err);
    localCache.delete(key);
  }
}

export async function redisFlush(): Promise<void> {
  if (useLocalCache || !redisClient) {
    localCache.clear();
    return;
  }
  try {
    await redisClient.flushall();
  } catch (err) {
    console.error("Redis FLUSH error:", err);
    localCache.clear();
  }
}
