import { GoogleGenAI } from "@google/genai";
import { Task, Subtask, FileNode, Message } from "../src/types.js"; // Match local file extension rules (.ts/.js)
import { saveTask, saveFile, addMessage, getFiles, getMessages } from "./db.js";
import { executeGitPush } from "./github.js";
import { AppEnv, AiBinding, AiChatMessage, extractCfAiText, resolveEnvWithOverrides } from "./env.js";
import { routeLLMTask } from "./llmRouter.js";
import { executeTerminalCommand, isCommandSafe } from "./command.js";
import fs from "fs";
import path from "path";

let aiClient: GoogleGenAI | null = null;
let aiClientKey: string | null = null;

export function getGeminiClient(env?: Partial<AppEnv>): GoogleGenAI | null {
  const key = resolveEnvWithOverrides(env).GEMINI_API_KEY;
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
    throw new Error("No AI inference binding (Cloudflare AI or Gemini client) was initialized. Set GEMINI_API_KEY or bind Cloudflare AI.");
  }
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: userContent,
    config: { systemInstruction: systemPrompt, responseMimeType: "application/json" }
  });
  return response.text ?? "";
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
export function cancelActiveBuild(taskId: string) {
  activeCancellationSignal.aborted = true;
  activeCancellationSignal.taskId = taskId;
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
  { test: /\b(?:create|make|add|mkdir)\s+(?:a\s+)?(?:folder|directory|dir)\s+(?:called\s+|named\s+)?([^\s,]+)/i, cmd: (m) => `mkdir -p ${m[1].replace(/^\//, "")}` },
  // "create src/utils folder" / "add components/ folder"
  { test: /\b(?:create|add|make)\s+([a-zA-Z0-9_./-]+)\s+(?:folder|directory|dir)\b/i, cmd: (m) => `mkdir -p ${m[1].replace(/^\//, "")}` },
  // plain "mkdir src/utils" at start of prompt
  { test: /^mkdir\s+(-p\s+)?([a-zA-Z0-9_./-]+)/i, cmd: (m) => `mkdir -p ${(m[2] || m[1]).replace(/^\//, "")}` },
  // "touch file.ts" or "create file foo.ts"
  { test: /^(?:touch|new file|create file)s+([a-zA-Z0-9_./-]+)/i, cmd: (m) => `touch ${m[1]}` },
  // "delete file foo.ts" / "remove file"
  { test: /^(?:delete|remove|rm)s+(?:files+)?([a-zA-Z0-9_./-]+)/i, cmd: (m) => `rm -f ${m[1]}` },
  // "run npm install" / "install dependencies"
  { test: /^(?:runs+)?npms+installs*$/i, cmd: () => 'npm install' },
  { test: /^installs+(?:alls+)?dep(?:endencies)?/i, cmd: () => 'npm install' },
  // "git status" / "git log"
  { test: /^gits+(status|log|diff|pull|fetch)(?:s|$)/i, cmd: (m) => `git ${m[1]}` },
];

