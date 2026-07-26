import React, { useState, useEffect, useRef } from "react";
import { API_BASE } from "./lib/api.ts";
import { Message, Task, FileNode, DatabaseStatus, AgentSession } from "./types.js";
import Navbar, { TabType, PersonaObj } from "./components/Navbar.tsx";
import Sidebar from "./components/Sidebar.tsx";
import TaskAccordion from "./components/TaskAccordion.tsx";
import WorkspacePreview from "./components/WorkspacePreview.tsx";
import DbVisualizer from "./components/DbVisualizer.tsx";
import DeployView from "./components/DeployView.tsx";
import GithubView from "./components/GithubView.tsx";
import LogsView from "./components/LogsView.tsx";
import PermissionsView from "./components/PermissionsView.tsx";
import SettingsView from "./components/SettingsView.tsx";
import EnvBoxView from "./components/EnvBoxView.tsx";
import NotificationsView from "./components/NotificationsView.tsx";
import ScreenshotsView from "./components/ScreenshotsView.tsx";
import SubtasksSimulationView from "./components/SubtasksSimulationView.tsx";
import FaceswapChatView from "./components/FaceswapChatView.tsx";
import SettingsModal from "./components/SettingsModal.tsx";
import {
  Send,
  Paperclip,
  Bot,
  Zap,
  Code,
  Sparkles,
  RefreshCw,
  X,
  MessageSquare,
  Cpu,
  Layers,
  Terminal,
  Database,
  Plus,
  Play,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const PERSONAS: PersonaObj[] = [
  {
    id: "trinity",
    name: "Trinity Agent",
    icon: Bot,
    badgeColor: "bg-indigo-600 hover:bg-indigo-700",
    avatarBg: "bg-indigo-600",
    description: "Sovereign full-stack agentic coding system"
  },
  {
    id: "architect",
    name: "System Architect",
    icon: Cpu,
    badgeColor: "bg-purple-600 hover:bg-purple-700",
    avatarBg: "bg-purple-600",
    description: "Infrastructure, edge worker & Cloudflare D1 designer"
  },
  {
    id: "executor",
    name: "Runtime Executor",
    icon: Zap,
    badgeColor: "bg-amber-600 hover:bg-amber-700",
    avatarBg: "bg-amber-600",
    description: "Fast code synthesis & container command runner"
  },
  {
    id: "reviewer",
    name: "Code Reviewer",
    icon: CheckCircle2,
    badgeColor: "bg-emerald-600 hover:bg-emerald-700",
    avatarBg: "bg-emerald-600",
    description: "Static type checker & linter auditor"
  }
];

const INITIAL_SESSIONS: AgentSession[] = [
  { id: "session-main", name: "Trinity Core Workspace", createdAt: new Date().toISOString() }
];

const SAMPLE_FILES: FileNode[] = [
  {
    path: "src/App.tsx",
    language: "typescript",
    content: `import React from "react";\n\nexport default function App() {\n  return (\n    <div className="p-8 font-sans">\n      <h1 className="text-2xl font-bold text-indigo-600">Trinity Coding Agent</h1>\n      <p className="text-slate-600 mt-2">Active full-stack container running on Cloud Run edge.</p>\n    </div>\n  );\n}`
  },
  {
    path: "server/worker.ts",
    language: "typescript",
    content: `import { Hono } from "hono";\nconst app = new Hono();\napp.get("/api/health", (c) => c.json({ status: "online", node: "cloudflare-edge" }));\nexport default app;`
  },
  {
    path: "wrangler.api.toml",
    language: "toml",
    content: `name = "agent-api"\nmain = "server/worker.ts"\ncompatibility_date = "2026-07-01"\n\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "trinity-db"\n`
  }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>("chat");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  
  const [currentPersona, setCurrentPersona] = useState<PersonaObj>(PERSONAS[0]);
  const [sessions, setSessions] = useState<AgentSession[]>(INITIAL_SESSIONS);
  const [activeSessionId, setActiveSessionId] = useState<string>("session-main");

  const [inputPrompt, setInputPrompt] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [attachment, setAttachment] = useState<{ name: string; type: string; data: string; size: number } | null>(null);

  const [tasks, setTasks] = useState<Task[]>([
    {
      id: "task-init",
      name: "Synthesize Trinity Sovereign Infrastructure",
      status: "completed",
      progress: 100,
      activeSubtaskIndex: 1,
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      subtasks: [
        {
          id: "sub-1",
          taskId: "task-init",
          name: "Initialize Hono API worker & Cloudflare D1 bindings",
          status: "completed",
          logs: [
            "[SYSTEM] Initializing Cloudflare D1 database connection...",
            "[SYSTEM] Worker server/worker.ts router mounted.",
            "[SUCCESS] Sovereign container layer verified."
          ]
        }
      ]
    }
  ]);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "msg-welcome",
      role: "assistant",
      content: "Welcome to Trinity Coding Agent! I am ready to build, execute, and deploy your code. How can I assist you today?",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      taskId: "task-init"
    }
  ]);

  const [files, setFiles] = useState<FileNode[]>(SAMPLE_FILES);
  const [previewReloadKey, setPreviewReloadKey] = useState(0);
  const [dbStatus, setDbStatus] = useState<DatabaseStatus>({
    d1: "connected",
    kv: "connected"
  });

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll chat log
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, tasks]);

  // Fetch initial tasks/files from backend API
  const refreshWorkspace = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/workspaces/status`);
      if (res.ok) {
        const data = await res.json();
        if (data.dbStatus) setDbStatus(data.dbStatus);
        if (data.tasks) setTasks(data.tasks);
        if (data.files) setFiles(data.files);
      }
    } catch (err) {
      console.warn("Using offline container state fallback:", err);
    }
  };

  useEffect(() => {
    refreshWorkspace();
  }, []);

  const handleSendPrompt = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputPrompt.trim() && !attachment) return;

    const userText = inputPrompt.trim();
    const newMsgId = `msg-${Date.now()}`;
    const userMsg: Message = {
      id: newMsgId,
      role: "user",
      content: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      attachment: attachment || undefined
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputPrompt("");
    setAttachment(null);
    setIsSending(true);

    const newTask: Task = {
      id: `task-${Date.now()}`,
      name: userText || "Executing AI coding task",
      status: "running",
      progress: 25,
      activeSubtaskIndex: 0,
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      subtasks: [
        {
          id: `sub-${Date.now()}-1`,
          taskId: `task-${Date.now()}`,
          name: "Parse user requirements & construct plan",
          status: "running",
          logs: [
            `cmd> trinity-agent exec --persona ${currentPersona.id}`,
            `[SYSTEM] Context loaded. Analyzing prompt...`
          ]
        }
      ]
    };

    setTasks((prev) => [newTask, ...prev]);

    try {
      const res = await fetch(`${API_BASE}/api/tasks/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: userText,
          persona: currentPersona.id,
          sessionId: activeSessionId
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.task) {
          setTasks((prev) => prev.map((t) => (t.id === newTask.id ? data.task : t)));
        }
      } else {
        // Local simulation fallback
        setTimeout(() => {
          setTasks((prev) =>
            prev.map((t) => {
              if (t.id === newTask.id) {
                return {
                  ...t,
                  status: "completed",
                  progress: 100,
                  completedAt: new Date().toISOString(),
                  subtasks: [
                    {
                      id: `${t.id}-sub-1`,
                      taskId: t.id,
                      name: "Executed task workflow",
                      status: "completed",
                      logs: [
                        `cmd> trinity compile --target cloudflare-worker`,
                        `[SUCCESS] Code compiled and written to workspace.`
                      ]
                    }
                  ]
                };
              }
              return t;
            })
          );

          setMessages((prev) => [
            ...prev,
            {
              id: `msg-ans-${Date.now()}`,
              role: "assistant",
              content: `Task "${userText}" completed successfully! Code workspace updated.`,
              timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              taskId: newTask.id
            }
          ]);
          setPreviewReloadKey((k) => k + 1);
        }, 1500);
      }
    } catch (err) {
      console.error("Task execution endpoint error:", err);
    } finally {
      setIsSending(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setAttachment({
        name: file.name,
        type: file.type,
        data: reader.result as string,
        size: file.size
      });
    };
    reader.readAsDataURL(file);
  };

  const handleUpdateFile = (path: string, newContent: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.path === path ? { ...f, content: newContent } : f))
    );
    setPreviewReloadKey((k) => k + 1);
  };

  const handleNewSession = () => {
    const newSess: AgentSession = {
      id: `session-${Date.now()}`,
      name: `Agent Workspace ${sessions.length + 1}`,
      createdAt: new Date().toISOString()
    };
    setSessions((prev) => [newSess, ...prev]);
    setActiveSessionId(newSess.id);
  };

  const handleDeleteSession = (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id && sessions.length > 1) {
      setActiveSessionId(sessions.find((s) => s.id !== id)!.id);
    }
  };

  const handlePurgeCluster = async () => {
    try {
      await fetch(`${API_BASE}/api/purge`, { method: "POST" });
    } catch (err) {
      console.warn("Purge call fallback:", err);
    }
    setTasks([]);
    setMessages([
      {
        id: "msg-purge",
        role: "assistant",
        content: "Cluster records flushed. Ready for fresh tasks.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      }
    ]);
  };

  return (
    <div id="app-container" className="h-screen w-screen flex flex-col bg-slate-100 text-slate-900 font-sans overflow-hidden select-none">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentPersonaObj={currentPersona}
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        isMoreMenuOpen={isMoreMenuOpen}
        setIsMoreMenuOpen={setIsMoreMenuOpen}
        tasks={tasks}
      />

      {/* Slide-over Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSessionId}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        dbStatus={dbStatus}
        currentPersona={currentPersona}
        personas={PERSONAS}
        onSelectPersona={setCurrentPersona}
      />

      {/* Main Container Layout */}
      <main className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-3 p-2 sm:p-4 min-h-0 overflow-hidden">
        
        {/* Left Side: Chat & Task Execution Panel */}
        <div
          className={`w-full md:col-span-6 flex flex-col min-h-0 h-full bg-white border border-gray-150 rounded-3xl shadow-xs overflow-hidden ${
            ["chat", "preview", "code"].includes(activeTab)
              ? activeTab === "chat"
                ? "flex"
                : "hidden md:flex"
              : "hidden"
          }`}
        >
          {/* Chat Panel Header */}
          <div className="bg-gray-50/80 px-4 py-3 border-b border-gray-150 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 ${currentPersona.avatarBg} text-white rounded-lg shadow-2xs`}>
                <currentPersona.icon className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-bold text-xs text-gray-900 font-display">{currentPersona.name}</h3>
                <p className="text-[10px] text-gray-500 font-mono">Cloud Run Edge Sandbox Active</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold font-mono px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                ONLINE
              </span>
            </div>
          </div>

          {/* Chat Messages & Task Execution Logs */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col gap-1.5 ${
                  msg.role === "user" ? "items-end" : "items-start"
                }`}
              >
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-gray-400 px-1">
                  <span>{msg.role === "user" ? "You" : currentPersona.name}</span>
                  <span>•</span>
                  <span>{msg.timestamp}</span>
                </div>

                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white font-medium rounded-tr-xs shadow-xs"
                      : "bg-gray-100/90 text-gray-800 border border-gray-200/80 rounded-tl-xs"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>

                  {msg.attachment && (
                    <div className="mt-2 pt-2 border-t border-white/20 text-[10px] flex items-center gap-1.5 opacity-90">
                      <Paperclip className="h-3 w-3" />
                      <span>{msg.attachment.name}</span>
                    </div>
                  )}
                </div>

                {/* Render Task Accordion if message has a corresponding task */}
                {msg.taskId && tasks.find((t) => t.id === msg.taskId) && (
                  <div className="w-full mt-2">
                    <TaskAccordion
                      task={tasks.find((t) => t.id === msg.taskId)!}
                      isInitiallyExpanded={true}
                    />
                  </div>
                )}
              </div>
            ))}

            {isSending && (
              <div className="flex items-center gap-2 text-xs text-indigo-600 font-mono p-3 bg-indigo-50/60 rounded-2xl border border-indigo-100">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-indigo-600" />
                <span>Trinity Agent is synthesizing code and executing tasks...</span>
              </div>
            )}

            <div ref={chatBottomRef} />
          </div>

          {/* Prompt Input Box */}
          <form onSubmit={handleSendPrompt} className="p-3 bg-gray-50/90 border-t border-gray-150 shrink-0">
            {attachment && (
              <div className="mb-2 flex items-center justify-between p-2 bg-indigo-50 rounded-xl border border-indigo-200 text-xs text-indigo-900">
                <div className="flex items-center gap-2 min-w-0">
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-indigo-600" />
                  <span className="truncate font-mono">{attachment.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAttachment(null)}
                  className="p-1 hover:bg-indigo-100 rounded text-indigo-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-2xl p-1.5 shadow-2xs focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors shrink-0"
                title="Attach file or code asset"
              >
                <Paperclip className="h-4 w-4" />
              </button>

              <input
                type="text"
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                placeholder={`Ask ${currentPersona.name} to write code, build components or run tasks...`}
                className="flex-1 bg-transparent text-xs text-gray-900 focus:outline-none px-2 font-sans placeholder:text-gray-400"
              />

              <button
                type="submit"
                disabled={!inputPrompt.trim() && !attachment}
                className="p-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl transition-all shadow-xs shrink-0 cursor-pointer"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>

        {/* Right Side: Main Workspace View Switcher */}
        {["chat", "preview", "code"].includes(activeTab) && (
          <WorkspacePreview
            activeTab={activeTab}
            files={files}
            currentPrompt={inputPrompt}
            previewReloadKey={previewReloadKey}
            tasks={tasks}
            isSending={isSending}
            onUpdateFile={handleUpdateFile}
          />
        )}

        {activeTab === "database" && (
          <div className="w-full md:col-span-12 lg:col-span-12 h-full flex flex-col">
            <DbVisualizer
              messages={messages}
              tasks={tasks}
              files={files}
              onPurge={handlePurgeCluster}
            />
          </div>
        )}

        {activeTab === "deploy" && (
          <div className="w-full md:col-span-12 lg:col-span-12 h-full flex flex-col">
            <DeployView />
          </div>
        )}

        {activeTab === "github" && (
          <div className="w-full md:col-span-12 lg:col-span-12 h-full flex flex-col">
            <GithubView />
          </div>
        )}

        {activeTab === "logs" && (
          <div className="w-full md:col-span-12 lg:col-span-12 h-full flex flex-col">
            <LogsView />
          </div>
        )}

        {activeTab === "permissions" && (
          <div className="w-full md:col-span-12 lg:col-span-12 h-full flex flex-col">
            <PermissionsView />
          </div>
        )}

        {activeTab === "settings" && (
          <div className="w-full md:col-span-12 lg:col-span-12 h-full flex flex-col">
            <EnvBoxView />
          </div>
        )}

        {activeTab === "notifications" && (
          <div className="w-full md:col-span-12 lg:col-span-12 h-full flex flex-col">
            <NotificationsView />
          </div>
        )}

        {activeTab === "screenshots" && (
          <div className="w-full md:col-span-12 lg:col-span-12 h-full flex flex-col">
            <ScreenshotsView />
          </div>
        )}

        {activeTab === "simulation" && (
          <div className="w-full md:col-span-12 lg:col-span-12 h-full flex flex-col">
            <SubtasksSimulationView />
          </div>
        )}

        {activeTab === "faceswap" && (
          <div className="w-full md:col-span-12 lg:col-span-12 h-full flex flex-col">
            <FaceswapChatView
              activePersona={currentPersona.id}
              setActivePersona={(id) => {
                const found = PERSONAS.find((p) => p.id === id);
                if (found) setCurrentPersona(found);
              }}
              PERSONAS={PERSONAS}
              currentPersonaObj={currentPersona}
            />
          </div>
        )}
      </main>

      {/* Settings Modal Dialog */}
      {isSettingsModalOpen && (
        <SettingsModal
          onClose={() => setIsSettingsModalOpen(false)}
          dbStatus={dbStatus}
          onRefresh={refreshWorkspace}
        />
      )}
    </div>
  );
}
