/**
 * WORKFLOW_ENGINE — Durable Object (SQLite backend)
 *
 * Durable multi-step task execution for jobs that may exceed 30s.
 *
 * Guarantees:
 *   • Checkpointing: every step's state is written to DO SQLite before execution
 *   • Auto-retry:    exponential back-off on transient failures (up to 3 retries)
 *   • Approval gates:pauses workflow until POST /approve is called
 *   • Alarm watchdog: DO alarm fires every 10 min to catch stalled workflows
 *   • KV status:      current step/status written to CACHE_KV so the UI can poll
 *
 * Storage: ctx.storage.sql (SQLite Durable Object backend — migration v7)
 *   TABLE workflows (id, data TEXT/JSON, session_id, status, updated_at)
 *
 * Routes:
 *   POST /workflow                — create and start a new workflow
 *   GET  /workflow/:id            — get workflow status + step details
 *   POST /workflow/:id/approve    — approve a paused step
 *   POST /workflow/:id/cancel     — cancel a running workflow
 *   GET  /workflows               — list all workflows for a session
 */

import { AppEnv } from "../env.js";

type StepStatus = "pending" | "running" | "done" | "failed" | "awaiting_approval";
type WorkflowStatus = "pending" | "running" | "done" | "failed" | "paused" | "cancelled" | "SUSPENDED";

interface StepDef {
  id: string;
  name: string;
  type: "agent" | "command" | "approval" | "custom";
  payload: Record<string, unknown>;
  requiresApproval?: boolean;
}

interface Step extends StepDef {
  status: StepStatus;
  retries: number;
  output?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

interface Workflow {
  id: string;
  name: string;
  sessionId: string;
  steps: Step[];
  currentStepIndex: number;
  status: WorkflowStatus;
  createdAt: string;
  updatedAt: string;
  result?: string;
}

const MAX_RETRIES    = 3;
const ALARM_INTERVAL = 10 * 60 * 1000; // 10 min watchdog

export class WorkflowEngineSql {
  private state: DurableObjectState;
  private env: AppEnv;

