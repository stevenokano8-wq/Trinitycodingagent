import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

import { initDb, getMessages, addMessage, clearMessages, getTasks, deleteTasks, getFiles, clearFiles, saveFile, listAgentWorkspaceFiles } from "./server/db.js";
import { initCache, cacheFlush } from "./server/cache.js";
import { planBuildTasks, executeAgentBuild, sseClients, broadcastSSE, cancelActiveBuild, getSuspendedFrame, resumeSuspendedExecution, fetchSymbolDependencies, buildASTGraph } from "./server/agent.js";
import { getGithubConfig, saveGithubConfig, executeGitPush, executeGitPullRequest } from "./server/github.js";
import { setRuntimeOverrides, resolveEnvWithOverrides } from "./server/env.js";
import { getLogDrops, clearLogDrops } from "./server/logger.js";
import { executeTerminalCommand } from "./server/command.js";
import { DatabaseStatus, Message, FileNode } from "./src/types.js";
import * as fs from "fs";
import * as childProcess from "child_process";

// This Express server is the local development entry (`pnpm dev`/`pnpm start`).
// Production runs as a Cloudflare Worker via server/worker.ts instead — both
// share the same db/cache/github/agent modules, threaded with an explicit
// env object in Workers and process.env here. D1/KV bindings only exist in
// the Workers runtime, so local dev always runs on the in-memory fallback.

const app = express();
const PORT = 3000;

app.use(express.json());

// Server-side state of our DBs
let dbStatus: DatabaseStatus = {
  d1: "local_fallback",
  kv: "local_fallback"
};

