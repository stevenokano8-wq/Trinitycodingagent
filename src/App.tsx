import React, { useState, useEffect, useRef } from "react";
import { 
  Menu, 
  Zap, 
  MessageSquare, 
  Smartphone, 
  ChevronDown, 
  Code, 
  FileText, 
  Github, 
  ShieldCheck, 
  Settings, 
  Database, 
  Bell, 
  Camera, 
  Copy, 
  Download, 
  Plus, 
  Send, 
  RefreshCw, 
  Trash2,
  Cpu,
  Shield,
  Clock,
  Loader2,
  Sparkles,
  X,
  Square,
  Play,
  FolderOpen
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Message, Task, FileNode, DatabaseStatus } from "./types.js";
import TaskAccordion from "./components/TaskAccordion.tsx";
import { API_BASE } from "./lib/api.ts";
import CodeView from "./components/CodeView.tsx";
import PreviewView from "./components/PreviewView.tsx";
import DbVisualizer from "./components/DbVisualizer.tsx";
import SettingsModal from "./components/SettingsModal.tsx";
import DeployView from "./components/DeployView.tsx";
import GithubView from "./components/GithubView.tsx";
import PermissionsView from "./components/PermissionsView.tsx";
import SupabaseView from "./components/SupabaseView.tsx";
import NotificationsView from "./components/NotificationsView.tsx";
import ScreenshotsView from "./components/ScreenshotsView.tsx";
import SettingsView from "./components/SettingsView.tsx";
import SubtasksSimulationView from "./components/SubtasksSimulationView.tsx";
import FaceswapChatView from "./components/FaceswapChatView.tsx";
import LogsView from "./components/LogsView.tsx";

function renderMarkdownMessage(content: string) {
  const lines = content.split("\n");
  return (
    <div className="space-y-2">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("###")) {
          return (
            <h3 key={idx} className="text-sm font-bold text-slate-800 tracking-tight mt-4 mb-2 uppercase font-sans">
              {trimmed.replace(/^###\s*/, "")}
            </h3>
          );
        }
        if (trimmed.startsWith("- **") || trimmed.startsWith("* **")) {
          const match = trimmed.match(/^[-*]\s*\*\*(.*?)\*\*:(.*)$/);
          if (match) {
            return (
              <div key={idx} className="flex items-start gap-2 text-slate-700 text-sm pl-2">
                <span className="text-indigo-500 shrink-0 mt-1.5">•</span>
                <span>
                  <strong className="text-slate-800 font-bold">{match[1]}</strong>: {match[2]}
                </span>
              </div>
            );
          }
        }
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          return (
            <div key={idx} className="flex items-start gap-2 text-slate-700 text-sm pl-2">
              <span className="text-indigo-500 shrink-0 mt-1.5">•</span>
              <span>{trimmed.replace(/^[-*]\s*/, "")}</span>
            </div>
          );
        }
        if (!trimmed) {
          return <div key={idx} className="h-1" />;
        }
        return (
          <p key={idx} className="text-slate-700 text-sm leading-relaxed">
            {line}
          </p>
        );
      })}
    </div>
  );
}

