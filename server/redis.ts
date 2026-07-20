/**
 * Upstash Redis — sovereign-agent integration layer
 *
 * Provides 5 capabilities that extend Cloudflare past its operational limits:
 *   1. Session Management   — durable state across Worker invocations
 *   2. Rate Limiting        — global counters across all Workers
 *   3. LLM Response Cache   — cost-saving prompt-hash cache
 *   4. Background Task Tracking — real-time task status, checkpoint/resume
 *   5. Chat History Memory  — persistent conversation memory per session
 *
 * Philosophy: Cloudflare KV/D1 do the heavy lifting; Redis is the
 * pressure-release valve for state that must survive >5-min CPU windows
 * or span multiple Worker isolates.
 */

// ── Client singleton ──────────────────────────────────────────────────────────

type RedisClient = {
  ping(): Promise<string>;
  get<T = string>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  flushall(): Promise<unknown>;
};

let _redis: RedisClient | null = null;

export async function getRedis(): Promise<RedisClient> {
  if (_redis) return _redis;

  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error(
      "[Redis] UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set."
    );
  }

  const { Redis } = await import("@upstash/redis");
  _redis = new Redis({ url, token }) as unknown as RedisClient;
  return _redis;
}

export async function redisHealthCheck(): Promise<boolean> {
  try {
    const r = await getRedis();
    return (await r.ping()) === "PONG";
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SESSION MANAGEMENT
//    Key: session:{sessionId}:state  |  TTL: 24 h
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_TTL = 86_400;

export async function sessionGet(sessionId: string): Promise<Record<string, unknown> | null> {
  try {
    const r   = await getRedis();
    const raw = await r.get<string>(`session:${sessionId}:state`);
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : (raw as any);
  } catch { return null; }
}

export async function sessionSet(
  sessionId: string,
  state: Record<string, unknown>,
  ttl = SESSION_TTL,
): Promise<void> {
  const r = await getRedis();
  await r.set(`session:${sessionId}:state`, JSON.stringify(state), { ex: ttl });
}

export async function sessionDelete(sessionId: string): Promise<void> {
  const r = await getRedis();
  await r.del(`session:${sessionId}:state`);
}

export async function sessionExtend(sessionId: string, ttl = SESSION_TTL): Promise<void> {
  const r = await getRedis();
  await r.expire(`session:${sessionId}:state`, ttl);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. RATE LIMITING
//    Key: ratelimit:{userId}:{window}  |  Windows: minute / hour / day
// ─────────────────────────────────────────────────────────────────────────────

const WINDOW_TTL: Record<string, number>   = { minute: 60, hour: 3_600, day: 86_400 };
const RATE_LIMITS: Record<string, number>  = { minute: 20, hour: 200,   day: 1_000 };

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  window: string;
}

export async function checkRateLimit(
  userId: string,
  window: "minute" | "hour" | "day" = "hour",
): Promise<RateLimitResult> {
  const r     = await getRedis();
  const key   = `ratelimit:${userId}:${window}`;
  const count = await r.incr(key);
  if (count === 1) await r.expire(key, WINDOW_TTL[window]);
  const limit = RATE_LIMITS[window];
  return { allowed: count <= limit, count, limit, window };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. LLM RESPONSE CACHING
//    Key: cache:llm:{promptHash}  |  TTL: 1 h
// ─────────────────────────────────────────────────────────────────────────────

const LLM_CACHE_TTL = 3_600;

function hashPrompt(prompt: string): string {
  let h = 2_166_136_261;
  for (let i = 0; i < prompt.length; i++) {
    h ^= prompt.charCodeAt(i);
    h  = (h * 16_777_619) >>> 0;
  }
  return h.toString(16);
}

export async function llmCacheGet(prompt: string): Promise<string | null> {
  try {
    const r = await getRedis();
    return await r.get<string>(`cache:llm:${hashPrompt(prompt)}`);
  } catch { return null; }
}

export async function llmCacheSet(
  prompt: string,
  response: string,
  ttl = LLM_CACHE_TTL,
): Promise<void> {
  const r = await getRedis();
  await r.set(`cache:llm:${hashPrompt(prompt)}`, response, { ex: ttl });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. BACKGROUND TASK TRACKING
//    Key: task:{taskId}:status  |  TTL: 6 h
//    Allows builds to checkpoint & resume across Worker invocations that
//    would otherwise hit Cloudflare's 5-min CPU limit.
// ─────────────────────────────────────────────────────────────────────────────

const TASK_TTL = 3_600 * 6;

export interface TaskStatus {
  taskId: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  currentStep?: string;
  logs: string[];
  startedAt?: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
}

export async function taskStatusGet(taskId: string): Promise<TaskStatus | null> {
  try {
    const r   = await getRedis();
    const raw = await r.get<string>(`task:${taskId}:status`);
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : (raw as any);
  } catch { return null; }
}

export async function taskStatusSet(status: TaskStatus): Promise<void> {
  const r = await getRedis();
  await r.set(
    `task:${status.taskId}:status`,
    JSON.stringify({ ...status, updatedAt: new Date().toISOString() }),
    { ex: TASK_TTL },
  );
}

export async function taskStatusUpdate(
  taskId: string,
  patch: Partial<Omit<TaskStatus, "taskId">>,
): Promise<void> {
  const existing = (await taskStatusGet(taskId)) ?? {
    taskId, status: "pending" as const, progress: 0, logs: [],
    updatedAt: new Date().toISOString(),
  };
  await taskStatusSet({ ...existing, ...patch, taskId, updatedAt: new Date().toISOString() });
}

export async function taskLogAppend(taskId: string, log: string): Promise<void> {
  const existing = await taskStatusGet(taskId);
  if (!existing) return;
  const logs = [...(existing.logs ?? []), `[${new Date().toISOString()}] ${log}`].slice(-200);
  await taskStatusSet({ ...existing, logs, updatedAt: new Date().toISOString() });
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. CHAT HISTORY MEMORY
//    Key: chat:{sessionId}:history  |  TTL: 24 h  |  Window: last 100 msgs
// ─────────────────────────────────────────────────────────────────────────────

const CHAT_TTL     = 86_400;
const CHAT_MAX_MSG = 100;

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

export async function chatHistoryGet(sessionId: string): Promise<ChatMessage[]> {
  try {
    const r   = await getRedis();
    const raw = await r.get<string>(`chat:${sessionId}:history`);
    if (!raw) return [];
    return typeof raw === "string" ? JSON.parse(raw) : (raw as any);
  } catch { return []; }
}

export async function chatHistoryAppend(
  sessionId: string,
  message: ChatMessage,
  ttl = CHAT_TTL,
): Promise<void> {
  const history = await chatHistoryGet(sessionId);
  const updated = [...history, message].slice(-CHAT_MAX_MSG);
  const r = await getRedis();
  await r.set(`chat:${sessionId}:history`, JSON.stringify(updated), { ex: ttl });
}

export async function chatHistoryClear(sessionId: string): Promise<void> {
  const r = await getRedis();
  await r.del(`chat:${sessionId}:history`);
}

export async function chatHistoryGetRecent(sessionId: string, n = 10): Promise<ChatMessage[]> {
  const all = await chatHistoryGet(sessionId);
  return all.slice(-n);
}

// ─────────────────────────────────────────────────────────────────────────────
// FILE OPERATION CHECKPOINTS
//    Key: checkpoint:{sessionId}:{taskId}  |  TTL: 6 h
//    Stores partial build state so long file-gen tasks can resume after
//    Cloudflare CPU budget is exhausted.
// ─────────────────────────────────────────────────────────────────────────────

export interface FileCheckpoint {
  sessionId: string;
  taskId: string;
  completedSubtasks: string[];
  pendingSubtasks: string[];
  generatedFiles: Array<{ path: string; content: string }>;
  savedAt: string;
}

export async function checkpointSave(cp: FileCheckpoint): Promise<void> {
  const r = await getRedis();
  await r.set(
    `checkpoint:${cp.sessionId}:${cp.taskId}`,
    JSON.stringify({ ...cp, savedAt: new Date().toISOString() }),
    { ex: TASK_TTL },
  );
}

export async function checkpointLoad(
  sessionId: string,
  taskId: string,
): Promise<FileCheckpoint | null> {
  try {
    const r   = await getRedis();
    const raw = await r.get<string>(`checkpoint:${sessionId}:${taskId}`);
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : (raw as any);
  } catch { return null; }
}

export async function checkpointClear(sessionId: string, taskId: string): Promise<void> {
  const r = await getRedis();
  await r.del(`checkpoint:${sessionId}:${taskId}`);
}
