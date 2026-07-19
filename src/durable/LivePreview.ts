/**
 * LIVE_PREVIEW — Durable Object
 *
 * Detects the front-end framework from a session's workspace,
 * builds an asset manifest, stores compiled files in R2 (when available),
 * and returns a preview URL.
 *
 * Framework detection priority:
 *   package.json scripts  →  vite | next | nuxt | vue | svelte | angular | remix
 */

import { AppEnv } from "../../server/env.js";

type Framework = "vite" | "next" | "nuxt" | "vue" | "svelte" | "angular" | "remix" | "unknown";

interface FrameworkInfo {
  name: Framework;
  devCommand: string;
  buildCommand: string;
  outDir: string;
  port: number;
}

interface AssetEntry {
  path: string;
  contentType: string;
  size: number;
  r2Key?: string;
}

interface PreviewState {
  sessionId: string;
  framework: FrameworkInfo;
  status: "idle" | "building" | "ready" | "error";
  error?: string;
  previewUrl?: string;
  assets: AssetEntry[];
  preparedAt?: string;
}

const FRAMEWORK_MAP: Record<string, FrameworkInfo> = {
  vite:    { name: "vite",    devCommand: "npx vite",          buildCommand: "npx vite build",     outDir: "dist",          port: 5173 },
  next:    { name: "next",    devCommand: "npx next dev",       buildCommand: "npx next build",     outDir: ".next",         port: 3000 },
  nuxt:    { name: "nuxt",    devCommand: "npx nuxt dev",       buildCommand: "npx nuxt build",     outDir: ".output",       port: 3000 },
  vue:     { name: "vue",     devCommand: "npx vite",          buildCommand: "npx vite build",     outDir: "dist",          port: 5173 },
  svelte:  { name: "svelte",  devCommand: "npx vite",          buildCommand: "npx vite build",     outDir: "dist",          port: 5173 },
  angular: { name: "angular", devCommand: "npx ng serve",       buildCommand: "npx ng build",       outDir: "dist",          port: 4200 },
  remix:   { name: "remix",   devCommand: "npx remix dev",      buildCommand: "npx remix build",    outDir: "build/client",  port: 3000 },
  unknown: { name: "unknown", devCommand: "npx serve .",        buildCommand: "",                   outDir: ".",             port: 3000 },
};

function detectFromPackageJson(pkg: Record<string, unknown>): FrameworkInfo {
  const deps = { ...pkg.dependencies as object, ...pkg.devDependencies as object } as Record<string, string>;
  const scripts = (pkg.scripts ?? {}) as Record<string, string>;
  const allText = JSON.stringify({ deps, scripts }).toLowerCase();

  if (allText.includes("next")) return FRAMEWORK_MAP.next;
  if (allText.includes("nuxt")) return FRAMEWORK_MAP.nuxt;
  if (allText.includes("remix")) return FRAMEWORK_MAP.remix;
  if (allText.includes("angular") || allText.includes("@angular")) return FRAMEWORK_MAP.angular;
  if (allText.includes("svelte")) return FRAMEWORK_MAP.svelte;
  if (allText.includes("vue")) return FRAMEWORK_MAP.vue;
  if (allText.includes("vite")) return FRAMEWORK_MAP.vite;
  return FRAMEWORK_MAP.unknown;
}

function mimeType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    html: "text/html", css: "text/css", js: "application/javascript",
    ts: "application/typescript", json: "application/json",
    svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg",
    jpeg: "image/jpeg", gif: "image/gif", woff2: "font/woff2",
    woff: "font/woff", ico: "image/x-icon", map: "application/json",
  };
  return map[ext] ?? "application/octet-stream";
}

export class LivePreview {
  private state: DurableObjectState;
  private env: AppEnv;

  constructor(state: DurableObjectState, env: AppEnv) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId") ?? "global";
    const { pathname } = url;

