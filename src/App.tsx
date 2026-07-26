import React, { Suspense, lazy, useState, useEffect, useRef } from "react";
import {
  Zap,
  Code,
  Database,
  Plus,
  Sparkles,
  Calendar,
  Activity,
  MessageSquare,
  Trash2,
  ChevronDown,
  AlertCircle,
  Play,
  Settings,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Message, Task, FileNode, DatabaseStatus } from "./types.js";
import { API_BASE } from "./lib/api.ts";
import type { TabType, PersonaObj } from "./components/Navbar.tsx";
import type { Attachment } from "./components/ExecutionTimeline.tsx";

const Navbar = lazy(() => import("./components/Navbar.tsx"));
const ExecutionTimeline = lazy(() => import("./components/ExecutionTimeline.tsx"));
const SettingsModal = lazy(() => import("./components/SettingsModal.tsx"));
const DbVisualizer = lazy(() => import("./components/DbVisualizer.tsx"));
const DeployView = lazy(() => import("./components/DeployView.tsx"));
const GithubView = lazy(() => import("./components/GithubView.tsx"));
const PermissionsView = lazy(() => import("./components/PermissionsView.tsx"));
const SupabaseView = lazy(() => import("./components/SupabaseView.tsx"));
const NotificationsView = lazy(() => import("./components/NotificationsView.tsx"));
const ScreenshotsView = lazy(() => import("./components/ScreenshotsView.tsx"));
const SettingsView = lazy(() => import("./components/SettingsView.tsx"));
const SubtasksSimulationView = lazy(() => import("./components/SubtasksSimulationView.tsx"));
const FaceswapChatView = lazy(() => import("./components/FaceswapChatView.tsx"));
const LogsView = lazy(() => import("./components/LogsView.tsx"));
const WorkspacePreview = lazy(() => import("./components/WorkspacePreview.tsx"));

const viewFallback = (
  <div className="flex h-full min-h-[280px] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white/70 text-sm font-medium text-gray-500">
    Loading view…
  </div>
);

interface AppShellProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  currentPersonaObj: PersonaObj;
  activePersona: string;
  setActivePersona: (persona: string) => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (value: boolean) => void;
  isMoreMenuOpen: boolean;
  setIsMoreMenuOpen: (value: boolean) => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (value: boolean) => void;
  messages: Message[];
  tasks: Task[];
  files: FileNode[];
  dbStatus: DatabaseStatus;
  inputText: string;
  setInputText: (value: string) => void;
  isSending: boolean;
  currentPrompt: string;
  suspendedFrame: any | null;
  thinkingState: { stage: string; text: string; elapsed: number; isThinking: boolean } | null;
  attachment: Attachment | null;
  setAttachment: (value: Attachment | null) => void;
  activeSessionId: string;
  savedSessions: any[];
  expandedSessionId: string | null;
  setExpandedSessionId: (value: string | null) => void;
  previewReloadKey: number;
  isLoadingSession: boolean;
  isConnectedSSE: boolean;
  currentTime: string;
  chatEndRef: React.RefObject<HTMLDivElement>;
  chatScrollContainerRef: React.RefObject<HTMLDivElement>;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSendPrompt: (e: React.FormEvent) => void;
  onClearSession: () => void;
  onKillAll: () => void;
  onFilePickerClick: () => void;
  onStartFreshChat: () => void;
  onClearAllHistory: () => void;
  onLoadSession: (session: any) => void;
  onSpinUpSessionPreview: (session: any, e?: React.MouseEvent) => void;
  onDeleteSession: (sessionId: string, e: React.MouseEvent) => void;
  onUpdateFile: (path: string, content: string) => void;
  onHITLApprove: (approved: boolean) => void;
  onRefreshData: () => void;
}

