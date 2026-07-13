// Centralized retry/backoff for calls to external LLM providers (Gemini,
// Cloudflare Workers AI). Both were previously called directly with no
// retry, so a single transient 429/5xx would fail the whole subtask.
export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (attempt: number, err: unknown) => void;
}

function isRetryableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  // Retry on rate limiting / transient server errors; do not retry on
  // clearly permanent failures (bad API key, invalid request shape).
  return /429|500|502|503|504|rate limit|timeout|ECONNRESET|fetch failed/i.test(msg);
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { retries = 3, baseDelayMs = 500, maxDelayMs = 8000, onRetry } = options;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isLastAttempt = attempt === retries;
      if (isLastAttempt || !isRetryableError(err)) {
        throw err;
      }
      onRetry?.(attempt + 1, err);
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt) + Math.random() * 200;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastErr;
}