// API: Database and cache statuses
app.get("/api/db-status", (req, res) => {
  res.json({
    d1: dbStatus.d1,
    kv: dbStatus.kv,
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
    const { role, content, attachment } = req.body;
    if (!content) {
      return res.status(400).json({ error: "Content is required" });
    }

    const userMsg: Message = {
      id: `msg-${Date.now()}-user`,
      role: role || "user",
      content,
      timestamp: new Date().toISOString(),
      attachment,
    };

    // Save user message to database
    await addMessage(userMsg);

    // If it's a user command, trigger the agent task planner and background executor
    if (userMsg.role === "user") {
      try {
        // Step 1: Generate Tasks and Subtasks list with Gemini (with fallback)
        const plannedTasks = await planBuildTasks(content, undefined, attachment);
        
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
        executeAgentBuild(content, plannedTasks, undefined, attachment);

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
    await cacheFlush();
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
    await cacheFlush();

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

// API: Cancel all tasks execution
app.post("/api/tasks/cancel-all", async (req, res) => {
  try {
    cancelActiveBuild("");
    res.json({ status: "success", message: "Halted all active task sequences." });
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

// API: Update settings (in-memory for this process only)
app.post("/api/settings", async (req, res) => {
  try {
    const { geminiApiKey, githubToken, githubRepoUrl, cloudflareAccountId, cloudflareApiToken } = req.body;

    const updates: Record<string, string> = {};
    if (geminiApiKey) updates.GEMINI_API_KEY = geminiApiKey;
    if (githubToken) updates.GITHUB_TOKEN = githubToken;
    if (githubRepoUrl) updates.GITHUB_REPO_URL = githubRepoUrl;
    if (cloudflareAccountId) updates.CLOUDFLARE_ACCOUNT_ID = cloudflareAccountId;
    if (cloudflareApiToken) updates.CLOUDFLARE_API_TOKEN = cloudflareApiToken;

    if (Object.keys(updates).length > 0) {
      setRuntimeOverrides(updates);
    }

    // Re-trigger DB/cache initializations
    const dStatus = await initDb();
    const cStatus = await initCache();

    dbStatus = {
      d1: dStatus.d1,
      kv: cStatus.status,
    };

    res.json({
      status: "success",
      dbStatus: {
        d1: dbStatus.d1,
        kv: dbStatus.kv,
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: Save key/value environment variable
app.post("/api/settings/env", async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) {
      return res.status(400).json({ error: "key is required" });
    }
    setRuntimeOverrides({ [key]: value || "" });
    res.json({ status: "success", message: `Environment variable ${key} updated successfully.` });
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

// API: Get suspended frame status (HITL Gate)
app.get("/api/agent/suspended", (req, res) => {
  const frame = getSuspendedFrame();
  res.json({ suspended: !!frame, frame });
});

// API: Approve suspended agent execution
app.post("/api/agent/approve", async (req, res) => {
  try {
    const { note } = req.body || {};
    const result = await resumeSuspendedExecution(true, note);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: Reject suspended agent execution
app.post("/api/agent/reject", async (req, res) => {
  try {
    const { note } = req.body || {};
    const result = await resumeSuspendedExecution(false, note);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get symbol dependencies / AST graph
app.get("/api/agent/dependencies", async (req, res) => {
  try {
    const symbol = req.query.symbol as string;
    if (symbol) {
      const deps = await fetchSymbolDependencies(symbol);
      return res.json({ symbol, dependencies: deps });
    }
    const files = await getFiles();
    const graph = buildASTGraph(files);
    const result: Record<string, any> = {};
    for (const [p, nodes] of graph.entries()) {
      result[p] = nodes;
    }
    res.json({ graph: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: Execute sandbox terminal command
app.post("/api/command/sandbox", async (req, res) => {
  try {
    const { command, cwd } = req.body || {};
    if (!command) return res.status(400).json({ error: "command is required" });

    const result = await executeTerminalCommand(command, {
      cwd,
      onStream: (chunk) => {
        broadcastSSE("terminal-output", chunk);
      }
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: Logs & Cache
app.get("/api/logs", (req, res) => {
  const logs = getLogDrops();
  res.json({ count: logs.length, logs });
});

app.post("/api/logs/clear", (req, res) => {
  clearLogDrops();
  res.json({ status: "cleared" });
});

app.post("/api/cache/clear", async (req, res) => {
  try {
    await cacheFlush();
    res.json({ status: "cleared" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: Custom environment variables
app.post("/api/settings/env", (req, res) => {
  try {
    const { key, value } = req.body || {};
    if (!key || !value) return res.status(400).json({ error: "key and value required" });
    setRuntimeOverrides({ [key]: value } as any);
    res.json({ success: true, key });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: Workspace operations
app.get("/api/workspace/list", (req, res) => {
  try {
    const diskFiles = listAgentWorkspaceFiles();
    res.json({ files: diskFiles });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/workspace/file", async (req, res) => {
  try {
    const filePath = req.query.path as string;
    if (!filePath) return res.status(400).json({ error: "path required" });
    const files = await getFiles();
    const file = files.find(f => f.path === filePath);
    if (!file) return res.status(404).json({ error: "file not found" });
    const mimeMap: Record<string, string> = {
      html: "text/html", css: "text/css", js: "application/javascript", ts: "application/typescript",
      json: "application/json", md: "text/markdown", png: "image/png", jpg: "image/jpeg", svg: "image/svg+xml",
    };
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
    const mime = mimeMap[ext] ?? "text/plain";
    res.setHeader("Content-Type", `${mime}; charset=utf-8`);
    res.send(file.content);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/workspace/preview", async (req, res) => {
  try {
    const files = await getFiles();
    const htmlFile = files.find(f => f.path === "index.html" || f.path.endsWith("/index.html")) || files.find(f => f.path.endsWith(".html"));
    if (!htmlFile) {
      const jsFiles = files.filter(f => f.path.endsWith(".js") || f.path.endsWith(".ts") || f.path.endsWith(".jsx") || f.path.endsWith(".tsx"));
      const cssFiles = files.filter(f => f.path.endsWith(".css"));
      const cssInline = cssFiles.map(f => `/* ${f.path} */\n${f.content}`).join("\n\n");
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Preview</title>${cssInline ? `<style>${cssInline}</style>` : ""}</head><body><div id="root"></div></body></html>`;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(html);
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(htmlFile.content);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/workspace/compile", async (req, res) => {
  const cwd = process.cwd();
  const wsDir = path.join(cwd, "agent-workspace");
  if (!fs.existsSync(wsDir)) return res.status(404).json({ ok: false, error: "agent-workspace directory does not exist yet" });

  const cmd = fs.existsSync(path.join(wsDir, "package.json"))
    ? "npm install --prefer-offline && npx vite build --outDir dist 2>&1"
    : "echo 'No package.json — nothing to compile'";

  childProcess.exec(cmd, { cwd: wsDir, timeout: 120_000, maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => {
    const output = (stdout + stderr).slice(0, 8000);
    broadcastSSE("workspace-compiled", { ok: !err, output });
    res.json({ ok: !err, output, error: err?.message });
  });
});

app.post("/api/clone-repo", async (req, res) => {
  try {
    const { repoUrl, token, targetDir } = req.body || {};
    if (!repoUrl) return res.status(400).json({ ok: false, error: "repoUrl is required" });

    let cloneUrl = repoUrl.trim();
    if (token && cloneUrl.startsWith("https://")) {
      cloneUrl = cloneUrl.replace("https://", `https://${token}@`);
    }

    const cwd = process.cwd();
    const dest = path.join(cwd, "agent-workspace", targetDir || "cloned-repo");

    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(dest), { recursive: true });

    childProcess.exec(`git clone --depth=1 "${cloneUrl}" "${dest}"`, { timeout: 60_000 }, async (err, stdout, stderr) => {
      if (err) {
        const safeErr = (stderr || err.message).replace(token || "", "***");
        return res.json({ ok: false, error: safeErr });
      }

      const clonedFiles: string[] = [];
      const walk = (dir: string) => {
        for (const e of fs.readdirSync(dir)) {
          const full = path.join(dir, e);
          if (e === ".git") continue;
          if (fs.statSync(full).isDirectory()) { walk(full); continue; }
          clonedFiles.push(full);
        }
      };
      walk(dest);

      for (const full of clonedFiles.slice(0, 200)) {
        try {
          const rel = path.relative(path.join(cwd, "agent-workspace"), full);
          const content = fs.readFileSync(full, "utf8");
          const ext = full.split(".").pop()?.toLowerCase() ?? "text";
          const lang: Record<string, string> = { ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", css: "css", html: "html", json: "json", md: "markdown", py: "python", sh: "bash" };
          await saveFile({ path: rel, content, language: lang[ext] ?? "text" });
          broadcastSSE("file-created", { path: rel, content, language: lang[ext] ?? "text" });
        } catch (_) {}
      }

      res.json({ ok: true, message: `Cloned ${repoUrl} into agent-workspace/`, dest });
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: Trigger project PR creation on GitHub remote
app.post("/api/github/pull-request", async (req, res) => {
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
    const result = await executeGitPullRequest(currentToken, currentRepoUrl, branch || "main", allFiles);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: Real-time progress updates SSE connection
app.get(["/api/tasks/stream", "/api/agent/stream", "/api/build/stream"], (req, res) => {
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

// API 404 catch-all to prevent unhandled API routes falling through to Vite proxy
app.use("/api", (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.originalUrl}` });
});

async function startServer() {
  // Inject Upstash Redis credentials so the cache layer picks them up before
  // initCache() runs. Cloudflare KV is only available in the deployed Worker
  // (via the CACHE_KV binding), so local dev relies on Upstash REST instead.
  {
    const rUrl   = process.env.UPSTASH_REDIS_REST_URL;
    const rToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (rUrl && rToken) {
      setRuntimeOverrides({ UPSTASH_REDIS_REST_URL: rUrl, UPSTASH_REDIS_REST_TOKEN: rToken } as any);
    }

    // Also pick up GitHub credentials from env if not already overridden
    const ghToken = process.env.GITHUB_TOKEN;
    const ghRepo  = process.env.GITHUB_REPO_URL;
    if (ghToken || ghRepo) {
      const existing = resolveEnvWithOverrides();
      setRuntimeOverrides({
        ...existing,
        ...(ghToken  ? { GITHUB_TOKEN: ghToken }     : {}),
        ...(ghRepo   ? { GITHUB_REPO_URL: ghRepo }   : {}),
        ...(rUrl     ? { UPSTASH_REDIS_REST_URL: rUrl }   : {}),
        ...(rToken   ? { UPSTASH_REDIS_REST_TOKEN: rToken } : {}),
      } as any);
    }
  }

  // Initialize Database (in-memory locally; D1 in the deployed Worker)
  const dStatus = await initDb();
  // Initialize Cache (KV → Upstash REST → in-memory, depending on available bindings)
  const cStatus = await initCache();

  dbStatus = {
    d1: dStatus.d1,
    kv: cStatus.status,
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
