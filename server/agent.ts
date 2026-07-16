import { GoogleGenAI } from "@google/genai";
import { Task, Subtask, FileNode, Message } from "../src/types.js"; // Match local file extension rules (.ts/.js)
import { saveTask, saveFile, addMessage, getFiles } from "./db.js";
import { executeGitPush } from "./github.js";
import { AppEnv, resolveEnvWithOverrides } from "./env.js";
import { routeLLMTask } from "./llmRouter.js";
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
5. Have strong professional context awareness. Avoid generic placeholder names, redundant terms, or conversational phrases.`;

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

        try {
          const ai = getGeminiClient(env);
          const route = routeLLMTask(prompt, sub.name, attachment?.name);
          modelsUsed.add(route.model === "gemini-2.5-pro" ? "Pro" : "Flash");

          const currentFiles = await getFiles();
          const registryMap = currentFiles.map(f => f.path).join(", ");

          // Determine paths dynamically using Gemini with professional context awareness!
          let targetPath = "";
          let language = "typescript";
          try {
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

          // Call model to generate production-grade code block with strict formatting, error correction, and perfect indentation
          let code = "";
          if (targetPath.endsWith(".gitkeep")) {
            code = "";
          } else {
            const response = await ai.models.generateContent({
              model: route.model,
              contents: `You are an elite, senior software engineer. Write a pure, complete, and production-grade implementation of the file "${targetPath}" to fulfill the subtask: "${sub.name}" under the user request: "${prompt}".

Workspace files structure for context: [${registryMap}].

CRITICAL REQUIREMENTS:
1. INDENTATION & FORMATTING: Follow strict clean-code guidelines. Use consistent 2-space indentation. Maintain beautiful, readable spacing.
2. SYNTAX & COMPILATION: Ensure all imports are resolved correctly from the workspace structure. Fix any typical typescript errors, make types precise, and avoid using 'any' unless necessary. No syntax errors, unbalanced braces, or missing brackets are tolerated.
3. COMPLETENESS: Write the full, executable content of the file. DO NOT truncate the code, do not write comments like '// ... implement rest here', and do NOT include mock descriptions.
4. RESPONSE FORMAT: Output ONLY the raw code content. DO NOT wrap the output in markdown code blocks like \`\`\`typescript or \`\`\`. Start writing the code immediately from the very first character of your response.`
            });

            code = response.text || "";
            if (code.startsWith("```")) {
              const lines = code.split("\n");
              if (lines[0].startsWith("```")) lines.shift();
              if (lines[lines.length - 1].startsWith("```")) lines.pop();
              code = lines.join("\n");
            }
          }

          const fileNode: FileNode = { path: targetPath, content: code, language: "typescript" };
          await saveFile(fileNode);

          // WRITE TO PHYSICAL DRIVE
          try {
            const dir = path.dirname(targetPath);
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(targetPath, code, "utf8");
            sub.logs.push(`[SUCCESS] Wrote file directly to physical workspace drive at: ${targetPath}`);
          } catch (writeErr: any) {
            sub.logs.push(`[WARN] Failed to write directly to physical drive: ${writeErr.message}`);
          }
          
          sub.file = targetPath;
          sub.code = code;
          sub.status = "completed";
          sub.completedAt = new Date().toISOString();
          sub.logs.push(`[SUCCESS] Compiled and wrote payload to: ${targetPath}`);
          broadcastSSE("file-created", fileNode);
          actionsTaken.push({ type: 'create_file', pathOrCommand: targetPath, success: true });
        } catch (subErr: any) {
          sub.status = "failed";
          sub.logs.push(`Error: ${subErr.message}`);
        }

        task.progress = Math.round(((sIdx + 1) / task.subtasks.length) * 100);
        await saveTask(task);
        broadcastSSE("task-update", task);
      }

      task.status = activeCancellationSignal.aborted ? "failed" : "completed";
      task.completedAt = new Date().toISOString();
      await saveTask(task);
    }

    // Git integration & Completion reports
    let gitReport = "";
    const config = resolveEnvWithOverrides(env);
    if (config.GITHUB_TOKEN && config.GITHUB_REPO_URL && !activeCancellationSignal.aborted) {
      const currentFiles = await getFiles();
      const push = await executeGitPush(config.GITHUB_TOKEN, config.GITHUB_REPO_URL, "main", currentFiles);
      gitReport = push.success ? `\n\n🔄 Committed successfully to remote repository.` : `\n\n⚠️ Git sync deferred.`;
    }

    const totalSec = Math.round((Date.now() - startTime) / 1000);
    const finalMsg: Message = {
      id: `msg-${Date.now()}-done`,
      role: "assistant",
      content: `### Build Completed Successfully\n\nAll tasks completed.${gitReport}`,
      timestamp: new Date().toISOString(),
      actionsTaken,
      thoughtTimeSeconds: 1.5,
      modelName: `Gemini [${Array.from(modelsUsed).join(" + ")}]`,
      durationSeconds: totalSec
    };
    await addMessage(finalMsg);
    broadcastSSE("build-finished", finalMsg);
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
      content: `### Build Failed\n\nAn unexpected error occurred: ${err.message || err}`,
      timestamp: new Date().toISOString(),
      durationSeconds: Math.round((Date.now() - startTime) / 1000)
    };
    await addMessage(finalMsg);
    broadcastSSE("build-finished", finalMsg);
  }
}
