import { GoogleGenAI } from "@google/genai";
import { Task, Subtask, FileNode, Message } from "../src/types.js"; // Match local file extension rules (.ts/.js)
import { saveTask, saveFile, addMessage, getFiles, getMessages } from "./db.js";
import { executeGitPush } from "./github.js";
import { AppEnv, resolveEnvWithOverrides } from "./env.js";
import { routeLLMTask } from "./llmRouter.js";
import { executeTerminalCommand, isCommandSafe } from "./command.js";
import fs from "fs";
import path from "path";

let aiClient: GoogleGenAI | null = null;
let aiClientKey: string | null = null;

export function getGeminiClient(env?: Partial<AppEnv>): GoogleGenAI {
  const key = resolveEnvWithOverrides(env).GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is required. Please set it in Settings.");
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

export const sseClients = new Set<any>();

export function broadcastSSE(event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (err) {
      sseClients.delete(client);
    }
  }
}

export function safeParseJSON(rawText: string): any {
  const trimmed = rawText.trim();
  try { return JSON.parse(trimmed); } catch {
    const firstBrace = trimmed.indexOf('{');
    const firstBracket = trimmed.indexOf('[');
    let startIndex = firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket) ? firstBrace : firstBracket;
    if (startIndex === -1) throw new Error("No JSON structure found.");
    
    // Attempt greedy bracket matching extraction
    const jsonRegex = /(\{[\s\S]*\}|\[[\s\S]*\])/;
    const match = trimmed.match(jsonRegex);
    if (match) return JSON.parse(match[0].trim());
    throw new Error("Failed to parse extracted JSON block");
  }
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

