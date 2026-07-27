/**
 * SUB_AGENT_ORCHESTRATOR — Durable Object (SQLite backend)
 *
 * Decomposes a high-level goal into parallel subtasks, spawns a dedicated
 * THINK_AGENT DO for each, collects their outputs, and synthesises a final
 * answer using DeepSeek R1 (via AI_GATEWAY).
 *
 * Architecture:
 *   1. decompose(goal)    → N subtasks via DeepSeek R1 reasoning
 *   2. fan-out            → N parallel THINK_AGENT DO calls
 *   3. synthesise(results)→ DeepSeek R1 merges all outputs
 *
 * Storage: ctx.storage.sql (SQLite Durable Object backend — migration v7)
 *   TABLE runs (run_id, data TEXT/JSON, session_id, status, created_at)
 *
 * Routes:
 *   POST /orchestrate           — { goal, sessionId, maxSubtasks? }
 *   GET  /run/:runId            — status + partial results of a run
 *   GET  /runs?sessionId=…      — list all runs
 */

import { AppEnv, AiChatMessage } from "../env.js";
import { MODELS } from "./AiGateway.js";

interface Subtask {
  id: string;
  title: string;
  goal: string;
  status: "pending" | "running" | "done" | "failed";
  result?: string;
  error?: string;
  agentId?: string;
}

interface OrchestratorRun {
  runId: string;
  sessionId: string;
  goal: string;
  status: "decomposing" | "running" | "synthesising" | "done" | "failed";
  subtasks: Subtask[];
  synthesis?: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

const DEFAULT_MAX_SUBTASKS = 5;

export class SubAgentOrchestratorSql {
  private state: DurableObjectState;
  private env: AppEnv;

