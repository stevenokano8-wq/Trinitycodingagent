// Shared environment shape used by both the local Node/Express dev server
// (server.ts) and the Cloudflare Worker entry (server/worker.ts).
//
// In Node dev, secret-like values fall back to process.env. In Workers, the
// fetch handler receives `env` from the platform (Worker secrets/vars, plus
// the D1 and KV bindings declared in wrangler.api.toml) and threads it
// through explicitly, since Workers have no process.env.
//
// Minimal ambient types for the Cloudflare bindings we use, kept local
// instead of pulling in the full `@cloudflare/workers-types` package (which
// can conflict with the DOM lib types this project also compiles against).
export interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  meta?: unknown;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = unknown>(): Promise<D1Result<T>>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<{ count: number; duration: number }>;
}

export interface KVNamespace {
  get(key: string, options?: { type?: "text" }): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string }): Promise<{ keys: { name: string }[] }>;
}

// Cloudflare Workers AI binding (declared as [ai] in wrangler.api.toml).
// Used for fast task-planning (division of labor); Gemini handles code synthesis.
export interface AiTextResponse {
  response: string;
}
export interface AiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
export interface AiBinding {
  run(model: string, input: { messages?: AiChatMessage[]; prompt?: string; max_tokens?: number }): Promise<AiTextResponse>;
}

export interface AppEnv {
  // Cloudflare D1 binding (declared as [[d1_databases]] in wrangler.api.toml).
  // Undefined in local Node dev (`pnpm dev`), where the in-memory fallback is used.
  DB?: D1Database;
  // Cloudflare Workers KV binding (declared as [[kv_namespaces]] in wrangler.api.toml).
  // Undefined in local Node dev (`pnpm dev`), where the in-memory fallback is used.
  CACHE_KV?: KVNamespace;
  // Cloudflare Workers AI binding for task planning (declared as [ai] in wrangler.api.toml).
  AI?: AiBinding;
  // AI + GitHub sync
  GEMINI_API_KEY?: string;
  GITHUB_TOKEN?: string;
  GITHUB_REPO_URL?: string;
}

// Resolve a value from an explicit env object first, falling back to
// process.env for local Node development (tsx/Express). D1/KV bindings only
// ever come from the explicit env object (Workers platform) — they have no
// process.env equivalent.
export function resolveEnv(env?: Partial<AppEnv>): AppEnv {
  const proc = typeof process !== "undefined" ? process.env : ({} as Record<string, string | undefined>);
  return {
    DB: env?.DB,
    CACHE_KV: env?.CACHE_KV,
    GEMINI_API_KEY: env?.GEMINI_API_KEY ?? proc.GEMINI_API_KEY,
    GITHUB_TOKEN: env?.GITHUB_TOKEN || "",
    GITHUB_REPO_URL: env?.GITHUB_REPO_URL || "",
  };
}

// Runtime-provided overrides (from POST /api/settings or /api/github/config).
// Workers have no writable disk/`.env`, so these live in isolate memory only —
// same "local fallback" philosophy as the in-memory DB/cache, with the same
// caveat: they don't survive a Worker isolate recycle or a fresh Node process.
// Only the plain string fields (Gemini/GitHub) are eligible for runtime
// overrides — D1/KV are bindings fixed at deploy time and cannot be swapped
// at runtime.
type OverridableAppEnv = Omit<AppEnv, "DB" | "CACHE_KV">;
let runtimeOverrides: Partial<OverridableAppEnv> = {};

export function setRuntimeOverrides(patch: Partial<OverridableAppEnv>) {
  runtimeOverrides = { ...runtimeOverrides, ...patch };
}

export function getRuntimeOverrides(): Partial<OverridableAppEnv> {
  return runtimeOverrides;
}

export function resolveEnvWithOverrides(env?: Partial<AppEnv>): AppEnv {
  return resolveEnv({ ...env, ...runtimeOverrides });
}
