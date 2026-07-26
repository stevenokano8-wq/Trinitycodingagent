import { API_BASE } from "./lib/api.ts";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Message, Task, FileNode, DatabaseStatus } from "./types.js";
import {
  Send, Paperclip, X, Code2, Eye, Github, Key, Terminal, Database,
  Rocket, Settings, Bell, Shield, Camera, Cpu, Sparkles, ChevronRight,
  RefreshCw, AlertCircle, Loader2, Zap, MessageSquare, Layers
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Views
import TaskAccordion    from "./components/TaskAccordion.js";
import CodeView         from "./components/CodeView.js";
import GithubView       from "./components/GithubView.js";
import LogsView         from "./components/LogsView.js";
import DeployView       from "./components/DeployView.js";
import DbVisualizer     from "./components/DbVisualizer.js";
import PreviewView      from "./components/PreviewView.js";
import SettingsView     from "./components/SettingsView.js";
import SettingsModal    from "./components/SettingsModal.js";
import NotificationsView from "./components/NotificationsView.js";
import PermissionsView  from "./components/PermissionsView.js";
import ScreenshotsView  from "./components/ScreenshotsView.js";
import SupabaseView     from "./components/SupabaseView.js";
import EnvBoxView       from "./components/EnvBoxView.js";

type ViewId =
  | "chat" | "code" | "preview" | "github" | "env"
  | "logs" | "db" | "deploy" | "settings" | "notifications"
  | "permissions" | "screenshots" | "supabase";

interface NavItem {
  id: ViewId;
  label: string;
  icon: React.ReactNode;
  shortLabel?: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "chat",          label: "Chat",          icon: <MessageSquare className="h-3.5 w-3.5" /> },
  { id: "code",          label: "Code",          icon: <Code2 className="h-3.5 w-3.5" /> },
  { id: "preview",       label: "Preview",       icon: <Eye className="h-3.5 w-3.5" /> },
  { id: "github",        label: "GitHub",        icon: <Github className="h-3.5 w-3.5" /> },
  { id: "env",           label: "Env",           icon: <Key className="h-3.5 w-3.5" /> },
  { id: "logs",          label: "Logs",          icon: <Terminal className="h-3.5 w-3.5" /> },
  { id: "db",            label: "Database",      icon: <Database className="h-3.5 w-3.5" />, shortLabel: "DB" },
  { id: "deploy",        label: "Deploy",        icon: <Rocket className="h-3.5 w-3.5" /> },
  { id: "supabase",      label: "Supabase",      icon: <Layers className="h-3.5 w-3.5" /> },
  { id: "screenshots",   label: "Screenshots",   icon: <Camera className="h-3.5 w-3.5" />, shortLabel: "Shots" },
  { id: "notifications", label: "Notifications", icon: <Bell className="h-3.5 w-3.5" />, shortLabel: "Alerts" },
  { id: "permissions",   label: "Permissions",   icon: <Shield className="h-3.5 w-3.5" />, shortLabel: "Perms" },
  { id: "settings",      label: "Settings",      icon: <Settings className="h-3.5 w-3.5" /> },
];

function getLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    css: "css", html: "html", json: "json", md: "markdown",
    py: "python", sh: "bash", yaml: "yaml", yml: "yaml",
    toml: "toml", sql: "sql", rs: "rust", go: "go",
  };
  return map[ext] ?? "text";
}

