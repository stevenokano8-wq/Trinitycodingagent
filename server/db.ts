import { Pool } from "pg";
import { Message, Task, Subtask, FileNode, DatabaseStatus } from "../src/types.js";
import { AppEnv, resolveEnvWithOverrides } from "./env.js";

// Workers have no filesystem, so the previous JSON-file fallback is replaced
// with an in-memory store. It is scoped to the current isolate/process and is
// NOT persisted across Worker isolate recycles or a fresh `pnpm dev` — same
// "local fallback" intent as before, just non-durable instead of file-backed.
interface LocalDbSchema {
  messages: Message[];
  tasks: Task[];
  files: FileNode[];
}

let localDb: LocalDbSchema = { messages: [], tasks: [], files: [] };

let pgPool: Pool | null = null;
let useLocalMemory = true;

export async function initDb(env?: Partial<AppEnv>): Promise<DatabaseStatus> {
  const resolved = resolveEnvWithOverrides(env);
  const dbUrl = resolved.DATABASE_URL;

  if (!dbUrl) {
    console.log("No DATABASE_URL configured. Falling back to in-memory persistence for this session.");
    useLocalMemory = true;
    pgPool = null;
    return { postgres: "local_fallback", redis: "local_fallback", postgresUrl: undefined };
  }

  try {
    // `pg.Pool` (not a single long-lived `Client`) is the supported pattern for
    // Cloudflare Hyperdrive + node-postgres under the `nodejs_compat` flag —
    // Hyperdrive manages pooling/connection reuse on its side.
    pgPool = new Pool({
      connectionString: dbUrl,
      ssl: dbUrl.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
      max: 5,
    });

    await pgPool.query("SELECT 1");
    useLocalMemory = false;
    console.log("Successfully connected to PostgreSQL database!");

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id VARCHAR(255) PRIMARY KEY,
        role VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        timestamp VARCHAR(100) NOT NULL,
        task_id VARCHAR(255)
      );
    `);
    await pgPool.query("ALTER TABLE messages ADD COLUMN IF NOT EXISTS actions_taken TEXT;");
    await pgPool.query("ALTER TABLE messages ADD COLUMN IF NOT EXISTS thought_time_seconds NUMERIC;");
    await pgPool.query("ALTER TABLE messages ADD COLUMN IF NOT EXISTS model_name VARCHAR(100);");
    await pgPool.query("ALTER TABLE messages ADD COLUMN IF NOT EXISTS duration_seconds NUMERIC;");

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL,
        progress INT NOT NULL,
        active_subtask_index INT NOT NULL,
        created_at VARCHAR(100) NOT NULL,
        started_at VARCHAR(100),
        completed_at VARCHAR(100)
      );
    `);
    await pgPool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS started_at VARCHAR(100);");
    await pgPool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at VARCHAR(100);");

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS subtasks (
        id VARCHAR(255) PRIMARY KEY,
        task_id VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL,
        logs TEXT NOT NULL,
        code TEXT,
        file VARCHAR(255),
        started_at VARCHAR(100),
        completed_at VARCHAR(100)
      );
    `);
    await pgPool.query("ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS started_at VARCHAR(100);");
    await pgPool.query("ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS completed_at VARCHAR(100);");

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS files (
        path VARCHAR(255) PRIMARY KEY,
        content TEXT NOT NULL,
        language VARCHAR(50) NOT NULL
      );
    `);

    return { postgres: "connected", redis: "local_fallback", postgresUrl: dbUrl };
  } catch (err: any) {
    console.error("PostgreSQL connection error, falling back to in-memory persistence:", err.message);
    useLocalMemory = true;
    pgPool = null;
    return { postgres: "error", redis: "local_fallback", postgresUrl: dbUrl };
  }
}

export async function getMessages(): Promise<Message[]> {
  if (useLocalMemory || !pgPool) {
    return localDb.messages;
  }
  try {
    const res = await pgPool.query("SELECT * FROM messages ORDER BY timestamp ASC");
    return res.rows.map((row) => ({
      id: row.id,
      role: row.role as any,
      content: row.content,
      timestamp: row.timestamp,
      taskId: row.task_id || undefined,
      actionsTaken: row.actions_taken ? JSON.parse(row.actions_taken) : undefined,
      thoughtTimeSeconds: row.thought_time_seconds ? parseFloat(row.thought_time_seconds) : undefined,
      modelName: row.model_name || undefined,
      durationSeconds: row.duration_seconds ? parseFloat(row.duration_seconds) : undefined,
    }));
  } catch (err) {
    console.error("Failed to query messages from Postgres:", err);
    return localDb.messages;
  }
}

export async function addMessage(msg: Message): Promise<void> {
  if (useLocalMemory || !pgPool) {
    localDb.messages.push(msg);
    return;
  }
  try {
    await pgPool.query(
      "INSERT INTO messages (id, role, content, timestamp, task_id, actions_taken, thought_time_seconds, model_name, duration_seconds) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
      [
        msg.id,
        msg.role,
        msg.content,
        msg.timestamp,
        msg.taskId || null,
        msg.actionsTaken ? JSON.stringify(msg.actionsTaken) : null,
        msg.thoughtTimeSeconds !== undefined ? msg.thoughtTimeSeconds : null,
        msg.modelName || null,
        msg.durationSeconds !== undefined ? msg.durationSeconds : null,
      ]
    );
  } catch (err) {
    console.error("Failed to insert message to Postgres:", err);
    localDb.messages.push(msg);
  }
}

export async function clearMessages(): Promise<void> {
  if (useLocalMemory || !pgPool) {
    localDb.messages = [];
    return;
  }
  try {
    await pgPool.query("DELETE FROM messages");
  } catch (err) {
    console.error("Failed to clear messages from Postgres:", err);
  }
}