    if (request.method === "POST" && pathname === "/prepare") {
      return this.prepare(sessionId);
    }
    if (request.method === "GET" && pathname === "/status") {
      return this.getStatus(sessionId);
    }
    if (request.method === "GET" && pathname === "/manifest") {
      return this.getManifest(sessionId);
    }
    if (request.method === "POST" && pathname === "/deploy") {
      return this.deploy(sessionId);
    }
    return new Response("Not found", { status: 404 });
  }

  // ── /prepare — detect framework from package.json ─────────────────────────
  private async prepare(sessionId: string): Promise<Response> {
    const prev = await this.getState(sessionId);
    const state: PreviewState = prev ?? {
      sessionId, framework: FRAMEWORK_MAP.unknown,
      status: "idle", assets: [],
    };

    if (this.env.SESSION_WORKSPACE) {
      try {
        const wsId = this.env.SESSION_WORKSPACE.idFromName(sessionId);
        const stub = this.env.SESSION_WORKSPACE.get(wsId);
        const resp = await stub.fetch(new Request(
          "https://ws/file?path=package.json"
        ));
        if (resp.ok) {
          const file = await resp.json() as { content?: string };
          if (file.content) {
            const pkg = JSON.parse(file.content) as Record<string, unknown>;
            state.framework = detectFromPackageJson(pkg);
          }
        }
      } catch { /* no package.json — leave as unknown */ }
    }

    state.status     = "ready";
    state.preparedAt = new Date().toISOString();
    await this.saveState(sessionId, state);
    return Response.json({
      ok: true, framework: state.framework.name,
      devCommand: state.framework.devCommand,
      buildCommand: state.framework.buildCommand,
      outDir: state.framework.outDir,
      port: state.framework.port,
    });
  }

  // ── /deploy — push files to R2 ────────────────────────────────────────────
  private async deploy(sessionId: string): Promise<Response> {
    const state = await this.getState(sessionId);
    if (!state) return new Response("Run /prepare first", { status: 400 });

    if (!this.env.FILES_R2) {
      const url = `https://preview.trinityuniverse.org/${sessionId}/index.html`;
      state.previewUrl = url;
      state.status     = "ready";
      await this.saveState(sessionId, state);
      return Response.json({ ok: true, previewUrl: url, note: "R2 not configured; preview URL is a placeholder" });
    }

    if (this.env.SESSION_WORKSPACE) {
      const wsId  = this.env.SESSION_WORKSPACE.idFromName(sessionId);
      const stub  = this.env.SESSION_WORKSPACE.get(wsId);
      const resp  = await stub.fetch(new Request("https://ws/files"));
      const files = await resp.json() as Array<{ path: string; content?: string; size: number }>;

      state.assets = [];
      for (const f of files) {
        const key = `preview/${sessionId}/${f.path}`;
        if (f.content) {
          await this.env.FILES_R2.put(key, f.content, {
            httpMetadata: { contentType: mimeType(f.path) },
          });
          state.assets.push({ path: f.path, contentType: mimeType(f.path), size: f.size, r2Key: key });
        }
      }
    }

    const previewUrl = `https://preview.trinityuniverse.org/${sessionId}/index.html`;
    state.previewUrl = previewUrl;
    state.status     = "ready";
    await this.saveState(sessionId, state);

    return Response.json({ ok: true, previewUrl, assetCount: state.assets.length });
  }

  // ── /status & /manifest ───────────────────────────────────────────────────
  private async getStatus(sessionId: string): Promise<Response> {
    const state = await this.getState(sessionId);
    if (!state) return Response.json({ status: "idle" });
    return Response.json({
      status: state.status, framework: state.framework.name,
      previewUrl: state.previewUrl, preparedAt: state.preparedAt,
    });
  }

  private async getManifest(sessionId: string): Promise<Response> {
    const state = await this.getState(sessionId);
    if (!state) return new Response("Not found", { status: 404 });
    return Response.json(state);
  }

  private async getState(sid: string): Promise<PreviewState | null> {
    return (await this.state.storage.get<PreviewState>(`preview:${sid}`)) ?? null;
  }
  private async saveState(sid: string, s: PreviewState): Promise<void> {
    await this.state.storage.put(`preview:${sid}`, s);
  }
}
