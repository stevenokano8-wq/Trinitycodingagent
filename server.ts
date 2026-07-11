import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

import { initDb, getMessages, addMessage, clearMessages, getTasks, deleteTasks, getFiles, clearFiles, saveFile } from "./server/db.js";
import { initRedis, redisFlush } from "./server/redis.js";
import { planBuildTasks, executeAgentBuild, sseClients, broadcastSSE, cancelActiveBuild } from "./server/agent.js";
import { getGithubConfig, saveGithubConfig, executeGitPush } from "./server/github.js";
import { setRuntimeOverrides, resolveEnvWithOverrides } from "./server/env.js";
import { DatabaseStatus, Message, FileNode } from "./src/types.js";

// This Express server is the local development entry (`pnpm dev`/`pnpm start`).
// Production runs as a Cloudflare Worker via server/worker.ts instead — both
// share the same db/redis/github/agent modules, threaded with an explicit
// env object in Workers and process.env here.

const app = express();
const PORT = 3000;

app.use(express.json());

// Server-side state of our DBs
let dbStatus: DatabaseStatus = {
  postgres: "local_fallback",
  redis: "local_fallback"
};

// API: Database and cache statuses
app.get("/api/db-status", (req, res) => {
  res.json({
    postgres: dbStatus.postgres,
    redis: dbStatus.redis,
    postgresUrl: dbStatus.postgresUrl ? maskConnectionString(dbStatus.postgresUrl) : undefined,
    redisUrl: dbStatus.redisUrl ? maskConnectionString(dbStatus.redisUrl) : undefined,
  });
});

