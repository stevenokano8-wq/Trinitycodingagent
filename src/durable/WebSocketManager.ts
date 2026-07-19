/**
 * WEBSOCKET_MANAGER — Durable Object (Agent-based WebSocket hub)
 *
 * Central real-time hub using @cloudflare/agents Agent base class.
 * The Agent class provides built-in WebSocket connection management,
 * hibernation support, and state synchronization via partyserver.
 */

import { Agent, Connection } from "@cloudflare/agents";
import { AppEnv } from "../../server/env.js";

interface ClientMeta {
  userId?: string;
  sessionId: string;
  topics: string[];
  connectedAt: string;
}

interface BroadcastRequest {
  /** If set, only send to clients in this session */
  sessionId?: string;
  /** If set, only send to clients subscribed to this topic */
  topic?: string;
  /** The message payload (any JSON-serialisable value) */
  message: unknown;
}

export class WebSocketManager extends Agent<AppEnv> {
  // ── Agent WebSocket callbacks ─────────────────────────────────────────────

  async onConnect(connection: Connection<ClientMeta>): Promise<void> {
    const meta: ClientMeta = {
      sessionId:   connection.id, // fallback
      topics:      [],
      connectedAt: new Date().toISOString(),
    };
    connection.setState(meta);
    connection.send(JSON.stringify({ type: "connected", connectionId: connection.id }));
  }

  async onMessage(connection: Connection<ClientMeta>, raw: string): Promise<void> {
    let msg: unknown;
    try { msg = JSON.parse(raw); } catch { return; }

    const data = msg as Record<string, unknown>;

    if (data.type === "ping") {
      connection.send(JSON.stringify({ type: "pong", ts: Date.now() }));
      return;
    }

    // Client announces its session + optional topics
    if (data.type === "identify") {
      const prev = connection.state ?? {} as Partial<ClientMeta>;
      connection.setState({
        ...prev,
        userId:    data.userId as string | undefined,
        sessionId: (data.sessionId as string) ?? prev.sessionId ?? connection.id,
        topics:    Array.isArray(data.topics) ? (data.topics as string[]) : (prev.topics ?? []),
        connectedAt: prev.connectedAt ?? new Date().toISOString(),
      } as ClientMeta);
      connection.send(JSON.stringify({ type: "identified", ok: true }));
      return;
    }

    // Client subscribes/unsubscribes to topics
    if (data.type === "subscribe") {
      const prev = connection.state ?? {} as Partial<ClientMeta>;
      const topics = [...(prev.topics ?? []), ...(data.topics as string[] ?? [])];
      connection.setState({ ...prev, topics } as ClientMeta);
      return;
    }

    if (data.type === "unsubscribe") {
      const prev = connection.state ?? {} as Partial<ClientMeta>;
      const rm   = new Set<string>(data.topics as string[] ?? []);
      connection.setState({ ...prev, topics: (prev.topics ?? []).filter(t => !rm.has(t)) } as ClientMeta);
      return;
    }

    // Relay: client wants to send to others in same session
    if (data.type === "relay") {
      const meta = connection.state as ClientMeta | undefined;
      if (!meta) return;
      for (const c of this.getConnections<ClientMeta>()) {
        if (c.id !== connection.id && c.state?.sessionId === meta.sessionId) {
          c.send(JSON.stringify({ type: "relay", from: connection.id, payload: data.payload }));
        }
      }
    }
  }

  async onClose(connection: Connection<ClientMeta>): Promise<void> {
    const meta = connection.state as ClientMeta | undefined;
    if (!meta) return;
    for (const c of this.getConnections<ClientMeta>()) {
      if (c.state?.sessionId === meta.sessionId) {
        c.send(JSON.stringify({ type: "peer_disconnected", connectionId: connection.id }));
      }
    }
  }

  // ── REST handler (override Agent fetch for non-WS paths) ─────────────────
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Server-side broadcast
    if (request.method === "POST" && url.pathname === "/broadcast") {
      const { sessionId, topic, message } = await request.json() as BroadcastRequest;
      const payload = JSON.stringify({ type: "broadcast", message });
      let sent = 0;

      for (const conn of this.getConnections<ClientMeta>()) {
        const meta = conn.state as ClientMeta | undefined;
        if (!meta) continue;
        const matchSession = !sessionId || meta.sessionId === sessionId;
        const matchTopic   = !topic     || meta.topics.includes(topic);
        if (matchSession && matchTopic) {
          conn.send(payload);
          sent++;
        }
      }
      return Response.json({ ok: true, sent });
    }

    // List connections
    if (request.method === "GET" && url.pathname === "/connections") {
      const conns = [...this.getConnections<ClientMeta>()].map(c => ({
        id:          c.id,
        sessionId:   c.state?.sessionId,
        userId:      c.state?.userId,
        topics:      c.state?.topics ?? [],
        connectedAt: c.state?.connectedAt,
      }));
      return Response.json({ count: conns.length, connections: conns });
    }

    // Delegate WS upgrades and Agent state syncing to base class
    return super.fetch(request);
  }
}