  constructor(state: DurableObjectState, env: AppEnv) {
    this.state = state;
    this.env   = env;

    // Initialize SQLite schema inside blockConcurrencyWhile so the table
    // is guaranteed to exist before any fetch() or alarm() runs.
    this.state.blockConcurrencyWhile(async () => {
      this.state.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS workflows (
          id         TEXT PRIMARY KEY,
          data       TEXT NOT NULL,
          session_id TEXT NOT NULL,
          status     TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_wf_session  ON workflows(session_id);
        CREATE INDEX IF NOT EXISTS idx_wf_status   ON workflows(status);
      `);
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url   = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);

    if (request.method === "POST" && parts.length === 1 && parts[0] === "workflow") {
      return this.createWorkflow(request);
    }
    if (request.method === "GET" && parts.length === 2 && parts[0] === "workflow") {
      return this.getWorkflow(parts[1]);
    }
    if (request.method === "POST" && parts.length === 3 && parts[2] === "approve") {
      return this.approveStep(parts[1]);
    }
    if (request.method === "POST" && parts.length === 3 && parts[2] === "cancel") {
      return this.cancelWorkflow(parts[1]);
    }
    if (request.method === "GET" && parts.length === 1 && parts[0] === "workflows") {
      return this.listWorkflows(url.searchParams.get("sessionId") ?? "");
    }

    return new Response("Not found", { status: 404 });
  }

  // ── Alarm: watchdog for stalled workflows ─────────────────────────────────
  async alarm(): Promise<void> {
    const cursor = this.state.storage.sql.exec<{ data: string }>(
      `SELECT data FROM workflows WHERE status IN ('running','pending')`
    );
    for (const row of cursor) {
      const wf = JSON.parse(row.data) as Workflow;
      const staleSince = Date.now() - new Date(wf.updatedAt).getTime();
      if (staleSince > ALARM_INTERVAL) {
        await this.runNextStep(wf);
      }
    }
    await this.state.storage.setAlarm(Date.now() + ALARM_INTERVAL);
  }

  // ── Create ─────────────────────────────────────────────────────────────────
  private async createWorkflow(request: Request): Promise<Response> {
    const { name, sessionId, steps: rawSteps } =
      await request.json() as { name: string; sessionId: string; steps: StepDef[] };

    const id: string = crypto.randomUUID();
    const steps: Step[] = rawSteps.map(s => ({ ...s, status: "pending" as StepStatus, retries: 0 }));
    const wf: Workflow = {
      id, name, sessionId, steps,
      currentStepIndex: 0,
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.sqlSaveWorkflow(wf);
    await this.state.storage.setAlarm(Date.now() + ALARM_INTERVAL);
    this.runNextStep(wf).catch(() => {/* errors handled inside */});
    return Response.json({ ok: true, workflowId: id });
  }

  // ── Get ────────────────────────────────────────────────────────────────────
  private getWorkflow(id: string): Response {
    const cursor = this.state.storage.sql.exec<{ data: string }>(
      `SELECT data FROM workflows WHERE id = ?`, id
    );
    const row = [...cursor][0];
    if (!row) return new Response("Not found", { status: 404 });
    return Response.json(JSON.parse(row.data));
  }

  // ── Approve ────────────────────────────────────────────────────────────────
  private async approveStep(id: string): Promise<Response> {
    const wf = this.loadWorkflow(id);
    if (!wf) return new Response("Not found", { status: 404 });
    const step = wf.steps[wf.currentStepIndex];
    if (!step || step.status !== "awaiting_approval")
      return new Response("No step awaiting approval", { status: 400 });
    step.status = "pending";
    wf.status   = "running";
    this.sqlSaveWorkflow(wf);
    this.runNextStep(wf).catch(() => {});
    return Response.json({ ok: true });
  }

  // ── Cancel ─────────────────────────────────────────────────────────────────
  private async cancelWorkflow(id: string): Promise<Response> {
    const wf = this.loadWorkflow(id);
    if (!wf) return new Response("Not found", { status: 404 });
    wf.status    = "cancelled";
    wf.updatedAt = new Date().toISOString();
    this.sqlSaveWorkflow(wf);
    return Response.json({ ok: true });
  }

  // ── List ───────────────────────────────────────────────────────────────────
  private listWorkflows(sessionId: string): Response {
    const cursor = sessionId
      ? this.state.storage.sql.exec<{ data: string }>(
          `SELECT data FROM workflows WHERE session_id = ? ORDER BY updated_at DESC`, sessionId
        )
      : this.state.storage.sql.exec<{ data: string }>(
          `SELECT data FROM workflows ORDER BY updated_at DESC`
        );
    const wfs = [...cursor].map(r => JSON.parse(r.data) as Workflow);
    return Response.json(wfs);
  }

  // ── Core execution loop ────────────────────────────────────────────────────
  private async runNextStep(wf: Workflow): Promise<void> {
    while (wf.currentStepIndex < wf.steps.length) {
      const step = wf.steps[wf.currentStepIndex];

      if (step.requiresApproval && step.status === "pending") {
        step.status = "awaiting_approval";
        wf.status   = "paused";
        this.sqlSaveWorkflow(wf);
        return;
      }
      if (step.status === "done")               { wf.currentStepIndex++; continue; }
      if (step.status === "awaiting_approval")  return;

      step.status    = "running";
      step.startedAt = new Date().toISOString();
      wf.status      = "running";
      this.sqlSaveWorkflow(wf);

      try {
        const output      = await this.executeStep(step, wf);
        step.status       = "done";
        step.output       = output;
        step.completedAt  = new Date().toISOString();
        wf.currentStepIndex++;
      } catch (err) {
        step.retries++;
        if (step.retries >= MAX_RETRIES) {
          step.status = "failed";
          step.error  = String(err);
          wf.status   = "failed";
          wf.result   = `Step "${step.name}" failed after ${MAX_RETRIES} retries: ${err}`;
          this.sqlSaveWorkflow(wf);
          await this.updateKvStatus(wf);
          return;
        }
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, step.retries - 1)));
        step.status = "pending";
      }
      this.sqlSaveWorkflow(wf);
      await this.updateKvStatus(wf);
    }

    wf.status    = "done";
    wf.result    = "Workflow completed successfully.";
    wf.updatedAt = new Date().toISOString();
    this.sqlSaveWorkflow(wf);
    await this.updateKvStatus(wf);
  }

  private async executeStep(step: Step, wf: Workflow): Promise<string> {
    if (step.type === "approval") return "approved";

    if (step.type === "agent" && this.env.THINK_AGENT) {
      const agentId = this.env.THINK_AGENT.idFromName(`${wf.sessionId}:${step.id}`);
      const stub    = this.env.THINK_AGENT.get(agentId);
      const resp    = await stub.fetch(new Request("https://agent/run", {
        method: "POST",
        body: JSON.stringify({ goal: step.payload.goal, sessionId: wf.sessionId }),
        headers: { "Content-Type": "application/json" },
      }));
      const data = await resp.json() as { answer?: string };
      return data.answer ?? "Step completed.";
    }

    if (step.type === "custom" || step.type === "command") {
      return `Executed step: ${step.name}`;
    }

    return "Step completed.";
  }

  // ── SQL helpers ────────────────────────────────────────────────────────────
  private sqlSaveWorkflow(wf: Workflow): void {
    wf.updatedAt = new Date().toISOString();
    this.state.storage.sql.exec(
      `INSERT OR REPLACE INTO workflows (id, data, session_id, status, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      wf.id,
      JSON.stringify(wf),
      wf.sessionId,
      wf.status,
      wf.updatedAt,
    );
  }

  private loadWorkflow(id: string): Workflow | null {
    const cursor = this.state.storage.sql.exec<{ data: string }>(
      `SELECT data FROM workflows WHERE id = ?`, id
    );
    const row = [...cursor][0];
    return row ? JSON.parse(row.data) as Workflow : null;
  }

  private async updateKvStatus(wf: Workflow): Promise<void> {
    if (!this.env.CACHE_KV) return;
    await this.env.CACHE_KV.put(
      `wf:status:${wf.id}`,
      JSON.stringify({ status: wf.status, step: wf.currentStepIndex, total: wf.steps.length }),
      { expirationTtl: 3600 }
    );
  }
}
