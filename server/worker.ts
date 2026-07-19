/**
 * Cloudflare Worker entry — sovereign-agent-api
 *
 * All Durable Objects must be re-exported from this file.
 * Hono handles REST + SSE routing.
 * DO fetch handlers own their own path namespaces.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  initDb, getMessages, addMessage, clearMessages,
  getTasks, saveTask, deleteTasks, getFiles, clearFiles, saveFile,
} from "./db.js";
import { initCache } from "./cache.js";
import {
  planBuildTasks, executeAgentBuild, sseClients, broadcastSSE, cancelActiveBuild,
} from "./agent.js";
import { getGithubConfig, saveGithubConfig, executeGitPush, executeGitPullRequest } from "./github.js";
import { AppEnv, QueueMessage, MessageBatch, setRuntimeOverrides, resolveEnvWithOverrides } from "./env.js";
import { DatabaseStatus, Message, FileNode, Task } from "../src/types.js";

// ── Durable Object exports ────────────────────────────────────────────────────
// Cloudflare requires every DO class to be re-exported from the Worker entry.

export { SessionWorkspace }      from "./durable-objects/SessionWorkspace.js";
export { FileExplorer }          from "./durable-objects/FileExplorer.js";
export { WebSocketManager }      from "./durable-objects/WebSocketManager.js";
export { WorkflowEngine }        from "./durable-objects/WorkflowEngine.js";
export { ThinkAgent }            from "./durable-objects/ThinkAgent.js";
export { SubAgentOrchestrator }  from "./durable-objects/SubAgentOrchestrator.js";
export { UserProfile }           from "./durable-objects/UserProfile.js";
export { WorkspaceRegistry }     from "./durable-objects/WorkspaceRegistry.js";
export { AiGateway }             from "./durable-objects/AiGateway.js";
export { LivePreview }           from "./durable-objects/LivePreview.js";
export { BrowserRun }            from "./durable-objects/BrowserRun.js";

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
function proxyToDO(
  ns: import("./env.js").DurableObjectNamespace,
  id: string,
  path: string,
  request: Request,
): Promise<Response> {
  const doId = (() => {
    try { return ns.idFromString(id); } catch { return ns.idFromName(id); }
  })();
  return ns.get(doId).fetch(`https://do${path}`, request);
}

// ── Singleton DO proxy (always idFromName) ────────────────────────────────────
function proxyToSingletonDO(
  ns: import("./env.js").DurableObjectNamespace,
  name: string,
  path: string,
  request: Request,
): Promise<Response> {
  return ns.get(ns.idFromName(name)).fetch(`https://do${path}`, request);
}

// ══════════════════════════════════════════════════════════════════════════════
//  SESSION API  —  /api/session/*
// ══════════════════════════════════════════════════════════════════════════════

app.post("/api/session", async (c) => {
  const reqBody = await c.req.json().catch(() => ({})) as { userId?: string; workspaceName?: string };
  const userId = reqBody.userId ?? `anon-${Date.now()}`;
  const workspaceName = reqBody.workspaceName;

  const sessionId = crypto.randomUUID();

  if (c.env.WORKSPACE_REGISTRY) {
    const regId = c.env.WORKSPACE_REGISTRY.idFromName("global");
    await c.env.WORKSPACE_REGISTRY.get(regId).fetch(
      new Request("https://do/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, sessionId, name: workspaceName }),
      })
    );
  }

  return c.json({ sessionId, workspaceName: workspaceName ?? `workspace-${sessionId.slice(0, 8)}` });
});

app.get("/api/sessions", async (c) => {
  if (!c.env.WORKSPACE_REGISTRY) return c.json([]);
  const regId = c.env.WORKSPACE_REGISTRY.idFromName("global");
  const res = await c.env.WORKSPACE_REGISTRY.get(regId).fetch(new Request("https://do/sessions"));
  return new Response(res.body, { status: res.status, headers: res.headers });
});

// ── Health / status ──────────────────────────────────────────────────────────
app.get("/api/health", async (c) => {
  await ensureInit(c.env);
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    bindings: {
      d1:        !!c.env.DB,
      kv:        !!c.env.CACHE_KV,
      r2:        !!c.env.FILES_R2,
      ai:        !!c.env.AI,
      vectorize: !!c.env.VECTORIZE,
      queue:     !!c.env.TASK_QUEUE,
      browser:   !!c.env.BROWSER,
      sandbox:   !!c.env.SANDBOX,
    },
    dbStatus,
  });
});

// ── DB status ─────────────────────────────────────────────────────────────────
app.get("/api/db-status", async (c) => {
  await ensureInit(c.env);
  return c.json(dbStatus);
});

// ── Messages ──────────────────────────────────────────────────────────────────
app.get("/api/messages", async (c) => {
  await ensureInit(c.env);
  return c.json(await getMessages());
});

app.delete("/api/messages", async (c) => {
  await ensureInit(c.env);
  await clearMessages();
  return c.json({ success: true });
});

// ── Tasks ─────────────────────────────────────────────────────────────────────
app.get("/api/tasks", async (c) => {
  await ensureInit(c.env);
  return c.json(await getTasks());
});

app.delete("/api/tasks", async (c) => {
  await ensureInit(c.env);
  await deleteTasks();
  return c.json({ success: true });
});

// ── Files ─────────────────────────────────────────────────────────────────────
app.get("/api/files", async (c) => {
  await ensureInit(c.env);
  return c.json(await getFiles());
});

app.delete("/api/files", async (c) => {
  await ensureInit(c.env);
  await clearFiles();
  return c.json({ success: true });
});

// ── R2 File Storage ──────────────────────────────────────────────────────────
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
  const text = await obj.text();
  return c.json({ key, content: text, contentType: obj.httpMetadata?.contentType });
});

app.post("/api/r2/put", async (c) => {
  if (!c.env.FILES_R2) return c.json({ error: "R2 not bound" }, 503);
  const { key, content, contentType = "text/plain" } =
    await c.req.json<{ key: string; content: string; contentType?: string }>().catch(() => ({} as any));
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

// ── Vectorize (semantic search / RAG) ─────────────────────────────────────────
app.post("/api/vectorize/upsert", async (c) => {
  if (!c.env.VECTORIZE) return c.json({ error: "Vectorize not bound" }, 503);
  const { vectors } = await c.req.json<{ vectors: Array<{ id: string; values: number[]; metadata?: Record<string, string> }> }>().catch(() => ({ vectors: [] }));
  if (!vectors?.length) return c.json({ error: "No vectors provided" }, 400);
  const result = await c.env.VECTORIZE.upsert(vectors);
  return c.json({ ok: true, count: result.count });
});

app.post("/api/vectorize/search", async (c) => {
  if (!c.env.VECTORIZE) return c.json({ error: "Vectorize not bound" }, 503);
  const { vector, topK = 5, returnMetadata = true } =
    await c.req.json<{ vector: number[]; topK?: number; returnMetadata?: boolean }>().catch(() => ({} as any));
  if (!vector?.length) return c.json({ error: "Missing vector" }, 400);
  const result = await c.env.VECTORIZE.query(vector, { topK, returnMetadata });
  return c.json(result);
});

// ── Queue — enqueue a background task ─────────────────────────────────────────
app.post("/api/queue/send", async (c) => {
  if (!c.env.TASK_QUEUE) return c.json({ error: "Queue not bound" }, 503);
  const body = await c.req.json<Partial<QueueMessage>>().catch(() => ({} as any));
  const msg: QueueMessage = {
    type: body.type ?? "agent_build",
    sessionId: body.sessionId ?? "global",
    payload: body.payload ?? {},
    enqueuedAt: new Date().toISOString(),
  };
  await c.env.TASK_QUEUE.send(msg);
  return c.json({ ok: true, enqueuedAt: msg.enqueuedAt });
});

// ── Settings (Gemini API key override, GitHub config) ────────────────────────
app.post("/api/settings", async (c) => {
  const settingsBody = await c.req.json().catch(() => ({})) as { geminiApiKey?: string; githubToken?: string; githubRepoUrl?: string };
  const { geminiApiKey, githubToken, githubRepoUrl } = settingsBody;

  const overrides: Record<string, string> = {};
  if (geminiApiKey)  overrides.GEMINI_API_KEY   = geminiApiKey;
  if (githubToken)   overrides.GITHUB_TOKEN      = githubToken;
  if (githubRepoUrl) overrides.GITHUB_REPO_URL   = githubRepoUrl;

  setRuntimeOverrides(overrides as any);

  if (Object.keys(overrides).length === 0) {
    return c.json({ error: "No settings provided" }, 400);
  }

  initialized = false; // Force re-init with new credentials
  return c.json({ success: true, updated: Object.keys(overrides) });
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

// ── AI Gateway stats ──────────────────────────────────────────────────────────
app.get("/api/ai-gateway/stats", async (c) => {
  if (!c.env.AI_GATEWAY) return c.json({ error: "AI_GATEWAY not bound" }, 503);
  const userId = c.req.query("userId") ?? "anonymous";
  return proxyToSingletonDO(c.env.AI_GATEWAY, "global", `/stats?userId=${userId}`, c.req.raw);
});

app.post("/api/ai-gateway/run", async (c) => {
  if (!c.env.AI_GATEWAY) return c.json({ error: "AI_GATEWAY not bound" }, 503);
  return proxyToSingletonDO(c.env.AI_GATEWAY, "global", "/run", c.req.raw);
});

// ── Agent build (SSE + trigger) ───────────────────────────────────────────────
app.post("/api/build", async (c) => {
  await ensureInit(c.env);
  const buildBody = await c.req.json<{ prompt: string; attachment?: any }>().catch(() => ({ prompt: "", attachment: undefined })) as { prompt: string; attachment?: any };
  const { prompt, attachment } = buildBody;

  const userMsg: Message = {
    id: `msg-${Date.now()}-user`,
    role: "user",
    content: prompt,
    timestamp: new Date().toISOString(),
    attachment,
  };
  await addMessage(userMsg);
  broadcastSSE("message-added", userMsg);

  // Non-blocking — SSE stream delivers progress
  executeAgentBuild(prompt, [], c.env, attachment).catch(console.error);
  return c.json({ status: "started", messageId: userMsg.id });
});

app.post("/api/build/cancel", async (c) => {
  const { taskId = "" } = (await c.req.json().catch(() => ({}))) as { taskId?: string };
  cancelActiveBuild(taskId);
  return c.json({ status: "cancelled" });
});

app.get("/api/build/stream", async (c) => {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc    = new TextEncoder();
  sseClients.add(writer);

  c.req.raw.signal.addEventListener("abort", () => {
    sseClients.delete(writer);
    writer.close().catch(() => {});
  });

  // Heartbeat every 20 s to keep connection alive through CF
  const hb = setInterval(() => {
    writer.write(enc.encode(": heartbeat\n\n")).catch(() => clearInterval(hb));
  }, 20_000);

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
});

// ── Git push ──────────────────────────────────────────────────────────────────
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

// ── DO-routed APIs ────────────────────────────────────────────────────────────
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
  return c.env.FILE_EXPLORER.get(c.env.FILE_EXPLORER.idFromName("global")).fetch(
    new Request(`https://do/ws?sessionId=${sid}`, c.req.raw)
  );
});

app.all("/api/ws/*", async (c) => {
  if (!c.env.WEBSOCKET_MANAGER) return c.json({ error: "not bound" }, 503);
  return c.env.WEBSOCKET_MANAGER.get(
    c.env.WEBSOCKET_MANAGER.idFromName("global")
  ).fetch(new Request(`https://do/`, c.req.raw));
});

app.all("/api/workflow/*", async (c) => {
  if (!c.env.WORKFLOW_ENGINE) return c.json({ error: "not bound" }, 503);
  const sessionId = c.req.query("sessionId") ?? "global";
  const sub       = c.req.path.replace("/api/workflow", "");
  return proxyToDO(c.env.WORKFLOW_ENGINE, sessionId, sub || "/workflows", c.req.raw);
});

app.all("/api/agent/orchestrate/*", async (c) => {
  if (!c.env.SUB_AGENT_ORCHESTRATOR) return c.json({ error: "not bound" }, 503);
  const sessionId = c.req.query("sessionId") ?? "global";
  const sub       = c.req.path.replace("/api/agent/orchestrate", "");
  return proxyToDO(c.env.SUB_AGENT_ORCHESTRATOR, sessionId, sub || "/orchestrate", c.req.raw);
});

app.all("/api/preview/*", async (c) => {
  if (!c.env.LIVE_PREVIEW) return c.json({ error: "not bound" }, 503);
  const sessionId = c.req.query("sessionId") ?? "global";
  const sub       = c.req.path.replace("/api/preview", "");
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
  const sub       = c.req.path.replace("/api/think", "");
  return proxyToDO(c.env.THINK_AGENT, sessionId, sub || "/state", c.req.raw);
});

// ══════════════════════════════════════════════════════════════════════════════
//  QUEUE CONSUMER
//  Processes background tasks sent via POST /api/queue/send
// ══════════════════════════════════════════════════════════════════════════════

async function handleQueueMessage(msg: QueueMessage, env: AppEnv): Promise<void> {
  console.log(`[Queue] Processing ${msg.type} for session ${msg.sessionId}`);

  switch (msg.type) {
    case "agent_build": {
      const prompt = (msg.payload.prompt as string) ?? "";
      if (prompt) {
        await ensureInit(env);
        await executeAgentBuild(prompt, [], env, msg.payload.attachment as any);
      }
      break;
    }

    case "git_push": {
      const files = await getFiles();
      const token = (msg.payload.token as string) ?? env.GITHUB_TOKEN;
      const repo  = (msg.payload.repoUrl as string) ?? env.GITHUB_REPO_URL;
      if (token && repo) {
        await executeGitPush(token, repo, "main", files);
      }
      break;
    }

    case "browser_test": {
      if (!env.BROWSER_RUN) break;
      const url     = msg.payload.url as string;
      const sessId  = msg.sessionId;
      const doId    = env.BROWSER_RUN.idFromName("global");
      await env.BROWSER_RUN.get(doId).fetch(
        new Request("https://do/navigate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        })
      );
      break;
    }

    case "vectorize_upsert": {
      if (!env.VECTORIZE) break;
      const vectors = msg.payload.vectors as Array<{ id: string; values: number[]; metadata?: Record<string, string> }>;
      if (vectors?.length) {
        await env.VECTORIZE.upsert(vectors);
      }
      break;
    }

    case "workflow_step": {
      if (!env.WORKFLOW_ENGINE) break;
      const sessionId  = msg.sessionId;
      const workflowId = msg.payload.workflowId as string;
      const doId       = env.WORKFLOW_ENGINE.idFromName(sessionId);
      await env.WORKFLOW_ENGINE.get(doId).fetch(
        new Request(`https://do/workflow/${workflowId}/step`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(msg.payload),
        })
      );
      break;
    }

    default:
      console.warn(`[Queue] Unknown message type: ${(msg as any).type}`);
  }
}

// ── Hono app default export + queue consumer handler ─────────────────────────
export default {
  async fetch(request: Request, env: AppEnv, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx as any);
  },

  async queue(batch: MessageBatch<QueueMessage>, env: AppEnv): Promise<void> {
    for (const msg of batch.messages) {
      try {
        await handleQueueMessage(msg.body, env);
        msg.ack();
      } catch (err) {
        console.error(`[Queue] Failed to process message ${msg.id}:`, err);
        msg.retry();
      }
    }
  },
};

// ── Cache flush helper (used by cache.ts) ─────────────────────────────────────
import { cacheFlush } from "./cache.js";
