/**
 * THINK_AGENT — Durable Object (Agent-based, @cloudflare/agents)
 *
 * Autonomous ReAct-loop agent. Each instance is an isolated agent with its
 * own conversation history, tool call log, and streaming WebSocket channel.
 */

import { Agent, Connection } from "@cloudflare/agents";
import { getSandbox }         from "@cloudflare/sandbox";
import { AppEnv, AiChatMessage } from "../../server/env.js";
import { MODELS } from "./AiGateway.js";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
  result: string;
  ts: string;
}

interface AgentState {
  sessionId: string;
  taskId: string;
  goal: string;
  status: "idle" | "running" | "done" | "failed";
  steps: ToolCall[];
  finalAnswer?: string;
  startedAt: string;
  updatedAt: string;
}

interface ToolAction {
  thought: string;
  action: { tool: string; args: Record<string, unknown> };
}

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Sovereign Agent — an autonomous AI coding assistant running on Cloudflare Workers.

You have access to these tools. Respond ONLY with valid JSON, no markdown fences:

{"thought":"<why you're doing this>","action":{"tool":"<name>","args":{<args>}}}

Available tools:
- read       {"path":"rel/path"}
- write      {"path":"...","content":"..."}
- edit       {"path":"...","old":"...","new":"..."}
- delete     {"path":"..."}
- list       {"path":"optional/prefix"}
- find       {"pattern":"filename glob"}
- grep       {"pattern":"regex","path":"optional prefix"}
- bash       {"command":"shell command"}
- ask_ai     {"prompt":"...","taskType":"reasoning|code_gen|fast"}
- done       {"answer":"final answer to user"}

