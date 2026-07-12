// Cloudflare Worker entry point for the "sovereign-agent-api" worker.
// Mirrors the Express routes in server.ts (used for local `pnpm dev`), but
// runs as a stateless fetch handler: env bindings/secrets are passed in per
// request instead of read from process.env, and any background work after a
// response is returned must be wrapped in ctx.waitUntil().
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  initDb, getMessages, addMessage, clearMessages, getTasks, saveTask,
  deleteTasks, getFiles, clearFiles, saveFile,
} from "./db.js";
import { initCache, cacheFlush } from "./cache.js";
import { planBuildTasks, executeAgentBuild, sseClients, broadcastSSE, cancelActiveBuild } from "./agent.js";
import { getGithubConfig, saveGithubConfig, executeGitPush } from "./github.js";
import { AppEnv, setRuntimeOverrides, resolveEnvWithOverrides } from "./env.js";
import { DatabaseStatus, Message, FileNode } from "../src/types.js";

type Bindings = AppEnv;

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", cors());

let dbStatus: DatabaseStatus = { d1: "local_fallback", kv: "local_fallback" };
let initialized = false;

async function ensureInit(env: Bindings) {
  if (initialized) return;
  const dStatus = await initDb(env);
  const cStatus = await initCache(env);
  dbStatus = {
    d1: dStatus.d1,
    kv: cStatus.status,
  };
  initialized = true;
}

app.get("/api/db-status", async (c) => {
  await ensureInit(c.env);
  return c.json({
    d1: dbStatus.d1,
    kv: dbStatus.kv,
  });
});

