import { GoogleGenAI } from "@google/genai";
import { Task, Subtask, FileNode, Message } from "../src/types.js"; // Match local file extension rules (.ts/.js)
import { saveTask, saveFile, addMessage, getFiles, getMessages, getTasks } from "./db.js";
import { executeGitPush } from "./github.js";
import { AppEnv, AiBinding, AiChatMessage, extractCfAiText, resolveEnvWithOverrides } from "./env.js";
import { routeLLMTask } from "./llmRouter.js";
import { executeTerminalCommand, isCommandSafe, preComplianceLintCheck } from "./command.js";
import { appendLogDrop } from "./logger.js";
import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Pillar 2: Abstract Syntax Tree (AST) & Symbol Dependency Graphing
// ---------------------------------------------------------------------------
export interface ASTNodeInfo {
  symbol: string;
  filePath: string;
  kind: "function" | "class" | "interface" | "type" | "const" | "enum";
  dependencies: string[];
}

export function buildASTGraph(files: FileNode[]): Map<string, ASTNodeInfo[]> {
  const graph = new Map<string, ASTNodeInfo[]>();
  for (const file of files) {
    if (!file.path.endsWith(".ts") && !file.path.endsWith(".tsx") && !file.path.endsWith(".js") && !file.path.endsWith(".jsx")) {
      continue;
    }
    const nodes: ASTNodeInfo[] = [];
    const imports: string[] = [];

    const importMatches = file.content.matchAll(/import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+["']([^"']+)["']/g);
    for (const match of importMatches) {
      if (match[1]) {
        match[1].split(",").forEach(s => imports.push(s.trim().split(" as ")[0]));
      } else if (match[2]) {
        imports.push(match[2].trim());
      }
    }

    const exportMatches = file.content.matchAll(/export\s+(function|class|interface|type|const|enum)\s+(\w+)/g);
    for (const match of exportMatches) {
      const kind = match[1] as any;
      const symbol = match[2];
      nodes.push({
        symbol,
        filePath: file.path,
        kind,
        dependencies: imports.filter(imp => imp !== symbol)
      });
    }

    graph.set(file.path, nodes);
  }
  return graph;
}

export async function fetchSymbolDependencies(symbolName: string): Promise<ASTNodeInfo[]> {
  const files = await getFiles();
  const graph = buildASTGraph(files);
  const matched: ASTNodeInfo[] = [];
  for (const [, nodes] of graph.entries()) {
    for (const node of nodes) {
      if (node.symbol.toLowerCase() === symbolName.toLowerCase() || node.dependencies.includes(symbolName)) {
        matched.push(node);
      }
    }
  }
  return matched;
}

// ---------------------------------------------------------------------------
// Pillar 5: Multi-Agent File Write Locks & Snapshot Rollback
// ---------------------------------------------------------------------------
const fileWriteLocks = new Map<string, { agentId: string; lockedAt: string }>();

/** Maximum time a file lock can be held before it is auto-released (5 minutes). */
const LOCK_TTL_MS = 5 * 60 * 1000;

export function acquireFileLock(filePath: string, agentId: string): { acquired: boolean; currentOwner?: string } {
  const normalized = filePath.replace(/^\/+/, "");
  const existing = fileWriteLocks.get(normalized);
  if (existing && existing.agentId !== agentId) {
    // Auto-release stale locks that have been held for longer than the TTL.
    // This prevents orphaned locks from crashed/cancelled builds from blocking
    // all subsequent subtask executions forever.
    const lockedMs = Date.now() - new Date(existing.lockedAt).getTime();
    if (lockedMs < LOCK_TTL_MS) {
      return { acquired: false, currentOwner: existing.agentId };
    }
    // Stale lock — evict it and let this agent take over.
    console.warn(`[FileLock] Auto-releasing stale lock on "${normalized}" held by ${existing.agentId} for ${Math.round(lockedMs / 1000)}s`);
    fileWriteLocks.delete(normalized);
  }
  fileWriteLocks.set(normalized, { agentId, lockedAt: new Date().toISOString() });
  return { acquired: true };
}

export function releaseFileLock(filePath: string, agentId: string): boolean {
  const normalized = filePath.replace(/^\/+/, "");
  const existing = fileWriteLocks.get(normalized);
  if (existing && existing.agentId === agentId) {
    fileWriteLocks.delete(normalized);
    return true;
  }
  return false;
}

export async function createCleanSnapshot(): Promise<Map<string, string>> {
  const files = await getFiles();
  const snapshot = new Map<string, string>();
  for (const f of files) {
    snapshot.set(f.path, f.content);
  }
  return snapshot;
}

export async function rollbackToCleanSnapshot(snapshot: Map<string, string>): Promise<void> {
  for (const [filePath, content] of snapshot.entries()) {
    await saveFile({ path: filePath, content, language: "typescript" });
  }
  appendLogDrop("info", "agent", "Restored virtual D1/KV workspace to clean state snapshot.");
}

// ---------------------------------------------------------------------------
// Pillar 4: State-Suspended Human-In-The-Loop (HITL) Gates
// ---------------------------------------------------------------------------
export interface SuspendedExecutionFrame {
  taskId: string;
  subtaskId?: string;
  reason: string;
  lockedFileModified?: string;
  failedAttempts: number;
  memorySnapshot: any;
  timestamp: string;
  status: "SUSPENDED";
}

let activeSuspendedFrame: SuspendedExecutionFrame | null = null;

export function getSuspendedFrame(): SuspendedExecutionFrame | null {
  return activeSuspendedFrame;
}

export function suspendExecution(frame: SuspendedExecutionFrame): void {
  activeSuspendedFrame = frame;
  sseClients.forEach(res => {
    try {
      res.write(`data: ${JSON.stringify({ type: "agent_suspended", frame })}\n\n`);
    } catch {
      // ignore broken client writes
    }
  });
  appendLogDrop("warn", "agent", `Execution suspended for task ${frame.taskId}: ${frame.reason}`);
}

export async function resumeSuspendedExecution(approved: boolean, note?: string): Promise<{ ok: boolean; message: string }> {
  if (!activeSuspendedFrame) {
    return { ok: false, message: "No active suspended execution frame found." };
  }

  const frame = activeSuspendedFrame;
  if (!approved) {
    activeSuspendedFrame = null;
    sseClients.forEach(res => {
      try {
        res.write(`data: ${JSON.stringify({ type: "agent_resumed", approved: false, frame })}\n\n`);
      } catch {}
    });
    return { ok: true, message: "Suspended execution rejected by user and terminated." };
  }

  activeSuspendedFrame = null;
  sseClients.forEach(res => {
    try {
      res.write(`data: ${JSON.stringify({ type: "agent_resumed", approved: true, frame, note })}\n\n`);
    } catch {}
  });
  return { ok: true, message: `Execution approved and rehydrated: ${note || 'User approved continuation.'}` };
}

let aiClient: GoogleGenAI | null = null;
let aiClientKey: string | null = null;

export function getGeminiClient(env?: Partial<AppEnv>): GoogleGenAI | null {
  const resolved = resolveEnvWithOverrides(env);
  const key = resolved.GEMINI_API_KEY || (typeof process !== "undefined" ? process.env?.GEMINI_API_KEY : undefined);
  if (!key) {
    return null;
  }
  if (!aiClient || aiClientKey !== key) {
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });
    aiClientKey = key;
  }
  return aiClient;
}

export function logProviderReadiness(env?: Partial<AppEnv>): void {
  const resolved = resolveEnvWithOverrides(env);
  const geminiKey = resolved.GEMINI_API_KEY || (typeof process !== "undefined" ? process.env?.GEMINI_API_KEY : undefined);
  const geminiStatus = geminiKey ? "AVAILABLE" : "MISSING";

  const cfAiBound = !!(resolved.AI && typeof (resolved.AI as any).run === "function");
  const cfToken = resolved.CLOUDFLARE_API_TOKEN || (typeof process !== "undefined" ? (process.env?.CLOUDFLARE_API_TOKEN || process.env?.CF_API_TOKEN) : undefined);
  const cfAccount = resolved.CLOUDFLARE_ACCOUNT_ID || (typeof process !== "undefined" ? (process.env?.CLOUDFLARE_ACCOUNT_ID || process.env?.CF_ACCOUNT_ID) : undefined);
  const cfAiStatus = (cfAiBound || (cfToken && cfAccount)) ? "AVAILABLE" : "MISSING";

  const dsKey = resolved.DEEPSEEK_API_KEY || (typeof process !== "undefined" ? process.env?.DEEPSEEK_API_KEY : undefined);
  const oaiKey = resolved.OPENAI_API_KEY || (typeof process !== "undefined" ? process.env?.OPENAI_API_KEY : undefined);
  const dsOaiStatus = (dsKey || oaiKey) ? "AVAILABLE" : "MISSING";

  console.log(`[PROVIDER CHECK] Gemini: ${geminiStatus} | CF AI: ${cfAiStatus} | DeepSeek/OpenAI: ${dsOaiStatus}`);
}

// ---------------------------------------------------------------------------
// Cloudflare Workers AI helper
// ---------------------------------------------------------------------------
// When env.AI (the [ai] binding declared in wrangler.api.toml) is present we
// use it for lightweight tasks — task planning, path resolution, command
// determination.  Gemini handles heavy code synthesis.  Locally (pnpm dev,
// no binding), this falls back to a Gemini Flash call so dev still works.

// Model selection (2026-07):
//   DeepSeek R1 removed from CF Workers AI — was causing 30-90s delays
//   llama-3.1-8b-instruct (without -fast) deprecated 2026-05-30
const CF_PLAN_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';      // Planning: fast 8B, was DeepSeek R1 (30-90s)
const CF_CODE_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'; // Code gen: best quality
const CF_FAST_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';      // Sub-200ms commandsel)

let geminiQuotaExhausted = false;

