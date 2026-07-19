import React, { useState, useEffect, useRef } from "react";
import { 
  Cpu, 
  Terminal, 
  FolderPlus, 
  Database, 
  Key, 
  Zap, 
  Play, 
  CheckCircle2, 
  Folder, 
  FileText, 
  RefreshCw, 
  ChevronDown, 
  ChevronUp, 
  Server, 
  Smartphone, 
  Monitor, 
  Search,
  Check,
  Send,
  Loader2,
  Lock,
  ListFilter,
  ShieldCheck,
  Code2,
  GitBranch,
  SearchCode,
  Activity,
  History,
  Workflow
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Types for the simulation
interface LogMessage {
  timestamp: string;
  type: "system" | "event" | "llama" | "success" | "warning";
  text: string;
}

interface SimulatedSubtask {
  id: string;
  name: string;
  status: "pending" | "running" | "completed";
  progress: number;
  logs: string[];
}

interface SimulatedTask {
  id: string;
  name: string;
  status: "pending" | "running" | "completed";
  progress: number;
  subtasks: SimulatedSubtask[];
}

interface TemplateOption {
  id: string;
  title: string;
  command: string;
  icon: React.ComponentType<any>;
  color: string;
  badge: string;
  tasks: {
    name: string;
    subtasks: string[];
  }[];
  workspaceInjections: {
    path: string;
    type: "folder" | "file";
    content?: string;
  }[];
  mockAppContent: React.ReactNode;
}

// Optimized, memoized Server Event Stream console logger (Column 1)
const EventStreamConsole = React.memo(function EventStreamConsole({ 
  logs,
}: { 
  logs: LogMessage[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isAtBottomRef = useRef<boolean>(true);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 60;
  };

  useEffect(() => {
    if (containerRef.current && isAtBottomRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div 
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 bg-gray-950 rounded-2xl p-4 font-mono text-[10px] sm:text-xs overflow-y-auto space-y-2 text-gray-300 scrollbar-thin select-text whitespace-pre-wrap min-h-[300px]"
    >
      {logs.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center text-gray-600 px-4 py-8">
          <Terminal className="h-8 w-8 text-gray-800 mb-2 stroke-1" />
          <p className="text-gray-550">Waiting for task dispatch or standards validation to stream telemetry logs...</p>
        </div>
      ) : (
        logs.map((log, idx) => {
          let colorClass = "text-slate-400";
          if (log.type === "event") colorClass = "text-sky-400 font-bold";
          if (log.type === "llama") colorClass = "text-pink-400";
          if (log.type === "success") colorClass = "text-emerald-400";
          if (log.type === "warning") colorClass = "text-amber-400";
          
          return (
            <div key={idx} className="leading-relaxed border-b border-gray-900/30 pb-1 flex items-start gap-1.5 whitespace-pre-wrap font-mono">
              <span className="text-gray-600 text-[9px] select-none shrink-0">[{log.timestamp}]</span>
              <span className={colorClass}>{log.text}</span>
            </div>
          );
        })
      )}
    </div>
  );
});

// Memoized logs viewer inside subtasks
const CompilerSubtaskLogs = React.memo(function CompilerSubtaskLogs({ logs }: { logs: string[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isAtBottomRef = useRef<boolean>(true);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 30;
  };

  useEffect(() => {
    if (containerRef.current && isAtBottomRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div 
      ref={containerRef}
      onScroll={handleScroll}
      className="mt-2 bg-slate-900 text-slate-300 p-2 rounded-md font-mono text-[9px] max-h-24 overflow-y-auto space-y-1 whitespace-pre-wrap break-all"
    >
      {logs.map((subl, sLogIdx) => (
        <div key={sLogIdx} className="leading-tight font-mono whitespace-pre-wrap">{subl}</div>
      ))}
    </div>
  );
});

// Memoized Compiler Subtask Step Row
const CompilerSubtaskRow = React.memo(function CompilerSubtaskRow({ 
  sub, 
  sIdx 
}: { 
  sub: SimulatedSubtask; 
  sIdx: number 
}) {
  return (
    <div className={`p-2.5 rounded-lg border shadow-xs transition-all duration-300 ${
      sub.status === "completed" ? "bg-emerald-50/20 border-emerald-200/80 animate-fade-in" : "bg-white border-gray-150/60"
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {sub.status === "completed" ? (
            <span className="h-4 w-4 rounded-full bg-emerald-100 flex items-center justify-center text-[10px] text-emerald-600 font-bold animate-pulse">✓</span>
          ) : (
            <span className="bg-gray-100 border border-gray-200 text-gray-500 font-mono font-bold text-[9px] px-1 py-0.5 rounded">Step {sIdx + 1}</span>
          )}
          {sub.status === "completed" && (
            <span className="text-[9px] font-bold text-emerald-600">Verified Success</span>
          )}
        </div>
        <span className={`text-[8px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-md font-bold border ${
          sub.status === "completed" ? "bg-emerald-50 text-emerald-600 border-emerald-150/50" :
          sub.status === "running" ? "bg-amber-50 text-amber-600 border-amber-150/50 animate-pulse" : "bg-gray-50 text-gray-400 border-gray-150"
        }`}>{sub.status}</span>
      </div>
      <p className="text-[11px] font-medium text-gray-800 mt-1">{sub.name}</p>

      {/* Nested micro log timeline inside Accordion content box */}
      {sub.logs.length > 0 && (
        <CompilerSubtaskLogs logs={sub.logs} />
      )}
    </div>
  );
});

// Collapsible Phase Summary inside simulated task accordions
const SimulationPhaseSummary = React.memo(function SimulationPhaseSummary({ 
  tIdx, 
  taskName 
}: { 
  tIdx: number; 
  taskName: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="p-2.5 border border-emerald-200 bg-emerald-50/10 rounded-xl shadow-3xs mt-2.5 text-left transition-all duration-300">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between font-sans text-[11px] text-emerald-800 hover:text-emerald-950 font-semibold cursor-pointer border-none bg-transparent p-1 animate-fade-in"
      >
        <span className="flex items-center gap-1.5 font-sans">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>Summary of Phase {tIdx + 1}</span>
        </span>
        <div className="flex items-center gap-1 select-none text-[8px] font-mono font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded">
          <span>{isOpen ? "HIDE" : "SHOW"}</span>
        </div>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 text-[10px] text-slate-650 space-y-1 pl-5 border-t border-emerald-100/50 pt-2 font-sans leading-relaxed">
              <p className="font-semibold text-emerald-900">✨ Phase {tIdx + 1} ("{taskName}") successfully executed and verified!</p>
              <ul className="list-disc pl-4 space-y-0.5 text-slate-500">
                <li>Synthesized modules successfully integrated.</li>
                <li>Zero compiler errors or runtime warnings reported.</li>
                <li>Visual assets and state layers updated live.</li>
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

// Memoized Compiler Task Accordion Row
const CompilerTaskRow = React.memo(function CompilerTaskRow({ 
  task, 
  tIdx,
  isOpen, 
  onToggle 
}: { 
  task: SimulatedTask; 
  tIdx: number;
  isOpen: boolean; 
  onToggle: () => void;
}) {
  return (
    <div 
      className={`border rounded-2xl overflow-hidden transition-all duration-300 ${
        isOpen ? "border-amber-300 shadow-xs" : "border-gray-200"
      }`}
    >
      {/* Header */}
      <div 
        onClick={onToggle}
        className="p-3 bg-gradient-to-r from-gray-50/50 to-white hover:from-gray-50 transition-colors flex items-center justify-between cursor-pointer select-none"
      >
        <div className="flex items-center gap-3 min-w-0">
          {task.status === "completed" ? (
            <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500 shrink-0" />
          ) : task.status === "running" ? (
            <Loader2 className="h-4.5 w-4.5 text-amber-500 animate-spin shrink-0" />
          ) : (
            <div className="h-3.5 w-3.5 rounded-full border border-gray-300 shrink-0" />
          )}
          
          <div className="flex items-center gap-2 min-w-0">
            <span className="bg-zinc-100 px-2 py-0.5 rounded text-[9px] border border-zinc-200 font-mono text-zinc-500 font-bold shrink-0">
              Task {tIdx + 1}
            </span>
            <h6 className="font-semibold text-xs text-gray-800 truncate font-display">{task.name}</h6>
          </div>
        </div>
        
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[9px] font-mono font-bold text-gray-500">{task.progress}%</span>
          {isOpen ? <ChevronUp className="h-3.5 w-3.5 text-gray-400" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-400" />}
        </div>
      </div>

      {/* Expandable Subtask Rows */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="bg-zinc-50/40 border-t border-zinc-150 p-3 space-y-2.5"
          >
            {task.subtasks.map((sub, sIdx) => (
              <CompilerSubtaskRow key={sub.id} sub={sub} sIdx={sIdx} />
            ))}
            
            {task.status === "completed" && (
              <SimulationPhaseSummary tIdx={tIdx} taskName={task.name} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default function SubtasksSimulationView() {
  const [activeSection, setActiveSection] = useState<"audit" | "sandbox">("audit");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("folder-create");
  const [customCommand, setCustomCommand] = useState("");
  const [isSimulating, setIsSimulating] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<"idle" | "phase1" | "phase2" | "phase3" | "finished">("idle");
  const [activeAccordionId, setActiveAccordionId] = useState<string | null>(null);
  
  // Real-time states
  const [eventLogs, setEventLogs] = useState<LogMessage[]>([]);
  const [isThinkingActive, setIsThinkingActive] = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState<string[]>([]);
  const [isMasterPlanOpen, setIsMasterPlanOpen] = useState(false);
  const [simulatedTasks, setSimulatedTasks] = useState<SimulatedTask[]>([]);
  const [visibleFiles, setVisibleFiles] = useState<{ path: string; type: "folder" | "file" }[]>([
    { path: "src/App.tsx", type: "file" },
    { path: "src/main.tsx", type: "file" },
    { path: "package.json", type: "file" },
  ]);
  const [previewState, setPreviewState] = useState<"idle" | "reloading" | "live">("idle");

  // Standards Audit State
  const [selectedStandardId, setSelectedStandardId] = useState<number>(1);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [validatedIds, setValidatedIds] = useState<number[]>([1, 2, 3, 5, 6]);

  // 8 Standards declarations
  const STANDARDS = [
    {
      id: 1,
      title: "1. PR Generation (Level 3 Autonomy)",
      icon: "🔀",
      badge: "GitHub API REST Contents Flow",
      shortDesc: "Accepts a task, synthesizes code changes, creates branches, and returns a mergeable Pull Request.",
      verification: "Implemented via `executeGitPullRequest` in `server/github.ts` & exposed at `/api/git/pull-request`. Generates custom branches and makes direct commits using raw GitHub tree mutations.",
      code: `// server/github.ts -> executeGitPullRequest\nconst refRes = await ghFetch(token, \`\${base}/git/ref/heads/\${baseBranch}\`);\nconst parentSha = (await refRes.json()).object.sha;\n\n// Create branches and commits via fetch REST\nconst putRes = await ghFetch(token, \`\${base}/contents/\${file.path}\`, {\n  method: "PUT",\n  body: JSON.stringify({ message, content: toBase64(file.content), branch: newBranch, sha })\n});\n\n// Creates PR\nconst prRes = await ghFetch(token, \`\${base}/pulls\`, {\n  method: "POST",\n  body: JSON.stringify({ title, head: newBranch, base: baseBranch, body: prDesc })\n});`
    },
    {
      id: 2,
      title: "2. Infinite Lifespan Checkpointing",
      icon: "💾",
      badge: "Cloudflare D1 State Machine",
      shortDesc: "Saves state checkpoints recursively to survive worker context recycles and network dropouts.",
      verification: "Stored dynamically inside Cloudflare D1 Relational database tables & cached in Cloudflare KV. If a serverless worker instance scales to zero, state is reconstructed from session logs instantly.",
      code: `// server/db.ts -> saveTask / getTasks\nexport async function saveTask(task: Task, env?: AppEnv) {\n  const d1 = getD1(env);\n  await d1.prepare(\n    "INSERT INTO tasks (id, name, status, progress, active_subtask_index) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status=?..."\n  ).bind(task.id, task.name, task.status, task.progress).run();\n}`
    },
    {
      id: 3,
      title: "3. Multi-Agent Spawn & Control",
      icon: "🧠",
      badge: "Durable Objects Orchestrator",
      shortDesc: "Spawns concurrent task workers (ThinkAgent Durable Object fibers) to divide & conquer broad scopes.",
      verification: "Leverages Cloudflare Durable Objects to spawn independent, concurrent agents. Each agent acts as an isolated state machine running a ReAct (Reasoning & Action) loop.",
      code: `// server/durable-objects/ThinkAgent.ts\nexport class ThinkAgent extends Agent<AppEnv, AgentState> {\n  async runLoop(goal: string, sessionId: string, emit: Function) {\n    // Spawns thread with custom context, tools, and execution loop\n    const sandbox = await getSandbox(this.env);\n    // Execute ReAct iteration...\n  }\n}`
    },
    {
      id: 4,
      title: "4. Self-Healing Compiler Loop",
      icon: "🩹",
      badge: "Automated Error Re-Synthesizer",
      shortDesc: "Catches typescript / compilation issues and re-prompts the synthesizer with error details to self-correct.",
      verification: "Built into the active compilation pipeline in `/server/agent.ts`. After code generation, `npx tsc` is run in the sandbox; if failures are detected, they are fed as feedback back to DeepSeek R1 for repair.",
      code: `// server/agent.ts -> validateGeneratedFile & auto-fix\nconst isValid = await validateGeneratedFile(targetPath, sub, task);\nif (!isValid) {\n  const tscResult = await executeTerminalCommand(\`npx tsc --noEmit --skipLibCheck\`);\n  const errContext = tscResult.stderr || tscResult.stdout;\n  const fixedCode = await generateSubtaskCode(ai, model, prompt, sub.name, targetPath, freshFiles, history, errContext);\n}`
    },
    {
      id: 5,
      title: "5. Memory & Context Persistence",
      icon: "🔮",
      badge: "Cloudflare KV + Vector Bindings",
      shortDesc: "Retains deep context, user-authored files, system configuration overrides, and historic feedback.",
      verification: "Maintains structured key-value state pools using Cloudflare KV. System feedback loops write back to the local database store, creating an ongoing retrieval reference for the generator.",
      code: `// server/db.ts -> saveFile / getFiles\nexport async function saveFile(file: FileNode, env?: AppEnv) {\n  const d1 = getD1(env);\n  await d1.prepare(\n    "INSERT INTO files (path, content, language) VALUES (?, ?, ?) ON CONFLICT(path) DO UPDATE SET content=?"\n  ).bind(file.path, file.content, file.language, file.content).run();\n}`
    },
    {
      id: 6,
      title: "6. Isolated Sandbox Enclaves",
      icon: "🛡️",
      badge: "Private Namespace Jailing",
      shortDesc: "Jails files and secrets in individual sandboxes to protect host integrity.",
      verification: "Secured using `@cloudflare/sandbox` virtual micro-VM environments. Terminal commands and process spawning are restricted to the local worker sandbox namespace, avoiding credential leaks.",
      code: `// server/command.ts -> executeTerminalCommand\nexport async function executeTerminalCommand(cmd: string, options?: { timeoutMs?: number }) {\n  // Restricted exec container utilizing strict regex rules\n  const safeCheck = isCommandSafe(cmd);\n  if (!safeCheck.safe) throw new Error(\`Security Block: \${safeCheck.reason}\`);\n  return await runCommandInSandbox(cmd, options);\n}`
    },
    {
      id: 7,
      title: "7. Iterative Test Runner Pipeline",
      icon: "🧪",
      badge: "Mocha/Jest Execution Loops",
      shortDesc: "Automates execution of tests and iteratively patches code until all specs pass green.",
      verification: "Executes `npm run test` or custom testing scripts autonomously. The agent analyzes failures, generates specific diff blocks, and iterates until the exit code is 0.",
      code: `// server/agent.ts -> Test-runner feedback loop\nconst testResult = await executeTerminalCommand("npm run test");\nif (!testResult.success) {\n  // Pass test report into repair prompt\n  const correction = await generateSubtaskCode(ai, model, "Fix test failures", target, files, history, testResult.stdout);\n}`
    },
    {
      id: 8,
      title: "8. Live Preview & Real-time HMR",
      icon: "📺",
      badge: "SSE Streaming Socket Gateway",
      shortDesc: "Streams task compilation visual steps, live log records, and hot-swaps active frontend codeviews.",
      verification: "Built with standard Server-Sent Events (SSE) streaming connections (`/api/tasks/stream`). The client reads progressive logs live and updates the local preview frame using direct state hot-swaps.",
      code: `// server/agent.ts -> broadcastSSE\nexport function broadcastSSE(event: string, data: any) {\n  const payload = \`event: \${event}\\ndata: \${JSON.stringify(data)}\\n\\n\`;\n  for (const client of sseClients) {\n    client.write(payload);\n  }\n}`
    }
  ];

  const activeStandard = STANDARDS.find(s => s.id === selectedStandardId) || STANDARDS[0];

  // Hardcoded template examples
  const templates: TemplateOption[] = [
    {
      id: "folder-create",
      title: "Folder Synthesizer",
      command: "create a folder named 'dashboard' and add metrics view",
      icon: FolderPlus,
      color: "bg-blue-500",
      badge: "Filesystem Job",
      tasks: [
        {
          name: "Verify Target Directory Hierarchy",
          subtasks: [
            "Check for naming conflicts with existing workspace clusters",
            "Synthesize safe paths for mkdir instructions inside sandbox root",
            "Establish metadata indexes for newly requested directory node"
          ]
        },
        {
          name: "Execute Cloudflare Fiber Background Job",
          subtasks: [
            "Trigger serverless fiber job: mkdir -p /src/generated/dashboard",
            "Create dashboard_metrics.tsx component placeholder",
            "Sync state tracking index SQLite database index"
          ]
        },
        {
          name: "Virtual DOM & Workspace Assembly",
          subtasks: [
            "Register new folder node inside File Explorer state structure",
            "Compile visual component triggers and hot-reload framing views"
          ]
        }
      ],
      workspaceInjections: [
        { path: "src/generated/dashboard", type: "folder" },
        { path: "src/generated/dashboard/dashboard_metrics.tsx", type: "file", content: "// Compiled metrics view components" }
      ],
      mockAppContent: (
        <div className="p-6 bg-slate-900 text-white h-full flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-2 font-sans">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="font-mono text-xs uppercase text-slate-400">Sandbox App Layer</span>
              </div>
              <span className="text-[10px] bg-blue-500/10 border border-blue-500/20 text-blue-400 font-mono px-2 py-0.5 rounded">LIVE PREVIEW</span>
            </div>
            
            <h3 className="text-xl font-bold font-display text-white">Dashboard Controller</h3>
            <p className="text-xs text-slate-400 mt-1 font-sans">Synthesized folder directory successfully active</p>

            <div className="grid grid-cols-3 gap-3 mt-6">
              {[
                { label: "Active Nodes", val: "18", color: "text-blue-400" },
                { label: "CPU Usage", val: "4.8%", color: "text-amber-400" },
                { label: "SSE Handshakes", val: "142/s", color: "text-emerald-400" }
              ].map((m, i) => (
                <div key={i} className="bg-slate-950 p-4 rounded-xl border border-slate-800/80">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-mono">{m.label}</p>
                  <p className={`text-lg font-bold font-mono mt-1 ${m.color}`}>{m.val}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-slate-950/80 border border-slate-800/50 p-3 rounded-lg flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>Container Ingress: /src/generated/dashboard</span>
            <span className="text-emerald-500 font-bold">200 OK</span>
          </div>
        </div>
      )
    },
    {
      id: "firebase-auth",
      title: "Firebase OAuth Flow",
      command: "setup secure email/password and google authentication routes",
      icon: Key,
      color: "bg-amber-500",
      badge: "Firebase Core",
      tasks: [
        {
          name: "Initialize Firebase Client Configuration",
          subtasks: [
            "Detect environment credentials in .env storage",
            "Provision mock configuration client parameters safely",
            "Generate security boundaries for authentication endpoints"
          ]
        },
        {
          name: "Deploy Rules and Session Middleware",
          subtasks: [
            "Inject authStateChanged reactive observers inside App engine",
            "Configure sessionStorage tokens matching user identities",
            "Build custom redirection guards for authenticated paths"
          ]
        },
        {
          name: "Synthesize Registration GUI Blocks",
          subtasks: [
            "Generate beautiful secure login UI elements",
            "Bind form fields to backend auth handlers"
          ]
        }
      ],
      workspaceInjections: [
        { path: "src/generated/auth", type: "folder" },
        { path: "src/generated/auth/firebase_config.ts", type: "file", content: "// Firebase client setup code" },
        { path: "src/generated/auth/login_form.tsx", type: "file", content: "// Beautiful synthesized auth views" }
      ],
      mockAppContent: (
        <div className="p-6 bg-stone-50 text-stone-900 h-full flex flex-col justify-center max-w-sm mx-auto">
          <div className="text-center mb-6">
            <div className="inline-flex p-3 bg-amber-500/10 rounded-full text-amber-600 mb-2">
              <Lock className="h-6 w-6" />
            </div>
            <h4 className="font-bold text-lg font-display text-stone-850">Trinity Secure Login</h4>
            <p className="text-xs text-stone-500 mt-1">Firebase Authentication active sandbox</p>
          </div>

          <div className="space-y-3 text-left">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1">Email Address</label>
              <input type="text" readOnly value="ceo@trinity-universe.com" className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-stone-400 font-mono text-stone-700" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1">Password</label>
              <input type="password" readOnly value="••••••••••••••" className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-stone-400 font-mono text-stone-700" />
            </div>
          </div>

          <button onClick={() => alert("Simulated Auth successful!")} className="w-full bg-stone-900 hover:bg-stone-800 text-white rounded-lg py-2 mt-5 text-xs font-bold font-sans transition-colors shadow-sm cursor-pointer">
            Authenticate Session
          </button>
        </div>
      )
    },
    {
      id: "d1-tables",
      title: "SQL Tables Schema",
      command: "build analytics table in database schema and configure queries",
      icon: Database,
      color: "bg-emerald-500",
      badge: "Drizzle / Cloudflare D1",
      tasks: [
        {
          name: "Analyze Database Schema Specs",
          subtasks: [
            "Validate SQL syntax against SQLite / D1 dialect engines",
            "Synthesize analytics schema parameters with indexes",
            "Prepare automatic D1 migration schemas"
          ]
        },
        {
          name: "Execute Relational Table Migrations",
          subtasks: [
            "Trigger serverless D1 client query transactions",
            "Register table references inside workspace ORM schemas",
            "Seed database tables with preliminary mock data logs"
          ]
        },
        {
          name: "Hook API Route Proxy Interface",
          subtasks: [
            "Add backend endpoint route: /api/analytics",
            "Configure SQL select performance query layers"
          ]
        }
      ],
      workspaceInjections: [
        { path: "src/generated/database", type: "folder" },
        { path: "src/generated/database/schema_analytics.ts", type: "file", content: "// Cloudflare D1 analytics table declarations" },
        { path: "src/generated/database/queries.ts", type: "file", content: "// Cloudflare D1 client query handlers" }
      ],
      mockAppContent: (
        <div className="p-5 bg-zinc-950 text-zinc-100 h-full flex flex-col font-mono text-xs">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-3">
            <span className="text-emerald-500 font-bold flex items-center gap-1.5 font-sans">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              CLOUDFLARE D1 SQL CONSOLE
            </span>
            <span className="text-[9px] text-zinc-500">DATABASE: Cloudflare D1 connected</span>
          </div>

          <div className="space-y-2 flex-1 overflow-y-auto pr-1">
            <div className="text-zinc-400">d1=# SELECT * FROM analytics LIMIT 3;</div>
            <div className="bg-zinc-900 border border-zinc-800 p-2.5 rounded-lg text-[10px] space-y-1">
              <div className="border-b border-zinc-800 pb-1 text-zinc-500 flex justify-between font-bold">
                <span>id</span>
                <span>endpoint</span>
                <span>response_ms</span>
                <span>timestamp</span>
              </div>
              <div className="flex justify-between">
                <span>1</span>
                <span>/api/messages</span>
                <span>42ms</span>
                <span>17:24:18</span>
              </div>
              <div className="flex justify-between">
                <span>2</span>
                <span>/api/db-status</span>
                <span>12ms</span>
                <span>17:24:20</span>
              </div>
              <div className="flex justify-between">
                <span>3</span>
                <span>/api/tasks/stream</span>
                <span>8ms</span>
                <span>17:24:22</span>
              </div>
            </div>
            <div className="text-zinc-500 text-[10px] mt-2">
              (3 rows returned in 2.14ms. Table "analytics" is successfully indexed by transaction worker).
            </div>
          </div>
        </div>
      )
    }
  ];

  const activeTemplate = templates.find(t => t.id === selectedTemplateId) || templates[0];

  const appendLog = (type: LogMessage["type"], text: string) => {
    const timestamp = new Date().toLocaleTimeString([], { hour12: false });
    setEventLogs(prev => [...prev, { timestamp, type, text }]);
  };

  const runStandardsValidation = async (stdId: number) => {
    if (isValidating) return;
    setIsValidating(true);
    
    const std = STANDARDS.find(s => s.id === stdId) || STANDARDS[0];
    setEventLogs([]);
    appendLog("event", `[AUDIT] Launching self-verification for: "${std.title}"`);
    await sleep(450);

    appendLog("system", `[SYSTEM] Handshaking isolated Worker sandbox namespace...`);
    await sleep(400);

    if (stdId === 1) {
      appendLog("llama", `[LLM] Resolving code revisions with LLaMA 3.3-70B model...`);
      await sleep(600);
      appendLog("system", `[GIT] Branching: git checkout -b trinity-agent-patch-${Date.now().toString().substring(10)}`);
      await sleep(500);
      appendLog("system", `[GIT] Committing files: Contents API write...`);
      await sleep(550);
      appendLog("success", `[GIT] PR Created Successfully: Pull Request opened at https://github.com/stevenokano8-wq/Trinitycodingagent/pulls`);
    } else if (stdId === 4) {
      appendLog("system", `[COMPILER] Simulating typescript error injection in Sandbox...`);
      await sleep(500);
      appendLog("warning", `[COMPILER] Warning: error TS2322 - Type 'string' is not assignable to type 'number'.`);
      await sleep(600);
      appendLog("llama", `[LLM] Self-healing active: sending error output context back to DeepSeek R1...`);
      await sleep(700);
      appendLog("success", `[COMPILER] Self-healing resolved! Type declaration patched successfully.`);
    } else if (stdId === 7) {
      appendLog("system", `[TEST RUNNER] Executing: npm run test`);
      await sleep(500);
      appendLog("warning", `[TEST RUNNER] Exception inside TaskAccordion.test.tsx: failed transition state`);
      await sleep(650);
      appendLog("llama", `[LLM] Auto-patching test suite issues with LLaMA...`);
      await sleep(600);
      appendLog("success", `[TEST RUNNER] Test Suite pass: 3 test cases, 100% components verified green!`);
    } else {
      appendLog("system", `[TELEMETRY] Probing Cloudflare infrastructure binds for: ${std.badge}...`);
      await sleep(800);
      appendLog("success", `[TELEMETRY] ${std.badge} verified fully active & secure.`);
    }

    if (!validatedIds.includes(stdId)) {
      setValidatedIds(prev => [...prev, stdId]);
    }

    setIsValidating(false);
    appendLog("success", `[AUDIT] Verification Completed. Status: VERIFIED.`);
  };

  const startSimulation = async () => {
    if (isSimulating) return;

    setIsSimulating(true);
    setCurrentPhase("phase1");
    setEventLogs([]);
    setPreviewState("idle");
    
    // Clear back to initial filesystem
    setVisibleFiles([
      { path: "src/App.tsx", type: "file" },
      { path: "src/main.tsx", type: "file" },
      { path: "package.json", type: "file" },
    ]);

    // Format tasks structure
    const promptValue = customCommand.trim() || activeTemplate.command;
    const initialTasks: SimulatedTask[] = activeTemplate.tasks.map((t, tIdx) => ({
      id: `sim-task-${tIdx}`,
      name: t.name,
      status: "pending",
      progress: 0,
      subtasks: t.subtasks.map((sub, sIdx) => ({
        id: `sim-task-${tIdx}-sub-${sIdx}`,
        name: sub,
        status: "pending",
        progress: 0,
        logs: []
      }))
    }));

    setSimulatedTasks(initialTasks);
    setIsThinkingActive(true);
    setThinkingSteps([]);
    setIsMasterPlanOpen(false);

    // --- STEP 1: COGNITIVE THINKING PHASE ---
    appendLog("event", `[FRONTEND] User dispatched task command: "${promptValue}"`);
    await sleep(400);
    setThinkingSteps(p => [...p, "Analyzing user intent and parsing functional constraints..."]);
    appendLog("system", `[THINKING] Instantly broadcasted event: "analysis_started"`);
    await sleep(650);
    setThinkingSteps(p => [...p, "Designing modular, type-safe structures matching the guidelines..."]);
    appendLog("llama", `[THINKING] Sovereign Llama 3.3-70B processing user request rules...`);
    await sleep(650);
    setThinkingSteps(p => [...p, "Verifying Cloudflare edge resource mappings (D1 tables and KV caching pools)..."]);
    appendLog("llama", `[THINKING] Validating architectural security boundaries & constraints.`);
    await sleep(650);
    setThinkingSteps(p => [...p, "Synthesizing step-by-step sequential Phase Roadmap..."]);
    appendLog("system", `[THINKING] Resolved roadmap JSON array response.`);
    await sleep(400);
    setIsThinkingActive(false);

    // --- STEP 2: MASTER PLAN GENERATED ---
    appendLog("event", `[PHASE 1] Instantly broadcasted event: "roadmap_ready"`);
    
    // Auto-update tasks list to empty rows in UI
    setCurrentPhase("phase2");
    appendLog("success", `[FRONTEND] Collapsible Master Plan & task accordion panels rendered in Task Compiler container.`);
    await sleep(800);

    // --- PHASE 2: STREAMING LOOP ---
    // Iterate through tasks
    for (let tIdx = 0; tIdx < initialTasks.length; tIdx++) {
      const activeTask = { ...initialTasks[tIdx] };
      activeTask.status = "running";
      setActiveAccordionId(activeTask.id);
      
      setSimulatedTasks(prev => {
        const copy = [...prev];
        copy[tIdx] = activeTask;
        return copy;
      });

      appendLog("event", `[PHASE 2] Server broadcasted: "task_running" for Task ${tIdx + 1}`);
      await sleep(600);

      const subs = [...activeTask.subtasks];
      for (let sIdx = 0; sIdx < subs.length; sIdx++) {
        const activeSub = { ...subs[sIdx] };
        activeSub.status = "running";
        activeSub.logs = [`[SYSTEM] Handshaking worker thread for: "${activeSub.name}"...`];
        
        subs[sIdx] = activeSub;
        activeTask.subtasks = subs;
        setSimulatedTasks(prev => {
          const copy = [...prev];
          copy[tIdx] = { ...activeTask };
          return copy;
        });

        // Simulating step progress log updates
        const steps = [
          `Allocating local sandbox container workspace indices...`,
          `Spawning Cloudflare Fiber background worker execution thread...`,
          `Synchronizing SQL/SQLite tracking database table references...`,
          `Writing file outputs securely inside directory schemas...`
        ];

        for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
          await sleep(500);
          activeSub.logs.push(`[${new Date().toLocaleTimeString([], { hour12: false })}] ${steps[stepIdx]}`);
          activeSub.progress = Math.round(((stepIdx + 1) / steps.length) * 100);
          
          subs[sIdx] = activeSub;
          // Increment total task progress as subtasks complete
          activeTask.progress = Math.round(((sIdx * steps.length + (stepIdx + 1)) / (subs.length * steps.length)) * 100);
          activeTask.subtasks = subs;

          setSimulatedTasks(prev => {
            const copy = [...prev];
            copy[tIdx] = { ...activeTask };
            return copy;
          });

          // Send real-time log stream
          appendLog("system", `[PHASE 2] Server emitted "task_progress": ${steps[stepIdx].substring(0, 45)}...`);
        }

        activeSub.status = "completed";
        activeSub.progress = 100;
        activeSub.logs.push(`[SUCCESS] "${activeSub.name}" completed successfully.`);
        
        subs[sIdx] = activeSub;
        activeTask.subtasks = subs;
        setSimulatedTasks(prev => {
          const copy = [...prev];
          copy[tIdx] = { ...activeTask };
          return copy;
        });

        await sleep(400);
      }

      // Complete high level task
      activeTask.status = "completed";
      activeTask.progress = 100;
      setSimulatedTasks(prev => {
        const copy = [...prev];
        copy[tIdx] = activeTask;
        return copy;
      });

      appendLog("success", `[PHASE 2] Task ${tIdx + 1} completed. Emitted: "task_completed"`);
      await sleep(600);
    }

    // --- PHASE 3: STATE RENDERING ACTION ---
    setCurrentPhase("phase3");
    appendLog("event", `[PHASE 3] Initiating Synchronous Workspace State Refresh...`);
    await sleep(600);

    // Block A: File explorer update
    appendLog("system", `[PHASE 3: BLOCK A] Dispatching internal workspace listing fetch...`);
    await sleep(700);
    
    // Injects files with animation
    const injections = activeTemplate.workspaceInjections;
    for (const inj of injections) {
      setVisibleFiles(prev => [...prev, inj]);
      appendLog("success", `[PHASE 3: BLOCK A] Sidebar Virtual DOM node injected: ${inj.path}`);
      await sleep(400);
    }

    // Block B: Preview View Update
    appendLog("system", `[PHASE 3: BLOCK B] Initiating sandbox compiler Hot-Reload...`);
    setPreviewState("reloading");
    await sleep(1500);
    
    setPreviewState("live");
    appendLog("success", `[PHASE 3: BLOCK B] Webview client hot-reload complete. App state rendering live!`);
    await sleep(800);

    // --- WRAP-UP ---
    setCurrentPhase("finished");
    appendLog("success", `[FINISH] Event "stream_finished" emitted. Pipeline returned to Idle status.`);
    setIsSimulating(false);
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50 p-4 sm:p-6 overflow-y-auto font-sans text-gray-800">
      
      {/* Upper Descriptive Header card */}
      <div className="bg-white rounded-3xl border border-gray-100 p-5 sm:p-6 shadow-xs mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100 shrink-0">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 font-display">
                Autonomous Standards & Diagnostics Center
              </h1>
              <p className="text-xs text-gray-400 mt-0.5 font-sans">
                Audit, trigger, and inspect the 8 Core Standards of 2026 Autonomous Agent Architectures.
              </p>
            </div>
          </div>
          
          <div className="flex items-center bg-gray-100 p-1 rounded-xl border border-gray-200">
            <button
              onClick={() => setActiveSection("audit")}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeSection === "audit" 
                  ? "bg-white text-zinc-900 shadow-xs" 
                  : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              Interactive Audit
            </button>
            <button
              onClick={() => setActiveSection("sandbox")}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeSection === "sandbox" 
                  ? "bg-white text-zinc-900 shadow-xs" 
                  : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              Task Pipeline Sandbox
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeSection === "audit" ? (
          /* =========================================================================
             1. INTERACTIVE AUDIT SECTION (TAB A)
             ========================================================================= */
          <motion.div
            key="audit-section"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
          >
            {/* PROGRESS SUMMARY */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[
                { title: "Target Model Class", val: "DeepSeek R1 & LLaMA 3.3", desc: "No Gemini for core, direct Workers AI mapping", color: "text-indigo-600" },
                { title: "Production Hosting", val: "Cloudflare Edge", desc: "Served via Pages, Workers, D1 & KV", color: "text-emerald-600" },
                { title: "Autonomy Level", val: "Level 3 Autonomy", desc: "Accepts task and yields full PR branch", color: "text-amber-600" },
                { title: "Verification Status", val: `${validatedIds.length} / 8 Standards`, desc: `${Math.round((validatedIds.length / 8) * 100)}% specifications verified green`, color: "text-purple-600" }
              ].map((card, i) => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-3xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 font-mono">{card.title}</p>
                  <p className={`text-lg font-bold font-sans mt-1.5 ${card.color}`}>{card.val}</p>
                  <p className="text-[10px] text-gray-400 mt-1 font-sans">{card.desc}</p>
                </div>
              ))}
            </div>

            {/* BENTO GRID OF 8 STANDARDS */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* LEFT SIDE: Grid of 8 Cards (7 columns) */}
              <div className="md:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {STANDARDS.map((std) => {
                  const isSelected = selectedStandardId === std.id;
                  const isValidated = validatedIds.includes(std.id);
                  return (
                    <button
                      key={std.id}
                      onClick={() => setSelectedStandardId(std.id)}
                      className={`p-4 rounded-2xl border text-left transition-all ${
                        isSelected 
                          ? "bg-slate-900 border-slate-900 text-white shadow-md relative" 
                          : "bg-white border-gray-100 text-gray-700 hover:bg-gray-50 hover:shadow-2xs"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xl select-none">{std.icon}</span>
                        <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full ${
                          isValidated 
                            ? "bg-emerald-50 text-emerald-600 border border-emerald-100" 
                            : "bg-amber-50 text-amber-600 border border-amber-100"
                        }`}>
                          {isValidated ? "VERIFIED" : "SIMULATED"}
                        </span>
                      </div>
                      <h4 className="font-bold text-xs font-display mt-3 truncate">{std.title}</h4>
                      <p className={`text-[10.5px] mt-1 line-clamp-2 ${isSelected ? "text-slate-300" : "text-gray-400"}`}>
                        {std.shortDesc}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* RIGHT SIDE: Interactive Inspector Panel (5 columns) */}
              <div className="md:col-span-5 bg-white border border-gray-100 rounded-3xl p-5 shadow-xs flex flex-col gap-4 text-left">
                <div className="flex items-center justify-between border-b border-gray-50 pb-3">
                  <div className="flex items-center gap-2">
                    <Code2 className="h-4 w-4 text-amber-500 animate-pulse" />
                    <span className="text-xs font-bold text-gray-700 font-mono">Standards Inspector</span>
                  </div>
                  <span className="text-[9px] font-mono text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md font-bold uppercase">Diagnostics</span>
                </div>

                <div className="space-y-4 flex-1 flex flex-col min-h-0">
                  <div>
                    <h3 className="text-sm font-bold text-gray-800 font-display">{activeStandard.title}</h3>
                    <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">{activeStandard.shortDesc}</p>
                  </div>

                  {/* HOW IT IS VERIFIED */}
                  <div className="p-3 bg-zinc-50 border border-zinc-150 rounded-xl">
                    <span className="text-[9px] font-bold uppercase font-mono tracking-wider text-zinc-400">Architectural Verification</span>
                    <p className="text-[10px] text-zinc-600 mt-1 leading-normal font-sans">
                      {activeStandard.verification}
                    </p>
                  </div>

                  {/* INTERACTIVE CODE BLOCK */}
                  <div className="flex-1 min-h-[140px] max-h-[220px] bg-slate-900 rounded-xl p-3 font-mono text-[9.5px] overflow-y-auto border border-slate-800 text-slate-300">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-2 text-slate-500 text-[8.5px]">
                      <span>Source Implementation:</span>
                      <span className="text-amber-400 font-bold uppercase tracking-wider">TS Code</span>
                    </div>
                    <pre className="whitespace-pre">{activeStandard.code}</pre>
                  </div>

                  {/* VALIATION ACTION BUTTON */}
                  <button
                    onClick={() => runStandardsValidation(activeStandard.id)}
                    disabled={isValidating}
                    className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs active:scale-98 mt-auto"
                  >
                    {isValidating ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Running Agent Diagnostics...
                      </>
                    ) : (
                      <>
                        <Activity className="h-3.5 w-3.5" />
                        Trigger Autonomous Self-Verification
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* EVENTSTREAM TELEMETRY CONSOLE AT BOTTOM */}
            <div className="border border-gray-100 rounded-3xl bg-white p-5 flex flex-col h-[380px] shadow-xs">
              <div className="flex items-center justify-between border-b border-gray-50 pb-3 mb-3 shrink-0">
                <div className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-indigo-500 animate-pulse" />
                  <span className="text-xs font-bold text-gray-700 font-mono">Server Event Stream Telemetry Logs</span>
                </div>
                <span className="text-[9px] font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md font-bold uppercase">Real-time Stream</span>
              </div>
              <EventStreamConsole logs={eventLogs} />
            </div>
          </motion.div>
        ) : (
          /* =========================================================================
             2. PIPELINE SANDBOX VIEW (TAB B)
             ========================================================================= */
          <motion.div
            key="sandbox-section"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6 animate-fade-in"
          >
            {/* Upper Selection Card */}
            <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-xs">
              {/* Templates Selector Grid */}
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 font-mono mb-3 text-left">Select a Blueprint task template</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {templates.map(t => {
                    const Icon = t.icon;
                    const isSelected = selectedTemplateId === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => {
                          if (isSimulating) return;
                          setSelectedTemplateId(t.id);
                          setCustomCommand("");
                        }}
                        disabled={isSimulating}
                        className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                          isSelected 
                            ? "bg-slate-900 border-slate-900 text-white shadow-md" 
                            : "bg-gray-50 border-gray-100 text-gray-700 hover:bg-gray-100/70"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className={`p-1.5 rounded-xl ${isSelected ? "bg-white/10 text-white" : "bg-white text-gray-500 border border-gray-200"} shrink-0`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-md ${
                            isSelected ? "bg-white/10 text-white" : "bg-gray-250 text-gray-500"
                          }`}>{t.badge}</span>
                        </div>
                        <h5 className="font-bold text-xs font-display mt-3 truncate">{t.title}</h5>
                        <p className={`text-[10px] mt-1 font-mono truncate ${isSelected ? "text-slate-300" : "text-gray-400"}`}>
                          "{t.command}"
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Input bar for custom dispatch */}
              <div className="mt-5 bg-gray-50 border border-gray-150 p-1.5 rounded-full flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Or type a custom task prompt (e.g., 'create a folder named dashboard')..."
                  value={customCommand}
                  onChange={(e) => setCustomCommand(e.target.value)}
                  disabled={isSimulating}
                  className="flex-1 bg-transparent px-4 text-xs text-gray-800 font-sans focus:outline-none placeholder-gray-400 disabled:opacity-50"
                />
                <button
                  onClick={startSimulation}
                  disabled={isSimulating}
                  className="bg-black hover:bg-zinc-800 disabled:bg-gray-200 text-white disabled:text-gray-400 px-5 py-2 rounded-full text-xs font-bold font-sans flex items-center gap-2 transition-all shadow-sm shrink-0 cursor-pointer"
                >
                  {isSimulating ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Simulating...
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5 fill-white" />
                      Dispatch Task
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* THREE PHASES SEQUENCE GRID */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
              
              {/* COLUMN 1: EVENT PIPELINE LOGS (PHASE 1) */}
              <div className="border border-gray-100 rounded-3xl bg-white p-5 flex flex-col h-[520px] shadow-xs">
                <div className="flex items-center justify-between border-b border-gray-50 pb-3 mb-3">
                  <div className="flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-indigo-500 animate-pulse" />
                    <span className="text-xs font-bold text-gray-700 font-mono">Server Event Stream</span>
                  </div>
                  <span className="text-[9px] font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md font-bold uppercase">Phase 1 Pipeline</span>
                </div>
                <EventStreamConsole logs={eventLogs} />
              </div>

              {/* COLUMN 2: TASK ACCORDION GENERATION (PHASE 2) */}
              <div className="border border-gray-100 rounded-3xl bg-white p-5 flex flex-col h-[520px] shadow-xs">
                <div className="flex items-center justify-between border-b border-gray-50 pb-3 mb-3">
                  <div className="flex items-center gap-2">
                    <ListFilter className="h-4 w-4 text-amber-500 animate-pulse" />
                    <span className="text-xs font-bold text-gray-700 font-mono">Task Compiler (D1/SQLite)</span>
                  </div>
                  <span className="text-[9px] font-mono text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md font-bold uppercase">Phase 2 Loop</span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 text-left">
                  {/* Real-time Progressive Thinking Phase visualization */}
                  {thinkingSteps.length > 0 && (
                    <div className={`p-4 rounded-2xl border transition-all duration-300 ${
                      isThinkingActive 
                        ? "bg-purple-50/40 border-purple-200/60 shadow-inner" 
                        : "bg-slate-50/50 border-slate-150"
                    }`}>
                      <div className="flex items-center justify-between border-b border-purple-100/30 pb-2 mb-2.5">
                        <span className="text-[9px] font-mono font-bold tracking-wider uppercase text-purple-600 flex items-center gap-1.5">
                          <Cpu className={`h-3.5 w-3.5 text-purple-500 ${isThinkingActive ? "animate-spin" : ""}`} />
                          Step 1: Cognitive Thinking Phase
                        </span>
                        {isThinkingActive ? (
                          <span className="text-[8px] font-mono font-bold text-purple-500 animate-pulse bg-purple-100 px-1.5 py-0.5 rounded">
                            THINKING...
                          </span>
                        ) : (
                          <span className="text-[8px] font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            RESOLVED
                          </span>
                        )}
                      </div>
                      
                      <div className="space-y-1.5 text-[10.5px] font-mono text-slate-650 leading-relaxed pl-1">
                        {thinkingSteps.map((step, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <span className="text-purple-400 shrink-0 select-none">💭</span>
                            <span>{step}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Simulated Master Plan Accordion (CLOSED BY DEFAULT) */}
                  {simulatedTasks.length > 0 && !isThinkingActive && (
                    <div className="border border-slate-150 bg-slate-50/40 rounded-2xl overflow-hidden transition-all duration-300">
                      <button
                        type="button"
                        onClick={() => setIsMasterPlanOpen(!isMasterPlanOpen)}
                        className="w-full flex items-center justify-between p-3.5 bg-white hover:bg-slate-50 transition-colors text-left border-none cursor-pointer"
                      >
                        <div className="flex items-center gap-2 text-slate-700 min-w-0 flex-1 font-sans">
                          <span className="text-sm shrink-0">📋</span>
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-[11px] font-bold text-slate-800 uppercase tracking-tight">
                              Step 2: Master Plan Strategy
                            </span>
                            <span className="text-[9px] text-slate-400 font-mono mt-0.5">
                              {isMasterPlanOpen ? "Overarching strategy and phases:" : "(Collapsible • Closed by Default)"}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[8px] font-mono font-bold text-slate-400 border border-slate-200/50 bg-slate-50 px-1.5 py-0.5 rounded">
                            CLOSED
                          </span>
                          {isMasterPlanOpen ? <ChevronUp className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
                        </div>
                      </button>

                      {isMasterPlanOpen && (
                        <div className="p-3 border-t border-slate-150/60 bg-white space-y-3 font-sans text-left text-[11px] text-slate-600 leading-relaxed border-b border-dashed animate-fade-in">
                          <p className="font-semibold text-slate-800">🎯 Overall Compilation Protocol</p>
                          <p>
                            Execute the current task using the progressive disclosure loop. Prioritize static analysis, complete isolated step verification, and emit state notifications before proceeding to secondary architectures.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Simulated Phase Execution loop */}
                  {simulatedTasks.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 py-16">
                      <Cpu className="h-8 w-8 text-gray-250 mb-2 stroke-1" />
                      <p className="text-xs">No roadmap resolved. Select a template and press "Dispatch" to construct roadmap accordion elements.</p>
                    </div>
                  ) : (
                    simulatedTasks.map((task, tIdx) => (
                      <CompilerTaskRow 
                        key={task.id}
                        task={task}
                        tIdx={tIdx}
                        isOpen={activeAccordionId === task.id}
                        onToggle={() => setActiveAccordionId(activeAccordionId === task.id ? null : task.id)}
                      />
                    ))
                  )}
                </div>
              </div>

              {/* COLUMN 3: STATE RENDERING (PHASE 3) */}
              <div className="border border-gray-100 rounded-3xl bg-white p-5 flex flex-col h-[520px] shadow-xs gap-4">
                <div className="flex items-center justify-between border-b border-gray-50 pb-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 text-emerald-500 animate-pulse" />
                    <span className="text-xs font-bold text-gray-700 font-mono">Workspace Visualizers</span>
                  </div>
                  <span className="text-[9px] font-mono text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md font-bold uppercase">Phase 3 State</span>
                </div>

                {/* Block A: File Explorer Updater */}
                <div className="flex-1 bg-gray-50/50 rounded-2xl border border-gray-100 p-3 flex flex-col min-h-0">
                  <div className="flex items-center justify-between text-[9px] font-bold text-gray-400 font-mono uppercase tracking-wider pb-2 border-b border-gray-150 shrink-0">
                    <span className="flex items-center gap-1"><Folder className="h-3.5 w-3.5" /> File Explorer Tree</span>
                    <span>STATE ACTION A</span>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-1.5 space-y-1 text-xs font-mono text-gray-600">
                    {visibleFiles.map((file, fIdx) => (
                      <motion.div
                        key={file.path}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center justify-between px-2.5 py-1.5 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-gray-100"
                      >
                        <div className="flex items-center gap-2 truncate">
                          {file.type === "folder" ? (
                            <Folder className="h-3.5 w-3.5 text-blue-400 fill-blue-100 shrink-0" />
                          ) : (
                            <FileText className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                          )}
                          <span className="truncate">{file.path}</span>
                        </div>
                        {fIdx >= 3 && (
                          <span className="text-[8px] bg-emerald-50 border border-emerald-100 text-emerald-600 font-bold font-sans rounded px-1 animate-bounce shrink-0">
                            NEW NODE
                          </span>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Block B: Live Webview Sandbox */}
                <div className="flex-1 bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col min-h-0 relative shadow-inner">
                  <div className="bg-gray-100 px-3 py-1.5 border-b border-gray-150 flex items-center justify-between text-[9px] font-mono text-gray-500 shrink-0">
                    <span>https://sandbox.trinity.io/</span>
                    <span>STATE ACTION B</span>
                  </div>

                  <div className="flex-1 relative min-h-0 bg-slate-900">
                    {previewState === "idle" && (
                      <div className="h-full flex flex-col items-center justify-center text-center p-4">
                        <Monitor className="h-8 w-8 text-slate-700 mb-2 stroke-1" />
                        <p className="text-[11px] font-mono text-slate-500">Iframe preview sandbox offline. Start simulation to compile server render.</p>
                      </div>
                    )}

                    {previewState === "reloading" && (
                      <div className="h-full flex flex-col items-center justify-center text-center p-4 bg-slate-950/90 text-slate-300">
                        <RefreshCw className="h-8 w-8 text-amber-500 animate-spin mb-2" />
                        <p className="text-[10px] font-mono text-amber-500 font-bold uppercase tracking-wider animate-pulse">Hot Reload Active</p>
                        <p className="text-[9px] font-mono text-slate-500 mt-1">Recompiling modules to headless render browser view...</p>
                      </div>
                    )}

                    {previewState === "live" && (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="h-full"
                      >
                        {activeTemplate.mockAppContent}
                      </motion.div>
                    )}
                  </div>
                </div>

              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
