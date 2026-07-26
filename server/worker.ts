/**
 * Cloudflare Worker entry — trinity-agent-api
 *
 * All Durable Objects must be re-exported from this file.
 * Hono handles REST + SSE routing.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  initDb, getMessages, addMessage, clearMessages,
  getTasks, saveTask, deleteTasks, getFiles, clearFiles, saveFile,
  readAgentFile, listAgentWorkspaceFiles,
} from "./db.js";
import { initCache, cacheFlush } from "./cache.js";
import { getLogDrops, clearLogDrops } from "./logger.js";
import {
  planBuildTasks, executeAgentBuild, sseClients, broadcastSSE, cancelActiveBuild,
  getSuspendedFrame, resumeSuspendedExecution, fetchSymbolDependencies, buildASTGraph
} from "./agent.js";
import { executeTerminalCommand } from "./command.js";
import { getGithubConfig, saveGithubConfig, executeGitPush, executeGitPullRequest } from "./github.js";
import { AppEnv, QueueMessage, MessageBatch, setRuntimeOverrides, resolveEnvWithOverrides } from "./env.js";
import { DatabaseStatus, Message, FileNode, Task } from "../src/types.js";
import * as childProcess from "child_process";
import * as fs from "fs";
import * as path from "path";

// ── Durable Object exports ────────────────────────────────────────────────────
export { SessionWorkspace }     from "./durable-objects/SessionWorkspace.js";
export { FileExplorer }         from "./durable-objects/FileExplorer.js";
export { WebSocketManager }     from "./durable-objects/WebSocketManager.js";
export { WorkflowEngine }       from "./durable-objects/WorkflowEngine.js";
export { ThinkAgent }           from "./durable-objects/ThinkAgent.js";
export { SubAgentOrchestrator } from "./durable-objects/SubAgentOrchestrator.js";
export { UserProfile }          from "./durable-objects/UserProfile.js";
export { WorkspaceRegistry }    from "./durable-objects/WorkspaceRegistry.js";
export { AiGateway }            from "./durable-objects/AiGateway.js";
export { LivePreview }          from "./durable-objects/LivePreview.js";
export { BrowserRun }           from "./durable-objects/BrowserRun.js";

// ─────────────────────────────────────────────────────────────────────────────

type Bindings = AppEnv;
const app = new Hono<{ Bindings: Bindings }>();
app.use("*", cors());

let dbStatus: DatabaseStatus = { d1: "local_fallback", kv: "local_fallback" };
let initialized = false;

async function ensureInit(env: Bindings) {
  if (initialized) return;
  const dStatus = await initDb(env);
  const cStatus = await initCache(env);
  dbStatus = { d1: dStatus.d1, kv: cStatus.status };
  initialized = true;
}

// ── Generic DO proxy helper ───────────────────────────────────────────────────
function proxyToDO(ns: import("./env.js").DurableObjectNamespace, id: string, path: string, request: Request): Promise<Response> {
  const doId = (() => { try { return ns.idFromString(id); } catch { return ns.idFromName(id); } })();
  return ns.get(doId).fetch(`https://do${path}`, request);
}
function proxyToSingletonDO(ns: import("./env.js").DurableObjectNamespace, name: string, path: string, request: Request): Promise<Response> {
  return ns.get(ns.idFromName(name)).fetch(`https://do${path}`, request);
}

// ══════════════════════════════════════════════════════════════════════════════
//  HEALTH & STATUS
// ══════════════════════════════════════════════════════════════════════════════

app.get("/api/health", async (c) => {
  await ensureInit(c.env);
  return c.json({
    status: "ok", timestamp: new Date().toISOString(),
    bindings: { d1: !!c.env.DB, kv: !!c.env.CACHE_KV, r2: !!c.env.FILES_R2, ai: !!c.env.AI, vectorize: !!c.env.VECTORIZE, queue: !!c.env.TASK_QUEUE, browser: !!c.env.BROWSER, sandbox: !!c.env.SANDBOX },
    dbStatus,
  });
});

app.get("/api/db-status", async (c) => {
  await ensureInit(c.env);
  return c.json(dbStatus);
});

// ══════════════════════════════════════════════════════════════════════════════
//  SESSION
// ══════════════════════════════════════════════════════════════════════════════

app.post("/api/session", async (c) => {
  const reqBody = await c.req.json().catch(() => ({})) as { userId?: string; workspaceName?: string };
  const userId = reqBody.userId ?? `anon-${Date.now()}`;
  const workspaceName = reqBody.workspaceName;
  const sessionId = crypto.randomUUID();
  if (c.env.WORKSPACE_REGISTRY) {
    const regId = c.env.WORKSPACE_REGISTRY.idFromName("global");
    await c.env.WORKSPACE_REGISTRY.get(regId).fetch(new Request("https://do/session", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, sessionId, name: workspaceName }),
    }));
  }
  return c.json({ sessionId, workspaceName: workspaceName ?? `workspace-${sessionId.slice(0, 8)}` });
});

app.post("/api/session/clear", async (c) => {
  await ensureInit(c.env);
  await Promise.all([clearMessages(), deleteTasks(), clearFiles()]);
  broadcastSSE("session-cleared", { ts: new Date().toISOString() });
  return c.json({ success: true });
});

app.post("/api/session/load", async (c) => {
  await ensureInit(c.env);
  const body = (await c.req.json<{ messages?: Message[]; tasks?: Task[]; files?: FileNode[] }>().catch(() => ({}))) as { messages?: Message[]; tasks?: Task[]; files?: FileNode[] };
  await Promise.all([clearMessages(), deleteTasks(), clearFiles()]);
  if (body.messages?.length) for (const msg of body.messages) await addMessage(msg);
  if (body.tasks?.length)    for (const t   of body.tasks)    await saveTask(t);
  if (body.files?.length)    for (const f   of body.files)    await saveFile(f);
  broadcastSSE("session-loaded", { ts: new Date().toISOString() });
  return c.json({ success: true });
});

app.get("/api/sessions", async (c) => {
  if (!c.env.WORKSPACE_REGISTRY) return c.json([]);
  const regId = c.env.WORKSPACE_REGISTRY.idFromName("global");
  const res = await c.env.WORKSPACE_REGISTRY.get(regId).fetch(new Request("https://do/sessions"));
  return new Response(res.body, { status: res.status, headers: res.headers });
});

// ══════════════════════════════════════════════════════════════════════════════
//  MESSAGES
// ══════════════════════════════════════════════════════════════════════════════

app.get("/api/messages", async (c) => {
  await ensureInit(c.env);
  return c.json(await getMessages());
});

app.delete("/api/messages", async (c) => {
  await ensureInit(c.env);
  await clearMessages();
  return c.json({ success: true });
});

app.post("/api/messages", async (c) => {
  await ensureInit(c.env);
  const msgBody = await c.req.json<{ role?: string; content?: string; prompt?: string; attachment?: any }>().catch(() => ({} as any));
  const userText = msgBody.content || msgBody.prompt || "";
  if (!userText.trim()) return c.json({ error: "Empty prompt" }, 400);

  const userMsg: Message = {
    id: `msg-${Date.now()}-user`, role: "user", content: userText,
    timestamp: new Date().toISOString(), attachment: msgBody.attachment,
  };
  await addMessage(userMsg);
  broadcastSSE("message-added", userMsg);
  executeAgentBuild(userText, [], c.env, msgBody.attachment).catch(console.error);
  return c.json({ status: "started", messageId: userMsg.id });
});

// ══════════════════════════════════════════════════════════════════════════════
//  TASKS & BUILD
// ══════════════════════════════════════════════════════════════════════════════

app.get("/api/tasks", async (c) => {
  await ensureInit(c.env);
  return c.json(await getTasks());
});

app.delete("/api/tasks", async (c) => {
  await ensureInit(c.env);
  await deleteTasks();
  return c.json({ success: true });
});

app.post("/api/build", async (c) => {
  await ensureInit(c.env);
  const buildBody = await c.req.json<{ prompt: string; attachment?: any }>().catch(() => ({ prompt: "" })) as { prompt: string; attachment?: any };
  const { prompt, attachment } = buildBody;
  const userMsg: Message = {
    id: `msg-${Date.now()}-user`, role: "user", content: prompt,
    timestamp: new Date().toISOString(), attachment,
  };
  await addMessage(userMsg);
  broadcastSSE("message-added", userMsg);
  executeAgentBuild(prompt, [], c.env, attachment).catch(console.error);
  return c.json({ status: "started", messageId: userMsg.id });
});

app.post("/api/build/cancel",    async (c) => { const { taskId = "" } = (await c.req.json().catch(() => ({}))) as { taskId?: string }; await cancelActiveBuild(taskId); return c.json({ status: "cancelled" }); });
app.post("/api/tasks/cancel",    async (c) => { const { taskId = "" } = (await c.req.json().catch(() => ({}))) as { taskId?: string }; await cancelActiveBuild(taskId); return c.json({ status: "cancelled" }); });
app.post("/api/tasks/cancel-all", async (c) => { await cancelActiveBuild(); return c.json({ status: "cancelled" }); });

app.get("/api/build/stream", async (c) => {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  sseClients.add(writer);
  c.req.raw.signal.addEventListener("abort", () => { sseClients.delete(writer); writer.close().catch(() => {}); });
  const hb = setInterval(() => { writer.write(enc.encode(": heartbeat\n\n")).catch(() => clearInterval(hb)); }, 20_000);
  return new Response(readable, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive", "Access-Control-Allow-Origin": "*" },
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  FILES
// ══════════════════════════════════════════════════════════════════════════════

app.get("/api/files", async (c) => {
  await ensureInit(c.env);
  return c.json(await getFiles());
});

app.post("/api/files", async (c) => {
  await ensureInit(c.env);
  const body = await c.req.json<FileNode>().catch(() => null);
  if (!body?.path) return c.json({ error: "Missing path" }, 400);
  await saveFile(body);
  broadcastSSE("file-updated", body);
  return c.json({ success: true });
});

app.delete("/api/files", async (c) => {
  await ensureInit(c.env);
  await clearFiles();
  return c.json({ success: true });
});

// ══════════════════════════════════════════════════════════════════════════════
//  LOGS & CACHE
// ══════════════════════════════════════════════════════════════════════════════

app.get("/api/logs",        async (c) => { const logs = getLogDrops(); return c.json({ count: logs.length, logs }); });
app.post("/api/logs/clear", async (c) => { clearLogDrops(); return c.json({ status: "cleared" }); });
app.post("/api/cache/clear", async (c) => { await cacheFlush(); return c.json({ status: "cleared" }); });

// ══════════════════════════════════════════════════════════════════════════════
//  SETTINGS & ENVIRONMENT
// ══════════════════════════════════════════════════════════════════════════════

app.post("/api/settings", async (c) => {
  const settingsBody = await c.req.json().catch(() => ({})) as { geminiApiKey?: string; githubToken?: string; githubRepoUrl?: string };
  const { geminiApiKey, githubToken, githubRepoUrl } = settingsBody;
  const overrides: Record<string, string> = {};
  if (geminiApiKey)  overrides.GEMINI_API_KEY  = geminiApiKey;
  if (githubToken)   overrides.GITHUB_TOKEN    = githubToken;
  if (githubRepoUrl) overrides.GITHUB_REPO_URL = githubRepoUrl;
  setRuntimeOverrides(overrides as any);
  if (Object.keys(overrides).length === 0) return c.json({ error: "No settings provided" }, 400);
  initialized = false;
  return c.json({ success: true, updated: Object.keys(overrides) });
});

/** Generic env variable setter (for EnvBoxView custom keys) */
app.post("/api/settings/env", async (c) => {
  const { key, value } = (await c.req.json().catch(() => ({}))) as { key?: string; value?: string };
  if (!key || !value) return c.json({ error: "key and value required" }, 400);
  const overrides: Record<string, string> = { [key]: value };
  setRuntimeOverrides(overrides as any);
  return c.json({ success: true, key });
});