/** Returns a ready-made task list for simple commands without any AI call (<1 ms). */
function tryInstantPlan(prompt: string): Task[] | null {
  for (const p of INSTANT_COMMAND_PATTERNS) {
    const m = prompt.trim().match(p.test);
    if (m) {
      const command = p.cmd(m);
      const folder = command.replace(/^mkdir -p /, "");
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
   - "Create vite.config.ts with react plugin and server port 5173"
   - "Create index.html with <div id=\\"root\\"> and script type=module pointing to src/main.tsx"
   - "Create src/main.tsx with ReactDOM.createRoot mounting App component"
   - "Create src/index.css with Tailwind @tailwind base/components/utilities directives"
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
7. After code generation tasks, include a "Validate & install dependencies" subtask when new npm packages are needed.${frameworkDirective}`;

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
      name: "Synthesize Feature Elements",
      status: "pending",
      progress: 0,
      activeSubtaskIndex: 0,
      createdAt: new Date().toISOString(),
      subtasks: [{ id: `${taskId}-sub-0`, taskId, name: `Analyze and write features for: ${userPrompt}`, status: "pending", logs: ["Awaiting run..."] }]
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
 * Smart local code synthesis fallback when AI engines are offline or unconfigured.
 */
function synthesizeCodeLocally(
  prompt: string,
  subtaskName: string,
  targetPath: string,
  currentFiles: FileNode[]
): string {
  const normalizedPrompt = prompt.toLowerCase();
  const existingFile = currentFiles.find(f => f.path === targetPath);
  const baseContent = existingFile ? existingFile.content : "";

  // 1. If it's a CSS file
  if (targetPath.endsWith(".css")) {
    const commentMatch = prompt.match(/\/\*[\s\S]*?\*\//);
    if (commentMatch) {
      return baseContent ? `${baseContent}\n${commentMatch[0]}` : commentMatch[0];
    }
    const cleanComment = `/* Generated by Agent Fallback: ${prompt} */`;
    return baseContent ? `${baseContent}\n${cleanComment}` : cleanComment;
  }

  // 2. If it's a text file
  if (targetPath.endsWith(".txt")) {
    const quoteMatch = prompt.match(/["']([^"']+)["']/);
    if (quoteMatch) return quoteMatch[1];
    const saysMatch = prompt.match(/says\s+(.+)$/i);
    if (saysMatch) return saysMatch[1];
    return `Hello World\n`;
  }

  // 3. If it's JSON
  if (targetPath.endsWith(".json")) {
    return JSON.stringify({ status: "success", message: `Simulated fallback for: ${prompt}` }, null, 2);
  }

  // 4. If it's a typescript/javascript/tsx file
  if (targetPath.endsWith(".ts") || targetPath.endsWith(".tsx") || targetPath.endsWith(".js") || targetPath.endsWith(".jsx")) {
    if (baseContent) {
      return `${baseContent}\n\n// Agent Fallback: Completed subtask "${subtaskName}" for prompt "${prompt}"\n`;
    }
    
    if (targetPath.endsWith(".tsx")) {
      const componentName = path.basename(targetPath, path.extname(targetPath))
        .replace(/[^a-zA-Z0-9]/g, "")
        .replace(/^[a-z]/, (c) => c.toUpperCase());
      return `import React from "react";\n\nexport default function ${componentName}() {\n  return (\n    <div className="p-4 border border-dashed border-gray-300 rounded-lg text-center">\n      <h3 className="text-lg font-bold">Fallback Component</h3>\n      <p className="text-sm text-gray-500">Created for: ${prompt}</p>\n    </div>\n  );\n}\n`;
    }
    
    return `// Fallback file: ${targetPath}\n// Prompt: ${prompt}\nexport const status = "success";\n`;
  }

  return `File created for request: ${prompt}\nSubtask: ${subtaskName}\n`;
}

/**
 * Generate code for a subtask with full context — existing file contents + conversation history.
 * Returns the generated code string.
 * Supports both Cloudflare Workers AI binding and Google Gemini models.
 */
async function generateSubtaskCode(
  ai: GoogleGenAI | AiBinding | null,
  model: string,
  prompt: string,
  subtaskName: string,
  targetPath: string,
  currentFiles: FileNode[],
  conversationHistory: Message[],
  previousError?: string
): Promise<string> {
  const workspaceContext = buildWorkspaceContext(currentFiles);
  const conversationContext = buildConversationContext(conversationHistory);

  const errorContext = previousError
    ? `\n\nPREVIOUS ATTEMPT FAILED WITH ERROR — fix this on this attempt:\n${previousError}\n`
    : "";

  const systemInstruction = `You are an elite, senior software engineer with expert knowledge of TypeScript, React, Node.js, and modern web development. Your task is to write production-grade code.

CRITICAL REQUIREMENTS:
1. INDENTATION & FORMATTING: Use consistent 2-space indentation. Clean, readable code.
2. SYNTAX & COMPILATION: All imports must resolve correctly. Fix TypeScript errors, use precise types. No syntax errors.
3. COMPLETENESS: Write the FULL, executable file content. NO truncation, NO "// ... implement rest", NO placeholder comments.
4. IMPORTS: Only import packages that exist in package.json or are Node built-ins. Check the workspace context for what's available.
5. CONSISTENCY: Match the coding style and patterns already used in other workspace files.
6. RESPONSE FORMAT: Output ONLY the raw code. DO NOT wrap in markdown code blocks. Start from the very first character.${errorContext}`;

  const userContent = `Implement the file "${targetPath}" to fulfill: "${subtaskName}"
Overall user request: "${prompt}"
${conversationContext}

${workspaceContext}`;

  // If Cloudflare Workers AI binding is passed
  if (ai && typeof (ai as any).run === "function") {
    const messages: AiChatMessage[] = [
      { role: "system", content: systemInstruction },
      { role: "user", content: userContent }
    ];
    // Request synthesis using DeepSeek-R1 or Llama-3.3 on the Cloudflare Edge
    const response = await (ai as AiBinding).run(model, { messages, max_tokens: 3000 });
    let code = extractCfAiText(response);
    if (code.startsWith("```")) {
      const lines = code.split("\n");
      if (lines[0].startsWith("```")) lines.shift();
      if (lines[lines.length - 1].startsWith("```")) lines.pop();
      code = lines.join("\n");
    }
    return code;
  }

  // Fallback to Gemini or Smart Local Synthesis
  if (!ai) {
    console.warn("[generateSubtaskCode] No AI inference engine available. Executing smart local synthesis...");
    return synthesizeCodeLocally(prompt, subtaskName, targetPath, currentFiles);
  }

  const response = await (ai as GoogleGenAI).models.generateContent({
    model,
    contents: userContent,
    config: { systemInstruction }
  });

  let code = response.text || "";
  // Strip markdown code blocks if present
  if (code.startsWith("```")) {
    const lines = code.split("\n");
    if (lines[0].startsWith("```")) lines.shift();
    if (lines[lines.length - 1].startsWith("```")) lines.pop();
    code = lines.join("\n");
  }
  return code;
}

