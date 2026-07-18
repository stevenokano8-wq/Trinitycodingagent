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
import { DatabaseStatus, Message, FileNode, Task } from "../src/types.js";

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
    const { role, content, attachment, sessionId } = body;
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
      let plannedTasks: Task[] = [];
      
      c.req.raw.signal?.addEventListener("abort", () => {
        console.warn("Client aborted request POST /api/messages - starting cleanup");
        if (plannedTasks && plannedTasks.length > 0) {
          for (const task of plannedTasks) {
            cancelActiveBuild(task.id);
          }
        }
      });

      try {
        plannedTasks = await planBuildTasks(content, c.env, attachment);
        for (const task of plannedTasks) {
          if (!userMsg.taskId) userMsg.taskId = task.id;
          await saveTask(task);
        }

        // Load session-specific GitHub configuration from Workers KV if available
        let sessionGitToken = "";
        let sessionGitRepoUrl = "";
        if (sessionId && c.env.CACHE_KV) {
          const cached = await c.env.CACHE_KV.get(`github_config:${sessionId}`);
          if (cached) {
            try {
              const data = JSON.parse(cached);
              sessionGitToken = data.token || "";
              sessionGitRepoUrl = data.repoUrl || "";
            } catch (e) {
              console.error("Failed to parse cached github config for session:", e);
            }
          }
        }

        const customEnv = {
          ...c.env,
          GITHUB_TOKEN: sessionGitToken || undefined,
          GITHUB_REPO_URL: sessionGitRepoUrl || undefined,
        };

        // Long-running background build: must be kept alive with waitUntil,
        // otherwise the Worker would tear down the request context as soon
        // as this handler returns its response.
        c.executionCtx.waitUntil(executeAgentBuild(content, plannedTasks, customEnv, attachment));

        return c.json({ message: userMsg, tasks: plannedTasks });
      } catch (agentErr: any) {
        console.error("Agent planning failed, initializing fallback dead task state:", agentErr);
        
        // Ensure database state is updated with a dead task so the UI does not sit spinning forever
        const failTaskId = `task-${Date.now()}-failed`;
        const failedTask: Task = {
          id: failTaskId,
          name: "Analyze Task Plan",
          status: "failed",
          progress: 0,
          activeSubtaskIndex: 0,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          subtasks: [
            {
              id: `${failTaskId}-sub-0`,
              taskId: failTaskId,
              name: "Generate task planning blocks",
              status: "failed",
              logs: [`[FATAL ERROR] Planning failed: ${agentErr.message || agentErr}`]
            }
          ]
        };
        
        userMsg.taskId = failTaskId;
        try {
          await saveTask(failedTask);
        } catch (dbErr) {
          console.error("Failed to save failed task block to database:", dbErr);
        }

        const failAssistantMsg: Message = {
          id: `msg-${Date.now()}-finish`,
          role: "assistant",
          content: `### Sovereign Agent Task Report: FAILED\n\nFailed to plan build tasks: \`${agentErr.message || agentErr}\``,
          timestamp: new Date().toISOString(),
          actionsTaken: [],
          thoughtTimeSeconds: 0,
          modelName: "Error Flow",
          durationSeconds: 0
        };
        try {
          await addMessage(failAssistantMsg);
          broadcastSSE("build-finished", failAssistantMsg);
        } catch (msgErr) {
          console.error("Failed to post finish failure message to channel:", msgErr);
        }

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

// Kill all running tasks — no taskId required. Flips the global cancellation
// signal so the currently executing subtask loop breaks on its next check.
app.post("/api/tasks/cancel-all", async (c) => {
  try {
    cancelActiveBuild("__all__");
    return c.json({ status: "success", message: "All active task sequences halted." });
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

app.get("/api/github/config", async (c) => {
  try {
    const sessionId = c.req.query("sessionId");
    if (sessionId && c.env.CACHE_KV) {
      const cached = await c.env.CACHE_KV.get(`github_config:${sessionId}`);
      if (cached) {
        try {
          const data = JSON.parse(cached);
          const token = data.token || "";
          return c.json({
            repoUrl: data.repoUrl || "",
            branch: data.branch || "main",
            hasToken: !!token,
            maskedToken: token ? `${token.substring(0, 4)}••••••••` : "",
          });
        } catch (e) {
          console.error("Failed to parse cached config:", e);
        }
      }
    }
    return c.json({ repoUrl: "", branch: "main", hasToken: false, maskedToken: "" });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post("/api/github/config", async (c) => {
  try {
    const { token, repoUrl, branch, sessionId } = await c.req.json();
    if (sessionId && c.env.CACHE_KV) {
      let existingToken = "";
      let existingBranch = "main";
      const cached = await c.env.CACHE_KV.get(`github_config:${sessionId}`);
      if (cached) {
        try {
          const data = JSON.parse(cached);
          existingToken = data.token || "";
          existingBranch = data.branch || "main";
        } catch (e) {
          console.error("Failed parsing cached config on save:", e);
        }
      }

      await c.env.CACHE_KV.put(
        `github_config:${sessionId}`,
        JSON.stringify({
          token: token !== undefined ? token : existingToken,
          repoUrl: repoUrl || "",
          branch: branch || existingBranch,
        })
      );
    }
    return c.json({ status: "success", message: "GitHub configuration updated successfully." });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post("/api/github/push", async (c) => {
  await ensureInit(c.env);
  try {
    const body = await c.req.json().catch(() => ({}));
    const { token, repoUrl, branch, sessionId } = body;

    let currentToken = token;
    let currentRepoUrl = repoUrl;
    let currentBranch = branch || "main";

    if (sessionId && c.env.CACHE_KV) {
      const cached = await c.env.CACHE_KV.get(`github_config:${sessionId}`);
      if (cached) {
        try {
          const data = JSON.parse(cached);
          if (!currentToken) currentToken = data.token;
          if (!currentRepoUrl) currentRepoUrl = data.repoUrl;
          if (!branch) currentBranch = data.branch || "main";
        } catch (e) {
          console.error("Failed parsing cached config on push:", e);
        }
      }
    }

    if (!currentToken) return c.json({ error: "GitHub API Token is required. Please sign in or configure it for this session." }, 400);
    if (!currentRepoUrl) return c.json({ error: "GitHub Repository URL is required. Please configure it for this session." }, 400);

    const allFiles = await getFiles();
    const result = await executeGitPush(currentToken, currentRepoUrl, currentBranch, allFiles);
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

  // Keep the isolate alive for the full duration of this SSE connection.
  // The async IIFE above returns immediately (just registers a listener),
  // so we use a proper Promise that only resolves on abort — otherwise
  // Cloudflare can recycle the isolate mid-stream.
  c.executionCtx.waitUntil(
    new Promise<void>((resolve) => {
      const cleanup = () => {
        clearInterval(heartbeat);
        sseClients.delete(client);
        writer.close().catch(() => {});
        resolve();
      };
      if (c.req.raw.signal) {
        c.req.raw.signal.addEventListener("abort", cleanup, { once: true });
      }
      // Safety valve: resolve after 10 minutes max so the waitUntil never leaks.
      setTimeout(cleanup, 10 * 60 * 1000);
    })
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

export default {
  fetch: app.fetch,
  async scheduled(event: any, env: any, ctx: any) {
    console.log("Cron trigger executed successfully!");
    try {
      await ensureInit(env);
      console.log(`Sovereign Agent Worker scheduled check: D1 is ${dbStatus.d1}, KV is ${dbStatus.kv}`);
    } catch (err: any) {
      console.error("Error during scheduled cron execution:", err);
    }
  }
};

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