export async function getTasks(): Promise<Task[]> {
  if (useLocalMemory || !pgPool) {
    return localDb.tasks;
  }
  try {
    const tasksRes = await pgPool.query("SELECT * FROM tasks ORDER BY created_at ASC");
    const subtasksRes = await pgPool.query("SELECT * FROM subtasks");

    const subtasksByTask: Record<string, Subtask[]> = {};
    for (const row of subtasksRes.rows) {
      if (!subtasksByTask[row.task_id]) subtasksByTask[row.task_id] = [];
      subtasksByTask[row.task_id].push({
        id: row.id,
        taskId: row.task_id,
        name: row.name,
        status: row.status as any,
        logs: JSON.parse(row.logs),
        code: row.code || undefined,
        file: row.file || undefined,
        startedAt: row.started_at || undefined,
        completedAt: row.completed_at || undefined,
      });
    }

    return tasksRes.rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status as any,
      progress: row.progress,
      activeSubtaskIndex: row.active_subtask_index,
      createdAt: row.created_at,
      startedAt: row.started_at || undefined,
      completedAt: row.completed_at || undefined,
      subtasks: subtasksByTask[row.id] || [],
    }));
  } catch (err) {
    console.error("Failed to fetch tasks from Postgres:", err);
    return localDb.tasks;
  }
}

export async function saveTask(task: Task): Promise<void> {
  if (useLocalMemory || !pgPool) {
    const idx = localDb.tasks.findIndex((t) => t.id === task.id);
    if (idx >= 0) localDb.tasks[idx] = task;
    else localDb.tasks.push(task);
    return;
  }
  try {
    const check = await pgPool.query("SELECT id FROM tasks WHERE id = $1", [task.id]);
    if (check.rows.length > 0) {
      await pgPool.query(
        "UPDATE tasks SET name = $1, status = $2, progress = $3, active_subtask_index = $4, started_at = $5, completed_at = $6 WHERE id = $7",
        [task.name, task.status, task.progress, task.activeSubtaskIndex, task.startedAt || null, task.completedAt || null, task.id]
      );
    } else {
      await pgPool.query(
        "INSERT INTO tasks (id, name, status, progress, active_subtask_index, created_at, started_at, completed_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        [task.id, task.name, task.status, task.progress, task.activeSubtaskIndex, task.createdAt, task.startedAt || null, task.completedAt || null]
      );
    }

    for (const sub of task.subtasks) {
      const subCheck = await pgPool.query("SELECT id FROM subtasks WHERE id = $1", [sub.id]);
      if (subCheck.rows.length > 0) {
        await pgPool.query(
          "UPDATE subtasks SET name = $1, status = $2, logs = $3, code = $4, file = $5, started_at = $6, completed_at = $7 WHERE id = $8",
          [sub.name, sub.status, JSON.stringify(sub.logs), sub.code || null, sub.file || null, sub.startedAt || null, sub.completedAt || null, sub.id]
        );
      } else {
        await pgPool.query(
          "INSERT INTO subtasks (id, task_id, name, status, logs, code, file, started_at, completed_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
          [sub.id, sub.taskId, sub.name, sub.status, JSON.stringify(sub.logs), sub.code || null, sub.file || null, sub.startedAt || null, sub.completedAt || null]
        );
      }
    }
  } catch (err) {
    console.error("Failed to upsert task in Postgres:", err);
  }
}

export async function deleteTasks(): Promise<void> {
  if (useLocalMemory || !pgPool) {
    localDb.tasks = [];
    return;
  }
  try {
    await pgPool.query("DELETE FROM subtasks");
    await pgPool.query("DELETE FROM tasks");
  } catch (err) {
    console.error("Failed to delete tasks from Postgres:", err);
  }
}

export async function getFiles(): Promise<FileNode[]> {
  if (useLocalMemory || !pgPool) {
    return localDb.files;
  }
  try {
    const res = await pgPool.query("SELECT * FROM files");
    return res.rows.map((row) => ({ path: row.path, content: row.content, language: row.language }));
  } catch (err) {
    console.error("Failed to fetch files from Postgres:", err);
    return localDb.files;
  }
}

export async function saveFile(file: FileNode): Promise<void> {
  // NOTE: the previous implementation also physically wrote the file to disk
  // (`fs.writeFileSync`) so the local git-based push could pick it up. Workers
  // have no filesystem, and GitHub sync now goes through the Contents API
  // directly from this in-memory/DB record (see server/github.ts), so the
  // disk write is gone — this store is the single source of truth for files.
  if (useLocalMemory || !pgPool) {
    const idx = localDb.files.findIndex((f) => f.path === file.path);
    if (idx >= 0) localDb.files[idx] = file;
    else localDb.files.push(file);
    return;
  }
  try {
    const check = await pgPool.query("SELECT path FROM files WHERE path = $1", [file.path]);
    if (check.rows.length > 0) {
      await pgPool.query("UPDATE files SET content = $1, language = $2 WHERE path = $3", [file.content, file.language, file.path]);
    } else {
      await pgPool.query("INSERT INTO files (path, content, language) VALUES ($1, $2, $3)", [file.path, file.content, file.language]);
    }
  } catch (err) {
    console.error("Failed to save file in Postgres:", err);
  }
}

export async function clearFiles(): Promise<void> {
  if (useLocalMemory || !pgPool) {
    localDb.files = [];
    return;
  }
  try {
    await pgPool.query("DELETE FROM files");
  } catch (err) {
    console.error("Failed to clear files from Postgres:", err);
  }
}