function AppShell({
  activeTab,
  setActiveTab,
  currentPersonaObj,
  activePersona,
  setActivePersona,
  isSidebarOpen,
  setIsSidebarOpen,
  isMoreMenuOpen,
  setIsMoreMenuOpen,
  isSettingsOpen,
  setIsSettingsOpen,
  messages,
  tasks,
  files,
  dbStatus,
  inputText,
  setInputText,
  isSending,
  currentPrompt,
  suspendedFrame,
  thinkingState,
  attachment,
  setAttachment,
  activeSessionId,
  savedSessions,
  expandedSessionId,
  setExpandedSessionId,
  previewReloadKey,
  isLoadingSession,
  isConnectedSSE,
  currentTime,
  chatEndRef,
  chatScrollContainerRef,
  fileInputRef,
  onFileChange,
  onSendPrompt,
  onClearSession,
  onKillAll,
  onFilePickerClick,
  onStartFreshChat,
  onClearAllHistory,
  onLoadSession,
  onSpinUpSessionPreview,
  onDeleteSession,
  onUpdateFile,
  onHITLApprove,
  onRefreshData,
}: AppShellProps) {
  const showChatPane = ["chat", "preview", "code"].includes(activeTab);
  const leftColClass = `${showChatPane ? "md:col-span-4" : "md:col-span-10"} flex flex-col min-h-0 h-full overflow-hidden ${["preview", "code"].includes(activeTab) ? "hidden md:flex" : "flex flex-1"}`;
  const panelClass = "flex-1 flex flex-col min-h-0";

  const renderLeftPane = () => {
    if (showChatPane) {
      return (
        <Suspense fallback={viewFallback}>
          <ExecutionTimeline
            messages={messages}
            tasks={tasks}
            files={files}
            thinkingState={thinkingState}
            isConnectedSSE={isConnectedSSE}
            currentPersonaObj={currentPersonaObj}
            inputText={inputText}
            setInputText={setInputText}
            isSending={isSending}
            attachment={attachment}
            setAttachment={setAttachment}
            onSendPrompt={onSendPrompt}
            onClearSession={onClearSession}
            onKillAll={onKillAll}
            onFilePickerClick={onFilePickerClick}
            chatEndRef={chatEndRef}
            chatScrollContainerRef={chatScrollContainerRef}
          />
        </Suspense>
      );
    }

    const wrapMotion = (key: string, child: React.ReactNode) => (
      <motion.div key={key} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={panelClass}>{child}</motion.div>
    );

    switch (activeTab) {
      case "simulation": return wrapMotion("simulation", <SubtasksSimulationView />);
      case "faceswap": return wrapMotion("faceswap", <FaceswapChatView activePersona={activePersona} setActivePersona={setActivePersona} PERSONAS={PERSONAS} currentPersonaObj={currentPersonaObj} />);
      case "database": return wrapMotion("database", <DbVisualizer messages={messages} tasks={tasks} files={files} onPurge={onClearSession} />);
      case "logs": return wrapMotion("logs", <LogsView dbStatus={dbStatus} files={files} tasks={tasks} onRefresh={onRefreshData} />);
      case "deploy": return wrapMotion("deploy", <DeployView />);
      case "github": return wrapMotion("github", <GithubView sessionId={activeSessionId} />);
      case "permissions": return wrapMotion("permissions", <PermissionsView />);
      case "settings": return wrapMotion("settings", <SettingsView dbStatus={dbStatus} onRefresh={onRefreshData} />);
      case "supabase": return wrapMotion("supabase", <SupabaseView />);
      case "notifications": return wrapMotion("notifications", <NotificationsView />);
      case "screenshots": return wrapMotion("screenshots", <ScreenshotsView />);
      default: return null;
    }
  };

  return (
    <div className="h-screen max-h-screen h-[100dvh] max-h-[100dvh] bg-[#FEF0E4] flex flex-col font-sans select-none overflow-hidden antialiased">
      <input type="file" ref={fileInputRef} onChange={onFileChange} className="hidden" style={{ display: "none" }} accept="image/*,.txt,.pdf,.doc,.docx,.json,.js,.ts,.tsx,.css,.html" />
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentPersonaObj={currentPersonaObj}
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        isMoreMenuOpen={isMoreMenuOpen}
        setIsMoreMenuOpen={setIsMoreMenuOpen}
        tasks={tasks}
      />

      {suspendedFrame && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between gap-3 shadow-inner z-20">
          <div className="flex items-center gap-2.5 text-xs text-amber-900">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 animate-pulse" />
            <div>
              <span className="font-bold">Execution Suspended (HITL Gate Active):</span>{" "}
              <span>{suspendedFrame.reason || "High-risk action requires manual verification"}</span>
              {suspendedFrame.lockedFileModified && (
                <span className="ml-2 font-mono text-[10px] bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded text-amber-800">{suspendedFrame.lockedFileModified}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => onHITLApprove(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1 rounded-lg transition-all shadow-xs cursor-pointer">Approve & Resume</button>
            <button onClick={() => onHITLApprove(false)} className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-3 py-1 rounded-lg transition-all shadow-xs cursor-pointer">Reject Action</button>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-[1800px] w-full mx-auto p-4 sm:p-6 flex flex-col md:grid md:grid-cols-10 gap-6 min-h-0 relative overflow-hidden">
        <div className={leftColClass}>
          <AnimatePresence mode="wait">{renderLeftPane()}</AnimatePresence>
        </div>

        <Suspense fallback={viewFallback}>
          <WorkspacePreview
            activeTab={activeTab}
            files={files}
            currentPrompt={currentPrompt}
            previewReloadKey={previewReloadKey}
            tasks={tasks}
            isSending={isSending}
            onUpdateFile={onUpdateFile}
          />
        </Suspense>
      </main>

      {isSettingsOpen && (
        <Suspense fallback={null}>
          <SettingsModal onClose={() => setIsSettingsOpen(false)} dbStatus={dbStatus} onRefresh={onRefreshData} />
        </Suspense>
      )}

      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-xs z-40" onClick={() => setIsSidebarOpen(false)} />
            <motion.div
              initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
              className="fixed left-0 top-0 bottom-0 w-80 bg-white border-r border-gray-100 shadow-2xl z-50 p-6 flex flex-col"
            >
              <div className="flex items-center justify-between pb-6 border-b border-gray-50">
                <span className="font-bold text-gray-900 font-display">System Clusters</span>
                <button onClick={() => setIsSidebarOpen(false)} className="text-gray-400 hover:text-gray-900 text-sm">✕</button>
              </div>

              <div className="flex-1 py-6 space-y-6 overflow-y-auto scrollbar-thin">
                <button id="btn-sidebar-new-chat" onClick={onStartFreshChat} className="w-full flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 active:scale-[0.98] text-white font-semibold text-xs py-3 px-4 rounded-xl shadow-xs transition-all cursor-pointer font-sans shrink-0">
                  <Plus className="h-4 w-4 text-white" />
                  <span>Start Fresh Chat</span>
                </button>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-amber-500 animate-pulse" />
                    <span>Faceswap: Active Persona</span>
                  </h4>
                  <button id="btn-faceswap-chat-link" onClick={() => { setActiveTab("faceswap"); setIsSidebarOpen(false); }} className="w-full flex items-center justify-between p-3.5 rounded-2xl border border-amber-100 bg-amber-50/50 hover:bg-amber-50 text-amber-900 shadow-3xs transition-all cursor-pointer font-sans">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-full bg-amber-500 flex items-center justify-center text-white shrink-0 animate-pulse"><Sparkles className="h-4 w-4" /></div>
                      <div className="text-left">
                        <p className="text-xs font-bold">Faceswap Chat</p>
                        <p className="text-[9px] text-amber-600 font-mono">Launch Swap Interface</p>
                      </div>
                    </div>
                    <ChevronDown className="h-4 w-4 text-amber-500 -rotate-90 shrink-0" />
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                      <span>Chat History</span>
                      <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-bold font-mono">{savedSessions.length}</span>
                    </h4>
                    {savedSessions.length > 0 && (
                      <button id="btn-clear-all-history" onClick={onClearAllHistory} className="flex items-center gap-1 text-[10px] font-semibold text-red-400 hover:text-red-600 transition-colors px-2 py-0.5 rounded-lg hover:bg-red-50">
                        <Trash2 className="h-3 w-3" />Clear All
                      </button>
                    )}
                  </div>

                  {savedSessions.length === 0 ? (
                    <div className="p-4 rounded-2xl border border-dashed border-gray-200 text-center text-[11px] text-gray-400 font-sans">No saved chat sessions yet.</div>
                  ) : (
                    <div className="space-y-3 max-h-72 overflow-y-auto scrollbar-thin pr-1">
                      {savedSessions.map((session) => {
                        const isActive = session.id === activeSessionId;
                        const isExpanded = expandedSessionId === session.id;
                        const userMsgCount = (session.messages || []).filter((m: any) => m.role === "user").length;
                        const taskCount = (session.tasks || []).length;
                        const fileCount = (session.files || []).length;
                        const updatedStr = new Date(session.lastUpdated).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

                        return (
                          <div key={session.id} id={`session-item-${session.id}`} className={`group relative flex flex-col p-3 rounded-2xl border text-left transition-all ${isActive ? "bg-amber-50/80 border-amber-300 shadow-sm text-amber-950 font-medium" : "bg-gray-50/60 hover:bg-gray-100/80 border-gray-200 text-gray-700"}`}>
                            <div onClick={() => onLoadSession(session)} className="flex items-start justify-between gap-2 cursor-pointer">
                              <div className="flex items-start gap-2 min-w-0 flex-1">
                                <MessageSquare className={`h-4 w-4 shrink-0 mt-0.5 ${isActive ? "text-amber-600 animate-pulse" : "text-gray-400 group-hover:text-gray-600"}`} />
                                <div className="min-w-0 flex-1 font-sans">
                                  <p className="text-xs truncate font-bold text-gray-900 leading-snug">{session.title || "Workspace Session"}</p>
                                  <p className="text-[9px] text-gray-400 font-mono mt-0.5">{updatedStr}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button onClick={(e) => { e.stopPropagation(); onSpinUpSessionPreview(session, e); }} title="Open preview" className="p-1 rounded-lg hover:bg-indigo-50 text-gray-400 hover:text-indigo-500 transition-colors">
                                  <Play className="h-3 w-3" />
                                </button>
                                <button onClick={(e) => onDeleteSession(session.id, e)} title="Delete session" className="p-1 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); setExpandedSessionId(isExpanded ? null : session.id); }} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                                  <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                                </button>
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-3 text-[9px] font-mono text-gray-500">
                                <span className="flex items-center gap-1"><MessageSquare className="h-2.5 w-2.5" />{userMsgCount} msgs</span>
                                <span className="flex items-center gap-1"><Activity className="h-2.5 w-2.5" />{taskCount} tasks</span>
                                <span className="flex items-center gap-1"><Calendar className="h-2.5 w-2.5" />{fileCount} files</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <button onClick={() => { setActiveTab("settings"); setIsSidebarOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 text-left text-xs font-medium text-gray-600 transition-colors">
                    <Settings className="h-4 w-4 text-gray-400" />
                    Settings & Configuration
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-50 text-center">
                <p className="text-[10px] text-gray-400 font-mono">Trinity Universe — {currentTime}</p>
                {isLoadingSession && <p className="text-[10px] text-indigo-500 font-mono animate-pulse mt-1">Loading session...</p>}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function AppShellComponent() {
  const [activePersona, setActivePersona] = useState<string>("sovereign");
  const [activeTab, setActiveTab] = useState<TabType>("chat");
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [dbStatus, setDbStatus] = useState<DatabaseStatus>({ d1: "local_fallback", kv: "local_fallback" });
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState("");
  const [suspendedFrame, setSuspendedFrame] = useState<any | null>(null);
  const [thinkingState, setThinkingState] = useState<{ stage: string; text: string; elapsed: number; isThinking: boolean } | null>(null);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    const tabId = sessionStorage.getItem("trinity_tab_session_id");
    if (tabId) return tabId;
    const freshId = "session-" + Date.now();
    localStorage.setItem("trinity_active_session_id", freshId);
    sessionStorage.setItem("trinity_tab_session_id", freshId);
    return freshId;
  });
  const [savedSessions, setSavedSessions] = useState<any[]>([]);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [previewReloadKey, setPreviewReloadKey] = useState<number>(0);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isConnectedSSE, setIsConnectedSSE] = useState(false);
  const [currentTime, setCurrentTime] = useState("");

  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const sseTimeoutRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentPersonaObj = PERSONAS.find((p) => p.id === activePersona) || PERSONAS[0];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setAttachment({ name: file.name, type: file.type, data: result.split(",")[1] || result, size: file.size });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const fetchSuspended = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/agent/suspended`);
      if (r.ok) {
        const d = await r.json();
        setSuspendedFrame(d.frame);
      }
    } catch (_) {}
  };

  const handleHITLApproval = async (approved: boolean) => {
    try {
      await fetch(`${API_BASE}/api/agent/${approved ? "approve" : "reject"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: approved ? "User manual approval" : "User rejected action" }),
      });
      setSuspendedFrame(null);
    } catch (_) {}
  };

  const handleStartFreshChat = () => {
    setIsSidebarOpen(false);
    setActiveTab("chat");
    const newId = "session-" + Date.now();
    setActiveSessionId(newId);
    localStorage.setItem("trinity_active_session_id", newId);
    sessionStorage.setItem("trinity_tab_session_id", newId);
    setMessages([]);
    setTasks([]);
    setFiles([]);
    setCurrentPrompt("");
    setThinkingState(null);
    fetch(`${API_BASE}/api/session/clear`, { method: "POST" }).catch(() => {});
  };

  const handleKillAll = async () => {
    setThinkingState(null);
    setIsSending(false);
    setTasks((prev) => prev.map((t) => t.status === "running" || t.status === "pending"
      ? { ...t, status: "failed" as const, completedAt: new Date().toISOString(), subtasks: t.subtasks.map((s) => s.status === "running" || s.status === "pending" ? { ...s, status: "failed" as const, logs: [...(s.logs || []), "⛔ Cancelled by user signal."] } : s) }
      : t));
    try {
      await Promise.all([
        fetch(`${API_BASE}/api/tasks/cancel-all`, { method: "POST" }),
        fetch(`${API_BASE}/api/build/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }),
      ]);
    } catch (err) {
      console.error("Failed to cancel all tasks:", err);
    }
  };

  const handleClearAllHistory = () => {
    if (!confirm("Delete ALL saved chat sessions? This cannot be undone.")) return;
    localStorage.removeItem("trinity_saved_sessions");
    localStorage.removeItem("trinity_active_session_id");
    setSavedSessions([]);
    handleStartFreshChat();
  };

  const handleLoadSession = async (session: any) => {
    setIsLoadingSession(true);
    setIsSidebarOpen(false);
    setActiveSessionId(session.id);
    localStorage.setItem("trinity_active_session_id", session.id);
    setMessages(session.messages || []);
    setTasks(session.tasks || []);
    setFiles(session.files || []);
    setCurrentPrompt(session.currentPrompt || "");
    setThinkingState(null);
    setActiveTab("chat");
    fetch(`${API_BASE}/api/session/load`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: session.messages || [], tasks: session.tasks || [], files: session.files || [] }),
    }).catch((err) => console.error("Error syncing session:", err)).finally(() => setIsLoadingSession(false));
  };

  const handleSpinUpSessionPreview = async (session: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsSidebarOpen(false);
    await handleLoadSession(session);
    setActiveTab("preview");
    setPreviewReloadKey(Date.now());
  };

  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const saved = localStorage.getItem("trinity_saved_sessions");
    if (!saved) return;
    try {
      let list: any[] = JSON.parse(saved);
      list = list.filter((s) => s.id !== sessionId);
      localStorage.setItem("trinity_saved_sessions", JSON.stringify(list));
      setSavedSessions(list);
      if (activeSessionId === sessionId) handleStartFreshChat();
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  };

  const handleClearSession = async () => {
    setMessages([]);
    setTasks([]);
    setFiles([]);
    setCurrentPrompt("");
    setThinkingState(null);
    fetch(`${API_BASE}/api/session/clear`, { method: "POST" }).catch((e) => console.error("Purge error:", e));
  };

  const handleUpdateFile = async (path: string, content: string) => {
    try {
      const targetFile = files.find((f) => f.path === path);
      const res = await fetch(`${API_BASE}/api/files/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content, language: targetFile?.language || "typescript" }),
      });
      if (res.ok) setFiles(files.map((f) => f.path === path ? { ...f, content } : f));
      else console.error("Failed to save file:", await res.text());
    } catch (e) {
      console.error("Save error:", e);
    }
  };

  const handleSendPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isSending) return;
    const userText = inputText;
    const currentAttachment = attachment;
    setAttachment(null);
    setInputText("");
    setIsSending(true);
    const optimMsg: Message = { id: `msg-optim-${Date.now()}`, role: "user", content: userText, timestamp: new Date().toISOString(), attachment: currentAttachment || undefined };
    setMessages((prev) => [...prev, optimMsg]);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    try {
      const res = await fetch(`${API_BASE}/api/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user", content: userText, attachment: currentAttachment, sessionId: activeSessionId }),
      });
      if (!res.ok) throw new Error("Failed to dispatch build instructions.");
      const data = await res.json();
      if (data.tasks) {
        setTasks(data.tasks);
        setCurrentPrompt(userText);
      }
    } catch (err: any) {
      console.error("Failed sending prompt:", err);
      setMessages((prev) => [...prev, { id: `msg-err-${Date.now()}`, role: "system", content: `⚠️ **Transmission Error:** ${err.message}. Make sure your Gemini API key is configured.`, timestamp: new Date().toISOString() }]);
    } finally {
      setIsSending(false);
    }
  };

  const fetchInitialData = async (opts?: { serverOnly?: boolean }) => {
    try {
      const statusRes = await fetch(`${API_BASE}/api/db-status`);
      const statusData = await statusRes.json();
      setDbStatus({ d1: statusData.d1, kv: statusData.kv });

      if (!opts?.serverOnly) {
        const savedRaw = localStorage.getItem("trinity_saved_sessions");
        if (savedRaw) {
          try {
            const sessions: any[] = JSON.parse(savedRaw);
            const activeId = localStorage.getItem("trinity_active_session_id");
            const match = sessions.find((s: any) => s.id === activeId);
            const today = new Date().toDateString();
            if (match && (match.messages?.length > 0 || match.tasks?.length > 0)) {
              const sessionDay = match.lastUpdated ? new Date(match.lastUpdated).toDateString() : null;
              if (sessionDay === today) {
                setMessages(match.messages || []);
                setTasks(match.tasks || []);
                setFiles(match.files || []);
                setCurrentPrompt(match.currentPrompt || "");
                const hasPending = (match.tasks || []).some((t: any) => t.status === "pending" || t.status === "running");
                if (!hasPending) return;
              }
            }
            fetch(`${API_BASE}/api/session/clear`, { method: "POST" }).catch(() => {});
            return;
          } catch (_) {}
        }
      }

      const [msgRes, taskRes, fileRes] = await Promise.all([
        fetch(`${API_BASE}/api/messages`),
        fetch(`${API_BASE}/api/tasks`),
        fetch(`${API_BASE}/api/files`),
      ]);
      if (msgRes.ok) {
        const d = await msgRes.json();
        if (Array.isArray(d)) setMessages(d);
      }
      if (taskRes.ok) {
        const d = await taskRes.json();
        if (Array.isArray(d)) {
          setTasks(d);
          if (d.length > 0) setCurrentPrompt(d[0].name);
        }
      }
      if (fileRes.ok) {
        const d = await fileRes.json();
        if (Array.isArray(d)) setFiles(d);
      }
    } catch (err) {
      console.error("Failed to load workspace data:", err);
    }
  };

  const connectSSE = () => {
    if (eventSourceRef.current) eventSourceRef.current.close();
    if (sseTimeoutRef.current) clearTimeout(sseTimeoutRef.current);

    const es = new EventSource(`${API_BASE}/api/tasks/stream`);
    eventSourceRef.current = es;

    es.onopen = () => {
      setIsConnectedSSE(true);
      (sseTimeoutRef as any)._attempts = 0;
    };
    es.onerror = () => {
      setIsConnectedSSE(false);
      if (es.readyState === EventSource.CLOSED) {
        es.close();
        if (sseTimeoutRef.current) clearTimeout(sseTimeoutRef.current);
        const attempts = (sseTimeoutRef as any)._attempts ?? 0;
        const delay = Math.min(2000 * Math.pow(2, attempts), 30000);
        (sseTimeoutRef as any)._attempts = attempts + 1;
        sseTimeoutRef.current = setTimeout(connectSSE, delay);
      }
    };

    es.addEventListener("connected", (e: any) => {
      const d = JSON.parse(e.data);
      if (d?.status === "refreshed") fetchInitialData({ serverOnly: true });
    });
    es.addEventListener("agent-planning", (e: any) => {
      const d = JSON.parse(e.data);
      setCurrentPrompt(d.prompt ?? "");
      setTasks([]);
      setThinkingState({ stage: "understanding", text: "Planning tasks — analyzing your prompt...", elapsed: 0.3, isThinking: true });
    });
    es.addEventListener("tasks-planned", (e: any) => {
      const d = JSON.parse(e.data);
      if (Array.isArray(d.tasks) && d.tasks.length > 0) {
        setTasks(d.tasks);
        setThinkingState(null);
      }
    });
    es.addEventListener("build-started", (e: any) => {
      const d = JSON.parse(e.data);
      setCurrentPrompt(d.prompt);
      setTasks([]);
      setThinkingState({ stage: "understanding", text: "Analyzing user prompt and mapping system architecture...", elapsed: 0.5, isThinking: true });
    });
    es.addEventListener("thinking-update", (e: any) => {
      const d = JSON.parse(e.data);
      setThinkingState({ stage: d.stage, text: d.text, elapsed: d.elapsed, isThinking: true });
    });

    es.addEventListener("task-update", (e: any) => {
      const t = JSON.parse(e.data) as Task;
      setThinkingState(null);
      setTasks((prev) => {
        const idx = prev.findIndex((p) => p.id === t.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = t;
          return next;
        }
        return [t, ...prev];
      });
    });

    es.addEventListener("subtask_log", (e: any) => {
      const data = JSON.parse(e.data) as { subtaskId: string; log: string };
      setTasks((prev) => prev.map((task) => {
        const si = task.subtasks.findIndex((s) => s.id === data.subtaskId);
        if (si < 0) return task;
        const subs = [...task.subtasks];
        const orig = subs[si];
        let subStatus = orig.status === "pending" ? "running" : orig.status;
        if (data.log.includes("[DONE]") || data.log.includes("[SUCCESS]") || data.log.includes("[SKIP]")) subStatus = "completed";
        else if (data.log.includes("[ERROR]") || data.log.includes("⛔") || data.log.includes("[CMD] Error")) subStatus = "failed";
        const logs = orig.logs.includes(data.log) ? orig.logs : [...orig.logs, data.log];
        subs[si] = { ...orig, status: subStatus as any, logs };
        return { ...task, status: subStatus === "failed" ? "failed" as const : task.status, activeSubtaskIndex: Math.max(task.activeSubtaskIndex ?? 0, si), subtasks: subs };
      }));
    });

    es.addEventListener("file-created", (e: any) => {
      const f = JSON.parse(e.data) as FileNode;
      setFiles((prev) => {
        const idx = prev.findIndex((p) => p.path === f.path);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = f;
          return next;
        }
        return [...prev, f];
      });
    });

    es.addEventListener("message-added", (e: any) => {
      const msg = JSON.parse(e.data) as Message;
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        if (msg.role === "user") {
          const oi = prev.findIndex((m) => m.id.startsWith("msg-optim-") && m.content === msg.content);
          if (oi >= 0) {
            const next = [...prev];
            next[oi] = msg;
            return next;
          }
        }
        return [...prev, msg];
      });
    });

    es.addEventListener("build-finished", (e: any) => {
      const fm = JSON.parse(e.data) as Message;
      setThinkingState(null);
      setIsSending(false);
      setMessages((prev) => prev.some((m) => m.id === fm.id) ? prev : [...prev, fm]);
      fetchInitialData();
    });

    es.addEventListener("build-cancelled", () => {
      setThinkingState(null);
      setIsSending(false);
      setTasks((prev) => prev.map((t) => t.status === "running" || t.status === "pending" ? { ...t, status: "failed" as const, completedAt: new Date().toISOString(), subtasks: t.subtasks.map((s) => s.status === "running" || s.status === "pending" ? { ...s, status: "failed" as const, logs: [...(s.logs || []), "⛔ Cancelled by user signal."] } : s) } : t));
      fetchInitialData();
    });

    es.addEventListener("session-cleared", () => {
      setThinkingState(null);
      setMessages([]);
      setTasks([]);
      setFiles([]);
      setCurrentPrompt("");
    });
    es.addEventListener("agent_suspended", (e: any) => {
      try {
        setSuspendedFrame(JSON.parse(e.data).frame);
      } catch (_) {}
    });
    es.addEventListener("agent_resumed", () => setSuspendedFrame(null));
  };

  useEffect(() => {
    const saved = localStorage.getItem("trinity_saved_sessions");
    if (saved) {
      try {
        setSavedSessions(JSON.parse(saved));
      } catch (_) {}
    }
  }, []);

  useEffect(() => {
    const hasContent = messages.length > 1 || files.length > 0 || tasks.length > 0;
    if (!hasContent) return;
    const firstUser = messages.find((m) => m.role === "user");
    const title = firstUser ? firstUser.content : "Workspace Session";
    const savedRaw = localStorage.getItem("trinity_saved_sessions");
    let list: any[] = savedRaw ? JSON.parse(savedRaw) : [];
    const existing = list.find((s) => s.id === activeSessionId);
    const session = { id: activeSessionId, title: title.substring(0, 60) + (title.length > 60 ? "..." : ""), messages, tasks, files, currentPrompt, createdAt: existing?.createdAt || new Date().toISOString(), lastUpdated: new Date().toISOString() };
    const idx = list.findIndex((s) => s.id === activeSessionId);
    if (idx >= 0) list[idx] = session; else list.unshift(session);
    localStorage.setItem("trinity_saved_sessions", JSON.stringify(list));
    localStorage.setItem("trinity_active_session_id", activeSessionId);
    setSavedSessions(list);
  }, [messages, tasks, files, currentPrompt, activeSessionId]);

  useEffect(() => {
    const updateTime = () => setCurrentTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const IDLE_MS = 7 * 60 * 1000;
    let idleTimer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (!tasks.some((t) => t.status === "running") && (messages.length > 0 || tasks.length > 0 || files.length > 0)) handleStartFreshChat();
      }, IDLE_MS);
    };
    const EVENTS = ["mousedown", "mousemove", "keydown", "touchstart", "scroll", "click"];
    EVENTS.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(idleTimer);
      EVENTS.forEach((ev) => window.removeEventListener(ev, reset));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, messages.length, files.length]);

  useEffect(() => {
    fetchInitialData();
    fetchSuspended();
    connectSSE();
    const timer = setInterval(fetchSuspended, 6000);
    return () => {
      clearInterval(timer);
      if (eventSourceRef.current) eventSourceRef.current.close();
      if (sseTimeoutRef.current) clearTimeout(sseTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const container = chatScrollContainerRef.current;
    if (container) {
      if (container.scrollHeight - container.scrollTop - container.clientHeight < 180) chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    } else {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, tasks]);

  useEffect(() => {
    const hasActiveBuild = tasks.some((t) => t.status === "running" || t.status === "pending");
    if (!hasActiveBuild) return;
    const poll = setInterval(async () => {
      try {
        const [fr, tr] = await Promise.all([fetch(`${API_BASE}/api/files`), fetch(`${API_BASE}/api/tasks`)]);
        if (fr.ok) {
          const d = await fr.json();
          if (Array.isArray(d) && d.length > 0) setFiles(d);
        }
        if (tr.ok) {
          const d = await tr.json();
          if (Array.isArray(d)) setTasks((prev) => {
            const merged = [...prev];
            for (const t of d as Task[]) {
              const i = merged.findIndex((p) => p.id === t.id);
              if (i >= 0) merged[i] = t; else merged.push(t);
            }
            return merged;
          });
        }
      } catch (_) {}
    }, 2000);
    return () => clearInterval(poll);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks.some((t) => t.status === "running" || t.status === "pending")]);

  useEffect(() => {
    const isRunning = tasks.some((t) => t.status === "running" || t.status === "pending") || isSending;
    if (isRunning) {
      if (!pollingRef.current) {
        pollingRef.current = setInterval(async () => {
          try {
            const [mRes, tRes] = await Promise.all([fetch(`${API_BASE}/api/messages`), fetch(`${API_BASE}/api/tasks`)]);
            if (mRes.ok) {
              const msgs = await mRes.json() as any[];
              if (Array.isArray(msgs) && msgs.length > 0) {
                setMessages((prev) => {
                  const ids = new Set(prev.map((m: any) => m.id));
                  const newMsgs = msgs.filter((m: any) => !ids.has(m.id));
                  if (newMsgs.length === 0) return prev;
                  let next = [...prev];
                  for (const m of newMsgs) {
                    if (m.role === "user") {
                      const oi = next.findIndex((p) => p.id.startsWith("msg-optim-") && p.content === m.content);
                      if (oi >= 0) {
                        next[oi] = m;
                        continue;
                      }
                    }
                    if (!next.some((p) => p.id === m.id)) next.push(m);
                  }
                  return next;
                });
              }
            }
            if (tRes.ok) {
              const d = await tRes.json() as any[];
              if (Array.isArray(d) && d.length > 0) setTasks(d);
            }
          } catch (_) {}
        }, 2500);
      }
    } else if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [tasks, isSending]);

  return (
    <AppShell
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      currentPersonaObj={currentPersonaObj}
      activePersona={activePersona}
      setActivePersona={setActivePersona}
      isSidebarOpen={isSidebarOpen}
      setIsSidebarOpen={setIsSidebarOpen}
      isMoreMenuOpen={isMoreMenuOpen}
      setIsMoreMenuOpen={setIsMoreMenuOpen}
      isSettingsOpen={isSettingsOpen}
      setIsSettingsOpen={setIsSettingsOpen}
      messages={messages}
      tasks={tasks}
      files={files}
      dbStatus={dbStatus}
      inputText={inputText}
      setInputText={setInputText}
      isSending={isSending}
      currentPrompt={currentPrompt}
      suspendedFrame={suspendedFrame}
      thinkingState={thinkingState}
      attachment={attachment}
      setAttachment={setAttachment}
      activeSessionId={activeSessionId}
      savedSessions={savedSessions}
      expandedSessionId={expandedSessionId}
      setExpandedSessionId={setExpandedSessionId}
      previewReloadKey={previewReloadKey}
      isLoadingSession={isLoadingSession}
      isConnectedSSE={isConnectedSSE}
      currentTime={currentTime}
      chatEndRef={chatEndRef}
      chatScrollContainerRef={chatScrollContainerRef}
      fileInputRef={fileInputRef}
      onFileChange={handleFileChange}
      onSendPrompt={handleSendPrompt}
      onClearSession={handleClearSession}
      onKillAll={handleKillAll}
      onFilePickerClick={() => fileInputRef.current?.click()}
      onStartFreshChat={handleStartFreshChat}
      onClearAllHistory={handleClearAllHistory}
      onLoadSession={handleLoadSession}
      onSpinUpSessionPreview={handleSpinUpSessionPreview}
      onDeleteSession={handleDeleteSession}
      onUpdateFile={handleUpdateFile}
      onHITLApprove={handleHITLApproval}
      onRefreshData={fetchInitialData}
    />
  );
}

// ─── Personas ─────────────────────────────────────────────────────────────────
const PERSONAS: PersonaObj[] = [
  { id: "sovereign", name: "Sovereign Agent",     icon: Zap,      badgeColor: "bg-amber-500 hover:bg-amber-400",   avatarBg: "bg-amber-500",  description: "Multi-threading orchestration & background fiber control." },
  { id: "coder",     name: "Titan Code-Lobe",      icon: Code,     badgeColor: "bg-blue-600 hover:bg-blue-500",     avatarBg: "bg-blue-600",   description: "Automated type-safe TSX and full-stack API synthesizer." },
  { id: "designer",  name: "Neo Design-Architect", icon: Sparkles, badgeColor: "bg-pink-500 hover:bg-pink-400",     avatarBg: "bg-pink-500",   description: "Swiss grid-based modern UI aesthetics & typography." },
  { id: "db",        name: "D1 SQL-Oracle",         icon: Database, badgeColor: "bg-emerald-600 hover:bg-emerald-500", avatarBg: "bg-emerald-600", description: "Relational Drizzle schemas & transactional query optimization." },
];

export default function App() {
  // ── Persona / Navigation ──────────────────────────────────────────────────
  const [activePersona,   setActivePersona]   = useState<string>("sovereign");
  const [activeTab,       setActiveTab]       = useState<TabType>("chat");
  const [isMoreMenuOpen,  setIsMoreMenuOpen]  = useState(false);
  const [isSettingsOpen,  setIsSettingsOpen]  = useState(false);
  const [isSidebarOpen,   setIsSidebarOpen]   = useState(false);

  // ── Data ──────────────────────────────────────────────────────────────────
  const [messages,        setMessages]        = useState<Message[]>([]);
  const [tasks,           setTasks]           = useState<Task[]>([]);
  const [files,           setFiles]           = useState<FileNode[]>([]);
  const [dbStatus,        setDbStatus]        = useState<DatabaseStatus>({ d1: "local_fallback", kv: "local_fallback" });
  const [inputText,       setInputText]       = useState("");
  const [isSending,       setIsSending]       = useState(false);
  const [currentPrompt,   setCurrentPrompt]   = useState("");
  const [suspendedFrame,  setSuspendedFrame]  = useState<any | null>(null);
  const [thinkingState,   setThinkingState]   = useState<{ stage: string; text: string; elapsed: number; isThinking: boolean } | null>(null);
  const [attachment,      setAttachment]      = useState<Attachment | null>(null);

  // ── Session management ────────────────────────────────────────────────────
  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    const tabId = sessionStorage.getItem("trinity_tab_session_id");
    if (tabId) return tabId;
    const freshId = "session-" + Date.now();
    localStorage.setItem("trinity_active_session_id", freshId);
    sessionStorage.setItem("trinity_tab_session_id", freshId);
    return freshId;
  });
  const [savedSessions,       setSavedSessions]       = useState<any[]>([]);
  const [expandedSessionId,   setExpandedSessionId]   = useState<string | null>(null);
  const [previewReloadKey,    setPreviewReloadKey]     = useState<number>(0);
  const [isLoadingSession,    setIsLoadingSession]     = useState(false);
  const [isConnectedSSE,      setIsConnectedSSE]       = useState(false);
  const [currentTime,         setCurrentTime]          = useState("");

  // ── Refs ──────────────────────────────────────────────────────────────────
  const chatEndRef             = useRef<HTMLDivElement>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement>(null);
  const eventSourceRef         = useRef<EventSource | null>(null);
  const sseTimeoutRef          = useRef<any>(null);
  const fileInputRef           = useRef<HTMLInputElement>(null);
  const pollingRef             = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentPersonaObj = PERSONAS.find(p => p.id === activePersona) || PERSONAS[0];

  // ── File picker ───────────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setAttachment({ name: file.name, type: file.type, data: result.split(",")[1] || result, size: file.size });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // ── HITL ──────────────────────────────────────────────────────────────────
  const fetchSuspended = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/agent/suspended`);
      if (r.ok) { const d = await r.json(); setSuspendedFrame(d.frame); }
    } catch (_) {}
  };

  const handleHITLApproval = async (approved: boolean) => {
    try {
      await fetch(`${API_BASE}/api/agent/${approved ? "approve" : "reject"}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: approved ? "User manual approval" : "User rejected action" }),
      });
      setSuspendedFrame(null);
    } catch (_) {}
  };

  // ── Session helpers ───────────────────────────────────────────────────────
  const handleStartFreshChat = () => {
    setIsSidebarOpen(false);
    setActiveTab("chat");
    const newId = "session-" + Date.now();
    setActiveSessionId(newId);
    localStorage.setItem("trinity_active_session_id", newId);
    sessionStorage.setItem("trinity_tab_session_id", newId);
    setMessages([]); setTasks([]); setFiles([]); setCurrentPrompt(""); setThinkingState(null);
    fetch(`${API_BASE}/api/session/clear`, { method: "POST" }).catch(() => {});
  };

  const handleKillAll = async () => {
    setThinkingState(null); setIsSending(false);
    setTasks(prev => prev.map(t =>
      t.status === "running" || t.status === "pending"
        ? { ...t, status: "failed" as const, completedAt: new Date().toISOString(), subtasks: t.subtasks.map(s => s.status === "running" || s.status === "pending" ? { ...s, status: "failed" as const, logs: [...(s.logs || []), "⛔ Cancelled by user signal."] } : s) }
        : t
    ));
    try {
      await Promise.all([
        fetch(`${API_BASE}/api/tasks/cancel-all`, { method: "POST" }),
        fetch(`${API_BASE}/api/build/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }),
      ]);
    } catch (err) { console.error("Failed to cancel all tasks:", err); }
  };

  const handleClearAllHistory = () => {
    if (!confirm("Delete ALL saved chat sessions? This cannot be undone.")) return;
    localStorage.removeItem("trinity_saved_sessions");
    localStorage.removeItem("trinity_active_session_id");
    setSavedSessions([]);
    handleStartFreshChat();
  };

  const handleLoadSession = async (session: any) => {
    setIsLoadingSession(true); setIsSidebarOpen(false);
    setActiveSessionId(session.id);
    localStorage.setItem("trinity_active_session_id", session.id);
    setMessages(session.messages || []); setTasks(session.tasks || []); setFiles(session.files || []);
    setCurrentPrompt(session.currentPrompt || ""); setThinkingState(null); setActiveTab("chat");
    fetch(`${API_BASE}/api/session/load`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: session.messages || [], tasks: session.tasks || [], files: session.files || [] }),
    }).catch(err => console.error("Error syncing session:", err)).finally(() => setIsLoadingSession(false));
  };

  const handleSpinUpSessionPreview = async (session: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsSidebarOpen(false);
    await handleLoadSession(session);
    setActiveTab("preview"); setPreviewReloadKey(Date.now());
  };

  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const saved = localStorage.getItem("trinity_saved_sessions");
    if (!saved) return;
    try {
      let list: any[] = JSON.parse(saved);
      list = list.filter(s => s.id !== sessionId);
      localStorage.setItem("trinity_saved_sessions", JSON.stringify(list));
      setSavedSessions(list);
      if (activeSessionId === sessionId) handleStartFreshChat();
    } catch (err) { console.error("Failed to delete session:", err); }
  };

  const handleClearSession = async () => {
    setMessages([]); setTasks([]); setFiles([]); setCurrentPrompt(""); setThinkingState(null);
    fetch(`${API_BASE}/api/session/clear`, { method: "POST" }).catch(e => console.error("Purge error:", e));
  };

  const handleUpdateFile = async (path: string, content: string) => {
    try {
      const targetFile = files.find(f => f.path === path);
      const res = await fetch(`${API_BASE}/api/files/save`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content, language: targetFile?.language || "typescript" }),
      });
      if (res.ok) setFiles(files.map(f => f.path === path ? { ...f, content } : f));
      else console.error("Failed to save file:", await res.text());
    } catch (e) { console.error("Save error:", e); }
  };

  const handleSendPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isSending) return;
    const userText = inputText; const currentAttachment = attachment;
    setAttachment(null); setInputText(""); setIsSending(true);
    const optimMsg: Message = { id: `msg-optim-${Date.now()}`, role: "user", content: userText, timestamp: new Date().toISOString(), attachment: currentAttachment || undefined };
    setMessages(prev => [...prev, optimMsg]);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    try {
      const res = await fetch(`${API_BASE}/api/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user", content: userText, attachment: currentAttachment, sessionId: activeSessionId }),
      });
      if (!res.ok) throw new Error("Failed to dispatch build instructions.");
      const data = await res.json();
      if (data.tasks) { setTasks(data.tasks); setCurrentPrompt(userText); }
    } catch (err: any) {
      console.error("Failed sending prompt:", err);
      setMessages(prev => [...prev, { id: `msg-err-${Date.now()}`, role: "system", content: `⚠️ **Transmission Error:** ${err.message}. Make sure your Gemini API key is configured.`, timestamp: new Date().toISOString() }]);
    } finally { setIsSending(false); }
  };

  // ── Data fetching ─────────────────────────────────────────────────────────
  const fetchInitialData = async (opts?: { serverOnly?: boolean }) => {
    try {
      const statusRes = await fetch(`${API_BASE}/api/db-status`);
      const statusData = await statusRes.json();
      setDbStatus({ d1: statusData.d1, kv: statusData.kv });

      if (!opts?.serverOnly) {
        const savedRaw = localStorage.getItem("trinity_saved_sessions");
        if (savedRaw) {
          try {
            const sessions: any[] = JSON.parse(savedRaw);
            const activeId = localStorage.getItem("trinity_active_session_id");
            const match = sessions.find((s: any) => s.id === activeId);
            const today = new Date().toDateString();
            if (match && (match.messages?.length > 0 || match.tasks?.length > 0)) {
              const sessionDay = match.lastUpdated ? new Date(match.lastUpdated).toDateString() : null;
              if (sessionDay === today) {
                setMessages(match.messages || []); setTasks(match.tasks || []); setFiles(match.files || []); setCurrentPrompt(match.currentPrompt || "");
                const hasPending = (match.tasks || []).some((t: any) => t.status === "pending" || t.status === "running");
                if (!hasPending) return;
              }
            }
            fetch(`${API_BASE}/api/session/clear`, { method: "POST" }).catch(() => {});
            return;
          } catch (_) {}
        }
      }

      const [msgRes, taskRes, fileRes] = await Promise.all([
        fetch(`${API_BASE}/api/messages`), fetch(`${API_BASE}/api/tasks`), fetch(`${API_BASE}/api/files`),
      ]);
      if (msgRes.ok)  { const d = await msgRes.json();  if (Array.isArray(d)) setMessages(d); }
      if (taskRes.ok) { const d = await taskRes.json(); if (Array.isArray(d)) { setTasks(d); if (d.length > 0) setCurrentPrompt(d[0].name); } }
      if (fileRes.ok) { const d = await fileRes.json(); if (Array.isArray(d)) setFiles(d); }
    } catch (err) { console.error("Failed to load workspace data:", err); }
  };

  // ── SSE ───────────────────────────────────────────────────────────────────
  const connectSSE = () => {
    if (eventSourceRef.current) eventSourceRef.current.close();
    if (sseTimeoutRef.current) clearTimeout(sseTimeoutRef.current);

    const es = new EventSource(`${API_BASE}/api/tasks/stream`);
    eventSourceRef.current = es;

    es.onopen = () => { setIsConnectedSSE(true); (sseTimeoutRef as any)._attempts = 0; };
    es.onerror = () => {
      setIsConnectedSSE(false);
      if (es.readyState === EventSource.CLOSED) {
        es.close();
        if (sseTimeoutRef.current) clearTimeout(sseTimeoutRef.current);
        const attempts = (sseTimeoutRef as any)._attempts ?? 0;
        const delay = Math.min(2000 * Math.pow(2, attempts), 30000);
        (sseTimeoutRef as any)._attempts = attempts + 1;
        sseTimeoutRef.current = setTimeout(connectSSE, delay);
      }
    };

    es.addEventListener("connected", (e: any) => { const d = JSON.parse(e.data); if (d?.status === "refreshed") fetchInitialData({ serverOnly: true }); });
    es.addEventListener("agent-planning", (e: any) => { const d = JSON.parse(e.data); setCurrentPrompt(d.prompt ?? ""); setTasks([]); setThinkingState({ stage: "understanding", text: "Planning tasks — analyzing your prompt...", elapsed: 0.3, isThinking: true }); });
    es.addEventListener("tasks-planned", (e: any) => { const d = JSON.parse(e.data); if (Array.isArray(d.tasks) && d.tasks.length > 0) { setTasks(d.tasks); setThinkingState(null); } });
    es.addEventListener("build-started", (e: any) => { const d = JSON.parse(e.data); setCurrentPrompt(d.prompt); setTasks([]); setThinkingState({ stage: "understanding", text: "Analyzing user prompt and mapping system architecture...", elapsed: 0.5, isThinking: true }); });
    es.addEventListener("thinking-update", (e: any) => { const d = JSON.parse(e.data); setThinkingState({ stage: d.stage, text: d.text, elapsed: d.elapsed, isThinking: true }); });

    es.addEventListener("task-update", (e: any) => {
      const t = JSON.parse(e.data) as Task;
      setThinkingState(null);
      setTasks(prev => { const idx = prev.findIndex(p => p.id === t.id); if (idx >= 0) { const next = [...prev]; next[idx] = t; return next; } return [t, ...prev]; });
    });

    es.addEventListener("subtask_log", (e: any) => {
      const data = JSON.parse(e.data) as { subtaskId: string; log: string };
      setTasks(prev => prev.map(task => {
        const si = task.subtasks.findIndex(s => s.id === data.subtaskId);
        if (si < 0) return task;
        const subs = [...task.subtasks]; const orig = subs[si];
        let subStatus = orig.status === "pending" ? "running" : orig.status;
        if (data.log.includes("[DONE]") || data.log.includes("[SUCCESS]") || data.log.includes("[SKIP]")) subStatus = "completed";
        else if (data.log.includes("[ERROR]") || data.log.includes("⛔") || data.log.includes("[CMD] Error")) subStatus = "failed";
        const logs = orig.logs.includes(data.log) ? orig.logs : [...orig.logs, data.log];
        subs[si] = { ...orig, status: subStatus as any, logs };
        return { ...task, status: subStatus === "failed" ? "failed" as const : task.status, activeSubtaskIndex: Math.max(task.activeSubtaskIndex ?? 0, si), subtasks: subs };
      }));
    });

    es.addEventListener("file-created", (e: any) => {
      const f = JSON.parse(e.data) as FileNode;
      setFiles(prev => { const idx = prev.findIndex(p => p.path === f.path); if (idx >= 0) { const next = [...prev]; next[idx] = f; return next; } return [...prev, f]; });
    });

    es.addEventListener("message-added", (e: any) => {
      const msg = JSON.parse(e.data) as Message;
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        if (msg.role === "user") { const oi = prev.findIndex(m => m.id.startsWith("msg-optim-") && m.content === msg.content); if (oi >= 0) { const next = [...prev]; next[oi] = msg; return next; } }
        return [...prev, msg];
      });
    });

    es.addEventListener("build-finished", (e: any) => {
      const fm = JSON.parse(e.data) as Message;
      setThinkingState(null); setIsSending(false);
      setMessages(prev => prev.some(m => m.id === fm.id) ? prev : [...prev, fm]);
      fetchInitialData();
    });

    es.addEventListener("build-cancelled", () => {
      setThinkingState(null); setIsSending(false);
      setTasks(prev => prev.map(t => t.status === "running" || t.status === "pending" ? { ...t, status: "failed" as const, completedAt: new Date().toISOString(), subtasks: t.subtasks.map(s => s.status === "running" || s.status === "pending" ? { ...s, status: "failed" as const, logs: [...(s.logs || []), "⛔ Cancelled by user signal."] } : s) } : t));
      fetchInitialData();
    });

    es.addEventListener("session-cleared", () => { setThinkingState(null); setMessages([]); setTasks([]); setFiles([]); setCurrentPrompt(""); });
    es.addEventListener("agent_suspended", (e: any) => { try { setSuspendedFrame(JSON.parse(e.data).frame); } catch (_) {} });
    es.addEventListener("agent_resumed", () => setSuspendedFrame(null));
  };

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem("trinity_saved_sessions");
    if (saved) { try { setSavedSessions(JSON.parse(saved)); } catch (_) {} }
  }, []);

  useEffect(() => {
    const hasContent = messages.length > 1 || files.length > 0 || tasks.length > 0;
    if (!hasContent) return;
    const firstUser = messages.find(m => m.role === "user");
    const title = firstUser ? firstUser.content : "Workspace Session";
    const savedRaw = localStorage.getItem("trinity_saved_sessions");
    let list: any[] = savedRaw ? JSON.parse(savedRaw) : [];
    const existing = list.find(s => s.id === activeSessionId);
    const session = { id: activeSessionId, title: title.substring(0, 60) + (title.length > 60 ? "..." : ""), messages, tasks, files, currentPrompt, createdAt: existing?.createdAt || new Date().toISOString(), lastUpdated: new Date().toISOString() };
    const idx = list.findIndex(s => s.id === activeSessionId);
    if (idx >= 0) list[idx] = session; else list.unshift(session);
    localStorage.setItem("trinity_saved_sessions", JSON.stringify(list));
    localStorage.setItem("trinity_active_session_id", activeSessionId);
    setSavedSessions(list);
  }, [messages, tasks, files, currentPrompt, activeSessionId]);

  useEffect(() => {
    const updateTime = () => setCurrentTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    updateTime(); const interval = setInterval(updateTime, 1000); return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const IDLE_MS = 7 * 60 * 1000;
    let idleTimer: ReturnType<typeof setTimeout>;
    const reset = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => { if (!tasks.some(t => t.status === "running") && (messages.length > 0 || tasks.length > 0 || files.length > 0)) handleStartFreshChat(); }, IDLE_MS); };
    const EVENTS = ["mousedown", "mousemove", "keydown", "touchstart", "scroll", "click"];
    EVENTS.forEach(ev => window.addEventListener(ev, reset, { passive: true }));
    reset();
    return () => { clearTimeout(idleTimer); EVENTS.forEach(ev => window.removeEventListener(ev, reset)); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, messages.length, files.length]);

  useEffect(() => {
    fetchInitialData(); fetchSuspended(); connectSSE();
    const timer = setInterval(fetchSuspended, 6000);
    return () => { clearInterval(timer); if (eventSourceRef.current) eventSourceRef.current.close(); if (sseTimeoutRef.current) clearTimeout(sseTimeoutRef.current); };
  }, []);

  useEffect(() => {
    const container = chatScrollContainerRef.current;
    if (container) { if (container.scrollHeight - container.scrollTop - container.clientHeight < 180) chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }
    else chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, tasks]);

  useEffect(() => {
    const hasActiveBuild = tasks.some(t => t.status === "running" || t.status === "pending");
    if (!hasActiveBuild) return;
    const poll = setInterval(async () => {
      try {
        const [fr, tr] = await Promise.all([fetch(`${API_BASE}/api/files`), fetch(`${API_BASE}/api/tasks`)]);
        if (fr.ok) { const d = await fr.json(); if (Array.isArray(d) && d.length > 0) setFiles(d); }
        if (tr.ok) { const d = await tr.json(); if (Array.isArray(d)) setTasks(prev => { const merged = [...prev]; for (const t of d as Task[]) { const i = merged.findIndex(p => p.id === t.id); if (i >= 0) merged[i] = t; else merged.push(t); } return merged; }); }
      } catch (_) {}
    }, 2000);
    return () => clearInterval(poll);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks.some(t => t.status === "running" || t.status === "pending")]);

  useEffect(() => {
    const isRunning = tasks.some(t => t.status === "running" || t.status === "pending") || isSending;
    if (isRunning) {
      if (!pollingRef.current) {
        pollingRef.current = setInterval(async () => {
          try {
            const [mRes, tRes] = await Promise.all([fetch(`${API_BASE}/api/messages`), fetch(`${API_BASE}/api/tasks`)]);
            if (mRes.ok) {
              const msgs = await mRes.json() as any[];
              if (Array.isArray(msgs) && msgs.length > 0) {
                setMessages(prev => {
                  const ids = new Set(prev.map((m: any) => m.id));
                  const newMsgs = msgs.filter((m: any) => !ids.has(m.id));
                  if (newMsgs.length === 0) return prev;
                  let next = [...prev];
                  for (const m of newMsgs) {
                    if (m.role === "user") { const oi = next.findIndex(p => p.id.startsWith("msg-optim-") && p.content === m.content); if (oi >= 0) { next[oi] = m; continue; } }
                    if (!next.some(p => p.id === m.id)) next.push(m);
                  }
                  return next;
                });
              }
            }
            if (tRes.ok) { const d = await tRes.json() as any[]; if (Array.isArray(d) && d.length > 0) setTasks(d); }
          } catch (_) {}
        }, 2500);
      }
    } else {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    }
    return () => { if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; } };
  }, [tasks, isSending]);

  // ── Left column content ───────────────────────────────────────────────────
  const showChatPane = ["chat", "preview", "code"].includes(activeTab);
  const leftColClass = `${showChatPane ? "md:col-span-4" : "md:col-span-10"} flex flex-col min-h-0 h-full overflow-hidden ${["preview", "code"].includes(activeTab) ? "hidden md:flex" : "flex flex-1"}`;

  const renderLeftPane = () => {
    if (showChatPane) {
      return (
        <Suspense fallback={viewFallback}>
          <ExecutionTimeline
            messages={messages}
            tasks={tasks}
            files={files}
            thinkingState={thinkingState}
            isConnectedSSE={isConnectedSSE}
            currentPersonaObj={currentPersonaObj}
            inputText={inputText}
            setInputText={setInputText}
            isSending={isSending}
            attachment={attachment}
            setAttachment={setAttachment}
            onSendPrompt={handleSendPrompt}
            onClearSession={handleClearSession}
            onKillAll={handleKillAll}
            onFilePickerClick={() => fileInputRef.current?.click()}
            chatEndRef={chatEndRef}
            chatScrollContainerRef={chatScrollContainerRef}
          />
        </Suspense>
      );
    }
    const panelClass = "flex-1 flex flex-col min-h-0";
    const wrapMotion = (key: string, child: React.ReactNode) => (
      <motion.div key={key} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={panelClass}>
        <Suspense fallback={viewFallback}>{child}</Suspense>
      </motion.div>
    );
    switch (activeTab) {
      case "simulation":    return wrapMotion("simulation",    <SubtasksSimulationView />);
      case "faceswap":      return wrapMotion("faceswap",      <FaceswapChatView activePersona={activePersona} setActivePersona={setActivePersona} PERSONAS={PERSONAS} currentPersonaObj={currentPersonaObj} />);
      case "database":      return wrapMotion("database",      <DbVisualizer messages={messages} tasks={tasks} files={files} onPurge={handleClearSession} />);
      case "logs":          return wrapMotion("logs",          <LogsView dbStatus={dbStatus} files={files} tasks={tasks} onRefresh={fetchInitialData} />);
      case "deploy":        return wrapMotion("deploy",        <DeployView />);
      case "github":        return wrapMotion("github",        <GithubView sessionId={activeSessionId} />);
      case "permissions":   return wrapMotion("permissions",   <PermissionsView />);
      case "settings":      return wrapMotion("settings",      <SettingsView dbStatus={dbStatus} onRefresh={fetchInitialData} />);
      case "supabase":      return wrapMotion("supabase",      <SupabaseView />);
      case "notifications": return wrapMotion("notifications", <NotificationsView />);
      case "screenshots":   return wrapMotion("screenshots",   <ScreenshotsView />);
      default:              return null;
    }
  };

  return (
    <div className="h-screen max-h-screen h-[100dvh] max-h-[100dvh] bg-[#FEF0E4] flex flex-col font-sans select-none overflow-hidden antialiased">
      {/* Hidden file input */}
      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" style={{ display: "none" }} accept="image/*,.txt,.pdf,.doc,.docx,.json,.js,.ts,.tsx,.css,.html" />

      {/* Navbar */}
      <Suspense fallback={null}>
        <Navbar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          currentPersonaObj={currentPersonaObj}
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
          isMoreMenuOpen={isMoreMenuOpen}
          setIsMoreMenuOpen={setIsMoreMenuOpen}
          tasks={tasks}
        />
      </Suspense>

      {/* HITL Gate Banner */}
      {suspendedFrame && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between gap-3 shadow-inner z-20">
          <div className="flex items-center gap-2.5 text-xs text-amber-900">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 animate-pulse" />
            <div>
              <span className="font-bold">Execution Suspended (HITL Gate Active):</span>{" "}
              <span>{suspendedFrame.reason || "High-risk action requires manual verification"}</span>
              {suspendedFrame.lockedFileModified && (
                <span className="ml-2 font-mono text-[10px] bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded text-amber-800">{suspendedFrame.lockedFileModified}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => handleHITLApproval(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1 rounded-lg transition-all shadow-xs cursor-pointer">Approve & Resume</button>
            <button onClick={() => handleHITLApproval(false)} className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-3 py-1 rounded-lg transition-all shadow-xs cursor-pointer">Reject Action</button>
          </div>
        </div>
      )}

      {/* Main body */}
      <main className="flex-1 max-w-[1800px] w-full mx-auto p-4 sm:p-6 flex flex-col md:grid md:grid-cols-10 gap-6 min-h-0 relative overflow-hidden">
        {/* Left column */}
        <div className={leftColClass}>
          <AnimatePresence mode="wait">{renderLeftPane()}</AnimatePresence>
        </div>

        {/* Right column */}
        <Suspense fallback={viewFallback}>
          <WorkspacePreview
            activeTab={activeTab}
            files={files}
            currentPrompt={currentPrompt}
            previewReloadKey={previewReloadKey}
            tasks={tasks}
            isSending={isSending}
            onUpdateFile={handleUpdateFile}
          />
        </Suspense>
      </main>

      {/* Settings modal */}
      {isSettingsOpen && (
        <Suspense fallback={null}>
          <SettingsModal onClose={() => setIsSettingsOpen(false)} dbStatus={dbStatus} onRefresh={fetchInitialData} />
        </Suspense>
      )}

      {/* Sidebar drawer */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-xs z-40" onClick={() => setIsSidebarOpen(false)} />
            <motion.div
              initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
              className="fixed left-0 top-0 bottom-0 w-80 bg-white border-r border-gray-100 shadow-2xl z-50 p-6 flex flex-col"
            >
              <div className="flex items-center justify-between pb-6 border-b border-gray-50">
                <span className="font-bold text-gray-900 font-display">System Clusters</span>
                <button onClick={() => setIsSidebarOpen(false)} className="text-gray-400 hover:text-gray-900 text-sm">✕</button>
              </div>

              <div className="flex-1 py-6 space-y-6 overflow-y-auto scrollbar-thin">
                {/* New chat */}
                <button id="btn-sidebar-new-chat" onClick={handleStartFreshChat} className="w-full flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 active:scale-[0.98] text-white font-semibold text-xs py-3 px-4 rounded-xl shadow-xs transition-all cursor-pointer font-sans shrink-0">
                  <Plus className="h-4 w-4 text-white" />
                  <span>Start Fresh Chat</span>
                </button>

                {/* Faceswap persona */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-amber-500 animate-pulse" />
                    <span>Faceswap: Active Persona</span>
                  </h4>
                  <button id="btn-faceswap-chat-link" onClick={() => { setActiveTab("faceswap"); setIsSidebarOpen(false); }} className="w-full flex items-center justify-between p-3.5 rounded-2xl border border-amber-100 bg-amber-50/50 hover:bg-amber-50 text-amber-900 shadow-3xs transition-all cursor-pointer font-sans">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-full bg-amber-500 flex items-center justify-center text-white shrink-0 animate-pulse"><Sparkles className="h-4 w-4" /></div>
                      <div className="text-left">
                        <p className="text-xs font-bold">Faceswap Chat</p>
                        <p className="text-[9px] text-amber-600 font-mono">Launch Swap Interface</p>
                      </div>
                    </div>
                    <ChevronDown className="h-4 w-4 text-amber-500 -rotate-90 shrink-0" />
                  </button>
                </div>

                {/* Chat history */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                      <span>Chat History</span>
                      <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-bold font-mono">{savedSessions.length}</span>
                    </h4>
                    {savedSessions.length > 0 && (
                      <button id="btn-clear-all-history" onClick={handleClearAllHistory} className="flex items-center gap-1 text-[10px] font-semibold text-red-400 hover:text-red-600 transition-colors px-2 py-0.5 rounded-lg hover:bg-red-50">
                        <Trash2 className="h-3 w-3" />Clear All
                      </button>
                    )}
                  </div>

                  {savedSessions.length === 0 ? (
                    <div className="p-4 rounded-2xl border border-dashed border-gray-200 text-center text-[11px] text-gray-400 font-sans">No saved chat sessions yet.</div>
                  ) : (
                    <div className="space-y-3 max-h-72 overflow-y-auto scrollbar-thin pr-1">
                      {savedSessions.map((session) => {
                        const isActive   = session.id === activeSessionId;
                        const isExpanded = expandedSessionId === session.id;
                        const userMsgCount = (session.messages || []).filter((m: any) => m.role === "user").length;
                        const taskCount    = (session.tasks || []).length;
                        const fileCount    = (session.files || []).length;
                        const updatedStr   = new Date(session.lastUpdated).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

                        return (
                          <div key={session.id} id={`session-item-${session.id}`} className={`group relative flex flex-col p-3 rounded-2xl border text-left transition-all ${isActive ? "bg-amber-50/80 border-amber-300 shadow-sm text-amber-950 font-medium" : "bg-gray-50/60 hover:bg-gray-100/80 border-gray-200 text-gray-700"}`}>
                            <div onClick={() => handleLoadSession(session)} className="flex items-start justify-between gap-2 cursor-pointer">
                              <div className="flex items-start gap-2 min-w-0 flex-1">
                                <MessageSquare className={`h-4 w-4 shrink-0 mt-0.5 ${isActive ? "text-amber-600 animate-pulse" : "text-gray-400 group-hover:text-gray-600"}`} />
                                <div className="min-w-0 flex-1 font-sans">
                                  <p className="text-xs truncate font-bold text-gray-900 leading-snug">{session.title || "Workspace Session"}</p>
                                  <p className="text-[9px] text-gray-400 font-mono mt-0.5">{updatedStr}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button onClick={(e) => { e.stopPropagation(); handleSpinUpSessionPreview(session, e); }} title="Open preview" className="p-1 rounded-lg hover:bg-indigo-50 text-gray-400 hover:text-indigo-500 transition-colors">
                                  <Play className="h-3 w-3" />
                                </button>
                                <button onClick={(e) => handleDeleteSession(session.id, e)} title="Delete session" className="p-1 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); setExpandedSessionId(isExpanded ? null : session.id); }} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                                  <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                                </button>
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-3 text-[9px] font-mono text-gray-500">
                                <span className="flex items-center gap-1"><MessageSquare className="h-2.5 w-2.5" />{userMsgCount} msgs</span>
                                <span className="flex items-center gap-1"><Activity className="h-2.5 w-2.5" />{taskCount} tasks</span>
                                <span className="flex items-center gap-1"><Calendar className="h-2.5 w-2.5" />{fileCount} files</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Settings shortcut */}
                <div className="border-t border-gray-100 pt-4">
                  <button onClick={() => { setActiveTab("settings"); setIsSidebarOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 text-left text-xs font-medium text-gray-600 transition-colors">
                    <Settings className="h-4 w-4 text-gray-400" />
                    Settings & Configuration
                  </button>
                </div>
              </div>

              {/* Footer */}
              <div className="pt-4 border-t border-gray-50 text-center">
                <p className="text-[10px] text-gray-400 font-mono">Trinity Universe — {currentTime}</p>
                {isLoadingSession && <p className="text-[10px] text-indigo-500 font-mono animate-pulse mt-1">Loading session...</p>}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