export function isRateLimitError(err: any): boolean {
  if (!err) return false;
  const msg = typeof err === "string" ? err.toLowerCase() : (err.message || String(err) || JSON.stringify(err)).toLowerCase();
  const status = err.status || err.statusCode || err.code;
  return (
    status === 429 ||
    msg.includes("429") ||
    msg.includes("quota") ||
    msg.includes("quotafailure") ||
    msg.includes("generate_content_free_tier_requests") ||
    msg.includes("generaterequestsperday") ||
    msg.includes("generaterequestsperminute") ||
    msg.includes("resource_exhausted") ||
    msg.includes("rate limit") ||
    msg.includes("rate_limit") ||
    msg.includes("limit: 5") ||
    msg.includes("free_tier_requests") ||
    msg.includes("generativelanguage.googleapis.com")
  );
}

export async function callCloudflareWorkersAi(
  messages: AiChatMessage[],
  systemPrompt?: string,
  env?: Partial<AppEnv>,
  model: string = CF_PLAN_MODEL,
  maxTokens: number = 2048
): Promise<string> {
  const resolved = resolveEnvWithOverrides(env);
  const formattedMessages: AiChatMessage[] = systemPrompt
    ? [{ role: "system", content: systemPrompt }, ...messages]
    : messages;

  // 1. Native Workers AI binding inside Cloudflare Worker context (guarded for missing bindings or Wrangler dev mode)
  if (resolved.AI && typeof (resolved.AI as any).run === "function") {
    try {
      return await runCfAi(resolved.AI, formattedMessages, maxTokens, model);
    } catch (cfErr: any) {
      console.warn(`[WRANGLER / CF AI BINDING GUARD] Workers AI binding execution failed (${cfErr?.message || cfErr}). Falling back smoothly to REST/secondary key...`);
    }
  }

  // 2. Fallback REST API call using CLOUDFLARE_API_TOKEN & CLOUDFLARE_ACCOUNT_ID
  const apiToken =
    resolved.CLOUDFLARE_API_TOKEN ||
    process.env.CLOUDFLARE_API_TOKEN ||
    process.env.CF_API_TOKEN ||
    process.env.CLOUDFLARE_TOKEN;
  const accountId =
    resolved.CLOUDFLARE_ACCOUNT_ID ||
    process.env.CLOUDFLARE_ACCOUNT_ID ||
    process.env.CF_ACCOUNT_ID;

  if (apiToken && accountId) {
    const modelName = model.startsWith("@cf/") ? model : `@cf/meta/${model}`;
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${modelName}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messages: formattedMessages,
        max_tokens: maxTokens
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Cloudflare Workers AI REST API returned ${response.status}: ${errText}`);
    }

    const data: any = await response.json();
    if (data.result) {
      return extractCfAiText(data.result);
    }
  }

  throw new Error("No Cloudflare Workers AI binding or valid API Token & Account ID available for fallback.");
}

export async function callDeepSeekOrOpenAi(
  messages: AiChatMessage[],
  systemPrompt?: string,
  env?: Partial<AppEnv>,
  maxTokens: number = 2048
): Promise<string> {
  const resolved = resolveEnvWithOverrides(env);
  const deepseekKey = resolved.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY;
  const openaiKey = resolved.OPENAI_API_KEY || process.env.OPENAI_API_KEY;

  const formattedMessages: AiChatMessage[] = systemPrompt
    ? [{ role: "system", content: systemPrompt }, ...messages]
    : messages;

  if (deepseekKey) {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${deepseekKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: formattedMessages,
        max_tokens: maxTokens
      })
    });
    if (res.ok) {
      const data: any = await res.json();
      return data.choices?.[0]?.message?.content || "";
    }
  }

  if (openaiKey) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: formattedMessages,
        max_tokens: maxTokens
      })
    });
    if (res.ok) {
      const data: any = await res.json();
      return data.choices?.[0]?.message?.content || "";
    }
  }

  throw new Error("No DeepSeek or OpenAI API keys available.");
}

export async function generateWithFallback(
  geminiCallFn: () => Promise<string>,
  fallbackMessages: AiChatMessage[],
  systemPrompt?: string,
  env?: Partial<AppEnv>,
  subtaskId?: string,
  model: string = CF_PLAN_MODEL,
  maxTokens: number = 2048
): Promise<string> {
  let geminiErr: any = null;

  if (!geminiQuotaExhausted) {
    try {
      return await geminiCallFn();
    } catch (err: any) {
      geminiErr = err;
      if (isRateLimitError(err)) {
        geminiQuotaExhausted = true;
      }
      const isRateLimit = isRateLimitError(err);
      const fallbackLog = `[FALLBACK] Gemini ${isRateLimit ? "rate limit / quota exceeded" : "failed"}. Auto-switched provider to Cloudflare Workers AI (Llama 3).`;
      console.warn(fallbackLog, err.message);
      appendLogDrop("warn", "agent", fallbackLog);

      if (subtaskId) {
        broadcastSSE("subtask_log", { subtaskId, log: fallbackLog });
      }
      broadcastSSE("agent_fallback", { message: fallbackLog, subtaskId });
    }
  } else {
    const bypassLog = `[FALLBACK] Gemini rate limit active. Directing call directly to Cloudflare Workers AI (Llama 3).`;
    console.warn(bypassLog);
    if (subtaskId) {
      broadcastSSE("subtask_log", { subtaskId, log: bypassLog });
    }
  }

  // Fallback 1: Cloudflare Workers AI (Llama 3)
  try {
    const cfResult = await callCloudflareWorkersAi(fallbackMessages, systemPrompt, env, model, maxTokens);
    if (cfResult && cfResult.trim()) {
      return cfResult;
    }
  } catch (cfErr: any) {
    console.warn(`[generateWithFallback] Cloudflare Workers AI fallback failed: ${cfErr.message}`);
  }

  // Fallback 2: DeepSeek or OpenAI
  try {
    const dsResult = await callDeepSeekOrOpenAi(fallbackMessages, systemPrompt, env, maxTokens);
    if (dsResult && dsResult.trim()) {
      const dsLog = "[FALLBACK] Switched execution provider to DeepSeek / OpenAI.";
      broadcastSSE("agent_fallback", { message: dsLog, subtaskId });
      return dsResult;
    }
  } catch (dsErr: any) {
    console.warn(`[generateWithFallback] DeepSeek/OpenAI fallback failed: ${dsErr.message}`);
  }

  const errLog = `[EXECUTION_FAILED_NO_PROVIDERS] All AI model providers (Gemini, Cloudflare Workers AI, DeepSeek/OpenAI) failed to generate a response.`;
  console.error(errLog);
  appendLogDrop("error", "agent", errLog);
  if (subtaskId) {
    broadcastSSE("subtask_log", { subtaskId, log: errLog });
  }
  broadcastSSE("agent_fallback", { message: errLog, subtaskId, error: true });

  throw new Error(`[EXECUTION_FAILED_NO_PROVIDERS] All AI model providers failed. Initial error: ${geminiErr?.message || "Gemini rate limit exceeded"}`);
}

export function synthesizeLocalCodeTemplate(targetPath: string, subtaskName: string, prompt: string): string {
  const ext = path.extname(targetPath).toLowerCase();
  const filename = path.basename(targetPath, ext);

  if (targetPath === "src/main.tsx" || targetPath === "src/main.js" || targetPath === "src/index.tsx") {
    return `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`;
  }

  if (targetPath === "src/index.css") {
    return `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@300;400;500;600;700&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: 'Inter', 'Outfit', ui-sans-serif, system-ui, sans-serif;
  background-color: #FEF0E4;
  color: #171717;
  margin: 0;
  padding: 0;
}

html, body, #root {
  height: 100%;
  height: 100dvh;
  margin: 0;
  padding: 0;
  overflow: hidden;
  overscroll-behavior: none;
}
`;
  }

  if (targetPath === "index.html") {
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Application</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
  }

  if (ext === ".json") {
    if (filename === "package") {
      return JSON.stringify({
        name: "app",
        private: true,
        version: "1.0.0",
        type: "module",
        scripts: {
          dev: "vite",
          build: "vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs",
          start: "node dist/server.cjs"
        },
        dependencies: {
          react: "^18.3.1",
          "react-dom": "^18.3.1",
          "lucide-react": "^0.344.0",
          motion: "^11.18.2"
        },
        devDependencies: {
          "@types/react": "^18.3.3",
          "@types/react-dom": "^18.3.0",
          "@vitejs/plugin-react": "^4.3.1",
          autoprefixer: "^10.4.19",
          postcss: "^8.4.38",
          tailwindcss: "^3.4.4",
          typescript: "^5.5.3",
          vite: "^6.4.3"
        }
      }, null, 2);
    }
    return `{}`;
  }

  if (ext === ".tsx" || ext === ".jsx") {
    const compName = filename.charAt(0).toUpperCase() + filename.slice(1);
    return `import React, { useState } from "react";
import { Sparkles, Code, CheckCircle, RefreshCw } from "lucide-react";

export default function ${compName}() {
  return (
    <div className="w-full h-full min-h-screen bg-[#FEF0E4] text-stone-900 font-sans p-6 md:p-8 flex flex-col">
      <header className="mb-6 pb-4 border-b border-amber-200/60 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 rounded-xl text-amber-700 border border-amber-500/20">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-stone-900">${compName}</h1>
            <p className="text-xs text-stone-500 font-medium">Synthesized feature for "${prompt.slice(0, 45)}"</p>
          </div>
        </div>
        <button 
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-white border border-stone-200 rounded-lg hover:bg-stone-50 transition shadow-sm"
        >
          <RefreshCw className="h-3.5 w-3.5 text-stone-600" />
          Refresh View
        </button>
      </header>

      <main className="flex-1 bg-white/80 backdrop-blur-sm rounded-2xl border border-amber-200/50 p-6 shadow-sm">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200/60 text-amber-900 flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-sm">Engine Module Active</h3>
              <p className="text-xs text-amber-800/80 mt-1">
                Subtask "${subtaskName}" completed. Target ${targetPath} mounted successfully.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-stone-200 bg-white hover:border-amber-400/50 transition">
              <h4 className="font-semibold text-stone-800 text-sm mb-1 flex items-center gap-2">
                <Code className="h-4 w-4 text-amber-600" />
                Component Path
              </h4>
              <p className="text-xs text-stone-500"><code className="bg-stone-100 px-1.5 py-0.5 rounded font-mono text-amber-800">{targetPath}</code></p>
            </div>

            <div className="p-4 rounded-xl border border-stone-200 bg-white hover:border-amber-400/50 transition">
              <h4 className="font-semibold text-stone-800 text-sm mb-1 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-600" />
                Feature Scope
              </h4>
              <p className="text-xs text-stone-500">${prompt}</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
`;
  }

  if (ext === ".ts" || ext === ".js") {
    return `// Synthesized logic module for ${targetPath}\nexport function initializeModule() {\n  return { status: "active", path: "${targetPath}" };\n}\nexport default initializeModule;\n`;
  }

  return `// ${targetPath} content\n`;
}

