/**
 * FILE_EXPLORER — Durable Object (WebSocket hibernation)
 *
 * Maintains a live view of a session's file tree.
 * Connected clients receive delta events (file_added / file_updated / file_deleted)
 * whenever the workspace changes. Uses DO WebSocket hibernation so idle
 * connections cost zero CPU.
 *
 * Routes:
 *   GET  /ws?sessionId=…      — WebSocket upgrade (live delta stream)
 *   GET  /tree?sessionId=…    — full tree snapshot (REST)
 *   GET  /file?sessionId=…&path=… — single file content (REST)
 *   POST /write               — write file + broadcast delta
 *   DELETE /delete?path=…     — delete file + broadcast delta
 *   POST /scan?sessionId=…    — pull full tree from SESSION_WORKSPACE
 */

import { AppEnv } from "../env.js";

interface FileNode {
  path: string;
  language: string;
  size: number;
  updatedAt: string;
}

type DeltaEvent =
  | { type: "tree_snapshot"; data: FileNode[] }
  | { type: "file_added";   data: FileNode }
  | { type: "file_updated"; data: FileNode }
  | { type: "file_deleted"; data: { path: string } };

export class FileExplorer {
  private state: DurableObjectState;
  private env: AppEnv;

  constructor(state: DurableObjectState, env: AppEnv) {
    this.state = state;
    this.env = env;
  }

  // ── Fetch router ──────────────────────────────────────────────────────────
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    // ── WebSocket upgrade ─────────────────────────────────────────────────
    if (pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket")
        return new Response("Expected WebSocket", { status: 426 });
      const sessionId = url.searchParams.get("sessionId") ?? "global";
      const pair      = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      this.state.acceptWebSocket(server, [`explorer:${sessionId}`]);
      // Send snapshot immediately
      const tree = await this.getTreeFromStorage(sessionId);
      server.send(JSON.stringify({ type: "tree_snapshot", data: tree } satisfies DeltaEvent));
      return new Response(null, { status: 101, webSocket: client });
    }

    // ── REST: full tree snapshot ──────────────────────────────────────────
    if (request.method === "GET" && pathname === "/tree") {
      const sessionId = url.searchParams.get("sessionId") ?? "global";
      const tree = await this.getTreeFromStorage(sessionId);
      return Response.json(tree);
    }

    // ── REST: single file ─────────────────────────────────────────────────
    if (request.method === "GET" && pathname === "/file") {
      const sessionId = url.searchParams.get("sessionId") ?? "global";
      const path      = url.searchParams.get("path");
      if (!path) return new Response("Missing path", { status: 400 });
      if (!this.env.SESSION_WORKSPACE) return new Response("No workspace binding", { status: 503 });
      const wsId  = this.env.SESSION_WORKSPACE.idFromName(sessionId);
      const stub  = this.env.SESSION_WORKSPACE.get(wsId);
      return stub.fetch(new Request(`https://ws/file?path=${encodeURIComponent(path)}`));
    }

    // ── REST: write file + broadcast ──────────────────────────────────────
    if (request.method === "POST" && pathname === "/write") {
      const { sessionId = "global", path, content } =
        await request.json() as { sessionId?: string; path: string; content: string };

      if (this.env.SESSION_WORKSPACE) {
        const wsId = this.env.SESSION_WORKSPACE.idFromName(sessionId);
        const stub = this.env.SESSION_WORKSPACE.get(wsId);
        await stub.fetch(new Request("https://ws/file", {
          method: "POST",
          body: JSON.stringify({ path, content }),
          headers: { "Content-Type": "application/json" },
        }));
      }

      // Update local tree cache
      const tree  = await this.getTreeFromStorage(sessionId);
      const existing = tree.find(f => f.path === path);
      const node: FileNode = {
        path, language: detectLanguage(path),
        size: new TextEncoder().encode(content).length,
        updatedAt: new Date().toISOString(),
      };
      if (existing) { Object.assign(existing, node); }
      else          { tree.push(node); }
      await this.state.storage.put(`tree:${sessionId}`, tree);

      // Broadcast delta
      const event: DeltaEvent = existing
        ? { type: "file_updated", data: node }
        : { type: "file_added",   data: node };
      this.broadcastToSession(sessionId, event);

      return Response.json({ ok: true });
    }

    // ── REST: delete file + broadcast ─────────────────────────────────────
    if (request.method === "DELETE" && pathname === "/delete") {
      const sessionId = url.searchParams.get("sessionId") ?? "global";
      const path      = url.searchParams.get("path");
      if (!path) return new Response("Missing path", { status: 400 });

      if (this.env.SESSION_WORKSPACE) {
        const wsId = this.env.SESSION_WORKSPACE.idFromName(sessionId);
        const stub = this.env.SESSION_WORKSPACE.get(wsId);
        await stub.fetch(new Request(
          `https://ws/file?path=${encodeURIComponent(path)}`, { method: "DELETE" }
        ));
      }

      let tree = await this.getTreeFromStorage(sessionId);
      tree = tree.filter(f => f.path !== path);
      await this.state.storage.put(`tree:${sessionId}`, tree);
      this.broadcastToSession(sessionId, { type: "file_deleted", data: { path } });
      return Response.json({ ok: true });
    }

    // ── REST: pull full tree from SESSION_WORKSPACE ───────────────────────
    if (request.method === "POST" && pathname === "/scan") {
      const sessionId = url.searchParams.get("sessionId") ?? "global";
      if (!this.env.SESSION_WORKSPACE) return new Response("No workspace binding", { status: 503 });
      const wsId  = this.env.SESSION_WORKSPACE.idFromName(sessionId);
      const stub  = this.env.SESSION_WORKSPACE.get(wsId);
      const resp  = await stub.fetch(new Request("https://ws/files"));
      const files = await resp.json() as FileNode[];
      await this.state.storage.put(`tree:${sessionId}`, files);
      this.broadcastToSession(sessionId, { type: "tree_snapshot", data: files });
      return Response.json({ ok: true, count: files.length });
    }

    return new Response("Not found", { status: 404 });
  }

  // ── WebSocket hibernation callbacks ───────────────────────────────────────
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      const msg = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
      if (msg.type === "ping") ws.send(JSON.stringify({ type: "pong" }));
    } catch { /* ignore malformed */ }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    ws.close(1000, "closed");
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private async getTreeFromStorage(sessionId: string): Promise<FileNode[]> {
    return (await this.state.storage.get<FileNode[]>(`tree:${sessionId}`)) ?? [];
  }

  private broadcastToSession(sessionId: string, event: DeltaEvent): void {
    const tag = `explorer:${sessionId}`;
    const payload = JSON.stringify(event);
    for (const ws of this.state.getWebSockets(tag)) {
      try { ws.send(payload); } catch { /* stale connection */ }
    }
  }
}

function detectLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rb: "ruby", rs: "rust", go: "go", java: "java",
    cs: "csharp", cpp: "cpp", c: "c", html: "html", css: "css",
    json: "json", yaml: "yaml", yml: "yaml", md: "markdown", sh: "bash",
    toml: "toml", sql: "sql",
  };
  return map[ext] ?? "plaintext";
}