// 1. Dynamic Task Planner
export async function planBuildTasks(userPrompt: string, env?: Partial<AppEnv>, attachment?: any): Promise<Task[]> {
  try {
    const ai = getGeminiClient(env);
    const existingFiles = await getFiles();
    const workspaceLayout = existingFiles.map(f => f.path).join(", ") || "None";

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
7. After code generation tasks, include a "Validate & install dependencies" subtask when new npm packages are needed.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Plan tasks for: "${userPrompt}"\nWorkspace: ${workspaceLayout}`,
      config: { systemInstruction, responseMimeType: "application/json" }
    });

    const result = safeParseJSON(response.text || "{}");
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
    // Return direct atomic fallback task on failure
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
 * Generate code for a subtask with full context — existing file contents + conversation history.
 * Returns the generated code string.
 */
async function generateSubtaskCode(
  ai: GoogleGenAI,
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

  const response = await ai.models.generateContent({
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

// 2. Real-World Sequential Execution Loop
export async function executeAgentBuild(prompt: string, tasks: Task[], env?: Partial<AppEnv>, attachment?: any) {
  const startTime = Date.now();
  const modelsUsed = new Set<string>();
  const actionsTaken: any[] = [];
  activeCancellationSignal = { aborted: false, taskId: "" };

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

        // Check if this is a terminal/command subtask
        const isCommandTask = /^(run|execute|install|npm|npx|mkdir|create folder|delete|move|copy)\s/i.test(sub.name.trim()) ||
          sub.name.toLowerCase().includes("install dependencies") ||
          sub.name.toLowerCase().includes("validate") ||
          sub.name.toLowerCase().includes("run tests");

        if (isCommandTask) {
          try {
            // Ask Gemini to determine the best command to run
            const ai = getGeminiClient(env);
            const currentFiles = await getFiles();
            const cmdPrompt = `You are a DevOps expert. Determine the best terminal shell command to execute for the task: "${sub.name}" in the context of request: "${prompt}".
Existing workspace files: [${currentFiles.map(f => f.path).join(", ")}]

Rules:
- Return a single shell command as a plain string (no markdown, no explanation, no code fences).
- The command must be safe, non-interactive, and not require user input.
- Prefer npm/npx commands for JavaScript/TypeScript tasks.
- If it's a folder creation task, use: mkdir -p <path>
- If no meaningful command applies, return: echo "No command needed"`;

            const cmdResponse = await ai.models.generateContent({
              model: "gemini-2.5-flash",
              contents: cmdPrompt,
            });

            let command = (cmdResponse.text || "echo 'No command needed'").trim().replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "").trim();

            sub.logs.push(`[CMD] Preparing to execute: ${command}`);
            broadcastSSE("subtask_log", { subtaskId: sub.id, log: sub.logs[sub.logs.length - 1] });

            const safeCheck = isCommandSafe(command);
            if (!safeCheck.safe) {
              sub.logs.push(`[CMD] ⚠️ Command blocked by security policy: ${safeCheck.reason}`);
            } else {
              const cmdResult = await executeTerminalCommand(command, { timeoutMs: 60000 });
              if (cmdResult.success) {
                sub.logs.push(`[CMD] ✅ Command succeeded: ${cmdResult.stdout.substring(0, 300)}`);
                actionsTaken.push({ type: 'run_command', pathOrCommand: command, success: true });
              } else {
                sub.logs.push(`[CMD] ⚠️ Command output: ${(cmdResult.stderr || cmdResult.stdout).substring(0, 300)}`);
                actionsTaken.push({ type: 'run_command', pathOrCommand: command, success: false });
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
          const ai = getGeminiClient(env);
          const route = routeLLMTask(prompt, sub.name, attachment?.name);
          modelsUsed.add(route.model === "gemini-2.5-pro" ? "Pro" : "Flash");

          const currentFiles = await getFiles();
          const conversationHistory = await getMessages();

          // Determine target file path dynamically
          let targetPath = "";
          let language = "typescript";
          try {
            const registryMap = currentFiles.map(f => f.path).join(", ");
            const pathPrompt = `You are a Principal Software Engineer.
Determine the most appropriate file path (including correct folders and extension) and programming language to implement the subtask: "${sub.name}" for the overall request: "${prompt}".
Existing workspace files: [${registryMap}].

Rules:
- Choose standard professional paths (e.g., components in "src/components/", backend routes/apis in "server/routes/" or "server/api/", DB schema in "src/db/schema.ts" or "server/schema.ts").
- Keep it highly professional and literal. DO NOT hardcode placeholder names like "determine_the_desire_co_component.tsx".
- If the subtask is about folder creation, decide on the best name for the new folder based on its description, and return the folder path with a "/.gitkeep" file (e.g. "src/components/MyNewFolder/.gitkeep").
- If the file type is JSON, return "json" as the language. If CSS, return "css". If TSX/TS/JS, return "typescript".

Return ONLY a valid JSON object starting and ending with braces:
{
  "path": "the/file/path.ext",
  "language": "typescript|json|css"
}`;

            const pathResponse = await ai.models.generateContent({
              model: "gemini-2.5-flash",
              contents: pathPrompt,
              config: { responseMimeType: "application/json" }
            });
            
            const pathResult = safeParseJSON(pathResponse.text || "{}");
            if (pathResult.path) {
              targetPath = pathResult.path.trim().replace(/^\/+/, ""); // remove leading slashes
              language = pathResult.language || "typescript";
            }
          } catch (pathErr) {
            console.error("Failed to dynamically determine path, using fallback:", pathErr);
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

          // Generate code
          let code = "";
          let generationError: string | undefined;

          if (targetPath.endsWith(".gitkeep")) {
            code = "";
          } else {
            const freshFiles = await getFiles();
            
            // First attempt
            try {
              code = await generateSubtaskCode(
                ai, route.model, prompt, sub.name, targetPath,
                freshFiles, conversationHistory
              );
            } catch (genErr: any) {
              generationError = genErr.message;
              sub.logs.push(`[WARN] First attempt failed: ${genErr.message}. Retrying with Flash model...`);
              broadcastSSE("subtask_log", { subtaskId: sub.id, log: sub.logs[sub.logs.length - 1] });

              // Retry with Flash model
              try {
                code = await generateSubtaskCode(
                  ai, "gemini-2.5-flash", prompt, sub.name, targetPath,
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
                  ai, route.model, prompt, sub.name, targetPath,
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

    const totalSec = Math.round((Date.now() - startTime) / 1000);
    const finalMsg: Message = {
      id: `msg-${Date.now()}-done`,
      role: "assistant",
      content: `### ✅ Build Completed Successfully\n\nAll tasks completed in ${totalSec}s.${gitReport}`,
      timestamp: new Date().toISOString(),
      actionsTaken,
      thoughtTimeSeconds: 1.5,
      modelName: `Gemini [${Array.from(modelsUsed).join(" + ")}]`,
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
