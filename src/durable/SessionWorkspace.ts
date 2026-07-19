/**
 * SESSION_WORKSPACE — Durable Object
 *
 * Per-session isolated workspace. Session A cannot read Session B's data.
 *
 * Storage layout in DO KV:
 *   cred:enc          → AES-GCM encrypted JSON blob of credentials
 *   file:<path>       → { content, language, size, updatedAt }
 *   meta:fileIndex    → string[] of all known paths
 */

import { AppEnv } from "../../server/env.js";

interface Credentials {
  githubToken?: string;
  repoUrl?: string;
  [key: string]: string | undefined;
}

interface FileEntry {
  content: string;
  language: string;
  size: number;
  updatedAt: string;
}

function detectLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rb: "ruby", rs: "rust", go: "go", java: "java",
    cs: "csharp", cpp: "cpp", c: "c", html: "html", css: "css",
    json: "json", yaml: "yaml", yml: "yaml", md: "markdown", sh: "bash",
    toml: "toml", sql: "sql", graphql: "graphql",
  };
  return map[ext] ?? "plaintext";
}

export class SessionWorkspace {
  private state: DurableObjectState;
  private env: AppEnv;
  private encKey: CryptoKey | null = null;

  constructor(state: DurableObjectState, env: AppEnv) {
    this.state = state;
    this.env = env;
  }

  // ── AES-GCM key derived from DO id ────────────────────────────────────────
  private async getKey(): Promise<CryptoKey> {
    if (this.encKey) return this.encKey;
    const seed = this.state.id.toString().padEnd(32, "0").slice(0, 32);
    const km = await crypto.subtle.importKey("raw", new TextEncoder().encode(seed),
      { name: "PBKDF2" }, false, ["deriveKey"]);
    this.encKey = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: new TextEncoder().encode("sovereign-ws-v1"),
        iterations: 100_000, hash: "SHA-256" },
      km, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    return this.encKey;
  }

  private async encrypt(plain: string): Promise<string> {
    const key = await this.getKey();
    const iv  = crypto.getRandomValues(new Uint8Array(12));
    const ct  = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key,
      new TextEncoder().encode(plain));
    const out = new Uint8Array(12 + ct.byteLength);
    out.set(iv); out.set(new Uint8Array(ct), 12);
    return btoa(String.fromCharCode(...out));
  }

  private async decrypt(blob: string): Promise<string> {
    const key = await this.getKey();
    const buf = Uint8Array.from(atob(blob), c => c.charCodeAt(0));
    const pt  = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) },
      key, buf.slice(12));
    return new TextDecoder().decode(pt);
  }

  // ── Fetch handler ─────────────────────────────────────────────────────────
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "POST" && pathname === "/credentials") {
      const creds = await request.json() as Credentials;
      const enc   = await this.encrypt(JSON.stringify(creds));
      await this.state.storage.put("cred:enc", enc);
      return Response.json({ ok: true });
    }

    if (request.method === "GET" && pathname === "/credentials") {
      const enc = await this.state.storage.get<string>("cred:enc");
      if (!enc) return Response.json({});
      const creds = JSON.parse(await this.decrypt(enc)) as Credentials;
      return Response.json(creds);
    }

    if (request.method === "GET" && pathname === "/files") {
      const index = await this.state.storage.get<string[]>("meta:fileIndex") ?? [];
      const entries: Array<{ path: string; language: string; size: number; updatedAt: string }> = [];
      for (const p of index) {
        const f = await this.state.storage.get<FileEntry>(`file:${p}`);
        if (f) entries.push({ path: p, language: f.language, size: f.size, updatedAt: f.updatedAt });
      }
      return Response.json(entries);
    }

    if (request.method === "GET" && pathname === "/file") {
      const path = url.searchParams.get("path");
      if (!path) return new Response("Missing path", { status: 400 });
      const f = await this.state.storage.get<FileEntry>(`file:${path}`);
      if (!f) return new Response("Not found", { status: 404 });
      return Response.json({ path, ...f });
    }

    if (request.method === "POST" && pathname === "/file") {
      const { path, content } = await request.json() as { path: string; content: string };
      if (!path) return new Response("Missing path", { status: 400 });
      const entry: FileEntry = {
        content,
        language: detectLanguage(path),
        size: new TextEncoder().encode(content).length,
        updatedAt: new Date().toISOString(),
      };
      await this.state.storage.put(`file:${path}`, entry);
      const index = await this.state.storage.get<string[]>("meta:fileIndex") ?? [];
      if (!index.includes(path)) {
        index.push(path);
        await this.state.storage.put("meta:fileIndex", index);
      }
      return Response.json({ ok: true, path, size: entry.size });
    }

    if (request.method === "DELETE" && pathname === "/file") {
      const path = url.searchParams.get("path");
      if (!path) return new Response("Missing path", { status: 400 });
      await this.state.storage.delete(`file:${path}`);
      const index = (await this.state.storage.get<string[]>("meta:fileIndex") ?? [])
        .filter(p => p !== path);
      await this.state.storage.put("meta:fileIndex", index);
      return Response.json({ ok: true });
    }

    if (request.method === "DELETE" && pathname === "/workspace") {
      await this.state.storage.deleteAll();
      return Response.json({ ok: true });
    }

    if (request.method === "GET" && pathname === "/info") {
      const index = await this.state.storage.get<string[]>("meta:fileIndex") ?? [];
      return Response.json({ fileCount: index.length, sessionId: this.state.id.toString() });
    }

    return new Response("Not found", { status: 404 });
  }
}