app.get("/api/settings/github", async (c) => {
  const config = await getGithubConfig(c.env);
  return c.json(config);
});

app.post("/api/settings/github", async (c) => {
  const body = await c.req.json().catch(() => ({})) as { token?: string; repoUrl?: string };
  await saveGithubConfig(body.token, body.repoUrl);
  return c.json({ success: true });
});

// Alias so GithubView can call /api/github/config
app.get("/api/github/config", async (c) => {
  const config = await getGithubConfig(c.env);
  return c.json(config);
});

// ══════════════════════════════════════════════════════════════════════════════
//  HITL GATES, AST GRAPH, & SANDBOX COMPUTE (PILLARS 1, 2, 3, 4, 5)
// ══════════════════════════════════════════════════════════════════════════════

app.get("/api/agent/suspended", async (c) => {
  const frame = getSuspendedFrame();
  return c.json({ suspended: !!frame, frame });
});

app.post("/api/agent/approve", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { note?: string };
  const res = await resumeSuspendedExecution(true, body.note);
  return c.json(res);
});

app.post("/api/agent/reject", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { note?: string };
  const res = await resumeSuspendedExecution(false, body.note);
  return c.json(res);
});

app.get("/api/agent/dependencies", async (c) => {
  const symbol = c.req.query("symbol");
  if (symbol) {
    const deps = await fetchSymbolDependencies(symbol);
    return c.json({ symbol, dependencies: deps });
  }
  const files = await getFiles();
  const graph = buildASTGraph(files);
  const result: Record<string, any> = {};
  for (const [p, nodes] of graph.entries()) {
    result[p] = nodes;
  }
  return c.json({ graph: result });
});

