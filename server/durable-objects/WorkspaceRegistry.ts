/**
 * WORKSPACE_REGISTRY — Durable Object (global singleton)
 *
 * Maps userId → { sessionId, workspaceName, createdAt, lastAccessed }.
 * Always accessed via idFromName("global") so there is exactly one instance.
 *
 * Routes:
 *   GET    /sessions                  — all registered sessions
 *   GET    /session?userId=…          — lookup session for a user
 *   POST   /session                   — register { userId, sessionId, name? }
 *   DELETE /session?userId=…          — unregister user
 *   POST   /session/touch             — update lastAccessed timestamp
 *   GET    /stats                     — total counts
 */

import { AppEnv } from "../env.js";

interface SessionEntry {
  userId: string;
  sessionId: string;
  workspaceName: string;
  createdAt: string;
  lastAccessed: string;
}

export class WorkspaceRegistry {
  private state: DurableObjectState;
  private env: AppEnv;

  constructor(state: DurableObjectState, env: AppEnv) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "GET" && pathname === "/sessions") {
      const all = await this.allSessions();
      return Response.json(all);
    }

    if (request.method === "GET" && pathname === "/session") {
      const userId = url.searchParams.get("userId");
      if (!userId) return new Response("Missing userId", { status: 400 });
      const entry = await this.state.storage.get<SessionEntry>(`session:${userId}`);
      if (!entry) return new Response("Not found", { status: 404 });
      return Response.json(entry);
    }

    if (request.method === "POST" && pathname === "/session") {
      const { userId, sessionId, name } = await request.json() as {
        userId: string; sessionId: string; name?: string;
      };
      const entry: SessionEntry = {
        userId, sessionId,
        workspaceName: name ?? `workspace-${Date.now()}`,
        createdAt: new Date().toISOString(),
        lastAccessed: new Date().toISOString(),
      };
      await this.state.storage.put(`session:${userId}`, entry);
      // keep an index of all userIds
      const index = await this.state.storage.get<string[]>("index") ?? [];
      if (!index.includes(userId)) {
        index.push(userId);
        await this.state.storage.put("index", index);
      }
      return Response.json({ ok: true, entry });
    }

    if (request.method === "DELETE" && pathname === "/session") {
      const userId = url.searchParams.get("userId");
      if (!userId) return new Response("Missing userId", { status: 400 });
      await this.state.storage.delete(`session:${userId}`);
      const index = (await this.state.storage.get<string[]>("index") ?? [])
        .filter(id => id !== userId);
      await this.state.storage.put("index", index);
      return Response.json({ ok: true });
    }

    if (request.method === "POST" && pathname === "/session/touch") {
      const { userId } = await request.json() as { userId: string };
      const entry = await this.state.storage.get<SessionEntry>(`session:${userId}`);
      if (entry) {
        entry.lastAccessed = new Date().toISOString();
        await this.state.storage.put(`session:${userId}`, entry);
      }
      return Response.json({ ok: true });
    }

    if (request.method === "GET" && pathname === "/stats") {
      const index = await this.state.storage.get<string[]>("index") ?? [];
      return Response.json({ totalSessions: index.length });
    }

    return new Response("Not found", { status: 404 });
  }

  private async allSessions(): Promise<SessionEntry[]> {
    const index = await this.state.storage.get<string[]>("index") ?? [];
    const results: SessionEntry[] = [];
    for (const userId of index) {
      const e = await this.state.storage.get<SessionEntry>(`session:${userId}`);
      if (e) results.push(e);
    }
    return results;
  }
}
