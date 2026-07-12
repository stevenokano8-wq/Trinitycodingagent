import { Message, Task, Subtask, FileNode, DatabaseStatus } from "../src/types.js";
import { AppEnv, D1Database, resolveEnvWithOverrides } from "./env.js";

// Local Node dev (`pnpm dev`) has no D1 binding available outside `wrangler
// dev`, so it always uses this in-memory store. It is scoped to the current
// process/isolate and is NOT persisted across restarts — same "local
// fallback" intent as before.
interface LocalDbSchema {
  messages: Message[];
  tasks: Task[];
  files: FileNode[];
}

let localDb: LocalDbSchema = { messages: [], tasks: [], files: [] };

let db: D1Database | null = null;
let useLocalMemory = true;

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    task_id TEXT,
    actions_taken TEXT,
    thought_time_seconds REAL,
    model_name TEXT,
    duration_seconds REAL,
    attachment TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    progress INTEGER NOT NULL,
    active_subtask_index INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS subtasks (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    logs TEXT NOT NULL,
    code TEXT,
    file TEXT,
    started_at TEXT,
    completed_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS files (
    path TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    language TEXT NOT NULL
  )`,
];

export async function initDb(env?: Partial<AppEnv>): Promise<DatabaseStatus> {
  const resolved = resolveEnvWithOverrides(env);

  if (!resolved.DB) {
    console.log("No D1 binding (DB) present. Falling back to in-memory persistence for this session.");
    useLocalMemory = true;
    db = null;
    return { d1: "local_fallback", kv: "local_fallback" };
  }

  try {
    db = resolved.DB;
    for (const statement of SCHEMA_STATEMENTS) {
      await db.prepare(statement).run();
    }
    // Safely migrate existing databases to add attachment column
    try {
      await db.prepare("ALTER TABLE messages ADD COLUMN attachment TEXT").run();
    } catch (_) {
      // Column already exists or table doesn't exist yet, ignore
    }
    useLocalMemory = false;
    console.log("Successfully connected to Cloudflare D1!");
    return { d1: "connected", kv: "local_fallback" };
  } catch (err: any) {
    console.error("D1 initialization error, falling back to in-memory persistence:", err.message);
    useLocalMemory = true;
    db = null;
    return { d1: "error", kv: "local_fallback" };
  }
}

export async function getMessages(): Promise<Message[]> {
  if (useLocalMemory || !db) {
    return localDb.messages;
  }
  try {
    const res = await db.prepare("SELECT * FROM messages ORDER BY timestamp ASC").all<any>();
    return (res.results || []).map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      timestamp: row.timestamp,
      taskId: row.task_id || undefined,
      actionsTaken: row.actions_taken ? JSON.parse(row.actions_taken) : undefined,
      thoughtTimeSeconds: row.thought_time_seconds ?? undefined,
      modelName: row.model_name || undefined,
      durationSeconds: row.duration_seconds ?? undefined,
      attachment: row.attachment ? JSON.parse(row.attachment) : undefined,
    }));
  } catch (err) {
    console.error("Failed to query messages from D1:", err);
    return localDb.messages;
  }
}

export async function addMessage(msg: Message): Promise<void> {
  if (useLocalMemory || !db) {
    localDb.messages.push(msg);
    return;
  }
  try {
    await db
      .prepare(
        "INSERT INTO messages (id, role, content, timestamp, task_id, actions_taken, thought_time_seconds, model_name, duration_seconds, attachment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        msg.id,
        msg.role,
        msg.content,
        msg.timestamp,
        msg.taskId || null,
        msg.actionsTaken ? JSON.stringify(msg.actionsTaken) : null,
        msg.thoughtTimeSeconds !== undefined ? msg.thoughtTimeSeconds : null,
        msg.modelName || null,
        msg.durationSeconds !== undefined ? msg.durationSeconds : null,
        msg.attachment ? JSON.stringify(msg.attachment) : null
      )
      .run();
  } catch (err) {
    console.error("Failed to insert message into D1:", err);
    localDb.messages.push(msg);
  }
}

export async function clearMessages(): Promise<void> {
  if (useLocalMemory || !db) {
    localDb.messages = [];
    return;
  }
  try {
    await db.prepare("DELETE FROM messages").run();
  } catch (err) {
    console.error("Failed to clear messages from D1:", err);
  }
}

export async function getTasks(): Promise<Task[]> {
  if (useLocalMemory || !db) {
    return localDb.tasks;
  }
  try {
    const tasksRes = await db.prepare("SELECT * FROM tasks ORDER BY created_at ASC").all<any>();
    const subtasksRes = await db.prepare("SELECT * FROM subtasks").all<any>();

    const subtasksByTask: Record<string, Subtask[]> = {};
    for (const row of subtasksRes.results || []) {
      if (!subtasksByTask[row.task_id]) subtasksByTask[row.task_id] = [];
      subtasksByTask[row.task_id].push({
        id: row.id,
        taskId: row.task_id,
        name: row.name,
        status: row.status,
        logs: JSON.parse(row.logs),
        code: row.code || undefined,
        file: row.file || undefined,
        startedAt: row.started_at || undefined,
        completedAt: row.completed_at || undefined,
      });
    }

    return (tasksRes.results || []).map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      progress: row.progress,
      activeSubtaskIndex: row.active_subtask_index,
      createdAt: row.created_at,
      startedAt: row.started_at || undefined,
      completedAt: row.completed_at || undefined,
      subtasks: subtasksByTask[row.id] || [],
    }));
  } catch (err) {
    console.error("Failed to fetch tasks from D1:", err);
    return localDb.tasks;
  }
}

export async function saveTask(task: Task): Promise<void> {
  if (useLocalMemory || !db) {
    const idx = localDb.tasks.findIndex((t) => t.id === task.id);
    if (idx >= 0) localDb.tasks[idx] = task;
    else localDb.tasks.push(task);
    return;
  }
  try {
    const check = await db.prepare("SELECT id FROM tasks WHERE id = ?").bind(task.id).first();
    if (check) {
      await db
        .prepare("UPDATE tasks SET name = ?, status = ?, progress = ?, active_subtask_index = ?, started_at = ?, completed_at = ? WHERE id = ?")
        .bind(task.name, task.status, task.progress, task.activeSubtaskIndex, task.startedAt || null, task.completedAt || null, task.id)
        .run();
    } else {
      await db
        .prepare("INSERT INTO tasks (id, name, status, progress, active_subtask_index, created_at, started_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(task.id, task.name, task.status, task.progress, task.activeSubtaskIndex, task.createdAt, task.startedAt || null, task.completedAt || null)
        .run();
    }

    for (const sub of task.subtasks) {
      const subCheck = await db.prepare("SELECT id FROM subtasks WHERE id = ?").bind(sub.id).first();
      if (subCheck) {
        await db
          .prepare("UPDATE subtasks SET name = ?, status = ?, logs = ?, code = ?, file = ?, started_at = ?, completed_at = ? WHERE id = ?")
          .bind(sub.name, sub.status, JSON.stringify(sub.logs), sub.code || null, sub.file || null, sub.startedAt || null, sub.completedAt || null, sub.id)
          .run();
      } else {
        await db
          .prepare("INSERT INTO subtasks (id, task_id, name, status, logs, code, file, started_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(sub.id, sub.taskId, sub.name, sub.status, JSON.stringify(sub.logs), sub.code || null, sub.file || null, sub.startedAt || null, sub.completedAt || null)
          .run();
      }
    }
  } catch (err) {
    console.error("Failed to upsert task in D1:", err);
  }
}

export async function deleteTasks(): Promise<void> {
  if (useLocalMemory || !db) {
    localDb.tasks = [];
    return;
  }
  try {
    await db.prepare("DELETE FROM subtasks").run();
    await db.prepare("DELETE FROM tasks").run();
  } catch (err) {
    console.error("Failed to delete tasks from D1:", err);
  }
}

export async function getFiles(): Promise<FileNode[]> {
  if (useLocalMemory || !db) {
    return localDb.files;
  }
  try {
    const res = await db.prepare("SELECT * FROM files").all<any>();
    return (res.results || []).map((row) => ({ path: row.path, content: row.content, language: row.language }));
  } catch (err) {
    console.error("Failed to fetch files from D1:", err);
    return localDb.files;
  }
}

export async function saveFile(file: FileNode): Promise<void> {
  // Workers have no filesystem: GitHub sync goes through the Contents API
  // directly from this D1/in-memory record (see server/github.ts) — this
  // store is the single source of truth for files.
  if (useLocalMemory || !db) {
    const idx = localDb.files.findIndex((f) => f.path === file.path);
    if (idx >= 0) localDb.files[idx] = file;
    else localDb.files.push(file);
    return;
  }
  try {
    const check = await db.prepare("SELECT path FROM files WHERE path = ?").bind(file.path).first();
    if (check) {
      await db.prepare("UPDATE files SET content = ?, language = ? WHERE path = ?").bind(file.content, file.language, file.path).run();
    } else {
      await db.prepare("INSERT INTO files (path, content, language) VALUES (?, ?, ?)").bind(file.path, file.content, file.language).run();
    }
  } catch (err) {
    console.error("Failed to save file in D1:", err);
  }
}

export async function clearFiles(): Promise<void> {
  if (useLocalMemory || !db) {
    localDb.files = [];
    return;
  }
  try {
    await db.prepare("DELETE FROM files").run();
  } catch (err) {
    console.error("Failed to clear files from D1:", err);
  }
}