app.post("/api/command/sandbox", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { command?: string; cwd?: string };
  if (!body.command) return c.json({ error: "command is required" }, 400);

  const res = await executeTerminalCommand(body.command, {
    cwd: body.cwd,
    onStream: (chunk) => {
      broadcastSSE("terminal-output", chunk);
    }
  });
  return c.json(res);
});

// ══════════════════════════════════════════════════════════════════════════════
//  CLONE REPO — pulls any public or private GitHub repo into agent-workspace/
// ══════════════════════════════════════════════════════════════════════════════

app.post("/api/clone-repo", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { repoUrl?: string; token?: string; targetDir?: string };
  const { repoUrl, token, targetDir } = body;
  if (!repoUrl) return c.json({ ok: false, error: "repoUrl is required" }, 400);

  // Build authenticated URL for private repos
  let cloneUrl = repoUrl.trim();
  if (token && cloneUrl.startsWith("https://")) {
    cloneUrl = cloneUrl.replace("https://", `https://${token}@`);
  }

  const cwd    = typeof process !== "undefined" ? process.cwd() : "/tmp";
  const dest   = path.join(cwd, "agent-workspace", targetDir || "cloned-repo");

  // Remove existing dest if present so we can re-clone
  try {
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(dest), { recursive: true });
  } catch (_) {}

  return new Promise<Response>((resolve) => {
    if (typeof childProcess === "undefined" || !childProcess.exec) {
      resolve(c.json({ ok: false, error: "git not available in this runtime" }, 503));
      return;
    }

    childProcess.exec(`git clone --depth=1 "${cloneUrl}" "${dest}"`, { timeout: 60_000 }, (err, stdout, stderr) => {
      if (err) {
        // Scrub token from error message before returning
        const safeErr = (stderr || err.message).replace(token || "", "***");
        resolve(c.json({ ok: false, error: safeErr }));
        return;
      }

      // Walk cloned files and register them in the agent workspace DB
      const registerFiles = async () => {
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

        for (const full of clonedFiles.slice(0, 200)) { // cap at 200 files
          try {
            const rel = path.relative(path.join(cwd, "agent-workspace"), full);
            const content = fs.readFileSync(full, "utf8");
            const ext = full.split(".").pop()?.toLowerCase() ?? "text";
            const lang: Record<string, string> = { ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", css: "css", html: "html", json: "json", md: "markdown", py: "python", sh: "bash" };
            await saveFile({ path: rel, content, language: lang[ext] ?? "text" });
            broadcastSSE("file-created", { path: rel, content, language: lang[ext] ?? "text" });
          } catch (_) {}
        }
      };

      registerFiles()
        .then(() => resolve(c.json({ ok: true, message: `Cloned ${repoUrl} into agent-workspace/`, dest })))
        .catch(e => resolve(c.json({ ok: false, error: e.message })));
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  WORKSPACE PREVIEW — serves compiled agent-workspace HTML for live preview
// ══════════════════════════════════════════════════════════════════════════════

/** Serve the agent workspace as a self-contained HTML page (for preview iframe) */
app.get("/api/workspace/preview", async (c) => {
  await ensureInit(c.env);
  const files = await getFiles();

  // Find the entry HTML file
  const htmlFile = files.find(f => f.path === "index.html" || f.path.endsWith("/index.html")) ||
                   files.find(f => f.path.endsWith(".html"));

  if (!htmlFile) {
    // Fallback: generate a preview from whatever files we have
    const jsFiles  = files.filter(f => f.path.endsWith(".js") || f.path.endsWith(".ts") || f.path.endsWith(".jsx") || f.path.endsWith(".tsx"));
    const cssFiles = files.filter(f => f.path.endsWith(".css"));
    const hasReact = files.some(f => f.content?.includes("import React") || f.content?.includes("from 'react'") || f.content?.includes('from "react"'));

    const html = buildPreviewHtml(files, jsFiles, cssFiles, hasReact);
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Access-Control-Allow-Origin": "*" } });
  }

  let html = htmlFile.content;

  // Inline CSS files referenced in HTML
  const cssFiles = files.filter(f => f.path.endsWith(".css"));
  for (const css of cssFiles) {
    const filename = css.path.split("/").pop() ?? "";
    html = html.replace(new RegExp(`<link[^>]+href=["'][^"']*${filename}["'][^>]*>`, "g"),
      `<style>/* ${css.path} */\n${css.content}</style>`);
  }

  // Inline simple JS/TS files (non-React)
  const jsFiles = files.filter(f => (f.path.endsWith(".js") || f.path.endsWith(".ts")) && !f.path.endsWith(".tsx") && !f.path.endsWith(".jsx"));
  for (const js of jsFiles) {
    const filename = js.path.split("/").pop() ?? "";
    html = html.replace(new RegExp(`<script[^>]+src=["'][^"']*${filename}["'][^>]*></script>`, "g"),
      `<script>/* ${js.path} */\n${js.content}\n</script>`);
  }

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Access-Control-Allow-Origin": "*" } });
});

/** Serve individual file from agent-workspace */
app.get("/api/workspace/file", async (c) => {
  const filePath = c.req.query("path");
  if (!filePath) return c.json({ error: "path required" }, 400);
  const files = await getFiles();
  const file  = files.find(f => f.path === filePath);
  if (!file) return c.json({ error: "file not found" }, 404);
  const mimeMap: Record<string, string> = {
    html: "text/html", css: "text/css", js: "application/javascript", ts: "application/typescript",
    json: "application/json", md: "text/markdown", png: "image/png", jpg: "image/jpeg", svg: "image/svg+xml",
  };
  const ext  = filePath.split(".").pop()?.toLowerCase() ?? "";
  const mime = mimeMap[ext] ?? "text/plain";
  return new Response(file.content, { headers: { "Content-Type": `${mime}; charset=utf-8`, "Access-Control-Allow-Origin": "*" } });
});

/** List files in agent-workspace */
app.get("/api/workspace/list", async (c) => {
  const diskFiles = listAgentWorkspaceFiles();
  return c.json({ files: diskFiles });
});

/** Compile agent-workspace (runs npm install + vite build in agent-workspace/) */
app.post("/api/workspace/compile", async (c) => {
  const cwd = typeof process !== "undefined" ? process.cwd() : null;
  if (!cwd || !childProcess?.exec) return c.json({ ok: false, error: "Compilation not available in this runtime" }, 503);

  const wsDir = path.join(cwd, "agent-workspace");
  if (!fs.existsSync(wsDir)) return c.json({ ok: false, error: "agent-workspace directory does not exist yet" }, 404);

  return new Promise<Response>((resolve) => {
    const cmd = fs.existsSync(path.join(wsDir, "package.json"))
      ? "npm install --prefer-offline && npx vite build --outDir dist 2>&1"
      : "echo 'No package.json — nothing to compile'";

    childProcess.exec(cmd, { cwd: wsDir, timeout: 120_000, maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => {
      const output = (stdout + stderr).slice(0, 8000);
      broadcastSSE("workspace-compiled", { ok: !err, output });
      resolve(c.json({ ok: !err, output, error: err?.message }));
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  GIT
// ══════════════════════════════════════════════════════════════════════════════

app.post("/api/git/push", async (c) => {
  await ensureInit(c.env);
  const gitBody = await c.req.json().catch(() => ({})) as { token?: string; repoUrl?: string; branch?: string };
  const { token, repoUrl, branch = "main" } = gitBody;
  const config  = resolveEnvWithOverrides(c.env);
  const ghToken = token ?? config.GITHUB_TOKEN;
  const ghRepo  = repoUrl ?? config.GITHUB_REPO_URL;
  if (!ghToken || !ghRepo) return c.json({ error: "GitHub token and repo URL required" }, 400);
  const files = await getFiles();
  const result = await executeGitPush(ghToken, ghRepo, branch, files);
  return c.json(result);
});

app.post("/api/git/pull-request", async (c) => {
  await ensureInit(c.env);
  const gitBody = await c.req.json().catch(() => ({})) as { token?: string; repoUrl?: string; branch?: string };
  const { token, repoUrl, branch = "main" } = gitBody;
  const config  = resolveEnvWithOverrides(c.env);
  const ghToken = token ?? config.GITHUB_TOKEN;
  const ghRepo  = repoUrl ?? config.GITHUB_REPO_URL;
  if (!ghToken || !ghRepo) return c.json({ error: "GitHub token and repo URL required" }, 400);
  const files = await getFiles();
  const result = await executeGitPullRequest(ghToken, ghRepo, branch, files);
  return c.json(result);
});

// ══════════════════════════════════════════════════════════════════════════════
//  R2 / VECTORIZE / QUEUE
// ══════════════════════════════════════════════════════════════════════════════

app.get("/api/r2/list", async (c) => {
  if (!c.env.FILES_R2) return c.json({ error: "R2 not bound" }, 503);
  const prefix  = c.req.query("prefix") ?? "";
  const listing = await c.env.FILES_R2.list({ prefix, limit: 200 });
  return c.json({ objects: listing.objects.map(o => ({ key: o.key, size: o.size, uploaded: o.uploaded })) });
});
app.get("/api/r2/get", async (c) => {
  if (!c.env.FILES_R2) return c.json({ error: "R2 not bound" }, 503);
  const key = c.req.query("key");
  if (!key) return c.json({ error: "Missing key" }, 400);
  const obj = await c.env.FILES_R2.get(key);
  if (!obj) return c.json({ error: "Not found" }, 404);
  return c.json({ key, content: await obj.text(), contentType: obj.httpMetadata?.contentType });
});
app.post("/api/r2/put", async (c) => {
  if (!c.env.FILES_R2) return c.json({ error: "R2 not bound" }, 503);
  const { key, content, contentType = "text/plain" } = await c.req.json<{ key: string; content: string; contentType?: string }>().catch(() => ({} as any));
  if (!key || content === undefined) return c.json({ error: "Missing key or content" }, 400);
  await c.env.FILES_R2.put(key, content, { httpMetadata: { contentType } });
  return c.json({ ok: true, key });
});
app.delete("/api/r2/delete", async (c) => {
  if (!c.env.FILES_R2) return c.json({ error: "R2 not bound" }, 503);
  const key = c.req.query("key");
  if (!key) return c.json({ error: "Missing key" }, 400);
  await c.env.FILES_R2.delete(key);
  return c.json({ ok: true });
});
app.post("/api/vectorize/upsert", async (c) => {
  if (!c.env.VECTORIZE) return c.json({ error: "Vectorize not bound" }, 503);
  const { vectors } = await c.req.json<{ vectors: Array<{ id: string; values: number[]; metadata?: Record<string, string> }> }>().catch(() => ({ vectors: [] }));
  if (!vectors?.length) return c.json({ error: "No vectors" }, 400);
  const result = await c.env.VECTORIZE.upsert(vectors);
  return c.json({ ok: true, count: result.count });
});
app.post("/api/vectorize/search", async (c) => {
  if (!c.env.VECTORIZE) return c.json({ error: "Vectorize not bound" }, 503);
  const { vector, topK = 5, returnMetadata = true } = await c.req.json<{ vector: number[]; topK?: number; returnMetadata?: boolean }>().catch(() => ({} as any));
  if (!vector?.length) return c.json({ error: "Missing vector" }, 400);
  return c.json(await c.env.VECTORIZE.query(vector, { topK, returnMetadata }));
});
app.post("/api/queue/send", async (c) => {
  if (!c.env.TASK_QUEUE) return c.json({ error: "Queue not bound" }, 503);
  const body = await c.req.json<Partial<QueueMessage>>().catch(() => ({} as any));
  const msg: QueueMessage = { type: body.type ?? "agent_build", sessionId: body.sessionId ?? "global", payload: body.payload ?? {}, enqueuedAt: new Date().toISOString() };
  await c.env.TASK_QUEUE.send(msg);
  return c.json({ ok: true, enqueuedAt: msg.enqueuedAt });
});

// ══════════════════════════════════════════════════════════════════════════════
//  AI GATEWAY
// ══════════════════════════════════════════════════════════════════════════════

app.get("/api/ai-gateway/stats", async (c) => {
  if (!c.env.AI_GATEWAY) return c.json({ error: "AI_GATEWAY not bound" }, 503);
  const userId = c.req.query("userId") ?? "anonymous";
  return proxyToSingletonDO(c.env.AI_GATEWAY, "global", `/stats?userId=${userId}`, c.req.raw);
});
app.post("/api/ai-gateway/run", async (c) => {
  if (!c.env.AI_GATEWAY) return c.json({ error: "AI_GATEWAY not bound" }, 503);
  return proxyToSingletonDO(c.env.AI_GATEWAY, "global", "/run", c.req.raw);
});

// ══════════════════════════════════════════════════════════════════════════════
//  DURABLE OBJECT PROXY ROUTES
// ══════════════════════════════════════════════════════════════════════════════

app.all("/api/session/:sessionId/*", async (c) => {
  if (!c.env.SESSION_WORKSPACE) return c.json({ error: "not bound" }, 503);
  const sub = c.req.path.replace(`/api/session/${c.req.param("sessionId")}`, "");
  return proxyToDO(c.env.SESSION_WORKSPACE, c.req.param("sessionId"), sub, c.req.raw);
});
app.all("/api/explorer/:sessionId/*", async (c) => {
  if (!c.env.FILE_EXPLORER) return c.json({ error: "not bound" }, 503);
  const sub = c.req.path.replace(`/api/explorer/${c.req.param("sessionId")}`, "");
  return proxyToDO(c.env.FILE_EXPLORER, "global", sub, c.req.raw);
});
app.get("/api/explorer/ws", async (c) => {
  if (!c.env.FILE_EXPLORER) return c.json({ error: "not bound" }, 503);
  const sid = c.req.query("sessionId") ?? "global";
  return c.env.FILE_EXPLORER.get(c.env.FILE_EXPLORER.idFromName("global")).fetch(new Request(`https://do/ws?sessionId=${sid}`, c.req.raw));
});
app.all("/api/ws/*", async (c) => {
  if (!c.env.WEBSOCKET_MANAGER) return c.json({ error: "not bound" }, 503);
  return c.env.WEBSOCKET_MANAGER.get(c.env.WEBSOCKET_MANAGER.idFromName("global")).fetch(new Request("https://do/", c.req.raw));
});
app.all("/api/workflow/*", async (c) => {
  if (!c.env.WORKFLOW_ENGINE) return c.json({ error: "not bound" }, 503);
  const sessionId = c.req.query("sessionId") ?? "global";
  const sub = c.req.path.replace("/api/workflow", "");
  return proxyToDO(c.env.WORKFLOW_ENGINE, sessionId, sub || "/workflows", c.req.raw);
});
app.all("/api/agent/orchestrate/*", async (c) => {
  if (!c.env.SUB_AGENT_ORCHESTRATOR) return c.json({ error: "not bound" }, 503);
  const sessionId = c.req.query("sessionId") ?? "global";
  const sub = c.req.path.replace("/api/agent/orchestrate", "");
  return proxyToDO(c.env.SUB_AGENT_ORCHESTRATOR, sessionId, sub || "/orchestrate", c.req.raw);
});
app.all("/api/preview/*", async (c) => {
  if (!c.env.LIVE_PREVIEW) return c.json({ error: "not bound" }, 503);
  const sessionId = c.req.query("sessionId") ?? "global";
  const sub = c.req.path.replace("/api/preview", "");
  return proxyToDO(c.env.LIVE_PREVIEW, sessionId, sub || "/status", c.req.raw);
});
app.all("/api/browser/*", async (c) => {
  if (!c.env.BROWSER_RUN) return c.json({ error: "not bound" }, 503);
  const sub = c.req.path.replace("/api/browser", "");
  return proxyToSingletonDO(c.env.BROWSER_RUN, "global", sub || "/sessions", c.req.raw);
});
app.all("/api/think/*", async (c) => {
  if (!c.env.THINK_AGENT) return c.json({ error: "not bound" }, 503);
  const sessionId = c.req.query("sessionId") ?? "global";
  const sub = c.req.path.replace("/api/think", "");
  return proxyToDO(c.env.THINK_AGENT, sessionId, sub || "/state", c.req.raw);
});

// ══════════════════════════════════════════════════════════════════════════════
//  QUEUE CONSUMER
// ══════════════════════════════════════════════════════════════════════════════

async function handleQueueMessage(msg: QueueMessage, env: AppEnv): Promise<void> {
  switch (msg.type) {
    case "agent_build": {
      const prompt = (msg.payload.prompt as string) ?? "";
      if (prompt) { await ensureInit(env); await executeAgentBuild(prompt, [], env, msg.payload.attachment as any); }
      break;
    }
    case "git_push": {
      const files = await getFiles();
      const token = (msg.payload.token as string) ?? env.GITHUB_TOKEN;
      const repo  = (msg.payload.repoUrl as string) ?? env.GITHUB_REPO_URL;
      if (token && repo) await executeGitPush(token, repo, "main", files);
      break;
    }
    case "browser_test": {
      if (!env.BROWSER_RUN) break;
      const url   = msg.payload.url as string;
      const doId  = env.BROWSER_RUN.idFromName("global");
      await env.BROWSER_RUN.get(doId).fetch(new Request("https://do/navigate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) }));
      break;
    }
    case "vectorize_upsert": {
      if (!env.VECTORIZE) break;
      const vectors = msg.payload.vectors as Array<{ id: string; values: number[]; metadata?: Record<string, string> }>;
      if (vectors?.length) await env.VECTORIZE.upsert(vectors);
      break;
    }
    case "workflow_step": {
      if (!env.WORKFLOW_ENGINE) break;
      const workflowId = msg.payload.workflowId as string;
      const doId = env.WORKFLOW_ENGINE.idFromName(msg.sessionId);
      await env.WORKFLOW_ENGINE.get(doId).fetch(new Request(`https://do/workflow/${workflowId}/step`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(msg.payload) }));
      break;
    }
    default: console.warn(`[Queue] Unknown message type: ${(msg as any).type}`);
  }
}

export default {
  async fetch(request: Request, env: AppEnv, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx as any);
  },
  async queue(batch: MessageBatch<QueueMessage>, env: AppEnv): Promise<void> {
    for (const msg of batch.messages) {
      try { await handleQueueMessage(msg.body, env); msg.ack(); }
      catch (err) { console.error(`[Queue] Failed:`, err); msg.retry(); }
    }
  },
};

// ── Preview HTML builder ──────────────────────────────────────────────────────
function buildPreviewHtml(files: FileNode[], jsFiles: FileNode[], cssFiles: FileNode[], hasReact: boolean): string {
  const cssInline  = cssFiles.map(f => `/* ${f.path} */\n${f.content}`).join("\n\n");
  const mainHtml   = files.find(f => f.path.endsWith(".html"))?.content ?? "";

  if (mainHtml) return mainHtml;

  const simpleParts = jsFiles.filter(f => !f.content.includes("import ") && !f.content.includes("require(")).map(f => f.content).join("\n\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Agent Workspace Preview</title>
  ${cssInline ? `<style>${cssInline}</style>` : ""}
  ${hasReact ? `
  <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  ` : ""}
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #fff; }
    #root { min-height: 100vh; }
  </style>
</head>
<body>
  <div id="root"></div>
  ${hasReact
    ? `<script type="text/babel">${jsFiles.map(f => f.content).join("\n\n")}\n\nconst __root = ReactDOM.createRoot(document.getElementById("root"));\ntry { __root.render(React.createElement(App)); } catch(e) { document.getElementById("root").textContent = e.message; }</script>`
    : `<script>${simpleParts}</script>`
  }
</body>
</html>`;
}