app.get("/api/messages", async (c) => {
  await ensureInit(c.env);
  try {
    return c.json(await getMessages());
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post("/api/messages", async (c) => {
  await ensureInit(c.env);
  try {
    const body = await c.req.json();
    const { role, content, attachment } = body;
    if (!content) return c.json({ error: "Content is required" }, 400);

    const userMsg: Message = {
      id: `msg-${Date.now()}-user`,
      role: role || "user",
      content,
      timestamp: new Date().toISOString(),
      attachment,
    };

    await addMessage(userMsg);

    if (userMsg.role === "user") {
      try {
        const plannedTasks = await planBuildTasks(content, c.env, attachment);
        for (const task of plannedTasks) {
          if (!userMsg.taskId) userMsg.taskId = task.id;
          await saveTask(task);
        }

        // Long-running background build: must be kept alive with waitUntil,
        // otherwise the Worker would tear down the request context as soon
        // as this handler returns its response.
        c.executionCtx.waitUntil(executeAgentBuild(content, plannedTasks, c.env, attachment));

        return c.json({ message: userMsg, tasks: plannedTasks });
      } catch (agentErr: any) {
        console.error("Agent planning error:", agentErr);
        return c.json({ message: userMsg, error: agentErr.message });
      }
    }
    return c.json({ message: userMsg });
  } catch (err: any) {
    console.error("API messages insert error:", err);
    return c.json({ error: err.message }, 500);
  }
});

app.post("/api/session/clear", async (c) => {
  await ensureInit(c.env);
  try {
    await clearMessages();
    await deleteTasks();
    await clearFiles();
    await cacheFlush();
    broadcastSSE("session-cleared", {});
    return c.json({ status: "success", message: "Conversation logs, task registry, files, and cache successfully purged." });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post("/api/session/load", async (c) => {
  await ensureInit(c.env);
  try {
    const { messages: newMsgs, tasks: newTasks, files: newFiles } = await c.req.json();

    await clearMessages();
    await deleteTasks();
    await clearFiles();
    await cacheFlush();

    if (newMsgs && Array.isArray(newMsgs)) {
      const actualMsgs = newMsgs.filter((m: any) => m.id !== "welcome-msg");
      for (const msg of actualMsgs) await addMessage(msg);
    }

    if (newTasks && Array.isArray(newTasks)) {
      for (const t of newTasks) await saveTask(t);
    }

    if (newFiles && Array.isArray(newFiles)) {
      for (const f of newFiles) await saveFile(f);
    }

    broadcastSSE("connected", { status: "refreshed" });
    return c.json({ status: "success", message: "Workspace session loaded successfully." });
  } catch (err: any) {
    console.error("API session load error:", err);
    return c.json({ error: err.message }, 500);
  }
});

app.get("/api/tasks", async (c) => {
  await ensureInit(c.env);
  try {
    return c.json(await getTasks());
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post("/api/tasks/cancel", async (c) => {
  try {
    const { taskId } = await c.req.json();
    if (!taskId) return c.json({ error: "taskId is required" }, 400);
    cancelActiveBuild(taskId);
    return c.json({ status: "success", message: `Halted task sequence ${taskId}.` });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get("/api/files", async (c) => {
  await ensureInit(c.env);
  try {
    return c.json(await getFiles());
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post("/api/files/save", async (c) => {
  await ensureInit(c.env);
  try {
    const { path: filePath, content, language } = await c.req.json();
    if (!filePath || content === undefined) {
      return c.json({ error: "path and content are required parameters" }, 400);
    }

    const fileNode: FileNode = { path: filePath, content, language: language || "typescript" };
    await saveFile(fileNode);

    const resolved = resolveEnvWithOverrides(c.env);
    if (resolved.GITHUB_TOKEN && resolved.GITHUB_REPO_URL) {
      c.executionCtx.waitUntil(
        (async () => {
          const allFiles = await getFiles();
          const pRes = await executeGitPush(resolved.GITHUB_TOKEN!, resolved.GITHUB_REPO_URL!, "main", allFiles);
          console.log(`Auto-push on manual save: ${pRes.success ? "Success" : "Failed: " + pRes.message}`);
        })()
      );
    }

    return c.json({ status: "success", message: `File saved to ${filePath} successfully.` });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post("/api/settings", async (c) => {
  try {
    const { geminiApiKey } = await c.req.json();

    // No writable disk in Workers: settings changes are applied as in-memory
    // overrides for this session only (see server/env.ts). D1/KV are
    // bindings fixed at deploy time (wrangler.api.toml) and cannot be
    // reconfigured at runtime — only Gemini's key can be overridden here.
    const patch: Partial<AppEnv> = {};
    if (geminiApiKey) patch.GEMINI_API_KEY = geminiApiKey;
    setRuntimeOverrides(patch);

    initialized = false;
    await ensureInit(c.env);

    return c.json({
      status: "success",
      dbStatus: {
        d1: dbStatus.d1,
        kv: dbStatus.kv,
      },
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get("/api/github/config", (c) => {
  try {
    return c.json(getGithubConfig(c.env));
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post("/api/github/config", async (c) => {
  try {
    const { token, repoUrl } = await c.req.json();
    saveGithubConfig(token, repoUrl);
    return c.json({ status: "success", message: "GitHub configuration updated successfully." });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post("/api/github/push", async (c) => {
  await ensureInit(c.env);
  try {
    const body = await c.req.json().catch(() => ({}));
    const { token, repoUrl, branch } = body;
    const resolved = resolveEnvWithOverrides(c.env);

    const currentToken = token || resolved.GITHUB_TOKEN;
    const currentRepoUrl = repoUrl || resolved.GITHUB_REPO_URL;

    if (!currentToken) return c.json({ error: "GitHub API Token is required. Please configure it or pass it." }, 400);
    if (!currentRepoUrl) return c.json({ error: "GitHub Repository URL is required. Please configure it or pass it." }, 400);

    const allFiles = await getFiles();
    const result = await executeGitPush(currentToken, currentRepoUrl, branch || "main", allFiles);
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Server-Sent Events over a Worker fetch response: build a TransformStream
// and register its writer in the same `sseClients` set that agent.ts's
// broadcastSSE() already writes to via `.write(...)`. Known limitation
// (accepted scope): this only fans out to clients connected to the same
// isolate that handles the broadcast — there's no cross-isolate pub/sub here.
app.get("/api/tasks/stream", (c) => {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const client = {
    write: (chunk: string) => {
      writer.write(encoder.encode(chunk)).catch(() => {
        sseClients.delete(client);
      });
    },
  };

  sseClients.add(client);

  client.write(`retry: 2000\n\n`);
  client.write(`event: connected\ndata: ${JSON.stringify({ status: "listening" })}\n\n`);

  const heartbeat = setInterval(() => {
    client.write(`:\n\n`);
  }, 15000);

  c.executionCtx.waitUntil(
    (async () => {
      // Keep this waitUntil alive roughly as long as the stream itself; the
      // client is removed and the interval cleared once writes start failing
      // (handled inside client.write above) or on abort.
      c.req.raw.signal?.addEventListener("abort", () => {
        clearInterval(heartbeat);
        sseClients.delete(client);
        writer.close().catch(() => {});
      });
    })()
  );

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});

export default app;

// Legacy Durable Object classes from earlier iterations of this worker
// (sandboxed code execution, project tooling, agent sessions) are still
// registered against this script account-side. Cloudflare requires every
// deploy to keep exporting a class name it has ever bound, to avoid
// silently orphaning any storage those objects hold. None of this repo's
// code uses them anymore, so these are inert stubs kept only to satisfy
// that platform requirement.
class LegacyDurableObjectStub {
  constructor(_state: unknown, _env: unknown) {}
  async fetch(): Promise<Response> {
    return new Response("This Durable Object class is retired and no longer in use.", { status: 410 });
  }
}

export class Sandbox extends LegacyDurableObjectStub {}
export class ProjectTools extends LegacyDurableObjectStub {}
export class AgentSession extends LegacyDurableObjectStub {}
