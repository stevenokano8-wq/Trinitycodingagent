import fs from "fs";
import path from "path";

export interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  module: string;
  message: string;
  details?: any;
}

const LOG_FILE_PATH = "server/agent_logs.json";
const MAX_IN_MEMORY_LOGS = 500;
const memoryLogs: LogEntry[] = [];

export function appendLogDrop(level: "info" | "warn" | "error" | "debug", module: string, message: string, details?: any) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    module,
    message,
    details
  };

  memoryLogs.push(entry);
  if (memoryLogs.length > MAX_IN_MEMORY_LOGS) {
    memoryLogs.shift();
  }

  // Attempt writing to persistent agent_logs.json on physical disk if writeable
  try {
    const dir = path.dirname(LOG_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LOG_FILE_PATH, JSON.stringify(memoryLogs, null, 2), "utf8");
  } catch (_) {
    // Edge environments store in memory or D1/KV
  }
}

export function getLogDrops(): LogEntry[] {
  try {
    if (fs.existsSync(LOG_FILE_PATH)) {
      const content = fs.readFileSync(LOG_FILE_PATH, "utf8");
      return JSON.parse(content);
    }
  } catch (_) {}
  return memoryLogs;
}

export function clearLogDrops() {
  memoryLogs.length = 0;
  try {
    if (fs.existsSync(LOG_FILE_PATH)) {
      fs.writeFileSync(LOG_FILE_PATH, JSON.stringify([], null, 2), "utf8");
    }
  } catch (_) {}
}