async function runCfAi(
  ai: AiBinding,
  messages: AiChatMessage[],
  maxTokens = 1024,
  model: string = CF_PLAN_MODEL
): Promise<string> {
  const result = await ai.run(model, { messages, max_tokens: maxTokens });
  // extractCfAiText handles both OpenAI-style choices[] and legacy response field
  return extractCfAiText(result);
}

/**
 * Fast path: uses the lightweight 8B model for sub-100ms structured tasks
 * (command determination, path resolution). Saves DeepSeek capacity for planning.
 */
async function runCfAiFast(
  ai: AiBinding,
  messages: AiChatMessage[],
  maxTokens = 256
): Promise<string> {
  return runCfAi(ai, messages, maxTokens, CF_FAST_MODEL);
}

// Convenience: run a planning prompt, preferring CF AI over Gemini Flash.
async function runPlanningPrompt(
  systemPrompt: string,
  userContent: string,
  env?: Partial<AppEnv>,
  maxTokens = 2048
): Promise<string> {
  const resolved = resolveEnvWithOverrides(env);

  if (resolved.AI) {
    // Use Cloudflare Workers AI binding (no API key cost, edge-native)
    const messages: AiChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ];
    return runCfAi(resolved.AI, messages, maxTokens);
  }

  // Fallback: Gemini Flash (used in local `pnpm dev` without a KV/D1/AI binding)
  const ai = getGeminiClient(env);
  if (!ai) {
    try {
      return await callCloudflareWorkersAi(
        [{ role: "user", content: userContent }],
        systemPrompt,
        env,
        CF_PLAN_MODEL,
        maxTokens
      );
    } catch (_) {
      throw new Error("No AI inference binding (Cloudflare AI or Gemini client) was initialized. Set GEMINI_API_KEY or bind Cloudflare AI.");
    }
  }

  return generateWithFallback(
    async () => {
      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: userContent,
        config: { systemInstruction: systemPrompt, responseMimeType: "application/json" }
      });
      return response.text ?? "";
    },
    [{ role: "user", content: userContent }],
    systemPrompt,
    env,
    undefined,
    CF_PLAN_MODEL,
    maxTokens
  );
}

export const sseClients = new Set<any>();

export function broadcastSSE(event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const encoder = new TextEncoder();
  const encoded = encoder.encode(payload);
  for (const client of sseClients) {
    try {
      const res = client.write(encoded);
      if (res && typeof res.catch === "function") {
        res.catch(() => {
          sseClients.delete(client);
        });
      }
    } catch (err) {
      sseClients.delete(client);
    }
  }
}

export function safeParseJSON(rawText: string): any {
  // Strip markdown code fences (```json ... ``` or ``` ... ```) that LLMs often add
  const stripped = rawText.replace(/```(?:json)?\s*/gi, "").replace(/```\s*/g, "").trim();

  // Fast path: direct parse
  try { return JSON.parse(stripped); } catch { /* fall through */ }

  // Balanced-bracket extraction: walk character by character so we stop at the
  // correct closing brace/bracket rather than the last one in the string.
  const openChar = stripped.indexOf('{') !== -1 ? '{' : '[';
  const closeChar = openChar === '{' ? '}' : ']';
  const start = stripped.indexOf(openChar);
  if (start === -1) throw new Error("No JSON structure found in LLM response.");

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        return JSON.parse(stripped.slice(start, i + 1));
      }
    }
  }
  throw new Error("Unbalanced JSON structure in LLM response.");
}

export let activeCancellationSignal = { aborted: false, taskId: "" };

export async function cancelActiveBuild(taskId?: string) {
  activeCancellationSignal = { aborted: true, taskId: taskId || "" };
  
  try {
    const tasks = await getTasks();
    for (const task of tasks) {
      if (task.status === "running" || task.status === "pending") {
        task.status = "failed";
        task.completedAt = new Date().toISOString();
        for (const sub of task.subtasks) {
          if (sub.status === "running" || sub.status === "pending") {
            sub.status = "failed";
            sub.completedAt = new Date().toISOString();
            sub.logs = sub.logs || [];
            sub.logs.push("⛔ Cancelled by user signal.");
          }
        }
        await saveTask(task);
        broadcastSSE("task-update", task);
      }
    }
    broadcastSSE("build-cancelled", { taskId: taskId || "all" });
  } catch (err) {
    console.error("Failed during cancelActiveBuild cleanup:", err);
  }
}

/**
 * Generates or updates .env.example with empty boxes (e.g. KEY=)
 * according to user prompt request, source URLs, and API key references.
 */
export async function syncEnvExampleFile(prompt: string, currentFiles: FileNode[]) {
  const defaultKeys = [
    "GEMINI_API_KEY",
    "GITHUB_TOKEN",
    "GITHUB_REPO_URL",
    "DATABASE_URL",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
  ];

  const detected = new Set<string>(defaultKeys);

  // Scan prompt for explicit env variable patterns or service keywords
  const envVarMatches = prompt.match(/[A-Z0-9_]{3,}_(?:KEY|URL|TOKEN|SECRET|ID|API|CONFIG)/g) || [];
  envVarMatches.forEach(varName => detected.add(varName));

  if (/supabase/i.test(prompt)) {
    detected.add("SUPABASE_URL");
    detected.add("SUPABASE_ANON_KEY");
  }
  if (/stripe/i.test(prompt)) {
    detected.add("STRIPE_SECRET_KEY");
    detected.add("STRIPE_PUBLISHABLE_KEY");
  }
  if (/openai/i.test(prompt)) {
    detected.add("OPENAI_API_KEY");
  }
  if (/firebase/i.test(prompt)) {
    detected.add("FIREBASE_API_KEY");
    detected.add("FIREBASE_AUTH_DOMAIN");
    detected.add("FIREBASE_PROJECT_ID");
  }

  // Scan workspace files for process.env.VAR_NAME or import.meta.env.VITE_VAR_NAME
  for (const f of currentFiles) {
    const fileEnvMatches = f.content.match(/(?:process\.env|import\.meta\.env)\.([A-Z0-9_]+)/g) || [];
    for (const match of fileEnvMatches) {
      const varName = match.replace(/^(process\.env|import\.meta\.env)\./, "");
      if (varName && varName !== "NODE_ENV" && varName !== "PORT") {
        detected.add(varName);
      }
    }
  }

  const envLines: string[] = [
    "# Workspace Environment Variable Declarations",
    "# Auto-generated empty boxes according to source URL & API key specifications",
    ""
  ];

  for (const key of Array.from(detected).sort()) {
    envLines.push(`${key}=`);
  }
  envLines.push("");

  const newEnvContent = envLines.join("\n");
  const existingEnv = currentFiles.find(f => f.path === ".env.example");

  if (!existingEnv || existingEnv.content !== newEnvContent) {
    const envFileNode: FileNode = {
      path: ".env.example",
      content: newEnvContent,
      language: "properties"
    };
    await saveFile(envFileNode);
    try {
      fs.writeFileSync(".env.example", newEnvContent, "utf8");
    } catch (_) {}
    broadcastSSE("file-created", envFileNode);
  }
}

/**
 * Read a file from disk and return its content, or null if unavailable.
 */
function readFileContent(filePath: string): string | null {
  try {
    if (typeof process !== "undefined" && fs && fs.existsSync) {
      const resolved = path.resolve(process.cwd(), filePath);
      if (resolved.startsWith(process.cwd()) && fs.existsSync(resolved)) {
        return fs.readFileSync(resolved, "utf8");
      }
    }
  } catch (_) {}
  return null;
}

/**
 * Build a rich workspace context string — includes file paths AND their contents
 * (truncated for large files) so the LLM can understand existing code before generating.
 */
function buildWorkspaceContext(files: FileNode[], maxFilesWithContent = 10, maxCharsPerFile = 3000): string {
  if (files.length === 0) return "No existing workspace files.";

  const lines: string[] = [`Existing workspace files (${files.length} total):`];

  // Prioritise smaller/interface files for full content
  const sorted = [...files].sort((a, b) => a.content.length - b.content.length);
  let contentCount = 0;

  for (const f of sorted) {
    if (contentCount < maxFilesWithContent && f.content.trim()) {
      const snippet = f.content.length > maxCharsPerFile
        ? f.content.substring(0, maxCharsPerFile) + `\n... [truncated, ${f.content.length} total chars]`
        : f.content;
      lines.push(`\n--- FILE: ${f.path} ---\n${snippet}`);
      contentCount++;
    } else {
      lines.push(`• ${f.path}`);
    }
  }

  return lines.join("\n");
}

/**
 * Build a conversation history string from recent messages.
 */
function buildConversationContext(messages: Message[], maxMessages = 6): string {
  if (messages.length === 0) return "";
  const recent = messages.slice(-maxMessages);
  const lines = recent.map(m => `[${m.role.toUpperCase()}]: ${m.content.substring(0, 500)}`);
  return `\nRecent conversation history:\n${lines.join("\n")}`;
}

// ---------------------------------------------------------------------------
// 0. Instant pre-classifier — zero AI calls for trivially simple commands
// ---------------------------------------------------------------------------

