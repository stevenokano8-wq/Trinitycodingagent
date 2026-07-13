// Minimal structured logger: emits single-line JSON so log lines carry
// task/session context instead of ad-hoc free-text console.log/error calls
// that are hard to grep or correlate across a build run in Cloudflare's
// log tail. Deliberately dependency-free (no pino/winston) since Workers
// only guarantee console.log/error/warn.
import { maskSecrets } from "./security.js";

type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  taskId?: string;
  subtaskId?: string;
  sessionId?: string;
  buildId?: string;
  [key: string]: unknown;
}

function emit(level: LogLevel, message: string, context?: LogContext, secretsToMask: Array<string | undefined> = []) {
  const safeMessage = maskSecrets(message, secretsToMask);
  const record = {
    ts: new Date().toISOString(),
    level,
    message: safeMessage,
    ...(context || {}),
  };
  const line = JSON.stringify(record);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit("debug", message, context),
  info: (message: string, context?: LogContext) => emit("info", message, context),
  warn: (message: string, context?: LogContext, secrets?: Array<string | undefined>) => emit("warn", message, context, secrets),
  error: (message: string, context?: LogContext, secrets?: Array<string | undefined>) => emit("error", message, context, secrets),
};