  constructor(state: DurableObjectState, env: AppEnv) {
    this.state = state;
    this.env   = env;

    // Initialize SQLite schema; guaranteed to complete before any fetch() runs.
    this.state.blockConcurrencyWhile(async () => {
      this.state.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS runs (
          run_id     TEXT PRIMARY KEY,
          data       TEXT NOT NULL,
          session_id TEXT NOT NULL,
          status     TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_runs_session ON runs(session_id);
        CREATE INDEX IF NOT EXISTS idx_runs_status  ON runs(status);
      `);
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url   = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);

    if (request.method === "POST" && parts[0] === "orchestrate") {
      return this.startRun(request);
    }
    if (request.method === "GET" && parts[0] === "run" && parts[1]) {
      return this.getRun(parts[1]);
    }
    if (request.method === "GET" && parts[0] === "runs") {
      return this.listRuns(url.searchParams.get("sessionId") ?? "");
    }
    return new Response("Not found", { status: 404 });
  }

  // ── Start a new orchestration run ─────────────────────────────────────────
  private async startRun(request: Request): Promise<Response> {
    const { goal, sessionId = "global", maxSubtasks = DEFAULT_MAX_SUBTASKS } =
      await request.json() as { goal: string; sessionId?: string; maxSubtasks?: number };

    const runId: string = crypto.randomUUID();
    const run: OrchestratorRun = {
      runId, sessionId, goal,
      status: "decomposing", subtasks: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.sqlSaveRun(run);

    // Run async decompose+execute+synthesise pipeline without blocking response
    this.runPipeline(run, maxSubtasks).catch(err => {
      run.status = "failed";
      run.error  = String(err);
      this.sqlSaveRun(run);
    });

    return Response.json({ ok: true, runId });
  }

  private async runPipeline(run: OrchestratorRun, maxSubtasks: number): Promise<void> {
    // Phase 1: decompose
    const subtasks = await this.decompose(run.goal, maxSubtasks, run.sessionId);
    run.subtasks = subtasks;
    run.status   = "running";
    this.sqlSaveRun(run);

    // Phase 2: fan-out — run subtasks in parallel
    await Promise.all(subtasks.map(st => this.runSubtask(st, run)));

    // Phase 3: synthesise
    run.status = "synthesising";
    this.sqlSaveRun(run);
    run.synthesis = await this.synthesise(run.goal, run.subtasks, run.sessionId);
    run.status    = "done";
    this.sqlSaveRun(run);
  }

  // ── Decompose goal into subtasks ───────────────────────────────────────────
  private async decompose(
    goal: string,
    maxSubtasks: number,
    sessionId: string,
  ): Promise<Subtask[]> {
    const prompt = `You are a software architecture planner. Break the following goal into ${maxSubtasks} or fewer independent subtasks that can be executed in parallel.

Goal: ${goal}

Respond ONLY with a JSON array (no markdown fences):
[{"title":"...", "goal":"..."}]`;

    const raw = await this.callAI(
      [{ role: "user", content: prompt }],
      "reasoning",
      sessionId,
    );

    let parsed: Array<{ title: string; goal: string }>;
    try {
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      parsed = JSON.parse(jsonMatch?.[0] ?? "[]");
    } catch {
      parsed = [{ title: "Execute goal", goal }];
    }

    return parsed.slice(0, maxSubtasks).map((p, i) => ({
      id: `${crypto.randomUUID().slice(0, 8)}-${i}`,
      title: p.title,
      goal:  p.goal,
      status: "pending" as const,
    }));
  }

  // ── Run a single subtask via THINK_AGENT DO ────────────────────────────────
  private async runSubtask(subtask: Subtask, run: OrchestratorRun): Promise<void> {
    subtask.status = "running";
    this.sqlSaveRun(run);

    try {
      if (this.env.THINK_AGENT) {
        const agentId  = this.env.THINK_AGENT.idFromName(`${run.sessionId}:${subtask.id}`);
        const stub     = this.env.THINK_AGENT.get(agentId);
        subtask.agentId = agentId.toString();
        const resp = await stub.fetch(new Request("https://agent/run", {
          method: "POST",
          body:   JSON.stringify({ goal: subtask.goal, sessionId: run.sessionId }),
          headers: { "Content-Type": "application/json" },
        }));
        const data = await resp.json() as { answer?: string };
        subtask.result = data.answer ?? "(no answer)";
      } else {
        subtask.result = await this.callAI(
          [{ role: "user", content: subtask.goal }],
          "code_gen",
          run.sessionId,
        );
      }
      subtask.status = "done";
    } catch (err) {
      subtask.status = "failed";
      subtask.error  = String(err);
    }

    this.sqlSaveRun(run);
  }

  // ── Synthesise all subtask outputs ────────────────────────────────────────
  private async synthesise(
    originalGoal: string,
    subtasks: Subtask[],
    sessionId: string,
  ): Promise<string> {
    const completedWork = subtasks
      .map(st => `## ${st.title}\n${st.status === "done" ? st.result ?? "(empty)" : `FAILED: ${st.error}`}`)
      .join("\n\n");

    const prompt = `You are a senior software architect synthesising the outputs of parallel coding agents.

Original goal:
${originalGoal}

Completed subtask outputs:
${completedWork}

Write a comprehensive synthesis that:
1. Summarises what was accomplished
2. Highlights any conflicts or integration points between subtasks
3. Lists any remaining work or known issues
4. Provides a clear "next steps" section

Be concrete and technical.`;

    return this.callAI(
      [{ role: "user", content: prompt }],
      "reasoning", sessionId
    );
  }

  // ── AI helper (AI_GATEWAY → direct AI fallback) ───────────────────────────
  private async callAI(
    messages: AiChatMessage[],
    taskType: string,
    sessionId: string,
  ): Promise<string> {
    if (this.env.AI_GATEWAY) {
      const id   = this.env.AI_GATEWAY.idFromName(`gw:${sessionId}`);
      const stub = this.env.AI_GATEWAY.get(id);
      const resp = await stub.fetch(new Request("https://gw/run", {
        method: "POST",
        body: JSON.stringify({ taskType, messages, maxTokens: 4096, userId: sessionId }),
        headers: { "Content-Type": "application/json" },
      }));
      const data = await resp.json() as { text?: string; error?: string };
      if (data.error) throw new Error(data.error);
      return data.text ?? "";
    }
    if (!this.env.AI) throw new Error("No AI binding");
    const model  = taskType === "code_gen" ? MODELS.CODE : MODELS.REASONING;
    const result = await this.env.AI.run(model, { messages, max_tokens: 4096 });
    return result.choices?.[0]?.message?.content ?? result.response ?? "";
  }

  // ── SQL helpers ────────────────────────────────────────────────────────────
  private sqlSaveRun(run: OrchestratorRun): void {
    run.updatedAt = new Date().toISOString();
    this.state.storage.sql.exec(
      `INSERT OR REPLACE INTO runs (run_id, data, session_id, status, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      run.runId,
      JSON.stringify(run),
      run.sessionId,
      run.status,
      run.createdAt,
    );
  }

  private getRun(runId: string): Response {
    const cursor = this.state.storage.sql.exec<{ data: string }>(
      `SELECT data FROM runs WHERE run_id = ?`, runId
    );
    const row = [...cursor][0];
    if (!row) return new Response("Not found", { status: 404 });
    return Response.json(JSON.parse(row.data));
  }

  private listRuns(sessionId: string): Response {
    const cursor = sessionId
      ? this.state.storage.sql.exec<{ data: string }>(
          `SELECT data FROM runs WHERE session_id = ? ORDER BY created_at DESC`, sessionId
        )
      : this.state.storage.sql.exec<{ data: string }>(
          `SELECT data FROM runs ORDER BY created_at DESC`
        );
    const runs = [...cursor].map(r => JSON.parse(r.data) as OrchestratorRun);
    return Response.json(runs);
  }
}
