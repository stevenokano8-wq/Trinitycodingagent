// Shared environment shape used by both the local Node/Express dev server
// (server.ts) and the Cloudflare Worker entry (server/worker.ts).
//
// In Node dev, values fall back to process.env. In Workers, the fetch handler
// receives `env` from the platform (Worker secrets/vars, Hyperdrive bindings)
// and threads it through explicitly, since Workers have no process.env.
export interface AppEnv {
  // Hyperdrive-bound Postgres connection string (or a plain DATABASE_URL for local dev)
  DATABASE_URL?: string;
  // Upstash Redis REST credentials (fetch-based, Workers-safe — replaces ioredis/TCP)
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  // AI + GitHub sync
  GEMINI_API_KEY?: string;
  GITHUB_TOKEN?: string;
  GITHUB_REPO_URL?: string;
}

// Resolve a value from an explicit env object first, falling back to
// process.env for local Node development (tsx/Express).
export function resolveEnv(env?: Partial<AppEnv>): AppEnv {
  const proc = typeof process !== "undefined" ? process.env : ({} as Record<string, string | undefined>);
  return {
    DATABASE_URL: env?.DATABASE_URL ?? proc.DATABASE_URL,
    UPSTASH_REDIS_REST_URL: env?.UPSTASH_REDIS_REST_URL ?? proc.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: env?.UPSTASH_REDIS_REST_TOKEN ?? proc.UPSTASH_REDIS_REST_TOKEN,
    GEMINI_API_KEY: env?.GEMINI_API_KEY ?? proc.GEMINI_API_KEY,
    GITHUB_TOKEN: env?.GITHUB_TOKEN ?? proc.GITHUB_TOKEN,
    GITHUB_REPO_URL: env?.GITHUB_REPO_URL ?? proc.GITHUB_REPO_URL,
  };
}

// Runtime-provided overrides (from POST /api/settings or /api/github/config).
// Workers have no writable disk/`.env`, so these live in isolate memory only —
// same "local fallback" philosophy as the in-memory DB/cache, with the same
// caveat: they don't survive a Worker isolate recycle or a fresh Node process.
let runtimeOverrides: Partial<AppEnv> = {};

export function setRuntimeOverrides(patch: Partial<AppEnv>) {
  runtimeOverrides = { ...runtimeOverrides, ...patch };
}

export function getRuntimeOverrides(): Partial<AppEnv> {
  return runtimeOverrides;
}

export function resolveEnvWithOverrides(env?: Partial<AppEnv>): AppEnv {
  return resolveEnv({ ...env, ...runtimeOverrides });
}