Rules:
1. Always output exactly one JSON object per turn.
2. Use "done" when the task is complete or you have a final answer.
3. Keep thoughts concise (one sentence).
4. Never output partial JSON or explanatory text outside the JSON.
5. Use ask_ai for complex reasoning or code generation sub-tasks.
6. Prefer edit over write when modifying existing files.
`;

const MAX_STEPS = 30;

// ── DO class ──────────────────────────────────────────────────────────────────
export class ThinkAgent extends Agent<AppEnv, AgentState> {

  // ── Agent WebSocket callbacks ─────────────────────────────────────────────
  async onConnect(connection: Connection<unknown>): Promise<void> {
    // @ts-ignore
    const saved = await this.state.storage.get<AgentState>("agentState");
    connection.send(JSON.stringify({ type: "state", state: saved ?? null }));
  }

  async onMessage(connection: Connection<unknown>, raw: string): Promise<void> {
    let msg: unknown;
    try { msg = JSON.parse(raw); } catch { return; }
    const data = msg as Record<string, unknown>;

    if (data.type === "run") {
      const goal      = data.goal as string;
      const sessionId = data.sessionId as string ?? "global";
      connection.send(JSON.stringify({ type: "ack", goal }));

      await this.runLoop(goal, sessionId, (event) => {
        try { connection.send(JSON.stringify(event)); } catch { /* closed */ }
      });
    }

    if (data.type === "reset") {
      // @ts-ignore
      await this.state.storage.delete("agentState");
      connection.send(JSON.stringify({ type: "reset_ok" }));
    }
  }

  // ── REST routes ────────────────────────────────────────────────────────────
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/run") {
      const { goal, sessionId = "global" } =
        await request.json() as { goal: string; sessionId?: string };
      let finalAnswer = "";
      await this.runLoop(goal, sessionId, (ev) => {
        if (ev.type === "done") finalAnswer = (ev as { type: "done"; answer: string }).answer;
      });
      return Response.json({ answer: finalAnswer });
    }

    if (request.method === "GET" && url.pathname === "/state") {
      // @ts-ignore
      const s = await this.state.storage.get<AgentState>("agentState");
      return Response.json(s ?? { status: "idle" });
    }

    if (request.method === "POST" && url.pathname === "/reset") {
      // @ts-ignore
      await this.state.storage.delete("agentState");
      return Response.json({ ok: true });
    }

    return super.fetch(request);
  }

  // ── Core ReAct loop ────────────────────────────────────────────────────────
  private async runLoop(
    goal: string,
    sessionId: string,
    emit: (ev: Record<string, unknown>) => void,
  ): Promise<void> {
    const taskId = crypto.randomUUID();
    const agentState: AgentState = {
      sessionId, taskId, goal, status: "running", steps: [],
      startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    // @ts-ignore
    await this.state.storage.put("agentState", agentState);

    const history: AiChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user",   content: `Goal: ${goal}\nSessionId: ${sessionId}` },
    ];

    for (let step = 0; step < MAX_STEPS; step++) {
      let raw = "";
      try {
        raw = await this.callAI(history, sessionId);
      } catch (err) {
        emit({ type: "error", message: String(err) });
        agentState.status = "failed";
        break;
      }

      let parsed: ToolAction;
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch?.[0] ?? raw) as ToolAction;
      } catch {
        emit({ type: "thought", text: raw });
        history.push({ role: "assistant", content: raw });
        history.push({ role: "user", content: "Invalid JSON. Respond with exactly one JSON object." });
        continue;
      }

      emit({ type: "thought", text: parsed.thought ?? "" });
      const { tool, args } = parsed.action ?? {};
      if (!tool) continue;

      if (tool === "done") {
        const answer = (args?.answer as string) ?? "Task complete.";
        emit({ type: "done", answer });
        agentState.status      = "done";
        agentState.finalAnswer = answer;
        break;
      }

      emit({ type: "tool_call", tool, args });
      let result = "";
      try {
        result = await this.executeTool(tool, args ?? {}, sessionId);
      } catch (err) {
        result = `Error: ${err}`;
      }
      emit({ type: "tool_result", tool, result: result.slice(0, 4000) });

      const tc: ToolCall = { tool, args: args as Record<string,unknown>, result, ts: new Date().toISOString() };
      agentState.steps.push(tc);
      agentState.updatedAt = new Date().toISOString();
      // @ts-ignore
      await this.state.storage.put("agentState", agentState);

      history.push({ role: "assistant", content: raw });
      history.push({ role: "user",      content: `Observation: ${result.slice(0, 3000)}` });
    }

    if (agentState.status === "running") {
      agentState.status      = "done";
      agentState.finalAnswer = "Max steps reached.";
      emit({ type: "done", answer: agentState.finalAnswer });
    }
    agentState.updatedAt = new Date().toISOString();
    // @ts-ignore
    await this.state.storage.put("agentState", agentState);
  }

  private async callAI(messages: AiChatMessage[], sessionId: string): Promise<string> {
    // @ts-ignore
    if (this.env.AI_GATEWAY) {
      // @ts-ignore
      const gwId  = this.env.AI_GATEWAY.idFromName(`gw:${sessionId}`);
      // @ts-ignore
      const stub  = this.env.AI_GATEWAY.get(gwId);
      const resp  = await stub.fetch(new Request("https://gw/run", {
        method: "POST",
        body: JSON.stringify({ taskType: "reasoning", messages, maxTokens: 2048, userId: sessionId }),
        headers: { "Content-Type": "application/json" },
      }));
      const data = await resp.json() as { text?: string; error?: string };
      if (data.error) throw new Error(data.error);
      return data.text ?? "";
    }

    // @ts-ignore
    if (!this.env.AI) throw new Error("Neither AI_GATEWAY nor AI binding available");
    // @ts-ignore
    const result = await this.env.AI.run(MODELS.REASONING, { messages, max_tokens: 2048 });
    return result.choices?.[0]?.message?.content ?? result.response ?? "";
  }

  private async executeTool(
    tool: string,
    args: Record<string, unknown>,
    sessionId: string,
  ): Promise<string> {
    const ws = () => {
      // @ts-ignore
      if (!this.env.SESSION_WORKSPACE) throw new Error("SESSION_WORKSPACE not bound");
      // @ts-ignore
      const id = this.env.SESSION_WORKSPACE.idFromName(sessionId);
      // @ts-ignore
      return this.env.SESSION_WORKSPACE.get(id);
    };

    switch (tool) {
      case "read": {
        const path = args.path as string;
        const resp = await ws().fetch(new Request(
          `https://ws/file?path=${encodeURIComponent(path)}`
        ));
        if (!resp.ok) return `File not found: ${path}`;
        const f = await resp.json() as { content?: string };
        return f.content ?? "";
      }

      case "write": {
        await ws().fetch(new Request("https://ws/file", {
          method: "POST",
          body: JSON.stringify({ path: args.path, content: args.content }),
          headers: { "Content-Type": "application/json" },
        }));
        return `Written: ${args.path}`;
      }

      case "edit": {
        const { path, old: oldStr, new: newStr } = args as { path: string; old: string; new: string };
        const resp = await ws().fetch(new Request(
          `https://ws/file?path=${encodeURIComponent(path)}`
        ));
        if (!resp.ok) return `File not found: ${path}`;
        const f = await resp.json() as { content?: string };
        const orig = f.content ?? "";
        if (!orig.includes(oldStr)) return `String not found in ${path}: "${oldStr.slice(0, 50)}"`;
        const updated = orig.replace(oldStr, newStr);
        await ws().fetch(new Request("https://ws/file", {
          method: "POST",
          body: JSON.stringify({ path, content: updated }),
          headers: { "Content-Type": "application/json" },
        }));
        return `Edited: ${path}`;
      }

      case "delete": {
        await ws().fetch(new Request(
          `https://ws/file?path=${encodeURIComponent(args.path as string)}`,
          { method: "DELETE" }
        ));
        return `Deleted: ${args.path}`;
      }

      case "list": {
        const resp = await ws().fetch(new Request("https://ws/files"));
        const files = await resp.json() as Array<{ path: string; size: number; updatedAt: string }>;
        const prefix = (args.path as string) ?? "";
        const filtered = prefix ? files.filter(f => f.path.startsWith(prefix)) : files;
        return filtered.map(f => `${f.path} (${f.size}B)`).join("\n") || "(empty)";
      }

      case "find": {
        const resp = await ws().fetch(new Request("https://ws/files"));
        const files = await resp.json() as Array<{ path: string }>;
        const pat   = (args.pattern as string).toLowerCase();
        const found = files.filter(f => f.path.toLowerCase().includes(pat));
        return found.map(f => f.path).join("\n") || "No files found.";
      }

      case "grep": {
        const resp  = await ws().fetch(new Request("https://ws/files"));
        const files = await resp.json() as Array<{ path: string }>;
        const regex = new RegExp(args.pattern as string, "gm");
        const prefix = (args.path as string) ?? "";
        const matches: string[] = [];
        for (const f of files) {
          if (prefix && !f.path.startsWith(prefix)) continue;
          const fr = await ws().fetch(new Request(
            `https://ws/file?path=${encodeURIComponent(f.path)}`
          ));
          if (!fr.ok) continue;
          const { content = "" } = await fr.json() as { content?: string };
          const lines = content.split("\n");
          lines.forEach((line, i) => {
            if (regex.test(line)) matches.push(`${f.path}:${i + 1}: ${line.trim()}`);
            regex.lastIndex = 0;
          });
          if (matches.length > 50) break;
        }
        return matches.join("\n") || "No matches.";
      }

      case "bash": {
        const command = args.command as string;
        // @ts-ignore
        if (this.env.SANDBOX) {
          try {
            // @ts-ignore
            const sandbox = getSandbox(this.env.SANDBOX as Parameters<typeof getSandbox>[0]);
            const result  = await sandbox.exec(command, { timeout: 30_000 });
            return (result as { stdout?: string; output?: string }).stdout
              ?? (result as { output?: string }).output
              ?? JSON.stringify(result);
          } catch (err) {
            return `Sandbox error: ${err}`;
          }
        }
        return await this.simulateBash(command, sessionId);
      }

      case "ask_ai": {
        const taskType = (args.taskType as string) ?? "reasoning";
        const messages: AiChatMessage[] = [
          { role: "system", content: "You are an expert software engineer. Answer concisely." },
          { role: "user",   content: args.prompt as string },
        ];
        return await this.callAI(messages, sessionId);
      }

      default:
        return `Unknown tool: ${tool}`;
    }
  }

  private async simulateBash(command: string, sessionId: string): Promise<string> {
    const cmd = command.trim();

    if (cmd.startsWith("ls") || cmd.startsWith("find") || cmd === "ls") {
      return this.executeTool("list", { path: "" }, sessionId);
    }
    if (cmd.startsWith("cat ")) {
      const path = cmd.slice(4).trim();
      return this.executeTool("read", { path }, sessionId);
    }
    if (cmd.startsWith("grep ")) {
      const parts = cmd.slice(5).trim().split(" ");
      return this.executeTool("grep", { pattern: parts[0] ?? "", path: parts[1] ?? "" }, sessionId);
    }
    if (cmd.startsWith("echo ")) return cmd.slice(5);
    if (cmd === "pwd") return "/workspace";
    if (cmd === "whoami") return "sovereign-agent";
    if (cmd === "date") return new Date().toISOString();
    if (cmd.startsWith("wc -l ")) {
      const path = cmd.slice(6).trim();
      const content = await this.executeTool("read", { path }, sessionId);
      return String(content.split("\n").length);
    }

    return `[SANDBOX not configured] Command "${cmd}" queued. Enable Cloudflare Containers to execute real commands.`;
  }
}