function ActionHistoryAccordion({ msg }: { msg: Message }) {
  const [isOpen, setIsOpen] = useState(false); // Closed/collapsed by default as requested!
  
  if (!msg.actionsTaken || msg.actionsTaken.length === 0) return null;

  const foldersCreated = msg.actionsTaken.filter(a => a.type === 'create_folder').length;
  const filesCreated = msg.actionsTaken.filter(a => a.type === 'create_file').length;
  const filesEdited = msg.actionsTaken.filter(a => a.type === 'edit_file').length;
  const commandsRun = msg.actionsTaken.filter(a => a.type === 'run_command').length;
  const isBuilt = msg.actionsTaken.some(a => a.type === 'build');

  const summaryParts: string[] = [];
  if (foldersCreated > 0) summaryParts.push(`Created ${foldersCreated} folder${foldersCreated > 1 ? 's' : ''}`);
  if (filesCreated > 0) summaryParts.push(`Created ${filesCreated} file${filesCreated > 1 ? 's' : ''}`);
  if (filesEdited > 0) summaryParts.push(`Edited ${filesEdited} file${filesEdited > 1 ? 's' : ''}`);
  if (commandsRun > 0) summaryParts.push(`Ran ${commandsRun} command${commandsRun > 1 ? 's' : ''}`);
  if (isBuilt) summaryParts.push("Built");

  const summaryText = summaryParts.join(", ");

  return (
    <div className="border border-slate-150 bg-slate-50/50 rounded-xl mb-3 overflow-hidden shadow-3xs max-w-2xl">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-white hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex items-center gap-2 text-slate-700 min-w-0 flex-1">
          <span className="p-1 rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-clipboard-list"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>
          </span>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-semibold text-slate-800">Action history</span>
            <span className="text-[10px] text-slate-500 truncate max-w-sm font-mono mt-0.5">
              {isOpen ? "Here are key actions taken for the app:" : `(${summaryText})`}
            </span>
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? "transform rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="px-4 pb-3.5 pt-1 border-t border-slate-100 bg-white font-mono text-xs text-slate-600 space-y-2.5 max-h-[220px] overflow-y-auto">
          {msg.actionsTaken.map((action, idx) => {
            let icon = "📝";
            let color = "text-emerald-600";
            let label = "";

            switch (action.type) {
              case 'create_folder':
                icon = "📂";
                label = `Created folder`;
                color = "text-blue-600";
                break;
              case 'create_file':
                icon = "📝";
                label = `Created file`;
                color = "text-amber-600";
                break;
              case 'edit_file':
                icon = "✏️";
                label = `Edited file`;
                color = "text-indigo-600";
                break;
              case 'run_command':
                icon = "⚙️";
                label = `Ran command`;
                color = "text-purple-600";
                break;
              case 'build':
                icon = "🛠️";
                label = `Built`;
                color = "text-emerald-600";
                break;
            }

            return (
              <div key={idx} className="flex items-start justify-between border-b border-slate-50 pb-2 last:border-b-0 last:pb-0">
                <div className="flex items-start gap-2 max-w-[85%]">
                  <span className="text-sm shrink-0">{icon}</span>
                  <div>
                    <span className="font-semibold text-slate-800 block text-[11px]">{label}</span>
                    <span className="text-[9px] text-slate-500 break-all">{action.pathOrCommand}</span>
                    {action.details && (
                      <span className="text-[9px] text-slate-400 block mt-0.5 italic">{action.details}</span>
                    )}
                  </div>
                </div>
                {action.success && (
                  <span className="text-emerald-500 shrink-0 font-bold text-[10px] flex items-center gap-0.5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-check-circle-2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
                    <span>done</span>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MasterPlanAccordion({ tasks }: { tasks: any[] }) {
  const [isOpen, setIsOpen] = useState(false); // CLOSED BY DEFAULT as requested!

  return (
    <div id="global-blueprint-master-plans" className="border border-slate-150 bg-slate-50/50 rounded-2xl mb-4 overflow-hidden shadow-3xs max-w-4xl w-full">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors text-left border-none cursor-pointer"
      >
        <div className="flex items-center gap-2.5 text-slate-700 min-w-0 flex-1">
          <span className="text-base shrink-0 select-none">📋</span>
          <div className="flex flex-col min-w-0 flex-1 font-sans">
            <span className="text-xs font-bold text-slate-800 tracking-tight uppercase">
              Master Plan (Strategy & Milestones)
            </span>
            <span className="text-[10px] text-slate-500 font-mono mt-0.5">
              {isOpen ? "Overarching strategy and phase breakdown:" : `(Collapsible Strategy • ${tasks.length} Phases Scheduled)`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[9px] font-mono font-bold text-slate-400 border border-slate-200/60 bg-slate-50 px-1.5 py-0.5 rounded">
            CLOSED BY DEFAULT
          </span>
          <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? "transform rotate-180" : ""}`} />
        </div>
      </button>

      {isOpen && (
        <div className="p-4 border-t border-slate-100 bg-white space-y-4 font-sans text-left">
          <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100 leading-relaxed">
            <p className="font-semibold text-slate-800 mb-1">🎯 Overarching Strategy</p>
            To achieve high reliability and clean output organization, we execute in scheduled, sequential phases. Each phase acts as a safe transactional block in the compilation loop. Static analysis checks and lint-gates are run automatically before releasing intermediate states to the client webview.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {tasks.map((task, tIdx) => {
              const isLocked = tasks.slice(0, tIdx).some(prevTask => prevTask.status !== "completed");
              const statusColor = task.status === "completed" ? "text-emerald-600 bg-emerald-50 border-emerald-150" : 
                                  task.status === "running" ? "text-blue-600 bg-blue-50 border-blue-150 animate-pulse" : 
                                  "text-slate-400 bg-slate-50 border-slate-150/40";
              const statusIcon = task.status === "completed" ? "🟢" : 
                                 task.status === "running" ? "🔵" : "⏳";
              const statusText = task.status === "completed" ? "Completed" : 
                                 task.status === "running" ? "Running" : 
                                 isLocked ? "Locked" : "Pending";
              return (
                <div key={task.id} className="flex items-center justify-between text-xs py-2 px-3.5 rounded-xl border border-slate-100 bg-white shadow-3xs">
                  <div className="flex flex-col min-w-0 flex-1 mr-2">
                    <span className="font-semibold text-slate-800 truncate">
                      Phase {tIdx + 1}: {task.name}
                    </span>
                    <span className="text-[9px] text-slate-400 font-mono mt-0.5">
                      {task.subtasks?.length || 0} sub-tasks listed
                    </span>
                  </div>
                  <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border shrink-0 ${statusColor} flex items-center gap-1`}>
                    <span>{statusIcon}</span>
                    <span>{statusText}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const PERSONAS = [
  {
    id: "sovereign",
    name: "Sovereign Agent",
    icon: Zap,
    badgeColor: "bg-amber-500 hover:bg-amber-400",
    avatarBg: "bg-amber-500",
    description: "Multi-threading orchestration & background fiber control."
  },
  {
    id: "coder",
    name: "Titan Code-Lobe",
    icon: Code,
    badgeColor: "bg-blue-600 hover:bg-blue-500",
    avatarBg: "bg-blue-600",
    description: "Automated type-safe TSX and full-stack API synthesizer."
  },
  {
    id: "designer",
    name: "Neo Design-Architect",
    icon: Sparkles,
    badgeColor: "bg-pink-500 hover:bg-pink-400",
    avatarBg: "bg-pink-500",
    description: "Swiss grid-based modern UI aesthetics & typography."
  },
  {
    id: "db",
    name: "D1 SQL-Oracle",
    icon: Database,
    badgeColor: "bg-emerald-600 hover:bg-emerald-500",
    avatarBg: "bg-emerald-600",
    description: "Relational Drizzle schemas & transactional query optimization."
  }
];

export default function App() {
  // Active Persona / Faceswap state
  const [activePersona, setActivePersona] = useState<string>("sovereign");

  // Navigation State
  const [activeTab, setActiveTab] = useState<
    "chat" | "preview" | "code" | "database" | "logs" | "deploy" | "github" | "permissions" | "settings" | "supabase" | "notifications" | "screenshots" | "simulation" | "faceswap"
  >("chat");
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Data States
  const [messages, setMessages] = useState<Message[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [dbStatus, setDbStatus] = useState<DatabaseStatus>({ d1: "local_fallback", kv: "local_fallback" });
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState("");
  const [thinkingState, setThinkingState] = useState<{
    stage: string;
    text: string;
    elapsed: number;
    isThinking: boolean;
  } | null>(null);

  const [attachment, setAttachment] = useState<{
    name: string;
    type: string;
    data: string; // base64 string
    size: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.split(",")[1] || result;
      setAttachment({
        name: file.name,
        type: file.type,
        data: base64Data,
        size: file.size
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // System States
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isConnectedSSE, setIsConnectedSSE] = useState(false);
  const [currentTime, setCurrentTime] = useState("");

  const chatEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const sseTimeoutRef = useRef<any>(null);

  // Chat History / Multi-session states
  // Always open with a fresh session — if the stored session is from a
  // previous calendar day it's treated as stale and a new one is created.
  // The old session is still accessible via the sidebar history.
  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    const storedId = localStorage.getItem("trinity_active_session_id");
    if (storedId) {
      try {
        const savedRaw = localStorage.getItem("trinity_saved_sessions");
        if (savedRaw) {
          const sessions: any[] = JSON.parse(savedRaw);
          const match = sessions.find((s: any) => s.id === storedId);
          if (match?.lastUpdated) {
            const sessionDay = new Date(match.lastUpdated).toDateString();
            const today = new Date().toDateString();
            if (sessionDay === today) {
              // Same-day refresh — restore the session as-is
              return storedId;
            }
          }
        }
      } catch (_) {}
    }
    // Different day or no stored session — start fresh
    const freshId = "session-" + Date.now();
    localStorage.setItem("trinity_active_session_id", freshId);
    return freshId;
  });
  const [savedSessions, setSavedSessions] = useState<any[]>([]);
  const [previewReloadKey, setPreviewReloadKey] = useState<number>(0);
  const [isLoadingSession, setIsLoadingSession] = useState<boolean>(false);

  const currentPersonaObj = PERSONAS.find(p => p.id === activePersona) || PERSONAS[0];

  // Load chat history index on start
  useEffect(() => {
    const saved = localStorage.getItem("trinity_saved_sessions");
    if (saved) {
      try {
        setSavedSessions(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse saved sessions:", e);
      }
    }
  }, []);

  // Save current session progress automatically as it grows
  useEffect(() => {
    const hasActualContent = messages.length > 1 || files.length > 0 || tasks.length > 0;
    if (!hasActualContent) return;

    const firstUserMsg = messages.find(m => m.role === "user");
    const title = firstUserMsg ? firstUserMsg.content : "Workspace Session";

    const sessionData = {
      id: activeSessionId,
      title: title.substring(0, 60) + (title.length > 60 ? "..." : ""),
      messages,
      tasks,
      files,
      currentPrompt,
      lastUpdated: new Date().toISOString()
    };

    const saved = localStorage.getItem("trinity_saved_sessions");
    let sessionsList: any[] = saved ? JSON.parse(saved) : [];

    const existingIdx = sessionsList.findIndex(s => s.id === activeSessionId);
    if (existingIdx >= 0) {
      sessionsList[existingIdx] = sessionData;
    } else {
      sessionsList.unshift(sessionData);
    }

    localStorage.setItem("trinity_saved_sessions", JSON.stringify(sessionsList));
    localStorage.setItem("trinity_active_session_id", activeSessionId);
    setSavedSessions(sessionsList);
  }, [messages, tasks, files, currentPrompt, activeSessionId]);

  const handleStartFreshChat = () => {
    // Reset UI immediately — do NOT await server clear (it can hang if a build is running)
    setIsSidebarOpen(false);
    setActiveTab("chat");

    // Create new session ID first so auto-save doesn't overwrite the old one
    const newSessionId = "session-" + Date.now();
    setActiveSessionId(newSessionId);
    localStorage.setItem("trinity_active_session_id", newSessionId);

    // Clear local React state
    setMessages([]);
    setTasks([]);
    setFiles([]);
    setCurrentPrompt("");
    setThinkingState(null);

    // Fire-and-forget server clear so next prompt starts clean on the backend
    fetch(`${API_BASE}/api/session/clear`, { method: "POST" }).catch(() => {});
  };

  // Kill all running tasks immediately — fires cancel-all API then marks tasks
  // as failed locally so the UI reacts without waiting for the next SSE event.
  const handleKillAll = async () => {
    try {
      await fetch(`${API_BASE}/api/tasks/cancel-all`, { method: "POST" });
    } catch (err) {
      console.error("Failed to cancel all tasks:", err);
    }
    setThinkingState(null);
    setIsSending(false);
    setTasks(prev =>
      prev.map(t =>
        t.status === "running"
          ? {
              ...t,
              status: "failed" as const,
              completedAt: new Date().toISOString(),
              subtasks: t.subtasks.map(s =>
                s.status === "running"
                  ? { ...s, status: "failed" as const, logs: [...s.logs, "⛔ Cancelled by user."] }
                  : s
              ),
            }
          : t
      )
    );
  };

  const handleClearAllHistory = () => {
    if (!confirm("Delete ALL saved chat sessions? This cannot be undone.")) return;
    localStorage.removeItem("trinity_saved_sessions");
    localStorage.removeItem("trinity_active_session_id");
    setSavedSessions([]);
    // Also start a fresh chat
    handleStartFreshChat();
  };

  const handleLoadSession = async (session: any) => {
    setIsLoadingSession(true);
    setIsSidebarOpen(false);
    setActiveSessionId(session.id);
    localStorage.setItem("trinity_active_session_id", session.id);

    // 1. Restore React state instantly from localStorage snapshot
    setMessages(session.messages || []);
    setTasks(session.tasks || []);
    setFiles(session.files || []);
    setCurrentPrompt(session.currentPrompt || "");
    setThinkingState(null);
    setActiveTab("chat");

    // 2. Sync to backend in the background (so SSE stays in sync for active builds)
    fetch(`${API_BASE}/api/session/load`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: session.messages || [],
        tasks: session.tasks || [],
        files: session.files || []
      })
    })
      .catch(err => console.error("Error syncing session load to backend:", err))
      .finally(() => setIsLoadingSession(false));
  };

  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // prevent load
    const saved = localStorage.getItem("trinity_saved_sessions");
    if (!saved) return;
    try {
      let sessionsList: any[] = JSON.parse(saved);
      sessionsList = sessionsList.filter(s => s.id !== sessionId);
      localStorage.setItem("trinity_saved_sessions", JSON.stringify(sessionsList));
      setSavedSessions(sessionsList);

      if (activeSessionId === sessionId) {
        handleStartFreshChat();
      }
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  };

  // Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // 7-minute idle timer — start a fresh session when the page has been inactive
  // and there is content worth saving (don't fire on a blank session).
  useEffect(() => {
    const IDLE_MS = 7 * 60 * 1000; // 7 minutes
    let idleTimer: ReturnType<typeof setTimeout>;

    const resetTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        const hasBuildRunning = tasks.some(t => t.status === "running");
        const hasContent = messages.length > 0 || tasks.length > 0 || files.length > 0;
        if (!hasBuildRunning && hasContent) {
          // Auto-save is handled by the session useEffect above; just open fresh
          handleStartFreshChat();
        }
      }, IDLE_MS);
    };

    const EVENTS = ["mousedown", "mousemove", "keydown", "touchstart", "scroll", "click"];
    EVENTS.forEach(ev => window.addEventListener(ev, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      clearTimeout(idleTimer);
      EVENTS.forEach(ev => window.removeEventListener(ev, resetTimer));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, messages.length, files.length]);

  // Fetch initial data & connect to live stream
  useEffect(() => {
    fetchInitialData();
    connectSSE();
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (sseTimeoutRef.current) {
        clearTimeout(sseTimeoutRef.current);
      }
    };
  }, []);

  // Auto-scroll chat on new message or task activity
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, tasks]);

  // Polling fallback: when a build is active, poll files + tasks every 5 s so
  // the Code view stays in sync even if SSE misses a broadcast (isolate split).
  useEffect(() => {
    const hasActiveBuild = tasks.some(t => t.status === "running");
    if (!hasActiveBuild) return;
    const pollInterval = setInterval(async () => {
      try {
        const [fileRes, taskRes] = await Promise.all([
          fetch(`${API_BASE}/api/files`),
          fetch(`${API_BASE}/api/tasks`)
        ]);
        if (fileRes.ok) {
          const fileData = await fileRes.json();
          if (Array.isArray(fileData) && fileData.length > 0) setFiles(fileData);
        }
        if (taskRes.ok) {
          const taskData = await taskRes.json();
          if (Array.isArray(taskData)) {
            setTasks(prev => {
              const incoming = taskData as typeof tasks;
              const merged = [...prev];
              for (const t of incoming) {
                const idx = merged.findIndex(p => p.id === t.id);
                if (idx >= 0) merged[idx] = t;
                else merged.push(t);
              }
              return merged;
            });
          }
        }
      } catch (_) {}
    }, 2000); // Reduced from 5s → 2s so the accordion updates faster during active builds
    return () => clearInterval(pollInterval);
  }, [tasks.some(t => t.status === "running")]);

  const fetchInitialData = async (opts?: { serverOnly?: boolean }) => {
    try {
      // 1. Always fetch DB status (lightweight)
      const statusRes = await fetch(`${API_BASE}/api/db-status`);
      const statusData = await statusRes.json();
      setDbStatus({ d1: statusData.d1, kv: statusData.kv });

      // 2. If we have a saved session in localStorage for the active session ID,
      //    prefer that over stale server in-memory data — UNLESS serverOnly is requested
      //    (e.g. after an SSE "refreshed" event from session/load).
      if (!opts?.serverOnly) {
        const savedRaw = localStorage.getItem("trinity_saved_sessions");
        if (savedRaw) {
          try {
            const sessions: any[] = JSON.parse(savedRaw);
            const activeId = localStorage.getItem("trinity_active_session_id");
            const match = sessions.find((s: any) => s.id === activeId);
            const today = new Date().toDateString();
            if (match && (match.messages?.length > 0 || match.tasks?.length > 0)) {
              // Only restore if the session is from today — stale sessions from
              // previous days are skipped so the user always starts clean.
              const sessionDay = match.lastUpdated
                ? new Date(match.lastUpdated).toDateString()
                : null;
              if (sessionDay === today) {
                setMessages(match.messages || []);
                setTasks(match.tasks || []);
                setFiles(match.files || []);
                setCurrentPrompt(match.currentPrompt || "");
                return; // Local data is fresher — skip server fetch
              }
            }
            // Either no match (fresh session ID generated on new day) or session is
            // from a different day. Clear server-side D1/KV so we don't restore
            // yesterday's messages and tasks from the fallback server fetch below.
            fetch(`${API_BASE}/api/session/clear`, { method: "POST" }).catch(() => {});
            return; // Don't fetch stale server data — start blank
          } catch (_) {}
        }
      }

      // 3. Fallback: fetch from server (used when no local session or serverOnly=true)
      const [msgRes, taskRes, fileRes] = await Promise.all([
        fetch(`${API_BASE}/api/messages`),
        fetch(`${API_BASE}/api/tasks`),
        fetch(`${API_BASE}/api/files`),
      ]);

      if (msgRes.ok) {
        const msgData = await msgRes.json();
        if (Array.isArray(msgData)) setMessages(msgData);
      }
      if (taskRes.ok) {
        const taskData = await taskRes.json();
        if (Array.isArray(taskData)) {
          setTasks(taskData);
          if (taskData.length > 0) setCurrentPrompt(taskData[0].name);
        }
      }
      if (fileRes.ok) {
        const fileData = await fileRes.json();
        if (Array.isArray(fileData)) setFiles(fileData);
      }
    } catch (err) {
      console.error("Failed to load initial workspace data:", err);
    }
  };

  const connectSSE = () => {
    // Prevent multiple overlapping connections or timers
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    if (sseTimeoutRef.current) {
      clearTimeout(sseTimeoutRef.current);
    }

    console.log("Establishing Server-Sent Events real-time connection...");
    const eventSource = new EventSource(`${API_BASE}/api/tasks/stream`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnectedSSE(true);
      console.log("SSE Pipeline active.");
    };

    eventSource.onerror = (e) => {
      setIsConnectedSSE(false);
      console.warn("Real-time pipeline temporary disconnect. Reconnecting...", e);
      
      // Let the native browser retry; if the stream is totally CLOSED, trigger manual reconnect helper
      if (eventSource.readyState === EventSource.CLOSED) {
        eventSource.close();
        if (sseTimeoutRef.current) {
          clearTimeout(sseTimeoutRef.current);
        }
        sseTimeoutRef.current = setTimeout(() => {
          connectSSE();
        }, 2000);
      }
    };

    // Listen to events
    eventSource.addEventListener("connected", (e: any) => {
      const data = JSON.parse(e.data);
      console.log("SSE Pipeline Handshake:", data);
      if (data && data.status === "refreshed") {
        // This event fires after POST /api/session/load — server data is authoritative here
        fetchInitialData({ serverOnly: true });
      }
    });

    eventSource.addEventListener("agent-planning", (e: any) => {
      const data = JSON.parse(e.data);
      setCurrentPrompt(data.prompt ?? "");
      setTasks([]);
      setThinkingState({
        stage: "understanding",
        text: "Planning tasks — analyzing your prompt...",
        elapsed: 0.3,
        isThinking: true
      });
    });

    eventSource.addEventListener("tasks-planned", (e: any) => {
      const data = JSON.parse(e.data);
      if (Array.isArray(data.tasks) && data.tasks.length > 0) {
        setTasks(data.tasks);
        setThinkingState(null);
      }
    });

    eventSource.addEventListener("build-started", (e: any) => {
      const data = JSON.parse(e.data);
      setCurrentPrompt(data.prompt);
      // Clear tasks locally as new run begins
      setTasks([]);
      setThinkingState({
        stage: "understanding",
        text: "Analyzing user prompt and mapping system architecture...",
        elapsed: 0.5,
        isThinking: true
      });
    });

    eventSource.addEventListener("thinking-update", (e: any) => {
      const data = JSON.parse(e.data);
      setThinkingState({
        stage: data.stage,
        text: data.text,
        elapsed: data.elapsed,
        isThinking: true
      });
    });

    eventSource.addEventListener("task-update", (e: any) => {
      const updatedTask = JSON.parse(e.data) as Task;
      setThinkingState(null); // Clear thinking state since task execution has started!
      setTasks(prevTasks => {
        const idx = prevTasks.findIndex(t => t.id === updatedTask.id);
        if (idx >= 0) {
          const next = [...prevTasks];
          next[idx] = updatedTask;
          return next;
        } else {
          return [updatedTask, ...prevTasks];
        }
      });
    });

    eventSource.addEventListener("subtask_log", (e: any) => {
      const data = JSON.parse(e.data) as { subtaskId: string; log: string };
      setTasks(prevTasks => {
        return prevTasks.map(task => {
          const subtaskIdx = task.subtasks.findIndex(s => s.id === data.subtaskId);
          if (subtaskIdx >= 0) {
            const updatedSubtasks = [...task.subtasks];
            const originalSubtask = updatedSubtasks[subtaskIdx];
            
            // Check if log already exists to avoid duplication
            if (!originalSubtask.logs.includes(data.log)) {
              updatedSubtasks[subtaskIdx] = {
                ...originalSubtask,
                logs: [...originalSubtask.logs, data.log]
              };
              
              // If subtask failed or completed, let's propagate status transitions
              let parentStatus = task.status;
              if (originalSubtask.status === "failed") {
                parentStatus = "failed";
              }
              
              return {
                ...task,
                status: parentStatus,
                subtasks: updatedSubtasks
              };
            }
          }
          return task;
        });
      });
    });

    eventSource.addEventListener("file-created", (e: any) => {
      const newFile = JSON.parse(e.data) as FileNode;
      setFiles(prevFiles => {
        const idx = prevFiles.findIndex(f => f.path === newFile.path);
        if (idx >= 0) {
          const next = [...prevFiles];
          next[idx] = newFile;
          return next;
        } else {
          return [...prevFiles, newFile];
        }
      });
    });

    eventSource.addEventListener("message-added", (e: any) => {
      const msg = JSON.parse(e.data) as Message;
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    });

    eventSource.addEventListener("build-finished", (e: any) => {
      const finishMsg = JSON.parse(e.data) as Message;
      setThinkingState(null);
      setMessages(prev => {
        if (prev.some(m => m.id === finishMsg.id)) return prev;
        return [...prev, finishMsg];
      });
      // Sync complete task tree
      fetchInitialData();
    });

    eventSource.addEventListener("session-cleared", () => {
      setThinkingState(null);
      setMessages([]);
      setTasks([]);
      setFiles([]);
      setCurrentPrompt("");
    });
  };

  const handleSendPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isSending) return;

    const userText = inputText;
    const currentAttachment = attachment;
    setAttachment(null);
    setInputText("");
    setIsSending(true);

    // Optimistically add user message
    const optimMsg: Message = {
      id: `msg-optim-${Date.now()}`,
      role: "user",
      content: userText,
      timestamp: new Date().toISOString(),
      attachment: currentAttachment || undefined
    };
    setMessages(prev => [...prev, optimMsg]);

    try {
      const res = await fetch(`${API_BASE}/api/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          role: "user", 
          content: userText, 
          attachment: currentAttachment,
          sessionId: activeSessionId
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to dispatch build instructions.");
      }

      const data = await res.json();
      if (data.tasks) {
        setTasks(data.tasks);
        setCurrentPrompt(userText);
      }
    } catch (err: any) {
      console.error("Failed sending prompt:", err);
      // Append fail message
      setMessages(prev => [...prev, {
        id: `msg-err-${Date.now()}`,
        role: "system",
        content: `⚠️ **Transmission Error:** ${err.message}. Make sure your Gemini API key is configured.`,
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setIsSending(false);
    }
  };

  const handleUpdateFile = async (path: string, content: string) => {
    // Send a real file update to the server and trigger auto-GitHub push
    try {
      const targetFile = files.find(f => f.path === path);
      const res = await fetch(`${API_BASE}/api/files/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path,
          content,
          language: targetFile?.language || "typescript"
        })
      });
      if (res.ok) {
        // Update local cache
        setFiles(files.map(f => f.path === path ? { ...f, content } : f));
      } else {
        console.error("Failed to save file on server:", await res.text());
      }
    } catch (e) {
      console.error("Save code file error:", e);
    }
  };

  const handleClearSession = async () => {
    // Clear local state immediately
    setMessages([]);
    setTasks([]);
    setFiles([]);
    setCurrentPrompt("");
    setThinkingState(null);
    // Then clear server state (fire and forget — don't block UI)
    fetch(`${API_BASE}/api/session/clear`, { method: "POST" }).catch(e => {
      console.error("Purge error:", e);
    });
  };

  // Create unified chronology timeline of messages and tasks grouped by logical interaction turns
  // This guarantees that the user's prompt always stays on top of its associated tasks,
  // preventing prompts from dropping below tasks due to potential client/server clock skews,
  // and implements sequential task disclosure by filtering out pending tasks.
  const userMessages = messages.filter(m => m.role === "user");

  // Helper to find the associated user message for a non-user item (task or assistant message)
  const getAssociatedUserMessageId = (itemTimestamp: string, isAssistantMessage: boolean = false) => {
    if (userMessages.length === 0) return "header";

    const itemTime = new Date(itemTimestamp).getTime();

    // If it's an assistant message, we prefer the most recent user message that preceded it
    if (isAssistantMessage) {
      let bestUserMsg = null;
      let minDiff = Infinity;
      for (const u of userMessages) {
        const uTime = new Date(u.timestamp).getTime();
        const diff = itemTime - uTime;
        // u must precede or be extremely close (to handle minor clock skews where assistant is slightly ahead but practically same time)
        if (diff >= -10000 && diff < minDiff) {
          minDiff = diff;
          bestUserMsg = u;
        }
      }
      if (bestUserMsg) return bestUserMsg.id;
      return "header";
    }

    // For tasks, they are ALWAYS associated with a user message (never header).
    // Find the user message closest to the task's createdAt, preferring preceding ones
    // and allowing up to 5 minutes of clock skew where the server-side task creation is slightly ahead.
    let bestUserMsg = userMessages[0];
    let bestDiff = Infinity;

    for (const u of userMessages) {
      const uTime = new Date(u.timestamp).getTime();
      const diff = itemTime - uTime;
      if (diff >= -300000) {
        if (diff < bestDiff) {
          bestDiff = diff;
          bestUserMsg = u;
        }
      }
    }

    return bestUserMsg.id;
  };

  // Create stably sorted list of tasks (oldest first, stable fallback by id)
  const stablySortedTasks = [...tasks].sort((a, b) => {
    const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.id.localeCompare(b.id);
  });

  // Create groups
  const groups: Record<string, {
    userMessage?: typeof messages[0];
    tasks: typeof tasks;
    messages: typeof messages;
  }> = {
    "header": { tasks: [], messages: [] }
  };

  // Initialize group for each user message
  for (const u of userMessages) {
    groups[u.id] = {
      userMessage: u,
      tasks: [],
      messages: []
    };
  }

  // Distribute other messages
  for (const m of messages) {
    if (m.role === "user") continue;
    const assocId = getAssociatedUserMessageId(m.timestamp, true);
    groups[assocId].messages.push(m);
  }

  // Distribute tasks (filtering at the timeline construction stage to achieve sequential task disclosure!)
  for (const t of stablySortedTasks) {
    const assocId = getAssociatedUserMessageId(t.createdAt, false);
    if (!groups[assocId]) {
      groups["header"].tasks.push(t);
    } else {
      groups[assocId].tasks.push(t);
    }
  }

  // Construct the final sorted timeline list
  const timeline: Array<
    | { type: "message"; id: string; timestamp: string; data: typeof messages[0] }
    | { type: "task"; id: string; timestamp: string; data: typeof tasks[0] }
  > = [];

  // 1. Add header group items (e.g. Welcome Message)
  groups["header"].messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  for (const m of groups["header"].messages) {
    timeline.push({ type: "message", id: m.id, timestamp: m.timestamp, data: m });
  }
  
  groups["header"].tasks.sort((a, b) => {
    const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.id.localeCompare(b.id);
  });
  const visibleHeaderTasks = groups["header"].tasks.filter((t, tIdx) => tIdx === 0 || t.status !== "pending");
  for (const t of visibleHeaderTasks) {
    timeline.push({ type: "task", id: t.id, timestamp: t.createdAt, data: t });
  }

  // 2. Add other user message groups sorted by the user message's timestamp
  const sortedUserMessages = [...userMessages].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  for (const u of sortedUserMessages) {
    const grp = groups[u.id];
    // A. Add the user message itself
    timeline.push({ type: "message", id: u.id, timestamp: u.timestamp, data: u });

    // B & C. Combine tasks and messages, then sort them chronologically by timestamp
    const combined: Array<
      | { type: "task"; timestamp: number; data: typeof tasks[0] }
      | { type: "message"; timestamp: number; data: typeof messages[0] }
    > = [];

    const visibleGrpTasks = grp.tasks.filter((t, tIdx) => tIdx === 0 || t.status !== "pending");
    for (const t of visibleGrpTasks) {
      combined.push({ type: "task", timestamp: new Date(t.createdAt).getTime(), data: t });
    }

    for (const m of grp.messages) {
      // If the message is the initial todo list, set its sorting timestamp slightly lower so it is guaranteed to render before Task 1
      const isTodo = m.content.includes("Master Task Itinerary") || m.content.includes("[Task-1]") || m.content.includes("todo");
      const ts = new Date(m.timestamp).getTime() - (isTodo ? 5000 : 0);
      combined.push({ type: "message", timestamp: ts, data: m });
    }

    // Sort chronologically
    combined.sort((a, b) => {
      const diff = a.timestamp - b.timestamp;
      if (diff !== 0) return diff;
      // If timestamp is exactly equal, prefer showing message before task
      if (a.type === b.type) return 0;
      return a.type === "message" ? -1 : 1;
    });

    // Push to timeline
    for (const item of combined) {
      if (item.type === "task") {
        timeline.push({ type: "task", id: item.data.id, timestamp: item.data.createdAt, data: item.data });
      } else {
        timeline.push({ type: "message", id: item.data.id, timestamp: item.data.timestamp, data: item.data });
      }
    }
  }

  return (
    <div className="h-screen max-h-screen h-[100dvh] max-h-[100dvh] bg-slate-50 flex flex-col font-sans select-none overflow-hidden antialiased">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
        accept="image/*,.txt,.pdf,.doc,.docx,.json,.js,.ts,.tsx,.css,.html" 
      />
      {/* Top Banner Bar - matching screenshot exactly! */}
      <header className="bg-white border-b border-gray-100 px-3 sm:px-6 py-2.5 sm:py-4 flex items-center justify-between sticky top-0 z-40 shadow-xs gap-2">
        
        {/* Left Side: Brand badge */}
        <div className="flex items-center gap-1 sm:gap-3 shrink-0">
          <button 
            id="btn-sidebar-toggle"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-1 sm:p-1.5 hover:bg-gray-100 rounded-xl text-gray-500 hover:text-gray-900 transition-colors shrink-0"
          >
            <Menu className="h-5 w-5" />
          </button>
          
          <div className="flex items-center gap-1">
            <div 
              onClick={() => setIsSidebarOpen(true)}
              className={`flex items-center gap-1 sm:gap-1.5 ${currentPersonaObj.badgeColor} text-white font-bold text-[10px] sm:text-xs px-2 sm:px-3 py-1.5 rounded-full shadow-xs whitespace-nowrap select-none shrink-0 cursor-pointer transition-colors`}
              title="Click to Faceswap agent persona"
            >
              <currentPersonaObj.icon className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
              <span className="hidden sm:inline-block">{currentPersonaObj.name}</span>
              <ChevronDown className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
            </div>
          </div>
        </div>

        {/* Center: Tabs Bar - styled exactly like the design screenshot! */}
        <div className="flex items-center bg-gray-100 p-0.5 sm:p-1 rounded-full border border-gray-150 relative shrink-0">
          <button
            id="tab-btn-chat"
            onClick={() => setActiveTab("chat")}
            className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-5 py-1.5 sm:py-2 rounded-full text-[11px] sm:text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
              activeTab === "chat" 
                ? "bg-white text-gray-900 shadow-sm" 
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            <MessageSquare className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            <span>Chat</span>
          </button>
          
          <button
            id="tab-btn-preview"
            onClick={() => setActiveTab("preview")}
            className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-5 py-1.5 sm:py-2 rounded-full text-[11px] sm:text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
              activeTab === "preview" 
                ? "bg-white text-gray-900 shadow-sm" 
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            <Play className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            <span>Preview</span>
          </button>

          <button
            id="tab-btn-files"
            onClick={() => setActiveTab("code")}
            className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-5 py-1.5 sm:py-2 rounded-full text-[11px] sm:text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
              activeTab === "code" 
                ? "bg-white text-gray-900 shadow-sm" 
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            <FolderOpen className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            <span>Files</span>
          </button>

          {/* More Dropdown Tab */}
          <div className="relative shrink-0">
            <button
              id="tab-btn-more"
              onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
              className={`flex items-center gap-1 sm:gap-2 px-2.5 sm:px-5 py-1.5 sm:py-2 rounded-full text-[11px] sm:text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                !["chat", "preview", "faceswap"].includes(activeTab) ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
              }`}
            >
              <span>More</span>
              <ChevronDown className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
            </button>

            {/* Dropdown Options List */}
            <AnimatePresence>
              {isMoreMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsMoreMenuOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute right-0 mt-2 w-56 bg-white border border-gray-100 rounded-2xl shadow-xl p-2 z-50 overflow-hidden font-sans text-xs"
                  >
                    {[
                      { id: "simulation", name: "Sub-Tasks Simulator", icon: Cpu, color: "text-pink-500 animate-pulse" },
                      { id: "code", name: "Code", icon: Code, color: "text-blue-500" },
                      { id: "deploy", name: "Deploy", icon: Zap, color: "text-amber-500" },
                      { id: "logs", name: "Logs", icon: FileText, color: "text-gray-500" },
                      { id: "github", name: "GitHub", icon: Github, color: "text-neutral-800" },
                      { id: "permissions", name: "Permissions", icon: ShieldCheck, color: "text-emerald-500" },
                      { id: "settings", name: "Settings", icon: Settings, color: "text-gray-600" },
                      { id: "supabase", name: "Supabase", icon: Zap, color: "text-emerald-600" },
                      { id: "notifications", name: "Notifications", icon: Bell, color: "text-red-500" },
                      { id: "screenshots", name: "Screenshots", icon: Camera, color: "text-indigo-500" }
                    ].map(item => (
                      <button
                        id={`more-menu-item-${item.id}`}
                        key={item.id}
                        onClick={() => {
                          setIsMoreMenuOpen(false);
                          setActiveTab(item.id as any);
                        }}
                        className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-gray-50 rounded-xl text-left text-xs font-medium text-gray-700 transition-colors"
                      >
                        <item.icon className={`h-4.5 w-4.5 ${item.color}`} />
                        {item.name}
                      </button>
                    ))}
                    
                    <div className="border-t border-gray-100 my-1" />
                    
                    <button
                      id="more-menu-item-duplicate"
                      onClick={() => { alert("Duplicating project blueprint in background..."); setIsMoreMenuOpen(false); }}
                      className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-gray-50 rounded-xl text-left text-xs font-medium text-gray-500 transition-colors"
                    >
                      <Copy className="h-4.5 w-4.5" />
                      Duplicate Project
                    </button>
                    <button
                      id="more-menu-item-download"
                      onClick={() => { alert("Zipping project directory to download.zip..."); setIsMoreMenuOpen(false); }}
                      className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-gray-50 rounded-xl text-left text-xs font-medium text-gray-500 transition-colors"
                    >
                      <Download className="h-4.5 w-4.5" />
                      Download ZIP
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Empty spacer element to balance flex justify-between layout if needed, or simply let flex-between space left/center */}
        <div className="w-10 sm:w-12 md:hidden block"></div>
      </header>

      {/* Main Body Stage */}
      <main className="flex-1 max-w-[1800px] w-full mx-auto p-4 sm:p-6 flex flex-col md:grid md:grid-cols-10 gap-6 min-h-0 relative overflow-hidden">
        
        {/* Left Column (active workspace view) */}
        <div className={`md:col-span-4 flex flex-col min-h-0 h-full overflow-hidden ${["preview", "code"].includes(activeTab) ? "hidden md:flex" : "flex flex-1"}`}>
          <AnimatePresence mode="wait">
          
          {/* 1. CHAT WORKSPACE VIEW */}
          {(activeTab === "chat" || activeTab === "code") && (
            <motion.div
              key="chat-panel"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="flex-1 flex flex-col min-h-0"
            >
              {/* If no user commands yet, show pristine central Welcome greeting exactly matching screenshot! */}
              {tasks.length === 0 && messages.filter(m => m.id !== "welcome-msg").length === 0 ? (
                <div id="central-welcome-greeting" className="flex-grow flex flex-col items-center justify-center text-center py-10 max-w-2xl mx-auto w-full space-y-8 px-4 sm:px-0">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1, duration: 0.6 }}
                    className="space-y-4"
                  >
                    <h1 className="text-4xl sm:text-5xl font-light tracking-tight text-gray-900 font-display">
                      Welcome back.
                    </h1>
                    <p className="text-2xl sm:text-3xl text-gray-400 font-light font-sans leading-relaxed">
                      Systems are ready for your
                    </p>
                    <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 font-display tracking-tight">
                      Trinity Universe build.
                    </h2>
                  </motion.div>

                  {/* Centered Input Form for Welcome state */}
                  <div className="w-full shrink-0 z-30">
                    <form 
                      onSubmit={handleSendPrompt}
                      className="w-full max-w-3xl mx-auto bg-white rounded-3xl px-5 py-3 shadow-md hover:shadow-lg transition-all border border-gray-150 flex flex-col gap-2"
                    >
                      {attachment && (
                        <div className="w-full flex items-center gap-2 mb-1 bg-slate-50 border border-slate-100 p-2 rounded-2xl text-left">
                          {attachment.type.startsWith("image/") ? (
                            <img
                              src={`data:${attachment.type};base64,${attachment.data}`}
                              alt={attachment.name}
                              className="h-10 w-10 object-cover rounded-lg border border-gray-200"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="h-10 w-10 bg-indigo-50 border border-indigo-150 rounded-lg flex items-center justify-center text-indigo-500 font-mono text-xs font-bold shrink-0">
                              FILE
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-700 truncate">{attachment.name}</p>
                            <p className="text-[10px] text-gray-400">{(attachment.size / 1024).toFixed(1)} KB</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setAttachment(null)}
                            className="p-1 hover:bg-gray-200 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                      <div className="w-full flex items-end gap-3">
                        <button 
                          id="btn-input-plus"
                          type="button" 
                          onClick={() => fileInputRef.current?.click()}
                          className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-700 transition-colors mb-1 shrink-0"
                        >
                          <Plus className="h-5 w-5" />
                        </button>

                      <textarea
                        id="input-prompt-command"
                        placeholder="Command the Titan-Lobe..."
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            e.currentTarget.form?.requestSubmit();
                          }
                        }}
                        rows={1}
                        className="flex-1 min-w-0 bg-transparent border-none text-sm text-gray-800 focus:outline-none placeholder-gray-400 resize-none max-h-32 py-2.5 scrollbar-thin"
                        disabled={isSending}
                        style={{ height: 'auto' }}
                        ref={(el) => {
                          if (el) {
                            el.style.height = 'auto';
                            el.style.height = `${el.scrollHeight}px`;
                          }
                        }}
                      />

                      {tasks.some(t => t.status === "running") && (
                        <button
                          type="button"
                          onClick={handleKillAll}
                          title="Stop all running tasks"
                          className="p-3 bg-rose-600 text-white hover:bg-rose-700 active:scale-95 rounded-full transition-all select-none shrink-0 mb-0.5 flex items-center gap-1.5 animate-pulse shadow-md shadow-rose-200"
                        >
                          <Square className="h-4 w-4 text-white fill-white" />
                        </button>
                      )}
                      <button
                        id="btn-input-submit"
                        type="submit"
                        disabled={!inputText.trim() || isSending}
                        className="p-3 bg-black text-white hover:bg-zinc-800 rounded-full transition-all disabled:opacity-30 disabled:hover:bg-black select-none shrink-0 mb-0.5"
                      >
                        {isSending ? <Loader2 className="h-4.5 w-4.5 animate-spin text-white" /> : <Send className="h-4.5 w-4.5 text-white" />}
                      </button>
                      </div>
                    </form>

                    {/* Suggestions list */}
                    <div className="flex flex-wrap justify-center gap-2 mt-4">
                      {[
                        "setup email registration with auth-guards",
                        "generate custom chart dashboards widget",
                        "seed database with 50 test products logs"
                      ].map((sug, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setInputText(sug)}
                          className="text-[11px] bg-white border border-gray-200 text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-full transition-colors font-mono cursor-pointer"
                        >
                          {sug}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* Else, render the unified chronological chat and task feed! */
                <div id="chat-thread-container" className="flex-1 flex flex-col min-h-0 max-w-4xl mx-auto w-full relative pb-4">
                  {/* Stream Feed Header info */}
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-150/70 shrink-0">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4.5 w-4.5 text-indigo-500 animate-pulse" />
                      <span className="text-xs font-bold text-gray-700 font-mono uppercase tracking-wider">Workspace Execution Timeline</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1.5 text-[10px] text-emerald-600 font-mono">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                        SSE PIPELINE {isConnectedSSE ? "ONLINE" : "OFFLINE"}
                      </span>
                      <button 
                        id="btn-clear-chat"
                        onClick={handleClearSession}
                        className="text-gray-400 hover:text-red-500 p-1.5 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
                        title="Purge session"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Unified Feed Scroll Area */}
                  <div className="flex-1 overflow-y-auto space-y-6 pr-1.5 scrollbar-thin pb-4">
                    {timeline.map((item, index) => {
                      if (item.type === "message") {
                        const msg = item.data;
                        if (msg.role === "user") {
                          return (
                            <div key={item.id} className="flex flex-col items-end w-full">
                              <div className="bg-[#e3edfa] text-slate-800 rounded-3xl rounded-tr-none px-6 py-4 max-w-[85%] shadow-xs leading-relaxed text-sm text-left">
                                {msg.attachment && (
                                  <div className="bg-white/80 p-2.5 rounded-xl border border-slate-200/40 flex items-center gap-2.5 max-w-sm mb-2.5 text-left self-start">
                                    {msg.attachment.type.startsWith("image/") ? (
                                      <img 
                                        src={`data:${msg.attachment.type};base64,${msg.attachment.data}`} 
                                        alt={msg.attachment.name} 
                                        className="h-12 w-12 object-cover rounded-lg border border-gray-200 shrink-0" 
                                        referrerPolicy="no-referrer"
                                      />
                                    ) : (
                                      <div className="h-12 w-12 bg-indigo-50 border border-indigo-150 rounded-lg flex items-center justify-center text-indigo-500 font-mono text-[10px] font-bold shrink-0">
                                        FILE
                                      </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-semibold text-slate-700 truncate">{msg.attachment.name}</p>
                                      <p className="text-[10px] text-slate-400">{(msg.attachment.size / 1024).toFixed(1)} KB</p>
                                    </div>
                                  </div>
                                )}
                                <div className="whitespace-pre-wrap">{msg.content}</div>
                              </div>
                              <span className="text-[10px] text-gray-400 mt-1.5 px-2 font-mono">
                                User • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          );
                        } else if (msg.role === "system") {
                          return (
                            <div key={item.id} className="w-full flex justify-center">
                              <div className="bg-amber-50 text-amber-800 border border-amber-100 rounded-2xl px-5 py-3 text-xs font-mono max-w-[90%] shadow-xs">
                                {msg.content}
                              </div>
                            </div>
                          );
                        } else {
                          // Assistant / Agent Message
                          return (
                            <div key={item.id} className="flex gap-4 items-start w-full">
                              <div className={`h-9 w-9 rounded-full ${currentPersonaObj.avatarBg} flex items-center justify-center text-white shrink-0 shadow-sm`}>
                                <currentPersonaObj.icon className="h-5 w-5" />
                              </div>
                              <div className="flex-1 space-y-2 min-w-0">
                                {msg.modelName && (
                                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-gray-500 font-medium select-none">
                                    <span>{msg.modelName}</span>
                                    {msg.thoughtTimeSeconds !== undefined && (
                                      <>
                                        <span>•</span>
                                        <span>Thought for {msg.thoughtTimeSeconds}s</span>
                                      </>
                                    )}
                                    {msg.durationSeconds !== undefined && (
                                      <>
                                        <span>•</span>
                                        <span>Ran for {msg.durationSeconds}s</span>
                                      </>
                                    )}
                                  </div>
                                )}
                                
                                {/* Action History collapsible block */}
                                <ActionHistoryAccordion msg={msg} />

                                <div className="text-gray-800 leading-relaxed text-sm p-4 bg-white border border-gray-150 rounded-2xl shadow-3xs">
                                  {renderMarkdownMessage(msg.content)}
                                </div>
                                <span className="text-[9px] font-mono text-gray-400 block mt-1">
                                  {currentPersonaObj.name} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            </div>
                          );
                        }
                      } else {
                        // Task Item
                        const task = item.data;
                        const taskIndex = stablySortedTasks.findIndex(t => t.id === task.id) + 1;
                        
                        // Progressive / Just-in-Time Layout:
                        // A task should only be rendered on the screen if it is the first task, 
                        // or if the predecessor task has completed.
                        const isPredecessorCompleted = taskIndex === 1 || (stablySortedTasks[taskIndex - 2] && stablySortedTasks[taskIndex - 2].status === "completed");
                        
                        if (!isPredecessorCompleted) {
                           // Crucial constraint: Task 3, Task 4, and future line headers do not exist on the screen yet!
                          return null;
                        }

                        const isLocked = stablySortedTasks.slice(0, taskIndex - 1).some(prevTask => prevTask.status !== "completed");
                        const isCompleted = task.status === "completed";
                        const isRunning = task.status === "running";
                        const isFailed = task.status === "failed";

                        return (
                          <div key={item.id} className="w-full space-y-4">
                            {/* Phase 3: Transition Text (The Handshake) */}
                            {taskIndex > 1 && stablySortedTasks[taskIndex - 2]?.status === "completed" && (
                              <div className="flex gap-4 items-start w-full animate-fade-in py-1">
                                <div className={`h-9 w-9 rounded-full ${currentPersonaObj.avatarBg} flex items-center justify-center text-white shrink-0 shadow-sm`}>
                                  <currentPersonaObj.icon className="h-5 w-5" />
                                </div>
                                <div className="flex-1 space-y-1">
                                  <div className="text-indigo-900 leading-relaxed text-xs p-3.5 bg-indigo-50/75 border border-indigo-150 rounded-2xl font-mono font-medium max-w-2xl">
                                    ⚡ Transitioning task flow. Predecessor task completed successfully.
                                    <br />
                                    <span className="text-indigo-600 font-bold">Now let us begin Task {taskIndex}: {task.name}...</span>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Main Task Layout Block */}
                            <div className={`w-full pl-0 sm:pl-13 space-y-3.5 transition-all duration-300 ${isLocked ? "opacity-55" : ""}`}>
                              {/* Phase 2: Static Line Header - Permanent Layout Anchor */}
                              <div className="flex items-center gap-3 select-none">
                                <div className={`h-2.5 w-2.5 rounded-full ${
                                  isCompleted ? "bg-emerald-500 shadow-emerald-200 shadow-sm" :
                                  isRunning ? "bg-blue-500 animate-pulse shadow-blue-200 shadow-sm" :
                                  isFailed ? "bg-rose-500 shadow-rose-200 shadow-sm" : "bg-gray-300"
                                }`} />
                                <span className={`text-[10px] font-mono font-bold tracking-wider uppercase ${
                                  isCompleted ? "text-emerald-600" :
                                  isRunning ? "text-blue-600" :
                                  isFailed ? "text-rose-600" : "text-slate-400"
                                }`}>
                                  {isCompleted ? "🟢 SUCCESS" : isRunning ? "🔵 ACTIVE" : isFailed ? "🔴 FAILED" : isLocked ? "⏳ LOCKED" : "⏳ PENDING"}
                                </span>
                                <span className="text-xs text-slate-200">|</span>
                                <h3 className={`text-xs font-bold font-mono tracking-tight uppercase ${isLocked ? "text-slate-400" : "text-slate-700"}`}>
                                  {isCompleted ? `Completed Task ${taskIndex}: ${task.name}` :
                                   isRunning ? `Executing Task ${taskIndex}: ${task.name}` :
                                   isFailed ? `Failed Task ${taskIndex}: ${task.name}` :
                                   `Task ${taskIndex}: ${task.name}`}
                                </h3>
                                {isLocked && (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-md">
                                    Locked
                                  </span>
                                )}
                              </div>

                              {/* Phase 3 & 4: Unified Accordion Card */}
                              <div className={isLocked ? "pointer-events-none select-none" : ""}>
                                <TaskAccordion 
                                  task={task} 
                                  isInitiallyExpanded={index === timeline.length - 1 || isRunning} 
                                  isLocked={isLocked}
                                  taskIndex={taskIndex}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      }
                    })}
                    
                    {/* Live thinking card */}
                    {thinkingState && thinkingState.isThinking && (
                      <div className="flex gap-4 items-start w-full animate-pulse py-3 select-none">
                        <div className="h-9 w-9 rounded-full bg-zinc-900 flex items-center justify-center text-white shrink-0 shadow-sm animate-spin">
                          <Cpu className="h-5 w-5" />
                        </div>
                        <div className="flex-1 space-y-2 max-w-2xl">
                          <div className="text-zinc-800 p-4 bg-zinc-50 border border-zinc-200 rounded-2xl shadow-3xs">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="font-bold text-[10px] uppercase tracking-wider text-zinc-500 font-mono">Thinking Process</span>
                              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-ping" />
                            </div>
                            <p className="text-sm font-medium text-zinc-700 font-sans">{thinkingState.text}</p>
                            <span className="text-[10px] font-mono text-zinc-400 mt-2 block">
                              Thought for {thinkingState.elapsed.toFixed(1)}s...
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div ref={chatEndRef} />
                  </div>

                  {/* Fixed bottom Input Bar */}
                  <div className="w-full bg-slate-50/90 pt-3 pb-1 border-t border-gray-150/50 z-30 shrink-0">
                    <form 
                      onSubmit={handleSendPrompt}
                      className="w-full max-w-3xl mx-auto bg-white rounded-3xl px-5 py-3 shadow-md hover:shadow-lg transition-all border border-gray-150 flex flex-col gap-2"
                    >
                      {attachment && (
                        <div className="w-full flex items-center gap-2 mb-1 bg-slate-50 border border-slate-100 p-2 rounded-2xl text-left">
                          {attachment.type.startsWith("image/") ? (
                            <img
                              src={`data:${attachment.type};base64,${attachment.data}`}
                              alt={attachment.name}
                              className="h-10 w-10 object-cover rounded-lg border border-gray-200"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="h-10 w-10 bg-indigo-50 border border-indigo-150 rounded-lg flex items-center justify-center text-indigo-500 font-mono text-xs font-bold shrink-0">
                              FILE
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-700 truncate">{attachment.name}</p>
                            <p className="text-[10px] text-gray-400">{(attachment.size / 1024).toFixed(1)} KB</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setAttachment(null)}
                            className="p-1 hover:bg-gray-200 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                      <div className="w-full flex items-end gap-3">
                        <button 
                          id="btn-input-plus"
                          type="button" 
                          onClick={() => fileInputRef.current?.click()}
                          className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-700 transition-colors mb-1 shrink-0"
                        >
                          <Plus className="h-5 w-5" />
                        </button>
                      <textarea
                        id="input-prompt-command"
                        placeholder="Command the Titan-Lobe..."
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            e.currentTarget.form?.requestSubmit();
                          }
                        }}
                        rows={1}
                        className="flex-1 min-w-0 bg-transparent border-none text-sm text-gray-800 focus:outline-none placeholder-gray-400 resize-none max-h-32 py-2.5 scrollbar-thin"
                        disabled={isSending}
                        style={{ height: 'auto' }}
                        ref={(el) => {
                          if (el) {
                            el.style.height = 'auto';
                            el.style.height = `${el.scrollHeight}px`;
                          }
                        }}
                      />
                      {tasks.some(t => t.status === "running") && (
                        <button
                          type="button"
                          onClick={handleKillAll}
                          title="Stop all running tasks"
                          className="p-3 bg-rose-600 text-white hover:bg-rose-700 active:scale-95 rounded-full transition-all select-none shrink-0 mb-0.5 flex items-center gap-1.5 animate-pulse shadow-md shadow-rose-200"
                        >
                          <Square className="h-4 w-4 text-white fill-white" />
                        </button>
                      )}
                      <button
                        id="btn-input-submit"
                        type="submit"
                        disabled={!inputText.trim() || isSending}
                        className="p-3 bg-black text-white hover:bg-zinc-800 rounded-full transition-all disabled:opacity-30 disabled:hover:bg-black select-none shrink-0 mb-0.5"
                      >
                        {isSending ? <Loader2 className="h-4.5 w-4.5 animate-spin text-white" /> : <Send className="h-4.5 w-4.5 text-white" />}
                      </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* 13. SUBTASKS SIMULATION VIEW */}
          {activeTab === "simulation" && (
            <motion.div
              key="simulation-panel"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <SubtasksSimulationView />
            </motion.div>
          )}

          {/* 14. FACESWAP CHAT VIEW */}
          {activeTab === "faceswap" && (
            <motion.div
              key="faceswap-panel"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <FaceswapChatView 
                activePersona={activePersona}
                setActivePersona={setActivePersona}
                PERSONAS={PERSONAS}
                currentPersonaObj={currentPersonaObj}
              />
            </motion.div>
          )}



          {/* 4. DATABASE TAB VIEW */}
          {activeTab === "database" && (
            <motion.div
              key="database-panel"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <DbVisualizer messages={messages} tasks={tasks} files={files} onPurge={handleClearSession} />
            </motion.div>
          )}

          {/* 5. LOGS VIEW */}
          {activeTab === "logs" && (
            <motion.div
              key="logs-panel"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <LogsView dbStatus={dbStatus} files={files} tasks={tasks} onRefresh={fetchInitialData} />
            </motion.div>
          )}

          {/* 6. DEPLOY VIEW */}
          {activeTab === "deploy" && (
            <motion.div
              key="deploy-panel"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <DeployView />
            </motion.div>
          )}

          {/* 7. GITHUB SYNC VIEW */}
          {activeTab === "github" && (
            <motion.div
              key="github-panel"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <GithubView sessionId={activeSessionId} />
            </motion.div>
          )}

          {/* 8. PERMISSIONS CONTROLLER VIEW */}
          {activeTab === "permissions" && (
            <motion.div
              key="permissions-panel"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <PermissionsView />
            </motion.div>
          )}

          {/* 9. SETTINGS TAB VIEW */}
          {activeTab === "settings" && (
            <motion.div
              key="settings-panel"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <SettingsView dbStatus={dbStatus} onRefresh={fetchInitialData} />
            </motion.div>
          )}

          {/* 10. SUPABASE DATABASE INSPECTOR VIEW */}
          {activeTab === "supabase" && (
            <motion.div
              key="supabase-panel"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <SupabaseView />
            </motion.div>
          )}

          {/* 11. ALERTS & NOTIFICATIONS VIEW */}
          {activeTab === "notifications" && (
            <motion.div
              key="notifications-panel"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <NotificationsView />
            </motion.div>
          )}

          {/* 12. VIEWPORT SCREENSHOTS GALLERY VIEW */}
          {activeTab === "screenshots" && (
            <motion.div
              key="screenshots-panel"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <ScreenshotsView />
            </motion.div>
          )}

          </AnimatePresence>
        </div>

        {/* Right Column (always-on live preview for large screens; full-screen on mobile when Preview active) */}
        <div className={`w-full md:col-span-6 flex flex-col min-h-0 h-full overflow-hidden ${activeTab === "faceswap" ? "hidden" : ["preview", "code"].includes(activeTab) ? "flex flex-1" : "hidden md:flex"}`}>
          {activeTab === "code" ? (
            <CodeView files={files} onUpdateFile={handleUpdateFile} />
          ) : (
            <PreviewView currentPrompt={currentPrompt} files={files} previewReloadKey={previewReloadKey} tasks={tasks} isSending={isSending} />
          )}
        </div>

      </main>

      {/* Floating Settings configuration Modal */}
      {isSettingsOpen && (
        <SettingsModal 
          onClose={() => setIsSettingsOpen(false)} 
          dbStatus={dbStatus} 
          onRefresh={fetchInitialData}
        />
      )}

      {/* Left Sidebar slideout drawer */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-xs z-40" onClick={() => setIsSidebarOpen(false)} />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              className="fixed left-0 top-0 bottom-0 w-80 bg-white border-r border-gray-100 shadow-2xl z-50 p-6 flex flex-col"
            >
              <div className="flex items-center justify-between pb-6 border-b border-gray-50">
                <span className="font-bold text-gray-900 font-display">System Clusters</span>
                <button onClick={() => setIsSidebarOpen(false)} className="text-gray-400 hover:text-gray-900 text-sm">✕</button>
              </div>

              <div className="flex-1 py-6 space-y-6 overflow-y-auto scrollbar-thin">
                {/* Start Fresh Chat Action */}
                <button
                  id="btn-sidebar-new-chat"
                  onClick={handleStartFreshChat}
                  className="w-full flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 active:scale-[0.98] text-white font-semibold text-xs py-3 px-4 rounded-xl shadow-xs transition-all cursor-pointer font-sans shrink-0"
                >
                  <Plus className="h-4 w-4 text-white" />
                  <span>Start Fresh Chat</span>
                </button>

                {/* Faceswap: Agent Personas Switcher */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-amber-500 animate-pulse" />
                    <span>Faceswap: Active Persona</span>
                  </h4>
                  
                  <button
                    id="btn-faceswap-chat-link"
                    onClick={() => {
                      setActiveTab("faceswap");
                      setIsSidebarOpen(false);
                    }}
                    className="w-full flex items-center justify-between p-3.5 rounded-2xl border border-amber-100 bg-amber-50/50 hover:bg-amber-50 text-amber-900 shadow-3xs transition-all cursor-pointer font-sans"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-full bg-amber-500 flex items-center justify-center text-white shrink-0 animate-pulse">
                        <Sparkles className="h-4 w-4" />
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-bold">Faceswap Chat</p>
                        <p className="text-[9px] text-amber-600 font-mono">Launch Swap Interface</p>
                      </div>
                    </div>
                    <ChevronDown className="h-4 w-4 text-amber-500 -rotate-90 shrink-0" />
                  </button>
                </div>

                {/* Chat History Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                      <span>Chat History</span>
                      <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-bold font-mono">
                        {savedSessions.length}
                      </span>
                    </h4>
                    {savedSessions.length > 0 && (
                      <button
                        id="btn-clear-all-history"
                        onClick={handleClearAllHistory}
                        title="Delete all saved sessions"
                        className="flex items-center gap-1 text-[10px] font-semibold text-red-400 hover:text-red-600 transition-colors px-2 py-0.5 rounded-lg hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3" />
                        Clear All
                      </button>
                    )}
                  </div>

                  {savedSessions.length === 0 ? (
                    <div className="p-4 rounded-2xl border border-dashed border-gray-200 text-center text-[11px] text-gray-400 font-sans">
                      No saved chat sessions yet.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto scrollbar-thin pr-1">
                      {savedSessions.map((session) => {
                        const isActive = session.id === activeSessionId;
                        return (
                          <div
                            key={session.id}
                            id={`session-item-${session.id}`}
                            onClick={() => handleLoadSession(session)}
                            className={`group relative flex items-center justify-between p-3 rounded-xl border text-left cursor-pointer transition-all ${
                              isActive
                                ? "bg-amber-50/70 border-amber-200 text-amber-900 shadow-xs font-semibold"
                                : "bg-gray-50/50 hover:bg-gray-100/70 border-gray-150 text-gray-700 hover:text-gray-900"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <MessageSquare className={`h-3.5 w-3.5 shrink-0 ${
                                isActive ? "text-amber-500" : "text-gray-400 group-hover:text-gray-600"
                              }`} />
                              <div className="min-w-0 flex-1 font-sans">
                                <p className="text-xs truncate font-semibold">
                                  {session.title || "Workspace Session"}
                                </p>
                                <p className="text-[9px] text-gray-400 font-mono mt-0.5">
                                  {new Date(session.lastUpdated).toLocaleDateString([], {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </p>
                              </div>
                            </div>

                            {/* Delete action button */}
                            <button
                              type="button"
                              onClick={(e) => handleDeleteSession(session.id, e)}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200/60 hover:text-red-500 rounded-md transition-all text-gray-400 shrink-0 ml-1.5"
                              title="Delete Session"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider font-mono">Current Build</h4>
                  <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center gap-3">
                    <Clock className="h-5 w-5 text-indigo-500" />
                    <div>
                      <p className="text-xs text-gray-400 font-medium font-mono">LOCAL TIME</p>
                      <p className="text-sm font-bold text-gray-800">{currentTime || "00:00 AM"}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider font-mono">Active Integrations</h4>
                  <div className="space-y-2 bg-slate-50 p-3 rounded-2xl border border-gray-100">
                    <div className="flex items-center justify-between text-xs font-medium text-gray-600 pb-2 border-b border-gray-100">
                      <span className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-pulse" />
                        <span>GitHub Sync</span>
                      </span>
                      <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-indigo-50 text-indigo-700">
                        sovereign-agent-api
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs font-medium text-gray-600 pb-2 border-b border-gray-100">
                      <span>Cloudflare D1 DB</span>
                      <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${dbStatus.d1 === "connected" || dbStatus.d1 === "local_fallback" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        {dbStatus.d1}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs font-medium text-gray-600 pb-2 border-b border-gray-100">
                      <span>Workers KV Cache</span>
                      <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${dbStatus.kv === "connected" || dbStatus.kv === "local_fallback" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        {dbStatus.kv}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs font-medium text-gray-600 pb-2 border-b border-gray-100">
                      <span>Core LLM Engine</span>
                      <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-purple-50 text-purple-700">
                        Gemini 2.5 Flash/Pro
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs font-medium text-gray-600">
                      <span>SSE Feed</span>
                      <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${isConnectedSSE ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                        {isConnectedSSE ? "Online" : "Offline"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-50 pt-4 flex items-center gap-3">
                <div className="h-9 w-9 bg-gray-900 text-white rounded-full flex items-center justify-center font-bold text-sm">
                  C
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-800">Workspace</p>
                  <p className="text-[10px] text-gray-400">trinityceo717@gmail.com</p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
