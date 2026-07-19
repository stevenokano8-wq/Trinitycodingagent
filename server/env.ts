/**
 * Shared environment types for sovereign-agent-api.
 * Every binding declared here must have a matching entry in wrangler.api.toml.
 * No Gemini / external AI keys — all inference goes through CF Workers AI.
 */

// ── D1 ────────────────────────────────────────────────────────────────────────
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

// ── KV ────────────────────────────────────────────────────────────────────────
export interface KVNamespace {
  get(key: string, options?: { type?: "text" }): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string }): Promise<{ keys: { name: string }[] }>;
}

// ── R2 ────────────────────────────────────────────────────────────────────────
export interface R2Object {
  key: string;
  size: number;
  etag: string;
  uploaded: Date;
  httpMetadata?: { contentType?: string };
}
export interface R2Bucket {
  put(
    key: string,
    value: string | ArrayBuffer | ReadableStream,
    options?: { httpMetadata?: { contentType?: string } }
  ): Promise<R2Object>;
  get(key: string): Promise<
    (R2Object & { text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer> }) | null
  >;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number }): Promise<{ objects: R2Object[] }>;
}

// ── Workers AI ────────────────────────────────────────────────────────────────
export interface AiTextResponse {
  choices?: Array<{ message?: { content?: string } }>;
  response?: string;
}
export interface AiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
export interface AiBinding {
  run(
    model: string,
    input: { messages?: AiChatMessage[]; prompt?: string; max_tokens?: number }
  ): Promise<AiTextResponse>;
}
export function extractCfAiText(result: AiTextResponse): string {
  return result.choices?.[0]?.message?.content ?? result.response ?? "";
}

// ── Vectorize ────────────────────────────────────────────────────────────────
export interface VectorizeVector {
  id: string;
  values: number[];
  namespace?: string;
  metadata?: Record<string, string | number | boolean>;
}
export interface VectorizeMatch {
  id: string;
  score: number;
  metadata?: Record<string, string | number | boolean>;
}
export interface VectorizeIndex {
  upsert(vectors: VectorizeVector[]): Promise<{ count: number }>;
  query(
    vector: number[],
    options?: { topK?: number; namespace?: string; returnMetadata?: boolean }
  ): Promise<{ matches: VectorizeMatch[] }>;
  deleteByIds(ids: string[]): Promise<{ count: number }>;
  getByIds(ids: string[]): Promise<VectorizeVector[]>;
}

// ── Queue ─────────────────────────────────────────────────────────────────────
export interface Queue<T = unknown> {
  send(message: T, options?: { contentType?: string; delaySeconds?: number }): Promise<void>;
  sendBatch(messages: Array<{ body: T; delaySeconds?: number }>): Promise<void>;
}
export interface MessageBatch<T = unknown> {
  queue: string;
  messages: Array<{
    id: string;
    timestamp: Date;
    body: T;
    ack(): void;
    retry(): void;
  }>;
  ackAll(): void;
  retryAll(): void;
}

// ── Cloudflare Sandbox (@cloudflare/sandbox containers binding) ───────────────
export type ContainerStub = { fetch(req: Request): Promise<Response> };

// ── Browser Rendering ─────────────────────────────────────────────────────────
export type BrowserBinding = unknown; // @cloudflare/puppeteer launch target

// ── Durable Object namespaces ─────────────────────────────────────────────────
export interface DurableObjectId {
  toString(): string;
  equals(other: DurableObjectId): boolean;
}
export interface DurableObjectStub {
  fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
}
export interface DurableObjectNamespace {
  newUniqueId(): DurableObjectId;
  idFromName(name: string): DurableObjectId;
  idFromString(hexId: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

// ── App environment ───────────────────────────────────────────────────────────
export interface AppEnv {
  // ── Persistence ────────────────────────────────────────────────────────────
  DB?: D1Database;
  CACHE_KV?: KVNamespace;
  FILES_R2?: R2Bucket;

  // ── Inference (CF Workers AI — no external keys needed) ───────────────────
  AI?: AiBinding;

  // ── Semantic search & RAG memory ─────────────────────────────────────────
  VECTORIZE?: VectorizeIndex;

  // ── Background task queue ─────────────────────────────────────────────────
  TASK_QUEUE?: Queue<QueueMessage>;

  // ── Code execution (Cloudflare Sandbox / Containers) ───────────────────────
  SANDBOX?: ContainerStub;

  // ── Browser rendering (Cloudflare Browser Rendering) ──────────────────────
  BROWSER?: BrowserBinding;

  // ── Durable Object namespaces ──────────────────────────────────────────────
  SESSION_WORKSPACE?: DurableObjectNamespace;
  FILE_EXPLORER?: DurableObjectNamespace;
  WEBSOCKET_MANAGER?: DurableObjectNamespace;
  WORKFLOW_ENGINE?: DurableObjectNamespace;
  THINK_AGENT?: DurableObjectNamespace;
  SUB_AGENT_ORCHESTRATOR?: DurableObjectNamespace;
  USER_PROFILE?: DurableObjectNamespace;
  WORKSPACE_REGISTRY?: DurableObjectNamespace;
  AI_GATEWAY?: DurableObjectNamespace;
  LIVE_PREVIEW?: DurableObjectNamespace;
  BROWSER_RUN?: DurableObjectNamespace;

  // ── Secrets / env vars ─────────────────────────────────────────────────────
  GEMINI_API_KEY?: string;
  GITHUB_TOKEN?: string;
  GITHUB_REPO_URL?: string;
}

// ── Queue message shape ───────────────────────────────────────────────────────
export interface QueueMessage {
  type: "agent_build" | "git_push" | "browser_test" | "vectorize_upsert" | "workflow_step";
  sessionId: string;
  payload: Record<string, unknown>;
  enqueuedAt: string;
}

// ── Runtime env overrides (for local dev / test injection) ────────────────────
let _runtimeOverrides: Partial<AppEnv> = {};
export function setRuntimeOverrides(overrides: Partial<AppEnv>) {
  _runtimeOverrides = overrides;
}
export function resolveEnvWithOverrides(env?: Partial<AppEnv>): Partial<AppEnv> {
  return { ...env, ..._runtimeOverrides };
}