export default function App() {
  const [activeView,     setActiveView]     = useState<ViewId>("chat");
  const [messages,       setMessages]       = useState<Message[]>([]);
  const [tasks,          setTasks]          = useState<Task[]>([]);
  const [files,          setFiles]          = useState<FileNode[]>([]);
  const [dbStatus,       setDbStatus]       = useState<DatabaseStatus>({ d1: "local_fallback", kv: "local_fallback" });
  const [prompt,         setPrompt]         = useState("");
  const [isBuilding,     setIsBuilding]     = useState(false);
  const [showSettings,   setShowSettings]   = useState(false);
  const [attachment,     setAttachment]     = useState<{ name: string; type: string; data: string; size: number } | null>(null);
  const [sseConnected,   setSseConnected]   = useState(false);
  const [sessionId]                        = useState(() => localStorage.getItem("trinity_session_id") || `sess-${Date.now()}`);

  const messagesEndRef   = useRef<HTMLDivElement>(null);
  const fileInputRef     = useRef<HTMLInputElement>(null);
  const textareaRef      = useRef<HTMLTextAreaElement>(null);
  const sseRef           = useRef<EventSource | null>(null);

  // ── Persist session ID ──────────────────────────────────────────────────────
  useEffect(() => { localStorage.setItem("trinity_session_id", sessionId); }, [sessionId]);

  // ── Initial data load ───────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([fetchMessages(), fetchTasks(), fetchFiles(), fetchDbStatus()]);
  }, []);

  // ── SSE real-time stream ────────────────────────────────────────────────────
  useEffect(() => {
    let retryTimer: ReturnType<typeof setTimeout>;
    let sse: EventSource;

    const connect = () => {
      sse = new EventSource(`${API_BASE}/api/build/stream`);
      sseRef.current = sse;
      sse.onopen  = () => setSseConnected(true);
      sse.onerror = () => { setSseConnected(false); sse.close(); retryTimer = setTimeout(connect, 4000); };

      sse.addEventListener("message-added",   (e) => { const msg = JSON.parse(e.data) as Message; setMessages(prev => { const exists = prev.some(m => m.id === msg.id); return exists ? prev : [...prev, msg]; }); if (msg.role === "assistant") setIsBuilding(false); });
      sse.addEventListener("task-updated",    (e) => { const t   = JSON.parse(e.data) as Task;    setTasks(prev => { const idx = prev.findIndex(x => x.id === t.id); return idx >= 0 ? prev.map((x, i) => i === idx ? t : x) : [...prev, t]; }); });
      sse.addEventListener("file-created",    (e) => { const f   = JSON.parse(e.data) as FileNode; setFiles(prev => { const idx = prev.findIndex(x => x.path === f.path); return idx >= 0 ? prev.map((x, i) => i === idx ? f : x) : [...prev, f]; }); });
      sse.addEventListener("file-updated",    (e) => { const f   = JSON.parse(e.data) as FileNode; setFiles(prev => prev.map(x => x.path === f.path ? f : x)); });
      sse.addEventListener("build-started",   ()  => setIsBuilding(true));
      sse.addEventListener("build-finished",  ()  => { setIsBuilding(false); fetchTasks(); fetchFiles(); });
      sse.addEventListener("session-cleared", ()  => { setMessages([]); setTasks([]); setFiles([]); });
    };

    connect();
    return () => { clearTimeout(retryTimer); sse?.close(); };
  }, []);

  // ── Auto-scroll chat ────────────────────────────────────────────────────────
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // ── Data fetchers ───────────────────────────────────────────────────────────
  const fetchMessages = async () => { try { const r = await fetch(`${API_BASE}/api/messages`); if (r.ok) setMessages(await r.json()); } catch (_) {} };
  const fetchTasks    = async () => { try { const r = await fetch(`${API_BASE}/api/tasks`);    if (r.ok) setTasks(await r.json());    } catch (_) {} };
  const fetchFiles    = async () => { try { const r = await fetch(`${API_BASE}/api/files`);    if (r.ok) setFiles(await r.json());    } catch (_) {} };
  const fetchDbStatus = async () => { try { const r = await fetch(`${API_BASE}/api/db-status`); if (r.ok) setDbStatus(await r.json()); } catch (_) {} };

  // ── File attachment handler ─────────────────────────────────────────────────
  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = (ev.target?.result as string).split(",")[1] ?? "";
      setAttachment({ name: file.name, type: file.type, data, size: file.size });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // ── Send message / trigger build ────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = prompt.trim();
    if (!text || isBuilding) return;

    const userMsg: Message = {
      id: `msg-${Date.now()}-user`,
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
      attachment: attachment ?? undefined,
    };
    setMessages(prev => [...prev, userMsg]);
    setPrompt("");
    setAttachment(null);
    setIsBuilding(true);

    try {
      await fetch(`${API_BASE}/api/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, role: "user", attachment }),
      });
    } catch (_) { setIsBuilding(false); }
  }, [prompt, isBuilding, attachment]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleUpdateFile = async (path: string, content: string) => {
    setFiles(prev => {
      const idx = prev.findIndex(f => f.path === path);
      const node: FileNode = { path, content, language: getLanguage(path) };
      return idx >= 0 ? prev.map((f, i) => i === idx ? node : f) : [...prev, node];
    });
    try {
      await fetch(`${API_BASE}/api/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content, language: getLanguage(path) }),
      });
    } catch (_) {}
  };

  const handleClearSession = async () => {
    if (!confirm("Clear all messages, tasks, and files?")) return;
    await fetch(`${API_BASE}/api/session/clear`, { method: "POST" });
    setMessages([]); setTasks([]); setFiles([]);
  };

  const activeTasks  = tasks.filter(t => t.status === "running" || t.status === "pending");
  const currentPrompt = messages.filter(m => m.role === "user").slice(-1)[0]?.content ?? "";

  // ── Render active right-panel view ──────────────────────────────────────────
  const renderView = () => {
    switch (activeView) {
      case "chat":        return <ChatRightPanel messages={messages} tasks={tasks} files={files} currentPrompt={currentPrompt} />;
      case "code":        return <CodeView files={files} onUpdateFile={handleUpdateFile} />;
      case "preview":     return <PreviewView files={files} currentPrompt={currentPrompt} />;
      case "github":      return <GithubView sessionId={sessionId} />;
      case "env":         return <EnvBoxView />;
      case "logs":        return <LogsView dbStatus={dbStatus} files={files} tasks={tasks} onRefresh={fetchDbStatus} />;
      case "db":          return <DbVisualizer />;
      case "deploy":      return <DeployView />;
      case "supabase":    return <SupabaseView />;
      case "screenshots": return <ScreenshotsView />;
      case "notifications": return <NotificationsView />;
      case "permissions": return <PermissionsView />;
      case "settings":    return <SettingsView dbStatus={dbStatus} onRefresh={fetchDbStatus} />;
      default:            return null;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#f4f4f2] overflow-hidden font-sans">
      {/* ── Top navigation bar ──────────────────────────────────────────────── */}
      <header className="h-12 bg-white border-b border-gray-100 flex items-center px-4 gap-2 shrink-0 shadow-sm z-30">
        {/* Brand */}
        <div className="flex items-center gap-2 mr-3">
          <div className="w-7 h-7 bg-gray-900 rounded-lg flex items-center justify-center">
            <Sparkles className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-bold text-sm text-gray-900 hidden sm:block tracking-tight">Trinity</span>
        </div>

        {/* Nav buttons — all clickable */}
        <div className="flex items-center gap-0.5 overflow-x-auto flex-1 hide-scrollbar">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all ${
                activeView === item.id
                  ? "bg-gray-900 text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
              }`}
            >
              {item.icon}
              <span className="hidden md:inline">{item.shortLabel ?? item.label}</span>
            </button>
          ))}
        </div>

        {/* Status indicators */}
        <div className="flex items-center gap-2 ml-2 shrink-0">
          <div className={`w-2 h-2 rounded-full ${sseConnected ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`} title={sseConnected ? "Live" : "Reconnecting…"} />
          {isBuilding && <Loader2 className="h-3.5 w-3.5 text-gray-400 animate-spin" />}
          <button onClick={() => setShowSettings(true)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all">
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* ── Main layout ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left chat panel (always visible) */}
        <div className="w-80 min-w-72 flex flex-col border-r border-gray-100 bg-white shrink-0 overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-4 gap-3">
                <div className="w-12 h-12 bg-gray-50 border border-gray-100 rounded-2xl flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-gray-400" />
                </div>
                <p className="text-xs text-gray-400 max-w-[200px]">Describe what you want to build — UI, API, full-stack, anything.</p>
              </div>
            ) : (
              messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)
            )}
            {isBuilding && (
              <div className="flex items-start gap-2 px-1">
                <div className="w-6 h-6 bg-gray-900 rounded-lg flex items-center justify-center shrink-0">
                  <Cpu className="h-3 w-3 text-white" />
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-500 flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Generating…
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Active tasks mini view */}
          {activeTasks.length > 0 && (
            <div className="px-3 pb-2">
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-2.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Zap className="h-3 w-3 text-amber-500" />
                  <span className="text-[10px] font-bold text-amber-700">{activeTasks.length} task{activeTasks.length > 1 ? "s" : ""} running</span>
                </div>
                {activeTasks.slice(0, 2).map(t => (
                  <div key={t.id} className="text-[10px] text-amber-600 font-mono truncate">{t.name}</div>
                ))}
                <button onClick={() => setActiveView("code")} className="text-[10px] text-amber-700 font-bold mt-1 flex items-center gap-1 hover:underline">
                  View files <ChevronRight className="h-2.5 w-2.5" />
                </button>
              </div>
            </div>
          )}

          {/* Attachment preview */}
          {attachment && (
            <div className="px-3 pb-1">
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono text-blue-700 truncate flex-1">{attachment.name}</span>
                <button onClick={() => setAttachment(null)} className="text-blue-400 hover:text-blue-700"><X className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          )}

          {/* Chat input */}
          <div className="p-3 border-t border-gray-100">
            <div className="relative bg-gray-50 border border-gray-200 rounded-xl overflow-hidden focus-within:border-gray-400 focus-within:bg-white transition-all">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What should I build?"
                rows={3}
                className="w-full bg-transparent px-3 pt-3 pb-1 text-xs resize-none outline-none text-gray-800 placeholder-gray-400"
              />
              <div className="flex items-center justify-between px-2 py-1.5">
                <div className="flex items-center gap-1">
                  <button onClick={() => fileInputRef.current?.click()} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all" title="Attach image or file">
                    <Paperclip className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={handleClearSession} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all" title="Clear session">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*,.pdf,.txt,.json,.ts,.tsx,.js,.jsx,.py,.md,.yaml,.yml" className="hidden" onChange={handleFileAttach} />
                </div>
                <button
                  onClick={handleSend}
                  disabled={!prompt.trim() || isBuilding}
                  className="bg-gray-900 text-white rounded-lg p-1.5 disabled:opacity-40 hover:bg-gray-700 transition-all"
                >
                  {isBuilding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right main content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.12 }}
              className="flex-1 flex flex-col overflow-hidden"
            >
              {renderView()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Settings modal */}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} dbStatus={dbStatus} onRefresh={fetchDbStatus} />
      )}
    </div>
  );
}

// ── Message bubble component ────────────────────────────────────────────────
function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex items-start gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${isUser ? "bg-gray-200" : "bg-gray-900"}`}>
        {isUser ? <span className="text-[9px] font-bold text-gray-600">U</span> : <Cpu className="h-3 w-3 text-white" />}
      </div>

      <div className={`flex flex-col gap-1 max-w-[85%] ${isUser ? "items-end" : "items-start"}`}>
        {/* Image attachment */}
        {msg.attachment && msg.attachment.type.startsWith("image/") && (
          <img
            src={`data:${msg.attachment.type};base64,${msg.attachment.data}`}
            alt={msg.attachment.name}
            className="max-w-[160px] rounded-xl border border-gray-200 shadow-sm"
          />
        )}
        {/* Text bubble */}
        <div className={`px-3 py-2 rounded-xl text-xs leading-relaxed ${
          isUser ? "bg-gray-900 text-white rounded-tr-sm" : "bg-gray-50 border border-gray-100 text-gray-700 rounded-tl-sm"
        }`}>
          <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
        </div>
        {/* Meta */}
        <div className="flex items-center gap-1.5 text-[9px] text-gray-400">
          {msg.modelName && <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded-full">{msg.modelName}</span>}
          {msg.durationSeconds && <span>{msg.durationSeconds}s</span>}
        </div>
      </div>
    </div>
  );
}

// ── Chat right panel (task accordion + file summary) ───────────────────────
function ChatRightPanel({ messages, tasks, files, currentPrompt }: {
  messages: Message[]; tasks: Task[]; files: FileNode[]; currentPrompt: string;
}) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#f4f4f2]">
      {tasks.length > 0 ? (
        <div className="flex-1 overflow-y-auto p-4">
          <TaskAccordion tasks={tasks} files={files} currentPrompt={currentPrompt} />
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
          <div className="w-16 h-16 bg-white border border-gray-100 rounded-3xl flex items-center justify-center shadow-sm">
            <Sparkles className="h-8 w-8 text-gray-300" />
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-gray-700">Ready to Build</h3>
            <p className="text-xs text-gray-400 max-w-xs">
              Type a prompt in the chat panel. The agent will break it into tasks, write files, and compile them in real-time.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-left text-[10px] text-gray-500 max-w-xs w-full">
            {["Build a landing page", "Create a REST API", "Clone my GitHub repo", "Add Supabase auth"].map(ex => (
              <div key={ex} className="bg-white border border-gray-100 rounded-xl px-3 py-2 font-mono hover:border-gray-300 cursor-default transition-all">
                {ex}
              </div>
            ))}
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div className="border-t border-gray-100 bg-white px-4 py-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">{files.length} workspace file{files.length !== 1 ? "s" : ""}</p>
          <div className="flex flex-wrap gap-1.5">
            {files.slice(-8).map(f => (
              <span key={f.path} className="text-[9px] bg-gray-50 border border-gray-100 text-gray-500 px-2 py-1 rounded-lg font-mono">
                {f.path.split("/").pop()}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