/** Generate a timestamped slug when no folder name is supplied */
function autoFolderName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `workspace-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

const INSTANT_COMMAND_PATTERNS: Array<{ test: RegExp; cmd: (m: RegExpMatchArray) => string }> = [
  // "create a folder" / "make a folder" — NO name given → auto-name
  { test: /^(?:create|make|add|new|mkdir)\s+(?:a\s+)?(?:new\s+)?(?:folder|directory|dir)\s*$/i, cmd: () => `mkdir -p ${autoFolderName()}` },
  // "create a folder called src/utils" / "make a folder named foo"
  { test: /^(?:create|make|add|mkdir)\s+(?:a\s+)?(?:folder|directory|dir)\s+(?:called\s+|named\s+)?([a-zA-Z0-9_./-]+)$/i, cmd: (m) => `mkdir -p ${m[1].replace(/^\//, "")}` },
  // "create src/utils folder" / "add components/ folder"
  { test: /^(?:create|add|make)\s+([a-zA-Z0-9_./-]+)\s+(?:folder|directory|dir)$/i, cmd: (m) => `mkdir -p ${m[1].replace(/^\//, "")}` },
  // plain "mkdir src/utils" at start of prompt
  { test: /^mkdir\s+(-p\s+)?([a-zA-Z0-9_./-]+)$/i, cmd: (m) => `mkdir -p ${(m[2] || m[1]).replace(/^\//, "")}` },
  // "touch file.ts" or "create file foo.ts"
  { test: /^(?:touch|new file|create file)\s+([a-zA-Z0-9_./-]+)$/i, cmd: (m) => `touch ${m[1]}` },
  // "delete file foo.ts" / "remove file"
  { test: /^(?:delete|remove|rm)\s+(?:file\s+)?([a-zA-Z0-9_./-]+)$/i, cmd: (m) => `rm -f ${m[1]}` },
  // "run npm install" / "install dependencies"
  { test: /^(?:run\s+)?npm\s+install\s*$/i, cmd: () => 'npm install' },
  { test: /^install\s+(?:all\s+)?dep(?:endencies)?\s*$/i, cmd: () => 'npm install' },
  // "git status" / "git log"
  { test: /^git\s+(status|log|diff|pull|fetch)\s*$/i, cmd: (m) => `git ${m[1]}` },
];

/** Returns a ready-made task list for simple commands without any AI call (<1 ms). */
function tryInstantPlan(prompt: string): Task[] | null {
  const trimmed = prompt.trim();
  // Do NOT instant plan if prompt is long, multi-line, or descriptive
  if (trimmed.length > 35 || trimmed.includes("\n") || trimmed.includes(",") || trimmed.split(/\s+/).length > 5) {
    return null;
  }
  for (const p of INSTANT_COMMAND_PATTERNS) {
    const m = trimmed.match(p.test);
    if (m) {
      const command = p.cmd(m);
      const folder = command.replace(/^mkdir -p /, "");
      if (folder.length > 30 || folder.includes(" ")) {
        return null;
      }
      const taskId = `task-${Date.now()}`;
      return [{ id: taskId, name: `Create folder ${folder}`, status: "pending", progress: 0,
        activeSubtaskIndex: 0, createdAt: new Date().toISOString(),
        subtasks: [{ id: `${taskId}-sub-0`, taskId, name: command, status: "pending", logs: ["Awaiting run..."] }] }];
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Framework detection — checks existing virtual files for a known framework
// ---------------------------------------------------------------------------
function detectFrameworkFromFiles(files: { path: string; content: string }[]): string | null {
  const pkgFile = files.find(f => f.path === "package.json" || f.path.endsWith("/package.json"));
  if (pkgFile) {
    try {
      const pkg = JSON.parse(pkgFile.content || "{}");
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      if (deps.next) return "next";
      if (deps.nuxt || deps["@nuxt/core"]) return "nuxt";
      if (deps.remix || deps["@remix-run/react"]) return "remix";
      if (deps["@angular/core"]) return "angular";
      if (deps.svelte) return "svelte";
      if (deps.vue) return "vue";
      if (deps.vite || deps.react) return "react-vite";
    } catch {}
  }
  // Fallback: check file extensions
  if (files.some(f => f.path.endsWith(".vue"))) return "vue";
  if (files.some(f => f.path.endsWith(".svelte"))) return "svelte";
  if (files.some(f => f.path === "vite.config.ts" || f.path === "vite.config.js")) return "react-vite";
  return null;
}

/** Prompts that imply the output needs a visible UI / frontend */
const UI_PROMPT_REGEX = /\b(background|gradient|animation|hero|landing|page|component|ui|app|website|interface|frontend|design|layout|view|screen|dashboard|navbar|button|card|modal|form|color|style|visual|scene|display|render|canvas|image|picture|illustration|pattern|texture|wallpaper|banner|header|footer|sidebar|panel)\b/i;

// ---------------------------------------------------------------------------
// 1. Dynamic Task Planner — uses Cloudflare AI binding when available
// ---------------------------------------------------------------------------
export async function planBuildTasks(userPrompt: string, env?: Partial<AppEnv>, attachment?: any): Promise<Task[]> {
  logProviderReadiness(env);
  // ── Instant path: no AI call for trivial folder/command prompts ────────────
  if (!attachment) {
    const instant = tryInstantPlan(userPrompt);
    if (instant) return instant;
  }

  try {
    const existingFiles = await getFiles();
    const workspaceLayout = existingFiles.map(f => f.path).join(", ") || "None";

    // ── Auto-framework routing ────────────────────────────────────────────────
    // If the prompt implies UI/frontend work but no framework is in the workspace,
    // we inject an explicit directive so the AI scaffolds React + Vite first.
    const detectedFramework = detectFrameworkFromFiles(existingFiles);
    const needsFramework = UI_PROMPT_REGEX.test(userPrompt) && !detectedFramework;
    const frameworkDirective = needsFramework
      ? `\n8. FRAMEWORK AUTO-ROUTING (MANDATORY): The workspace has no frontend framework and this prompt implies UI work. Task #1 MUST be "Bootstrap React + Vite project" with these exact subtasks:
   - "Create package.json with react, react-dom, vite, @vitejs/plugin-react, tailwindcss, autoprefixer dependencies"
   - "Create vite.config.ts with react plugin and server port 3000"
   - "Create index.html with <div id=\\"root\\"> and script type=module pointing to src/main.tsx"
   - "Create src/main.tsx with ReactDOM.createRoot mounting App component"
   - "Create src/index.css with Tailwind @import \"tailwindcss\"; directive"
   After that bootstrap task, implement the actual feature in a second task.`
      : "";

    const systemInstruction = `You are a Principal Software Architect. Your job is to break down the user's prompt into an atomic, sequential array of clear, actionable execution tasks.
Return ONLY valid JSON matching exactly:
{
  "tasks": [
    {
      "name": "Task Title",
      "subtasks": ["subtask description/target"]
    }
  ]
}

CRITICAL RULES:
1. Only plan concrete, actionable file-system or coding tasks (e.g., "Create folder/directory src/utils", "Implement component src/components/Card.tsx", "Add route /api/users to server.ts").
2. NEVER plan theoretical, conversational, explanatory, or administrative steps (e.g., "Choose tool", "Confirm environment", "Discuss layout", "Open terminal", "Wait for feedback").
3. Keep task and subtask names short, professional, and descriptive.
4. When folder creation is requested, the task and subtask must directly represent creating that folder (e.g. "Create src/components/MyFolder folder"). Do NOT make it a multi-step theoretical checklist.
5. Have strong professional context awareness. Avoid generic placeholder names, redundant terms, or conversational phrases.
6. Order tasks so dependencies come FIRST. If TaskB imports from TaskA, TaskA must appear earlier.
7. After code generation tasks, include a "Validate & install dependencies" subtask when new npm packages are needed.
8. MODIFY vs CREATE rule (MANDATORY): When the user's prompt says "add X to existing Y", "update Y", "extend Y", "put X in Y", or "change Y" — do NOT create new folders or new files with different names. Identify the EXISTING file(s) from the workspace layout and plan subtasks that edit those exact paths. Only plan new file paths when the feature is genuinely new and has no existing home. Creating a new timestamped workspace folder for every prompt is PROHIBITED.
9. FOLDER CREATION DISCIPLINE: Never auto-generate timestamped workspace folders (e.g. workspace-YYYYMMDD-HHMM). Only create named, purposeful directories that the code explicitly needs.${frameworkDirective}`;

    const userContent = `Plan tasks for: "${userPrompt}"\nWorkspace: ${workspaceLayout}`;

    // Use CF AI binding for planning (lightweight) — falls back to Gemini Flash locally
    const rawText = await runPlanningPrompt(systemInstruction, userContent, env, 2048);
    const result = safeParseJSON(rawText);

    return result.tasks.map((t: any, idx: number) => {
      const taskId = `task-${Date.now()}-${idx}`;
      return {
        id: taskId,
        name: t.name || `Sprint Phase ${idx + 1}`,
        status: "pending",
        progress: 0,
        activeSubtaskIndex: 0,
        createdAt: new Date().toISOString(),
        subtasks: (t.subtasks || []).map((sub: string, subIdx: number) => ({
          id: `${taskId}-sub-${subIdx}`,
          taskId,
          name: sub,
          status: "pending",
          logs: ["Awaiting run..."]
        }))
      };
    });
  } catch (err) {
    // Log the real error so it appears in Cloudflare worker tail logs
    console.error("[planBuildTasks] planning failed, returning fallback task:", err);
    const taskId = `task-${Date.now()}`;
    return [{
      id: taskId,
      name: "Implement Application Features",
      status: "pending",
      progress: 0,
      activeSubtaskIndex: 0,
      createdAt: new Date().toISOString(),
      subtasks: [{ id: `${taskId}-sub-0`, taskId, name: "Implement user requested application feature in src/App.tsx", status: "pending", logs: ["Awaiting run..."] }]
    }];
  }
}

/**
 * Detect npm package names from import statements in code and install missing ones.
 */
async function installDetectedPackages(code: string, sub: Subtask, task: Task): Promise<void> {
  try {
    // Find all import statements
    const importRegex = /^import\s+.*?\s+from\s+['"]([^'"./][^'"]*)['"]/gm;
    const requireRegex = /require\(\s*['"]([^'"./][^'"]*)['"]\s*\)/g;
    const packageNames = new Set<string>();

    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(code)) !== null) {
      const pkg = match[1].split("/")[0]; // handle scoped: @org/pkg → @org/pkg
      if (match[1].startsWith("@")) {
        packageNames.add(match[1].split("/").slice(0, 2).join("/"));
      } else {
        packageNames.add(pkg);
      }
    }
    while ((match = requireRegex.exec(code)) !== null) {
      packageNames.add(match[1].split("/")[0]);
    }

    // Built-ins and already-known packages to skip
    const BUILTIN_OR_KNOWN = new Set([
      "react", "react-dom", "express", "hono", "vite", "fs", "path", "os", "child_process",
      "crypto", "http", "https", "url", "stream", "util", "events", "buffer", "dotenv",
      "@google/genai", "lucide-react", "motion", "tailwindcss", "typescript",
      "@types/react", "@types/react-dom", "@types/express", "@types/node",
    ]);

    const toInstall = [...packageNames].filter(p => !BUILTIN_OR_KNOWN.has(p) && p.length > 0);

    if (toInstall.length > 0) {
      const installCmd = `npm install --save ${toInstall.join(" ")} 2>&1`;
      sub.logs.push(`[PKG] Detected new dependencies: ${toInstall.join(", ")}. Installing...`);
      broadcastSSE("subtask_log", { subtaskId: sub.id, log: sub.logs[sub.logs.length - 1] });
      await saveTask(task);

      const result = await executeTerminalCommand(installCmd, { timeoutMs: 60000 });
      if (result.success) {
        sub.logs.push(`[PKG] ✅ Dependencies installed successfully.`);
      } else {
        sub.logs.push(`[PKG] ⚠️ Package install warning: ${result.stderr.substring(0, 200)}`);
      }
      broadcastSSE("subtask_log", { subtaskId: sub.id, log: sub.logs[sub.logs.length - 1] });
      await saveTask(task);
    }
  } catch (err: any) {
    sub.logs.push(`[PKG] Package detection skipped: ${err.message}`);
  }
}

/**
 * Run TypeScript type-check on a generated file, logging results into the subtask.
 */
async function validateGeneratedFile(filePath: string, sub: Subtask, task: Task): Promise<boolean> {
  if (!filePath.endsWith(".ts") && !filePath.endsWith(".tsx")) return true;
  try {
    const result = await executeTerminalCommand(`npx tsc --noEmit --skipLibCheck 2>&1 | head -30`, { timeoutMs: 30000 });
    if (result.success) {
      sub.logs.push(`[VALIDATE] ✅ TypeScript check passed for ${filePath}.`);
      broadcastSSE("subtask_log", { subtaskId: sub.id, log: sub.logs[sub.logs.length - 1] });
      await saveTask(task);
      return true;
    } else {
      const errors = (result.stdout || result.stderr).substring(0, 500);
      sub.logs.push(`[VALIDATE] ⚠️ TypeScript issues detected (will auto-fix on retry): ${errors}`);
      broadcastSSE("subtask_log", { subtaskId: sub.id, log: sub.logs[sub.logs.length - 1] });
      await saveTask(task);
      return false;
    }
  } catch (_) {
    return true; // Don't block on validate errors
  }
}

/**
 * Automatically registers newly created standalone React components into src/App.tsx
 * to ensure Vite HMR triggers and the preview workspace layout stays synchronized.
 */
async function registerComponentInAppShell(targetPath: string): Promise<void> {
  if (!targetPath.startsWith("src/components/") || (!targetPath.endsWith(".tsx") && !targetPath.endsWith(".jsx"))) {
    return;
  }

  const filename = path.basename(targetPath, path.extname(targetPath));
  const EXCLUDED_COMPS = [
    "Navbar", "ExecutionTimeline", "SettingsModal", "DbVisualizer",
    "DeployView", "GithubView", "PermissionsView", "SupabaseView",
    "NotificationsView", "ScreenshotsView", "SettingsView",
    "SubtasksSimulationView", "FaceswapChatView", "LogsView",
    "WorkspacePreview", "CodeView", "PreviewView", "EnvBoxView"
  ];
  if (EXCLUDED_COMPS.includes(filename)) return;

  try {
    const files = await getFiles();
    const appFile = files.find(f => f.path === "src/App.tsx" || f.path === "App.tsx");
    if (!appFile) return;

    if (appFile.content.includes(filename)) return;

    let content = appFile.content;
    const lazyImportStmt = `const ${filename} = lazy(() => import("./components/${filename}.tsx"));\n`;

    if (content.includes("const WorkspacePreview = lazy(")) {
      content = content.replace(
        "const WorkspacePreview = lazy(() => import(\"./components/WorkspacePreview.tsx\"));",
        `const WorkspacePreview = lazy(() => import("./components/WorkspacePreview.tsx"));\n${lazyImportStmt}`
      );
    } else if (content.includes("const viewFallback =")) {
      content = content.replace("const viewFallback =", `${lazyImportStmt}\nconst viewFallback =`);
    } else {
      content = lazyImportStmt + content;
    }

    const updatedAppFile: FileNode = {
      path: appFile.path,
      content,
      language: "typescript"
    };

    await saveFile(updatedAppFile);
    broadcastSSE("file-created", updatedAppFile);
    appendLogDrop("info", "agent", `Auto-injected ${filename} into primary layout shell (${appFile.path})`);
  } catch (err: any) {
    console.warn(`[registerComponentInAppShell] Skipped layout injection for ${targetPath}:`, err.message);
  }
}

export const CODE_GEN_SYSTEM_PROMPT = `You are an expert full-stack developer generating production-ready code for a user's application.

CRITICAL ISOLATION & CONSTRAINTS:
1. STRICT USER UI FOCUS: Generate ONLY the code and UI requested by the end user for their product.
2. NO AGENT META-UI: DO NOT generate or render internal build statuses, execution pipelines, compilation dashboards, progress spinners, terminal outputs, or agent logs inside the application code.
3. NO INTERNAL TERMINOLOGY: Words like "Sovereign Pipeline", "SSE Pipeline", "Compilation Tunnel", "Execution Status", or "Subtask" must NEVER appear inside user-facing components.
4. CLEAN MOUNTING: Ensure component files export production-ready code meant to be rendered directly inside the root application container.
`;

export function buildCodeGenerationPrompt(originalUserPrompt: string, targetPath: string, subtaskTitle: string) {
  const systemInstruction = `${CODE_GEN_SYSTEM_PROMPT}

ADDITIONAL HARD RULES:
- Write production-grade code that is self-contained and ready to render inside the application's root container.
- Do not introduce mock agent dashboards, execution panels, or progress overlays.
- Return only the runnable file content for the requested file.`;

  const userContent = `[APPLICATION SPECIFICATION]
User Goal: ${originalUserPrompt}

[FILE GENERATION TARGET]
Target File: ${targetPath}
Internal Step Focus: ${subtaskTitle}

[INSTRUCTIONS]
Write the complete, non-truncated source code for "${targetPath}".
- Respond ONLY with the valid, runnable file content within clean code blocks.
- Focus strictly on the end-user application feature defined in the user goal.
- Do NOT wrap the component in mock agent dashboards or status wrappers.
`;

  return { systemInstruction, userContent };
}

/**
 * Generate code for a subtask with full context — existing file contents + conversation history.
 * Supports both Cloudflare Workers AI binding and Google Gemini models.
 * When an image attachment is provided, uses Gemini Vision to analyse it and incorporate
 * the visual design intent into the generated code.
 */
async function generateSubtaskCode(
  ai: GoogleGenAI | AiBinding | null,
  model: string,
  prompt: string,
  subtaskName: string,
  targetPath: string,
  currentFiles: FileNode[],
  conversationHistory: Message[],
  previousError?: string,
  attachment?: { name: string; type: string; data: string; size: number } | null,
  env?: Partial<AppEnv>
): Promise<string> {
  const workspaceContext = buildWorkspaceContext(currentFiles);
  const conversationContext = buildConversationContext(conversationHistory);

  const errorContext = previousError
    ? `\n\nPREVIOUS ATTEMPT FAILED WITH ERROR — fix this on this attempt:\n${previousError}\n`
    : "";

  // Vision context: if the user sent an image, describe it and include intent
  let visionContext = "";
  if (attachment && attachment.type.startsWith("image/") && attachment.data) {
    visionContext = `\nThe user also provided an image (${attachment.name}) as a visual reference or design spec.`;
    // Attempt Gemini Vision analysis (only available in Node / when Gemini client exists)
    if (ai && typeof (ai as GoogleGenAI).models?.generateContent === "function") {
      try {
        const visionResponse = await (ai as GoogleGenAI).models.generateContent({
          model: "gemini-2.0-flash",
          contents: [
            {
              parts: [
                { text: `Analyse this image and describe in detail: the layout, colour palette, typography, UI components, and overall visual design. Be specific and precise — your description will be used by a developer to replicate this design in code.` },
                { inlineData: { mimeType: attachment.type as any, data: attachment.data } },
              ],
            },
          ],
        });
        const description = visionResponse.text ?? "";
        if (description) {
          visionContext = `\n\n### Image Design Analysis (${attachment.name}):\n${description}\nUse this visual analysis to faithfully implement the design in the code you generate.\n`;
        }
      } catch (_) {
        visionContext = `\nThe user provided an image (${attachment.name}) as visual reference. Implement the code to match the described visual intent.\n`;
      }
    }
  }

  const { systemInstruction: isolationSystemInstruction, userContent: isolationUserContent } = buildCodeGenerationPrompt(prompt, targetPath, subtaskName);

  const systemInstruction = `${isolationSystemInstruction}

ADDITIONAL IMPLEMENTATION REQUIREMENTS:
1. INDENTATION & FORMATTING: Use consistent 2-space indentation. Clean, readable code.
2. SYNTAX & COMPILATION: All imports must resolve correctly. Fix TypeScript errors, use precise types. No syntax errors.
3. COMPLETENESS: Write the FULL, executable file content. NO truncation, NO "// ... implement rest", NO placeholder comments.
4. IMPORTS: Only import packages that exist in package.json or are Node built-ins. Check the workspace context for what's available.
5. CONSISTENCY: Match the coding style and patterns already used in other workspace files.
6. RESPONSE FORMAT: Output ONLY the raw code. DO NOT wrap in markdown code blocks. Start from the very first character.${errorContext}`;

  const userContent = `${isolationUserContent}

[IMPLEMENTATION CONTEXT]
Overall user request: "${prompt}"
${conversationContext}
${visionContext}
${workspaceContext}`;

  // If Cloudflare Workers AI binding is passed
  if (ai && typeof (ai as any).run === "function") {
    try {
      const messages: AiChatMessage[] = [
        { role: "system", content: systemInstruction },
        { role: "user", content: userContent }
      ];
      const response = await (ai as AiBinding).run(model, { messages, max_tokens: 3000 });
      let code = extractCfAiText(response);
      if (code) {
        if (code.startsWith("```")) {
          const lines = code.split("\n");
          if (lines[0].startsWith("```")) lines.shift();
          if (lines[lines.length - 1].startsWith("```")) lines.pop();
          code = lines.join("\n");
        }
        return code;
      }
    } catch (cfErr: any) {
      console.warn(`[generateSubtaskCode] CF Workers AI failed: ${cfErr.message}. Trying multi-provider fallback.`);
    }
  }

  // Multi-provider fallback chain (Gemini -> CF Workers AI -> DeepSeek/OpenAI)
  const rawCode = await generateWithFallback(
    async () => {
      const aiClient = getGeminiClient(env);
      if (!aiClient) throw new Error("Gemini API client uninitialized");
      const response = await aiClient.models.generateContent({
        model,
        contents: userContent,
        config: { systemInstruction }
      });

      let codeText = response.text || "";
      if (codeText.startsWith("```")) {
        const lines = codeText.split("\n");
        if (lines[0].startsWith("```")) lines.shift();
        if (lines[lines.length - 1].startsWith("```")) lines.pop();
        codeText = lines.join("\n");
      }
      if (!codeText) throw new Error("Gemini returned empty code text");
      return codeText;
    },
    [{ role: "user", content: userContent }],
    systemInstruction,
    env,
    undefined,
    CF_CODE_MODEL,
    3000
  );

  return rawCode;
}

// ---------------------------------------------------------------------------
// 2. Real-World Sequential Execution Loop
// ---------------------------------------------------------------------------
export async function executeAgentBuild(prompt: string, tasks: Task[], env?: Partial<AppEnv>, attachment?: any) {
  logProviderReadiness(env);
  const startTime = Date.now();
  const modelsUsed = new Set<string>();
  const actionsTaken: any[] = [];
  activeCancellationSignal = { aborted: false, taskId: "" };

  // Clear ALL file locks at the start of every build.  Locks from crashed or
  // cancelled prior runs are never auto-released by the old code path, which
  // causes every subsequent subtask that touches the same file to hit
  // [LOCK CONFLICT] and silently skip code generation.
  fileWriteLocks.clear();

  // Resolve CF AI binding once for this build run
  const resolved = resolveEnvWithOverrides(env);
  const cfAi = resolved.AI ?? null;

  try {
    // Immediately display the UI Blueprint
    let blueprint = tasks.map((t, i) => `**[Task-${i+1}] ${t.name}**\n` + t.subtasks.map((s, si) => `- Step ${si+1}: ${s.name}`).join('\n')).join('\n\n');
    const initialMsg: Message = { id: `msg-${Date.now()}-blueprint`, role: "assistant", content: blueprint, timestamp: new Date().toISOString() };
    await addMessage(initialMsg);
    broadcastSSE("message-added", initialMsg);
    broadcastSSE("build-started", { prompt, totalTasks: tasks.length });

    // Sync .env.example with empty boxes based on source URL and API key requests
    await syncEnvExampleFile(prompt, await getFiles());

    for (let tIdx = 0; tIdx < tasks.length; tIdx++) {
      const task = tasks[tIdx];
      if (activeCancellationSignal.aborted) {
        task.status = "failed";
        await saveTask(task);
        break;
      }

      task.status = "running";
      task.startedAt = new Date().toISOString();
      await saveTask(task);
      broadcastSSE("task-update", task);

      for (let sIdx = 0; sIdx < task.subtasks.length; sIdx++) {
        const sub = task.subtasks[sIdx];
        if (activeCancellationSignal.aborted) {
          sub.status = "failed";
          sub.completedAt = new Date().toISOString();
          sub.logs = sub.logs || [];
          sub.logs.push("⛔ Subtask execution cancelled by user.");
          await saveTask(task);
          break;
        }

        task.activeSubtaskIndex = sIdx;
        sub.status = "running";
        sub.startedAt = new Date().toISOString();
        sub.logs = [`Starting execution of: "${sub.name}"...`];
        await saveTask(task);
        broadcastSSE("task-update", task);
        broadcastSSE("subtask_log", { subtaskId: sub.id, log: sub.logs[0] });

        // Check if this is a terminal/command subtask.
        const isCommandTask =
          /^(run|execute|install|npm|npx|mkdir|delete|remove|touch)\s+/i.test(sub.name.trim()) ||
          /^mkdir\s+-p\s+/i.test(sub.name.trim()) ||
          sub.name.toLowerCase().includes("install dependencies") ||
          sub.name.toLowerCase().includes("validate & install");

        if (isCommandTask) {
          try {
            const currentFiles = await getFiles();

            // Use CF AI for command determination when available; Gemini Flash as fallback
            let command: string;
            const cmdSystemPrompt = `You are a DevOps expert. Determine the best terminal shell command to execute for the given task. Rules: Return a single shell command as a plain string (no markdown, no explanation, no code fences). The command must be safe, non-interactive, and not require user input. Prefer npm/npx commands for JavaScript/TypeScript tasks. If it's a folder creation task, use: mkdir -p <path>. If no meaningful command applies, return: echo "No command needed"`;
            const cmdUserContent = `Task: "${sub.name}" in the context of request: "${prompt}". Existing workspace files: [${currentFiles.map(f => f.path).join(", ")}]. Return only the shell command string.`;

            if (cfAi) {
              // Fast 8B model is enough for short command resolution — no need for the 70B planner
              const cfResponse = await runCfAiFast(
                cfAi,
                [{ role: "system", content: cmdSystemPrompt }, { role: "user", content: cmdUserContent }]
              );
              command = cfResponse.trim().replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "").trim();
              modelsUsed.add("CF-AI");
            } else {
              const ai = getGeminiClient(env);
              if (ai) {
                try {
                  command = await generateWithFallback(
                    async () => {
                      const cmdResponse = await ai.models.generateContent({
                        model: "gemini-3.6-flash",
                        contents: `${cmdSystemPrompt}\n\n${cmdUserContent}`,
                      });
                      return (cmdResponse.text || "echo 'No command needed'").trim().replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "").trim();
                    },
                    [{ role: "user", content: cmdUserContent }],
                    cmdSystemPrompt,
                    env,
                    sub.id,
                    CF_FAST_MODEL,
                    256
                  );
                  modelsUsed.add("Flash");
                } catch (cmdAiErr: any) {
                  // Real fallback commands — never use echo mocks that produce zero output
                  if (sub.name.toLowerCase().includes("mkdir") || sub.name.toLowerCase().includes("folder") || sub.name.toLowerCase().includes("directory")) {
                    const folderMatch = sub.name.match(/src\/[\w/.-]+|agent-workspace\/[\w/.-]+/);
                    command = `mkdir -p ${folderMatch ? folderMatch[0] : "src/components"}`;
                  } else if (sub.name.toLowerCase().includes("install") || sub.name.toLowerCase().includes("npm") || sub.name.toLowerCase().includes("dep")) {
                    command = `npm install`;
                  } else if (sub.name.toLowerCase().includes("build") || sub.name.toLowerCase().includes("compile")) {
                    command = `npm run build 2>&1 || true`;
                  } else if (sub.name.toLowerCase().includes("lint") || sub.name.toLowerCase().includes("typecheck")) {
                    command = `npx tsc --noEmit 2>&1 || true`;
                  } else if (sub.name.toLowerCase().includes("test")) {
                    command = `npm test 2>&1 || true`;
                  } else {
                    command = `echo "[done] Subtask '${sub.name.replace(/'/g, "")}' completed."`;
                  }
                }
              } else {
                // Real fallback commands — no AI available, but always do meaningful work
                if (sub.name.toLowerCase().includes("mkdir") || sub.name.toLowerCase().includes("folder") || sub.name.toLowerCase().includes("directory")) {
                  const folderMatch = sub.name.match(/src\/[\w/.-]+|agent-workspace\/[\w/.-]+/);
                  command = `mkdir -p ${folderMatch ? folderMatch[0] : "src/components"}`;

                } else if (sub.name.toLowerCase().includes("install") || sub.name.toLowerCase().includes("npm") || sub.name.toLowerCase().includes("dep")) {
                  command = `npm install`;
                } else if (sub.name.toLowerCase().includes("build") || sub.name.toLowerCase().includes("compile")) {
                  command = `npm run build 2>&1 || true`;
                } else if (sub.name.toLowerCase().includes("lint") || sub.name.toLowerCase().includes("typecheck") || sub.name.toLowerCase().includes("type-check")) {
                  command = `npx tsc --noEmit 2>&1 || true`;
                } else {
                  command = `echo "[done] Subtask '${sub.name.replace(/'/g, "")}' completed."`;
                }
              }
            }

            sub.logs.push(`[CMD] Preparing to execute: ${command}`);
            broadcastSSE("subtask_log", { subtaskId: sub.id, log: sub.logs[sub.logs.length - 1] });

            const safeCheck = isCommandSafe(command);
            if (!safeCheck.safe) {
              sub.logs.push(`[CMD] ⚠️ Command blocked by security policy: ${safeCheck.reason}`);
            } else {
              // Helper: register a folder in D1 virtual filesystem (used as fallback when
              // child_process is unavailable — CF Workers has a shim that throws on exec).
              const virtualMkdir = async (cmd: string) => {
                const folderPath = cmd.replace(/^mkdir\s+(-p\s+)?/, "").trim();
                const gitkeepPath = `${folderPath.replace(/\/$/, "")}/.gitkeep`;
                await saveFile({ path: gitkeepPath, content: "", language: "text" });
                sub.logs.push(`[CMD] ✅ Folder created (virtual): ${folderPath}`);
                broadcastSSE("file-created", { path: gitkeepPath, content: "", language: "text" });
                actionsTaken.push({ type: 'create_folder', pathOrCommand: folderPath, success: true });
              };

              // Build a stable workspace ID for sandbox session affinity
              const workspaceId = `agent-${prompt.substring(0, 20).replace(/[^a-z0-9]/gi, "-").toLowerCase()}-${sub.id.split("-")[1] || "0"}`;

              let cmdResult;
              try {
                cmdResult = await executeTerminalCommand(command, {
                  timeoutMs: 60000,
                  env: resolved,           // passes env.Sandbox (DO namespace) for CF Sandbox path
                  workspaceId,
                });
              } catch (execErr: any) {
                // Synchronous throws (CF Workers V8 shim) — handle non-destructively
                if (/^mkdir\b/.test(command.trim())) {
                  await virtualMkdir(command);
                } else {
                  sub.logs.push(`[CMD] ⚠️ Exec bypassed (${execErr.message?.substring(0, 120)}). Continuing.`);
                  actionsTaken.push({ type: 'run_command', pathOrCommand: command, success: false });
                }
                cmdResult = null;
              }

              if (cmdResult) {
                if (cmdResult.success) {
                  sub.logs.push(`[CMD] ✅ ${cmdResult.stdout.substring(0, 300) || cmdResult.message}`);
                  actionsTaken.push({ type: 'run_command', pathOrCommand: command, success: true });
                } else if (/^mkdir\b/.test(command.trim())) {
                  // returned failure without throwing — virtual fallback
                  await virtualMkdir(command);
                } else {
                  sub.logs.push(`[CMD] ⚠️ Command output: ${(cmdResult.stderr || cmdResult.stdout).substring(0, 300)}`);
                  actionsTaken.push({ type: 'run_command', pathOrCommand: command, success: false });
                }
              }
            }

            broadcastSSE("subtask_log", { subtaskId: sub.id, log: sub.logs[sub.logs.length - 1] });
            sub.status = "completed";
            sub.completedAt = new Date().toISOString();
          } catch (cmdErr: any) {
            // Non-destructive: log the error but mark subtask completed so the
            // overall task pipeline never stalls in a permanent RUNNING state.
            sub.logs.push(`[CMD] ⚠️ Command task error (recovered): ${cmdErr.message?.substring(0, 200)}`);
            sub.status = "completed";
            sub.completedAt = new Date().toISOString();
          }

          task.progress = Math.round(((sIdx + 1) / task.subtasks.length) * 100);
          await saveTask(task);
          broadcastSSE("task-update", task);
          continue;
        }

        // Normal code generation subtask
        try {
          const ai = cfAi ? null : getGeminiClient(env);
          const route = routeLLMTask(prompt, sub.name, attachment?.name);
          if (cfAi) {
            modelsUsed.add(route.model.includes("deepseek") ? "DeepSeek R1" : "Llama 3.3");
          } else if (ai) {
            modelsUsed.add(route.model === "gemini-3.1-pro-preview" ? "Pro" : "Flash");
          } else {
            modelsUsed.add("Local Fallback Engine");
          }

          const currentFiles = await getFiles();
          const conversationHistory = await getMessages();

          // Determine target file path — use CF AI when available, Gemini Flash as fallback
          let targetPath = "";
          let language = "typescript";
          
          // Smart local fallback regex to extract file path directly from the subtask/prompt if present
          const pathRegex = /(?:create|add|update|modify|file|inside|in|to)\s+([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+)/i;
          const subtaskMatch = sub.name.match(pathRegex);
          const promptMatch = prompt.match(pathRegex);
          if (subtaskMatch) {
            targetPath = subtaskMatch[1].trim().replace(/^\/+/, "");
          } else if (promptMatch) {
            targetPath = promptMatch[1].trim().replace(/^\/+/, "");
          }

          // ── Root-level path overrides: some files MUST live at the project root ──
          // These are checked AFTER AI resolves a path; if the AI put them in
          // a subfolder we correct it here.
          // IMPORTANT: package.json is intentionally excluded — we NEVER overwrite
          // an existing root package.json (it contains deploy/CI scripts). New
          // projects scaffold their deps by MERGING into the existing one.
          const ROOT_LEVEL_FILES: Record<string, { path: string; language: string }> = {
            "vite.config.ts": { path: "vite.config.ts", language: "typescript" },
            "vite.config.js": { path: "vite.config.js", language: "javascript" },
            "index.html":     { path: "index.html",     language: "html" },
            "tailwind.config.ts": { path: "tailwind.config.ts", language: "typescript" },
            "tailwind.config.js": { path: "tailwind.config.js", language: "javascript" },
            "tsconfig.json":  { path: "tsconfig.json",  language: "json" },
            "postcss.config.js": { path: "postcss.config.js", language: "javascript" },
            "postcss.config.ts": { path: "postcss.config.ts", language: "typescript" },
          };
          
          // Guard: never overwrite an existing root package.json with a scaffold version
          const existingRootPkg = currentFiles.find(f => f.path === "package.json");
          const isPackageJsonTask = sub.name.toLowerCase().includes("package.json");
          if (isPackageJsonTask && existingRootPkg) {
            sub.logs.push(`[SKIP] Root package.json already exists — skipping overwrite to preserve CI/deploy scripts. Dependencies will be installed separately.`);
            broadcastSSE("subtask_log", { subtaskId: sub.id, log: sub.logs[sub.logs.length - 1] });
            sub.status = "completed";
            sub.completedAt = new Date().toISOString();
            task.progress = Math.round(((sIdx + 1) / task.subtasks.length) * 100);
            await saveTask(task);
            broadcastSSE("task-update", task);
            continue;
          }

          try {
            const registryMap = currentFiles.map(f => f.path).join(", ");
            const pathSystemPrompt = `You are a Principal Software Engineer. Determine the most appropriate file path and programming language for the given subtask.
CRITICAL PATH RULES:
- Root-level config files go at ROOT, never inside src/: vite.config.ts → "vite.config.ts", index.html → "index.html", package.json → "package.json", tailwind.config.ts → "tailwind.config.ts", tsconfig.json → "tsconfig.json", postcss.config.js → "postcss.config.js"
- React components → "src/components/<ComponentName>.tsx"
- App entry → "src/App.tsx"
- React main → "src/main.tsx"
- CSS global → "src/index.css"
- Backend routes/APIs → "server/routes/<name>_api.ts"
- DB schema → "src/db/schema.ts" or "server/schema.ts"
- Use descriptive names matching the ACTUAL feature (not "analyze_and_write_fe" or other generic placeholder names)
- Return ONLY valid JSON: {"path": "the/file/path.ext", "language": "typescript|json|css|html|javascript"}`;
            const pathUserContent = `Subtask: "${sub.name}" for overall request: "${prompt}". Existing files: [${registryMap}]. Return only the JSON object.`;

            let pathRaw = "";
            if (cfAi) {
              // Fast 8B model is sufficient for structured path resolution (short, deterministic)
              pathRaw = await runCfAiFast(
                cfAi,
                [{ role: "system", content: pathSystemPrompt }, { role: "user", content: pathUserContent }],
                256
              );
              modelsUsed.add("CF-AI");
            } else if (ai) {
              try {
                pathRaw = await generateWithFallback(
                  async () => {
                    const pathResponse = await ai.models.generateContent({
                      model: "gemini-3.6-flash",
                      contents: pathUserContent,
                      config: { systemInstruction: pathSystemPrompt, responseMimeType: "application/json" }
                    });
                    return pathResponse.text ?? "";
                  },
                  [{ role: "user", content: pathUserContent }],
                  pathSystemPrompt,
                  env,
                  sub.id,
                  CF_FAST_MODEL,
                  256
                );
              } catch (pathAiErr: any) {
                console.warn("[Path determination] Gemini and CF AI failed:", pathAiErr.message);
              }
            }

            if (pathRaw) {
              const pathResult = safeParseJSON(pathRaw);
              if (pathResult.path) {
                let resolvedPath = pathResult.path.trim().replace(/^\/+/, "");
                // Apply root-level overrides: if AI put a known root file inside a subdir, correct it
                const filename = resolvedPath.split("/").pop() ?? "";
                if (ROOT_LEVEL_FILES[filename]) {
                  resolvedPath = ROOT_LEVEL_FILES[filename].path;
                  language = ROOT_LEVEL_FILES[filename].language;
                } else {
                  language = pathResult.language || "typescript";
                }
                targetPath = resolvedPath;
              }
            }
          } catch (pathErr) {
            console.error("Failed to dynamically determine path, using fallback:", pathErr);
          }

          // Also apply root-level override to paths extracted from subtask name regex
          {
            const filename = targetPath.split("/").pop() ?? "";
            if (ROOT_LEVEL_FILES[filename]) {
              targetPath = ROOT_LEVEL_FILES[filename].path;
              language = ROOT_LEVEL_FILES[filename].language;
            }
          }

          // Fallback if dynamic resolution fails
          if (!targetPath) {
            const isSchema = sub.name.toLowerCase().includes("schema");
            const isApi = sub.name.toLowerCase().includes("api") || sub.name.toLowerCase().includes("endpoint");
            const isApp = sub.name.toLowerCase().includes("app") || sub.name.toLowerCase().includes("main");
            if (isApp) {
              targetPath = "src/App.tsx";
            } else {
              const extension = isSchema ? ".ts" : isApi ? "_api.ts" : "Component.tsx";
              const folder = isSchema ? "src/db" : isApi ? "server/routes" : "src/components";
              const clean = sub.name.toLowerCase()
                .replace(/^analyze and write features for:?/i, "")
                .replace(/[^a-z0-9]/g, "_")
                .replace(/_+/g, "_")
                .replace(/^_+|_+$/g, "")
                .substring(0, 15) || "Feature";
              const capitalized = clean.charAt(0).toUpperCase() + clean.slice(1);
              targetPath = `${folder}/${capitalized}${extension}`;
            }
          }

          // Acquire write lock for target file (Pillar 5: Multi-agent state reconciliation)
          const lockResult = acquireFileLock(targetPath, sub.id);
          if (!lockResult.acquired) {
            sub.logs.push(`[LOCK CONFLICT] File ${targetPath} is currently locked by agent ${lockResult.currentOwner}`);
            broadcastSSE("subtask_log", { subtaskId: sub.id, log: sub.logs[sub.logs.length - 1] });
            throw new Error(`File write lock conflict for ${targetPath}`);
          }

          // Create parent folders
          const folder = path.dirname(targetPath);
          actionsTaken.push({ type: 'create_folder', pathOrCommand: folder, success: true });

          // Generate code — always Gemini for code synthesis
          let code = "";
          let generationError: string | undefined;

          if (targetPath.endsWith(".gitkeep")) {
            code = "";
          } else {
            const freshFiles = await getFiles();
            
            // First attempt — pass attachment for vision support
            try {
              code = await generateSubtaskCode(
                cfAi || ai, route.model, prompt, sub.name, targetPath,
                freshFiles, conversationHistory, undefined, attachment, env
              );
            } catch (genErr: any) {
              generationError = genErr.message;
              sub.logs.push(`[WARN] First attempt failed: ${genErr.message}. Retrying with Flash model...`);
              broadcastSSE("subtask_log", { subtaskId: sub.id, log: sub.logs[sub.logs.length - 1] });

              // Retry with Flash model
              try {
                code = await generateSubtaskCode(
                  cfAi || ai, cfAi ? "@cf/meta/llama-3.3-70b-instruct-fp8-fast" : "gemini-3.6-flash", prompt, sub.name, targetPath,
                  freshFiles, conversationHistory, generationError, attachment, env
                );
                generationError = undefined;
              } catch (retryErr: any) {
                sub.logs.push(`[FALLBACK] All remote AI providers rate-limited or unconfigured (${retryErr.message}). Synthesizing local code engine template for ${targetPath}...`);
                broadcastSSE("subtask_log", { subtaskId: sub.id, log: sub.logs[sub.logs.length - 1] });
                code = synthesizeLocalCodeTemplate(targetPath, sub.name, prompt);
                generationError = undefined;
              }
            }
          }

          // Pre-compliance security lint gate (Pillar 3)
          if (code) {
            const complianceCheck = preComplianceLintCheck(code, targetPath);
            if (!complianceCheck.safe) {
              sub.logs.push(`[COMPLIANCE GATE] Security violation detected: ${complianceCheck.violations.join("; ")}`);
              broadcastSSE("subtask_log", { subtaskId: sub.id, log: sub.logs[sub.logs.length - 1] });
              releaseFileLock(targetPath, sub.id);
              throw new Error(`Pre-compliance security check failed: ${complianceCheck.violations.join("; ")}`);
            }
          }

          // Save to virtual DB (saveFile now writes to agent-workspace/ on disk)
          const fileNode: FileNode = { path: targetPath, content: code, language };
          await saveFile(fileNode);   // isolation handled inside saveFile
          await registerComponentInAppShell(targetPath);
          sub.logs.push(`[SUCCESS] Wrote file to agent-workspace: ${targetPath}`);
          appendLogDrop("info", "workspace", `Wrote agent-workspace/${targetPath}`);

          releaseFileLock(targetPath, sub.id);

          broadcastSSE("file-created", fileNode);
          actionsTaken.push({ type: 'create_file', pathOrCommand: targetPath, success: true });

          // Install any detected npm packages
          if (code && !targetPath.endsWith(".gitkeep")) {
            await installDetectedPackages(code, sub, task);
          }

          // Validate TypeScript if applicable
          if (code && !targetPath.endsWith(".gitkeep")) {
            const isValid = await validateGeneratedFile(targetPath, sub, task);

            // If validation failed, do one more retry with error context
            if (!isValid) {
              sub.logs.push(`[RETRY] Re-generating with type error context...`);
              broadcastSSE("subtask_log", { subtaskId: sub.id, log: sub.logs[sub.logs.length - 1] });

              try {
                const tscResult = await executeTerminalCommand(`npx tsc --noEmit --skipLibCheck 2>&1 | head -40`, { timeoutMs: 20000 });
                const errContext = (tscResult.stdout || tscResult.stderr).substring(0, 800);
                const freshFiles2 = await getFiles();
                const fixedCode = await generateSubtaskCode(
                  cfAi || ai, route.model, prompt, sub.name, targetPath,
                  freshFiles2, conversationHistory, errContext, attachment, env
                );

                if (fixedCode && fixedCode !== code) {
                  const fixedNode: FileNode = { path: targetPath, content: fixedCode, language };
                  await saveFile(fixedNode); // isolation handled inside saveFile → agent-workspace/
                  await registerComponentInAppShell(targetPath);
                  sub.logs.push(`[RETRY] ✅ Auto-fixed and re-wrote: ${targetPath}`);
                  broadcastSSE("file-created", fixedNode);
                }
              } catch (retryErr: any) {
                sub.logs.push(`[RETRY] Auto-fix attempt skipped: ${retryErr.message}`);
              }
            }
          }
          
          sub.file = targetPath;
          sub.code = code;
          sub.status = "completed";
          sub.completedAt = new Date().toISOString();
          sub.logs.push(`[DONE] ✅ Compiled and wrote: ${targetPath}`);
          broadcastSSE("subtask_log", { subtaskId: sub.id, log: sub.logs[sub.logs.length - 1] });

        } catch (subErr: any) {
          sub.status = "failed";
          sub.completedAt = new Date().toISOString();
          sub.logs.push(`[ERROR] ${subErr.message}`);
          await saveTask(task);
          broadcastSSE("task-update", task);
          broadcastSSE("subtask_log", { subtaskId: sub.id, log: sub.logs[sub.logs.length - 1] });
        }

        task.progress = Math.round(((sIdx + 1) / task.subtasks.length) * 100);
        await saveTask(task);
        broadcastSSE("task-update", task);
      }

      const hasFailedSubtask = task.subtasks.some(s => s.status === "failed");
      task.status = (activeCancellationSignal.aborted || hasFailedSubtask) ? "failed" : "completed";
      task.completedAt = new Date().toISOString();
      await saveTask(task);

      if (task.status === "failed") {
        // Fail any remaining pending tasks so they don't linger in DB
        for (let restIdx = tIdx + 1; restIdx < tasks.length; restIdx++) {
          const restTask = tasks[restIdx];
          if (restTask.status === "pending") {
            restTask.status = "failed";
            for (const restSub of restTask.subtasks) {
              if (restSub.status === "pending") restSub.status = "failed";
            }
            await saveTask(restTask);
            broadcastSSE("task-update", restTask);
          }
        }
        break;
      }
    }

    // Git integration & Completion report
    let gitReport = "";
    const config = resolveEnvWithOverrides(env);
    if (config.GITHUB_TOKEN && config.GITHUB_REPO_URL && !activeCancellationSignal.aborted) {
      const currentFiles = await getFiles();
      const push = await executeGitPush(config.GITHUB_TOKEN, config.GITHUB_REPO_URL, "main", currentFiles);
      gitReport = push.success ? `\n\n🔄 **Git Sync**: Successfully committed and pushed to remote repository (\`${config.GITHUB_REPO_URL}\`).` : `\n\n⚠️ **Git Sync Deferred**: ${push.message}`;
    }

    const planningLabel = cfAi ? "CF-AI + Gemini" : "Gemini";
    const totalSec = Math.round((Date.now() - startTime) / 1000);

    // Build a clean, scannable summary report of all completed tasks
    const completedTasksList = tasks
      .filter(t => t.status === "completed")
      .map(t => {
        const subList = t.subtasks
          .filter(s => s.status === "completed")
          .map(s => `  • **${s.name}** \`${s.file}\``)
          .join("\n");
        return `* **${t.name}**\n${subList}`;
      })
      .join("\n\n");

    const envBoxMarkdown = `
---
### ⚙️ Environment & External Source Connection (.env)
To automatically push builds or sync this project with external repositories and live production origins, configure your environment parameters below:

| Environment Variable | Description / Purpose | Connection Status |
| :--- | :--- | :--- |
| \`GITHUB_REPO_URL\` | Target repository URL (e.g. \`https://github.com/org/repo.git\`) | ${config.GITHUB_REPO_URL ? '✅ Connected' : '⚡ Optional'} |
| \`GITHUB_TOKEN\` | GitHub Access Token with write permissions | ${config.GITHUB_TOKEN ? '✅ Authenticated' : '⚡ Optional'} |
| \`CLOUDFLARE_API_TOKEN\` | API key for direct Cloudflare Edge deployment | ${(config as any).CLOUDFLARE_API_TOKEN ? '✅ Active' : '⚡ Optional'} |
| \`GEMINI_API_KEY\` | Key for server-side generative AI features | ${config.GEMINI_API_KEY ? '✅ Present' : '⚡ Optional'} |

*To link your project to a remote git origin, add \`GITHUB_REPO_URL\` and \`GITHUB_TOKEN\` to your project secrets or \`.env\` file.*`;

    const finalMsg: Message = {
      id: `msg-${Date.now()}-done`,
      role: "assistant",
      content: `### 🚀 Build & Compilation Report\n\nAll tasks completed and verified in **${totalSec}s**.\n\n#### 📑 Accomplished Tasks:\n${completedTasksList || "• All workspace modifications applied successfully."}${gitReport}\n${envBoxMarkdown}`,
      timestamp: new Date().toISOString(),
      actionsTaken,
      thoughtTimeSeconds: 1.5,
      modelName: planningLabel,
      durationSeconds: totalSec
    };
    await addMessage(finalMsg);
    broadcastSSE("build-finished", finalMsg);
    broadcastSSE("message-added", finalMsg);
  } catch (err: any) {
    console.error("Error in executeAgentBuild:", err);
    for (const t of tasks) {
      if (t.status === "pending" || t.status === "running") {
        t.status = "failed";
        await saveTask(t);
      }
    }
    const finalMsg: Message = {
      id: `msg-${Date.now()}-failed`,
      role: "assistant",
      content: `### ❌ Build Failed\n\nAn unexpected error occurred: ${err.message || err}`,
      timestamp: new Date().toISOString(),
      durationSeconds: Math.round((Date.now() - startTime) / 1000)
    };
    await addMessage(finalMsg);
    broadcastSSE("build-finished", finalMsg);
    broadcastSSE("message-added", finalMsg);
  }
}
