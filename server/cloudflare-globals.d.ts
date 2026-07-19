/**
 * Cloudflare Workers global ambient type declarations.
 * Declared locally so the CI typecheck doesn't depend on @cloudflare/workers-types
 * package resolution. Wrangler's bundler handles the actual type-safe compilation.
 */

// ── Durable Objects ────────────────────────────────────────────────────────────
declare interface DurableObjectId {
  toString(): string;
  equals(other: DurableObjectId): boolean;
  readonly name?: string;
}

declare interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  get<T = unknown>(keys: string[]): Promise<Map<string, T>>;
  put<T>(key: string, value: T): Promise<void>;
  put<T>(entries: Record<string, T>): Promise<void>;
  delete(key: string): Promise<boolean>;
  delete(keys: string[]): Promise<number>;
  deleteAll(): Promise<void>;
  list<T = unknown>(options?: {
    start?: string; startAfter?: string; end?: string;
    prefix?: string; reverse?: boolean; limit?: number;
  }): Promise<Map<string, T>>;
  // Alarms API (older pattern: this.state.storage.setAlarm)
  setAlarm(scheduledTime: number | Date): Promise<void>;
  getAlarm(): Promise<number | null>;
  deleteAlarm(): Promise<void>;
}

declare interface DurableObjectState {
  readonly id: DurableObjectId;
  readonly storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(closure: () => Promise<T>): Promise<T>;
  waitUntil(promise: Promise<unknown>): void;
  acceptWebSocket(ws: WebSocket, tags?: string[]): void;
  getWebSockets(tag?: string): WebSocket[];
  setHibernatableWebSocketEventTimeout?(ms: number): void;
}

// ── WebSocket (CF-specific extensions) ────────────────────────────────────────
declare class WebSocketPair {
  readonly 0: WebSocket;
  readonly 1: WebSocket;
}

// ── Execution context ─────────────────────────────────────────────────────────
declare interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// ── Extend ResponseInit with CF WebSocket response ────────────────────────────
interface ResponseInit {
  webSocket?: WebSocket;
}