// API: Get messages
app.get("/api/messages", async (req, res) => {
  try {
    const msgs = await getMessages();
    res.json(msgs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: Add user message & trigger Sovereign Agent
app.post("/api/messages", async (req, res) => {
  try {
    const { role, content } = req.body;
    if (!content) {
      return res.status(400).json({ error: "Content is required" });
    }

    const userMsg: Message = {
      id: `msg-${Date.now()}-user`,
      role: role || "user",
      content,
      timestamp: new Date().toISOString(),
    };

    // Save user message to database
    await addMessage(userMsg);

    // If it's a user command, trigger the agent task planner and background executor
    if (userMsg.role === "user") {
      try {
        // Step 1: Generate Tasks and Subtasks list with Gemini (with fallback)
        const plannedTasks = await planBuildTasks(content);
        
        // Save initial tasks to SQL relational store
        for (const task of plannedTasks) {
          // Link first task to the message
          if (!userMsg.taskId) {
            userMsg.taskId = task.id;
          }
          await saveTaskWithRetry(task);
        }

        // Trigger background asynchronous compilation/synthesis worker
        // (Node stays alive between requests, so no waitUntil is needed here —
        // that's only required in the Workers entry, server/worker.ts)
        executeAgentBuild(content, plannedTasks);

        res.json({ message: userMsg, tasks: plannedTasks });
      } catch (agentErr: any) {
        console.error("Agent planning error:", agentErr);
        res.json({ message: userMsg, error: agentErr.message });
      }
    } else {
      res.json({ message: userMsg });
    }
  } catch (err: any) {
    console.error("API messages insert error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Helper for saving task robustly
async function saveTaskWithRetry(task: any) {
  try {
    const { saveTask } = await import("./server/db.js");
    await saveTask(task);
  } catch (e) {
    console.error("Retry task save failed:", e);
  }
}

// API: Clear session history and variables
app.post("/api/session/clear", async (req, res) => {
  try {
    await clearMessages();
    await deleteTasks();
    await clearFiles();
    await redisFlush();
    broadcastSSE("session-cleared", {});
    res.json({ status: "success", message: "Conversation logs, task registry, files, and cache successfully purged." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: Load a previously saved session state into the active database
app.post("/api/session/load", async (req, res) => {
  try {
    const { messages: newMsgs, tasks: newTasks, files: newFiles } = req.body;

    // 1. Flush active state
    await clearMessages();
    await deleteTasks();
    await clearFiles();
    await redisFlush();

    // 2. Load messages (skip welcome-msg as clearMessages creates one if welcome-msg doesn't exist, wait, clearMessages inserts a welcome-msg if count is 0. Let's do it safely)
    if (newMsgs && Array.isArray(newMsgs)) {
      // Clear welcome message if loading an actual chat session
      const actualMsgs = newMsgs.filter((m: any) => m.id !== "welcome-msg");
      if (actualMsgs.length > 0) {
        // We can just clear again without auto-seeding, or let the store add each msg
        for (const msg of actualMsgs) {
          await addMessage(msg);
        }
      } else {
        // Just keep the seeded welcome message
      }
    }

    // 3. Load tasks
    if (newTasks && Array.isArray(newTasks)) {
      for (const t of newTasks) {
        await saveTaskWithRetry(t);
      }
    }

    // 4. Load files
    if (newFiles && Array.isArray(newFiles)) {
      for (const f of newFiles) {
        await saveFile(f);
      }
    }

    // Broadcast SSE refresh notification so all clients update themselves
    broadcastSSE("connected", { status: "refreshed" });

    res.json({ status: "success", message: "Workspace session loaded successfully." });
  } catch (err: any) {
    console.error("API session load error:", err);
    res.status(500).json({ error: err.message });
  }
});

// API: Get tasks list
app.get("/api/tasks", async (req, res) => {
  try {
    const tasks = await getTasks();
    res.json(tasks);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: Cancel tasks execution
app.post("/api/tasks/cancel", async (req, res) => {
  try {
    const { taskId } = req.body;
    if (!taskId) {
      return res.status(400).json({ error: "taskId is required" });
    }
    cancelActiveBuild(taskId);
    res.json({ status: "success", message: `Halted task sequence ${taskId}.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get generated files
app.get("/api/files", async (req, res) => {
  try {
    const files = await getFiles();
    res.json(files);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: Save single file (from manual code editor or other modules)
app.post("/api/files/save", async (req, res) => {
  try {
    const { path: filePath, content, language } = req.body;
    if (!filePath || content === undefined) {
      return res.status(400).json({ error: "path and content are required parameters" });
    }
    
    const fileNode: FileNode = { path: filePath, content, language: language || "typescript" };
    await saveFile(fileNode);
    
    // Auto push on manual save if GitHub configured!
    const resolved = resolveEnvWithOverrides();
    const gitToken = resolved.GITHUB_TOKEN;
    const gitRepoUrl = resolved.GITHUB_REPO_URL;
    if (gitToken && gitRepoUrl) {
      // Run background push so the response doesn't hang
      getFiles()
        .then((allFiles) => executeGitPush(gitToken, gitRepoUrl, "main", allFiles))
        .then((pRes) => {
          console.log(`Auto-push on manual save: ${pRes.success ? 'Success' : 'Failed: ' + pRes.message}`);
        })
        .catch((e) => console.error("Auto-push error on manual save:", e));
    }

    res.json({ status: "success", message: `File saved to ${filePath} successfully.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: Update settings & save to .env
app.post("/api/settings", async (req, res) => {
  try {
    const { geminiApiKey, postgresUrl, redisUrl } = req.body;

    // Applied as in-memory overrides for this process only, matching the
    // Workers production entry (server/worker.ts) which has no writable
    // disk/.env either. For durable local config, edit .env directly.
    if (geminiApiKey) setRuntimeOverrides({ GEMINI_API_KEY: geminiApiKey });
    if (postgresUrl !== undefined) setRuntimeOverrides({ DATABASE_URL: postgresUrl });
    if (redisUrl !== undefined) {
      console.warn("redisUrl setting is deprecated; set UPSTASH_REDIS_REST_URL/TOKEN instead.");
    }

    // Re-trigger DB/Redis initializations
    const pStatus = await initDb();
    const rStatus = await initRedis();

    dbStatus = {
      postgres: pStatus.postgres,
      redis: rStatus.status,
      postgresUrl: pStatus.postgresUrl,
      redisUrl: rStatus.url
    };

    res.json({
      status: "success",
      dbStatus: {
        postgres: dbStatus.postgres,
        redis: dbStatus.redis,
        postgresUrl: dbStatus.postgresUrl ? maskConnectionString(dbStatus.postgresUrl) : undefined,
        redisUrl: dbStatus.redisUrl ? maskConnectionString(dbStatus.redisUrl) : undefined,
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get GitHub connection configuration
app.get("/api/github/config", (req, res) => {
  try {
    const config = getGithubConfig(process.env);
    res.json(config);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: Save GitHub connection configuration
app.post("/api/github/config", (req, res) => {
  try {
    const { token, repoUrl } = req.body;
    saveGithubConfig(token, repoUrl);
    res.json({ status: "success", message: "GitHub configuration updated successfully." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: Trigger project push to GitHub remote
app.post("/api/github/push", async (req, res) => {
  try {
    const { token, repoUrl, branch } = req.body;
    
    // Retrieve from saved configuration if not supplied in body
    const resolvedGh = resolveEnvWithOverrides();
    const currentToken = token || resolvedGh.GITHUB_TOKEN;
    const currentRepoUrl = repoUrl || resolvedGh.GITHUB_REPO_URL;
    
    if (!currentToken) {
      return res.status(400).json({ error: "GitHub API Token is required. Please configure it or pass it." });
    }
    if (!currentRepoUrl) {
      return res.status(400).json({ error: "GitHub Repository URL is required. Please configure it or pass it." });
    }
    
    const allFiles = await getFiles();
    const result = await executeGitPush(currentToken, currentRepoUrl, branch || "main", allFiles);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: Real-time progress updates SSE connection
app.get("/api/tasks/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  sseClients.add(res);

  // Send native retry timeout (2000ms) and initial connected handshake
  res.write(`retry: 2000\n\n`);
  res.write(`event: connected\ndata: ${JSON.stringify({ status: "listening" })}\n\n`);

  // Periodic heartbeat to prevent proxy timeouts (every 15 seconds)
  const heartbeat = setInterval(() => {
    res.write(`:\n\n`); // SSE comment acts as lightweight keep-alive
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// Helper to mask connection credentials for user display safety
function maskConnectionString(connStr: string): string {
  try {
    const url = new URL(connStr);
    if (url.password) {
      url.password = "••••••••";
    }
    return url.toString();
  } catch (e) {
    // Basic regex fallback if not standard URL
    return connStr.replace(/:([^:@]+)@/, ":••••••••@");
  }
}

async function startServer() {
  // Initialize Database (SQLite/JSON or Postgres)
  const pStatus = await initDb();
  // Initialize Redis Cache (Memory map or Redis)
  const rStatus = await initRedis();

  dbStatus = {
    postgres: pStatus.postgres,
    redis: rStatus.status,
    postgresUrl: pStatus.postgresUrl,
    redisUrl: rStatus.url
  };

  // Mount Vite middleware for development, serve index.html for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Sovereign Core] Server boot successful. Access client running on port ${PORT}`);
  });
}

startServer();
