/**
 * SUB_AGENT_ORCHESTRATOR — Durable Object
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

export class SubAgentOrchestrator {
  private state: DurableObjectState;
  private env: AppEnv;

  constructor(state: DurableObjectState, env: AppEnv) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
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

    const runId = crypto.randomUUID();
    const run: OrchestratorRun = {
      runId, sessionId, goal,
      status: "decomposing", subtasks: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.saveRun(run);

    // Run asynchronously so we can return the runId immediately
    this.execute(run, Math.min(maxSubtasks, 8)).catch(err => {
      run.status = "failed";
      run.error  = String(err);
      this.saveRun(run);
    });

    return Response.json({ ok: true, runId });
  }

  // ── Core orchestration pipeline ───────────────────────────────────────────
  private async execute(run: OrchestratorRun, maxSubtasks: number): Promise<void> {
    // 1. Decompose
    const subtasks = await this.decompose(run.goal, maxSubtasks, run.sessionId);
    run.subtasks = subtasks;
    run.status   = "running";
    await this.saveRun(run);

    // 2. Fan-out — spawn all THINK_AGENT DOs in parallel
    await Promise.all(subtasks.map(async (st) => {
      st.status  = "running";
      await this.saveRun(run);
      try {
        st.result  = await this.runSubAgent(st, run.sessionId);
        st.status  = "done";
      } catch (err) {
        st.status  = "failed";
        st.error   = String(err);
      }
      await this.saveRun(run);
    }));

    // 3. Synthesise
    run.status = "synthesising";
    await this.saveRun(run);
    try {
      run.synthesis = await this.synthesise(run.goal, run.subtasks, run.sessionId);
      run.status    = "done";
    } catch (err) {
      run.status = "failed";
      run.error  = `Synthesis failed: ${err}`;
    }
    await this.saveRun(run);
  }

  // ── Step 1: Decompose goal into subtasks via DeepSeek R1 ──────────────────
  private async decompose(
    goal: string, max: number, sessionId: string,
  ): Promise<Subtask[]> {
    const prompt = `Decompose this high-level goal into ${max} or fewer concrete, independent subtasks.
Each subtask must be completable by an autonomous coding agent.
Respond with ONLY a JSON array (no markdown):
[{"title":"...","goal":"detailed task description for an agent"}]

Goal: ${goal}`;

    const raw = await this.callAI(
      [{ role: "user", content: prompt }],
      "reasoning", sessionId
    );

    let parsed: Array<{ title: string; goal: string }>;
    try {
      const match = raw.match(/\[[\s\S]*\]/);
      parsed = JSON.parse(match?.[0] ?? "[]");
    } catch {
      // Fallback: single subtask = the original goal
      parsed = [{ title: goal.slice(0, 60), goal }];
    }

    return parsed.slice(0, max).map((s, i) => ({
      id:     `${i}`,
      title:  s.title,
      goal:   s.goal,
      status: "pending" as const,
    }));
  }

  // ── Step 2: Run one subtask via THINK_AGENT DO ────────────────────────────
  private async runSubAgent(st: Subtask, sessionId: string): Promise<string> {
    if (!this.env.THINK_AGENT) {
      // Graceful fallback: answer the subtask directly with AI
      return this.callAI(
        [{ role: "user", content: `Complete this task: ${st.goal}` }],
        "code_gen", sessionId
      );
    }

    const agentId = this.env.THINK_AGENT.idFromName(`orch:${st.id}:${sessionId}`);
    const stub    = this.env.THINK_AGENT.get(agentId);
    st.agentId    = agentId.toString();

    const resp = await stub.fetch(new Request("https://agent/run", {
      method: "POST",
      body: JSON.stringify({ goal: st.goal, sessionId }),
      headers: { "Content-Type": "application/json" },
    }));

    if (!resp.ok) throw new Error(`Agent HTTP ${resp.status}`);
    const data = await resp.json() as { answer?: string };
    return data.answer ?? "(no answer)";
  }

  // ── Step 3: Synthesise all results into a coherent final answer ───────────
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

  // ── Storage helpers ────────────────────────────────────────────────────────
  private async saveRun(run: OrchestratorRun): Promise<void> {
    run.updatedAt = new Date().toISOString();
    await this.state.storage.put(`run:${run.runId}`, run);
    const index = await this.state.storage.get<string[]>("index") ?? [];
    if (!index.includes(run.runId)) {
      index.push(run.runId);
      await this.state.storage.put("index", index);
    }
  }

  private async getRun(runId: string): Promise<Response> {
    const run = await this.state.storage.get<OrchestratorRun>(`run:${runId}`);
    if (!run) return new Response("Not found", { status: 404 });
    return Response.json(run);
  }

  private async listRuns(sessionId: string): Promise<Response> {
    const index = await this.state.storage.get<string[]>("index") ?? [];
    const runs: OrchestratorRun[] = [];
    for (const id of index) {
      const r = await this.state.storage.get<OrchestratorRun>(`run:${id}`);
      if (r && (!sessionId || r.sessionId === sessionId)) runs.push(r);
    }
    return Response.json(runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }
}