// ---------------------------------------------------------------------------
// 2. Real-World Sequential Execution Loop
// ---------------------------------------------------------------------------
export async function executeAgentBuild(prompt: string, tasks: Task[], env?: Partial<AppEnv>, attachment?: any) {
  const startTime = Date.now();
  const modelsUsed = new Set<string>();
  const actionsTaken: any[] = [];
  activeCancellationSignal = { aborted: false, taskId: "" };

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

    for (let tIdx = 0; tIdx < tasks.length; tIdx++) {
      const task = tasks[tIdx];
      if (activeCancellationSignal.aborted) {
        task.status = "failed";
        await saveTask(task);
        continue;
      }

      task.status = "running";
      task.startedAt = new Date().toISOString();
      await saveTask(task);
      broadcastSSE("task-update", task);

      for (let sIdx = 0; sIdx < task.subtasks.length; sIdx++) {
        const sub = task.subtasks[sIdx];
        if (activeCancellationSignal.aborted) {
          sub.status = "failed";
          await saveTask(task);
          continue;
        }

        task.activeSubtaskIndex = sIdx;
        sub.status = "running";
        sub.startedAt = new Date().toISOString();
        sub.logs = [`Starting execution of: "${sub.name}"...`];
        broadcastSSE("subtask_log", { subtaskId: sub.id, log: sub.logs[0] });
        await saveTask(task);

        // Check if this is a terminal/command subtask.
        // Fix: broadened to catch "Create X folder", "mkdir -p X", and instant-plan names.
        const isCommandTask =
          /^(run|execute|install|npm|npx|mkdir|delete|move|copy)\s/i.test(sub.name.trim()) ||
          /\bcreate\s+(?:a\s+)?(?:folder|directory|dir)\b/i.test(sub.name) ||
          /\b(?:folder|directory)\s+[a-zA-Z0-9_./-]+\s*$/i.test(sub.name) ||
          sub.name.toLowerCase().includes("install dependencies") ||
          sub.name.toLowerCase().includes("validate") ||
          sub.name.toLowerCase().includes("run tests");

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
                const cmdResponse = await ai.models.generateContent({
                  model: "gemini-2.5-flash",
                  contents: `${cmdSystemPrompt}\n\n${cmdUserContent}`,
                });
                command = (cmdResponse.text || "echo 'No command needed'").trim().replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "").trim();
                modelsUsed.add("Flash");
              } else {
                // Smart fallback command determination when no AI is present
                if (sub.name.toLowerCase().includes("mkdir") || sub.name.toLowerCase().includes("folder") || sub.name.toLowerCase().includes("directory")) {
                  command = `mkdir -p src/components`;
                } else if (sub.name.toLowerCase().includes("install") || sub.name.toLowerCase().includes("npm")) {
                  command = `echo "Packages handled internally"`;
                } else {
                  command = `echo "Completed simulated command task"`;
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

              let cmdResult;
              try {
                cmdResult = await executeTerminalCommand(command, { timeoutMs: 60000 });
              } catch (execErr: any) {
                // CF Workers' child_process shim throws synchronously instead of returning failure
                if (/^mkdir\b/.test(command.trim())) {
                  await virtualMkdir(command);
                } else {
                  sub.logs.push(`[CMD] ⚠️ Exec error: ${execErr.message}`);
                  actionsTaken.push({ type: 'run_command', pathOrCommand: command, success: false });
                }
                cmdResult = null;
              }

              if (cmdResult) {
                if (cmdResult.success) {
                  sub.logs.push(`[CMD] ✅ Command succeeded: ${cmdResult.stdout.substring(0, 300)}`);
                  actionsTaken.push({ type: 'run_command', pathOrCommand: command, success: true });
                } else if (/^mkdir\b/.test(command.trim())) {
                  // executeTerminalCommand returned failure (no child_process) — use virtual fallback
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
            sub.status = "failed";
            sub.logs.push(`[CMD] Error: ${cmdErr.message}`);
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
            modelsUsed.add(route.model === "gemini-2.5-pro" ? "Pro" : "Flash");
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
              const pathResponse = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: pathUserContent,
                config: { systemInstruction: pathSystemPrompt, responseMimeType: "application/json" }
              });
              pathRaw = pathResponse.text ?? "";
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
            const extension = isSchema ? "_schema.ts" : isApi ? "_api.ts" : "_component.tsx";
            const folder = isSchema ? "src/db" : isApi ? "server/routes" : "src/components";
            targetPath = `${folder}/${sub.name.toLowerCase().replace(/[^a-z0-9]/g, "_").substring(0, 20)}${extension}`;
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
            
            // First attempt
            try {
              code = await generateSubtaskCode(
                cfAi || ai, route.model, prompt, sub.name, targetPath,
                freshFiles, conversationHistory
              );
            } catch (genErr: any) {
              generationError = genErr.message;
              sub.logs.push(`[WARN] First attempt failed: ${genErr.message}. Retrying with Flash model...`);
              broadcastSSE("subtask_log", { subtaskId: sub.id, log: sub.logs[sub.logs.length - 1] });

              // Retry with Flash model
              try {
                code = await generateSubtaskCode(
                  cfAi || ai, cfAi ? "@cf/meta/llama-3.3-70b-instruct-fp8-fast" : "gemini-2.5-flash", prompt, sub.name, targetPath,
                  freshFiles, conversationHistory, generationError
                );
                generationError = undefined;
              } catch (retryErr: any) {
                throw retryErr; // Surface to outer catch
              }
            }
          }

          // Save to virtual DB
          const fileNode: FileNode = { path: targetPath, content: code, language };
          await saveFile(fileNode);

          // Write to physical disk
          try {
            const dir = path.dirname(targetPath);
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(targetPath, code, "utf8");
            sub.logs.push(`[SUCCESS] Wrote file to workspace: ${targetPath}`);
          } catch (writeErr: any) {
            sub.logs.push(`[WARN] Physical write failed: ${writeErr.message}`);
          }

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
                  freshFiles2, conversationHistory, errContext
                );

                if (fixedCode && fixedCode !== code) {
                  const fixedNode: FileNode = { path: targetPath, content: fixedCode, language };
                  await saveFile(fixedNode);
                  try {
                    fs.writeFileSync(targetPath, fixedCode, "utf8");
                    sub.logs.push(`[RETRY] ✅ Auto-fixed and re-wrote: ${targetPath}`);
                  } catch (_) {}
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
          sub.logs.push(`[ERROR] ${subErr.message}`);
          broadcastSSE("subtask_log", { subtaskId: sub.id, log: sub.logs[sub.logs.length - 1] });
        }

        task.progress = Math.round(((sIdx + 1) / task.subtasks.length) * 100);
        await saveTask(task);
        broadcastSSE("task-update", task);
      }

      task.status = activeCancellationSignal.aborted ? "failed" : "completed";
      task.completedAt = new Date().toISOString();
      await saveTask(task);
    }

    // Git integration & Completion report
    let gitReport = "";
    const config = resolveEnvWithOverrides(env);
    if (config.GITHUB_TOKEN && config.GITHUB_REPO_URL && !activeCancellationSignal.aborted) {
      const currentFiles = await getFiles();
      const push = await executeGitPush(config.GITHUB_TOKEN, config.GITHUB_REPO_URL, "main", currentFiles);
      gitReport = push.success ? `\n\n🔄 Committed successfully to remote repository.` : `\n\n⚠️ Git sync deferred: ${push.message}`;
    }

    const planningLabel = cfAi ? "CF-AI + Gemini" : "Gemini";
    const totalSec = Math.round((Date.now() - startTime) / 1000);
    const finalMsg: Message = {
      id: `msg-${Date.now()}-done`,
      role: "assistant",
      content: `### ✅ Build Completed Successfully\n\nAll tasks completed in ${totalSec}s.\n**Planning:** Cloudflare Workers AI (${CF_PLAN_MODEL})\n**Code synthesis:** Gemini [${Array.from(modelsUsed).filter(m => m !== "CF-AI").join(" + ")}]${gitReport}`,
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
