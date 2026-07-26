import React, { useRef } from "react";
import {
  MessageSquare,
  ChevronDown,
  Trash2,
  Plus,
  Send,
  Loader2,
  Square,
  X,
  Cpu,
  Sparkles,
  CheckCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Message, Task, FileNode } from "../types.js";
import TaskAccordion from "./TaskAccordion.tsx";
import { PersonaObj } from "./Navbar.tsx";

// ─── Attachment type ──────────────────────────────────────────────────────────
export interface Attachment {
  name: string;
  type: string;
  data: string;
  size: number;
}

// ─── Markdown renderer ────────────────────────────────────────────────────────
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
        if (!trimmed) return <div key={idx} className="h-1" />;
        return (
          <p key={idx} className="text-slate-700 text-sm leading-relaxed">
            {line}
          </p>
        );
      })}
    </div>
  );
}

// ─── Action History Accordion ─────────────────────────────────────────────────
function ActionHistoryAccordion({ msg }: { msg: Message }) {
  const [isOpen, setIsOpen] = React.useState(false);
  if (!msg.actionsTaken || msg.actionsTaken.length === 0) return null;

  const foldersCreated = msg.actionsTaken.filter(a => a.type === "create_folder").length;
  const filesCreated   = msg.actionsTaken.filter(a => a.type === "create_file").length;
  const filesEdited    = msg.actionsTaken.filter(a => a.type === "edit_file").length;
  const commandsRun    = msg.actionsTaken.filter(a => a.type === "run_command").length;
  const isBuilt        = msg.actionsTaken.some(a => a.type === "build");

  const parts: string[] = [];
  if (foldersCreated > 0) parts.push(`Created ${foldersCreated} folder${foldersCreated > 1 ? "s" : ""}`);
  if (filesCreated > 0)   parts.push(`Created ${filesCreated} file${filesCreated > 1 ? "s" : ""}`);
  if (filesEdited > 0)    parts.push(`Edited ${filesEdited} file${filesEdited > 1 ? "s" : ""}`);
  if (commandsRun > 0)    parts.push(`Ran ${commandsRun} command${commandsRun > 1 ? "s" : ""}`);
  if (isBuilt)            parts.push("Built");

  return (
    <div className="border border-slate-150 bg-slate-50/50 rounded-xl mb-3 overflow-hidden shadow-3xs max-w-2xl">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-white hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex items-center gap-2 text-slate-700 min-w-0 flex-1">
          <span className="p-1 rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>
          </span>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-semibold text-slate-800">Action history</span>
            <span className="text-[10px] text-slate-500 truncate max-w-sm font-mono mt-0.5">
              {isOpen ? "Here are key actions taken for the app:" : `(${parts.join(", ")})`}
            </span>
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="px-4 pb-3.5 pt-1 border-t border-slate-100 bg-white font-mono text-xs text-slate-600 space-y-2.5 max-h-[220px] overflow-y-auto">
          {msg.actionsTaken.map((action, idx) => {
            const iconMap: Record<string, string> = { create_folder: "📂", create_file: "📝", edit_file: "✏️", run_command: "⚙️", build: "🛠️" };
            const labelMap: Record<string, string> = { create_folder: "Created folder", create_file: "Created file", edit_file: "Edited file", run_command: "Ran command", build: "Built" };
            return (
              <div key={idx} className="flex items-start justify-between border-b border-slate-50 pb-2 last:border-b-0 last:pb-0">
                <div className="flex items-start gap-2 max-w-[85%]">
                  <span className="text-sm shrink-0">{iconMap[action.type] ?? "📝"}</span>
                  <div>
                    <span className="font-semibold text-slate-800 block text-[11px]">{labelMap[action.type] ?? action.type}</span>
                    <span className="text-[9px] text-slate-500 break-all">{action.pathOrCommand}</span>
                    {action.details && <span className="text-[9px] text-slate-400 block mt-0.5 italic">{action.details}</span>}
                  </div>
                </div>
                {action.success && (
                  <span className="text-emerald-500 shrink-0 font-bold text-[10px] flex items-center gap-0.5">
                    <CheckCircle className="h-2.5 w-2.5" />
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

// ─── Master Plan Accordion ────────────────────────────────────────────────────
function MasterPlanAccordion({ tasks }: { tasks: Task[] }) {
  const [isOpen, setIsOpen] = React.useState(false);
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
            <span className="text-xs font-bold text-slate-800 tracking-tight uppercase">Master Plan (Strategy & Milestones)</span>
            <span className="text-[10px] text-slate-500 font-mono mt-0.5">
              {isOpen ? "Overarching strategy and phase breakdown:" : `(Collapsible Strategy • ${tasks.length} Phases Scheduled)`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[9px] font-mono font-bold text-slate-400 border border-slate-200/60 bg-slate-50 px-1.5 py-0.5 rounded">CLOSED BY DEFAULT</span>
          <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
        </div>
      </button>

      {isOpen && (
        <div className="p-4 border-t border-slate-100 bg-white space-y-4 font-sans text-left">
          <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100 leading-relaxed">
            <p className="font-semibold text-slate-800 mb-1">🎯 Overarching Strategy</p>
            To achieve high reliability and clean output organization, we execute in scheduled, sequential phases. Each phase acts as a safe transactional block in the compilation loop.
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {tasks.map((task, tIdx) => {
              const isLocked   = tasks.slice(0, tIdx).some(p => p.status !== "completed");
              const statusColor = task.status === "completed" ? "text-emerald-600 bg-emerald-50 border-emerald-150" : task.status === "running" ? "text-blue-600 bg-blue-50 border-blue-150 animate-pulse" : "text-slate-400 bg-slate-50 border-slate-150/40";
              const statusIcon  = task.status === "completed" ? "🟢" : task.status === "running" ? "🔵" : "⏳";
              const statusText  = task.status === "completed" ? "Completed" : task.status === "running" ? "Running" : isLocked ? "Locked" : "Pending";
              return (
                <div key={task.id} className="flex items-center justify-between text-xs py-2 px-3.5 rounded-xl border border-slate-100 bg-white shadow-3xs">
                  <div className="flex flex-col min-w-0 flex-1 mr-2">
                    <span className="font-semibold text-slate-800 truncate">Phase {tIdx + 1}: {task.name}</span>
                    <span className="text-[9px] text-slate-400 font-mono mt-0.5">{task.subtasks?.length || 0} sub-tasks listed</span>
                  </div>
                  <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border shrink-0 ${statusColor} flex items-center gap-1`}>
                    <span>{statusIcon}</span><span>{statusText}</span>
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

// ─── Timeline computation ─────────────────────────────────────────────────────
type TimelineItem =
  | { type: "message"; id: string; timestamp: string; data: Message }
  | { type: "task";    id: string; timestamp: string; data: Task };

function buildTimeline(messages: Message[], tasks: Task[]): { timeline: TimelineItem[]; stablySortedTasks: Task[] } {
  const userMessages = messages.filter(m => m.role === "user");
  const stablySortedTasks = [...tasks].sort((a, b) => {
    const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });

  const getAssocUserMsgId = (itemTs: string, isAssistant = false): string => {
    if (userMessages.length === 0) return "header";
    const itemTime = new Date(itemTs).getTime();
    if (isAssistant) {
      let best: Message | null = null; let minDiff = Infinity;
      for (const u of userMessages) {
        const diff = itemTime - new Date(u.timestamp).getTime();
        if (diff >= -10000 && diff < minDiff) { minDiff = diff; best = u; }
      }
      return best ? best.id : "header";
    }
    let bestMsg = userMessages[0]; let bestDiff = Infinity;
    for (const u of userMessages) {
      const diff = itemTime - new Date(u.timestamp).getTime();
      if (diff >= -300000 && diff < bestDiff) { bestDiff = diff; bestMsg = u; }
    }
    return bestMsg.id;
  };

  const groups: Record<string, { userMessage?: Message; tasks: Task[]; messages: Message[] }> = {
    header: { tasks: [], messages: [] }
  };
  for (const u of userMessages) groups[u.id] = { userMessage: u, tasks: [], messages: [] };
  for (const m of messages) {
    if (m.role === "user") continue;
    const id = getAssocUserMsgId(m.timestamp, true);
    groups[id].messages.push(m);
  }
  for (const t of stablySortedTasks) {
    const id = getAssocUserMsgId(t.createdAt, false);
    if (!groups[id]) groups["header"].tasks.push(t);
    else groups[id].tasks.push(t);
  }

  const timeline: TimelineItem[] = [];

  // Header group
  groups["header"].messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  for (const m of groups["header"].messages) timeline.push({ type: "message", id: m.id, timestamp: m.timestamp, data: m });
  const visHdrTasks = groups["header"].tasks.filter((_, i) => i === 0 || _.status !== "pending");
  for (const t of visHdrTasks) timeline.push({ type: "task", id: t.id, timestamp: t.createdAt, data: t });

  // Per-user-message groups
  const sortedUserMsgs = [...userMessages].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  for (const u of sortedUserMsgs) {
    const grp = groups[u.id];
    timeline.push({ type: "message", id: u.id, timestamp: u.timestamp, data: u });
    const combined: Array<{ type: "task" | "message"; ts: number; data: Task | Message }> = [];
    for (const t of grp.tasks.filter((_, i) => i === 0 || _.status !== "pending"))
      combined.push({ type: "task", ts: new Date(t.createdAt).getTime(), data: t });
    for (const m of grp.messages) {
      const isTodo = m.content.includes("Master Task Itinerary") || m.content.includes("[Task-1]") || m.content.includes("todo");
      combined.push({ type: "message", ts: new Date(m.timestamp).getTime() - (isTodo ? 5000 : 0), data: m });
    }
    combined.sort((a, b) => a.ts !== b.ts ? a.ts - b.ts : a.type === "message" ? -1 : 1);
    for (const item of combined) {
      if (item.type === "task") {
        const t = item.data as Task;
        timeline.push({ type: "task", id: t.id, timestamp: t.createdAt, data: t });
      } else {
        const m = item.data as Message;
        timeline.push({ type: "message", id: m.id, timestamp: m.timestamp, data: m });
      }
    }
  }

  return { timeline, stablySortedTasks };
}

// ─── Input Bar ────────────────────────────────────────────────────────────────
interface InputBarProps {
  inputText: string;
  setInputText: (v: string) => void;
  isSending: boolean;
  attachment: Attachment | null;
  setAttachment: (v: Attachment | null) => void;
  onSendPrompt: (e: React.FormEvent) => void;
  onKillAll: () => void;
  onFilePickerClick: () => void;
  hasRunningTask: boolean;
}

function InputBar({ inputText, setInputText, isSending, attachment, setAttachment, onSendPrompt, onKillAll, onFilePickerClick, hasRunningTask }: InputBarProps) {
  return (
    <form
      onSubmit={onSendPrompt}
      className="w-full max-w-3xl mx-auto bg-white rounded-3xl px-5 py-3 shadow-md hover:shadow-lg transition-all border border-gray-150 flex flex-col gap-2"
    >
      {attachment && (
        <div className="w-full flex items-center gap-2 mb-1 bg-slate-50 border border-slate-100 p-2 rounded-2xl text-left">
          {attachment.type.startsWith("image/") ? (
            <img src={`data:${attachment.type};base64,${attachment.data}`} alt={attachment.name} className="h-10 w-10 object-cover rounded-lg border border-gray-200" referrerPolicy="no-referrer" />
          ) : (
            <div className="h-10 w-10 bg-indigo-50 border border-indigo-150 rounded-lg flex items-center justify-center text-indigo-500 font-mono text-xs font-bold shrink-0">FILE</div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-700 truncate">{attachment.name}</p>
            <p className="text-[10px] text-gray-400">{(attachment.size / 1024).toFixed(1)} KB</p>
          </div>
          <button type="button" onClick={() => setAttachment(null)} className="p-1 hover:bg-gray-200 rounded-full text-gray-400 hover:text-gray-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className="w-full flex items-end gap-3">
        <button id="btn-input-plus" type="button" onClick={onFilePickerClick} className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-700 transition-colors mb-1 shrink-0">
          <Plus className="h-5 w-5" />
        </button>
        <textarea
          id="input-prompt-command"
          placeholder="Command the Titan-Lobe..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
          rows={1}
          className="flex-1 min-w-0 bg-transparent border-none text-sm text-gray-800 focus:outline-none placeholder-gray-400 resize-none max-h-32 py-2.5 scrollbar-thin"
          disabled={isSending}
          style={{ height: "auto" }}
          ref={(el) => { if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; } }}
        />
        {hasRunningTask && (
          <button type="button" onClick={onKillAll} title="Stop all running tasks" className="p-3 bg-rose-600 text-white hover:bg-rose-700 active:scale-95 rounded-full transition-all select-none shrink-0 mb-0.5 flex items-center gap-1.5 animate-pulse shadow-md shadow-rose-200">
            <Square className="h-4 w-4 text-white fill-white" />
          </button>
        )}
        <button id="btn-input-submit" type="submit" disabled={!inputText.trim() || isSending} className="p-3 bg-black text-white hover:bg-zinc-800 rounded-full transition-all disabled:opacity-30 disabled:hover:bg-black select-none shrink-0 mb-0.5">
          {isSending ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : <Send className="h-4 w-4 text-white" />}
        </button>
      </div>
    </form>
  );
}

// ─── Main ExecutionTimeline component ─────────────────────────────────────────
interface ExecutionTimelineProps {
  messages: Message[];
  tasks: Task[];
  files: FileNode[];
  thinkingState: { stage: string; text: string; elapsed: number; isThinking: boolean } | null;
  isConnectedSSE: boolean;
  currentPersonaObj: PersonaObj;
  inputText: string;
  setInputText: (v: string) => void;
  isSending: boolean;
  attachment: Attachment | null;
  setAttachment: (v: Attachment | null) => void;
  onSendPrompt: (e: React.FormEvent) => void;
  onClearSession: () => void;
  onKillAll: () => void;
  onFilePickerClick: () => void;
  chatEndRef: React.RefObject<HTMLDivElement>;
  chatScrollContainerRef: React.RefObject<HTMLDivElement>;
}

export default function ExecutionTimeline({
  messages,
  tasks,
  thinkingState,
  isConnectedSSE,
  currentPersonaObj,
  inputText,
  setInputText,
  isSending,
  attachment,
  setAttachment,
  onSendPrompt,
  onClearSession,
  onKillAll,
  onFilePickerClick,
  chatEndRef,
  chatScrollContainerRef,
}: ExecutionTimelineProps) {
  const { timeline, stablySortedTasks } = buildTimeline(messages, tasks);
  const hasRunningTask = tasks.some(t => t.status === "running");
  const isEmpty = tasks.length === 0 && messages.filter(m => m.id !== "welcome-msg").length === 0;

  const SUGGESTIONS = [
    "setup email registration with auth-guards",
    "generate custom chart dashboards widget",
    "seed database with 50 test products logs",
  ];

  // ── Welcome / empty state ──────────────────────────────────────────────────
  if (isEmpty) {
    return (
      <motion.div
        key="chat-panel"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -15 }}
        className="flex-1 flex flex-col min-h-0 h-full overflow-hidden"
      >
        <div id="central-welcome-greeting" className="flex-1 flex flex-col items-center justify-center text-center py-6 max-w-2xl mx-auto w-full space-y-8 px-4 sm:px-0 overflow-y-auto scrollbar-thin">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1, duration: 0.6 }} className="space-y-4">
            <h1 className="text-4xl sm:text-5xl font-light tracking-tight text-gray-900 font-display">Welcome back.</h1>
            <p className="text-2xl sm:text-3xl text-gray-400 font-light font-sans leading-relaxed">Systems are ready for your</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 font-display tracking-tight">Trinity Universe build.</h2>
          </motion.div>

          <div className="w-full shrink-0 z-30">
            <InputBar
              inputText={inputText}
              setInputText={setInputText}
              isSending={isSending}
              attachment={attachment}
              setAttachment={setAttachment}
              onSendPrompt={onSendPrompt}
              onKillAll={onKillAll}
              onFilePickerClick={onFilePickerClick}
              hasRunningTask={hasRunningTask}
            />
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              {SUGGESTIONS.map((sug, i) => (
                <button key={i} type="button" onClick={() => setInputText(sug)} className="text-[11px] bg-white border border-gray-200 text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-full transition-colors font-mono cursor-pointer">
                  {sug}
                </button>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // ── Active chat thread ─────────────────────────────────────────────────────
  return (
    <motion.div
      key="chat-panel"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      className="flex-1 flex flex-col min-h-0 h-full overflow-hidden"
    >
      <div id="chat-thread-container" className="flex-1 flex flex-col min-h-0 h-full overflow-hidden max-w-4xl mx-auto w-full relative pb-1">
        {/* Thread header */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-150/70 shrink-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-indigo-500 animate-pulse" />
            <span className="text-xs font-bold text-gray-700 font-mono uppercase tracking-wider">Workspace Execution Timeline</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-[10px] text-emerald-600 font-mono">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
              SSE PIPELINE {isConnectedSSE ? "ONLINE" : "OFFLINE"}
            </span>
            <button id="btn-clear-chat" onClick={onClearSession} className="text-gray-400 hover:text-red-500 p-1.5 hover:bg-gray-100 rounded-xl transition-all cursor-pointer" title="Purge session">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scroll area */}
        <div ref={chatScrollContainerRef} className="flex-1 min-h-0 overflow-y-auto space-y-6 pr-1.5 scrollbar-thin pb-4">
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
                            <img src={`data:${msg.attachment.type};base64,${msg.attachment.data}`} alt={msg.attachment.name} className="h-10 w-10 object-cover rounded-lg border border-slate-200" />
                          ) : (
                            <div className="h-10 w-10 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center justify-center text-indigo-500 font-mono text-xs font-bold shrink-0">FILE</div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-slate-700 truncate">{msg.attachment.name}</p>
                            <p className="text-[10px] text-slate-400">{(msg.attachment.size / 1024).toFixed(1)} KB</p>
                          </div>
                        </div>
                      )}
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    </div>
                    <span className="text-[10px] text-gray-400 mt-1.5 px-2 font-mono">
                      User • {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                );
              }

              if (msg.role === "system") {
                return (
                  <div key={item.id} className="w-full flex justify-center">
                    <div className="bg-amber-50 text-amber-800 border border-amber-100 rounded-2xl px-5 py-3 text-xs font-mono max-w-[90%] shadow-xs">
                      {msg.content}
                    </div>
                  </div>
                );
              }

              // Assistant message
              return (
                <div key={item.id} className="flex gap-4 items-start w-full">
                  <div className={`h-9 w-9 rounded-full ${currentPersonaObj.avatarBg} flex items-center justify-center text-white shrink-0 shadow-sm`}>
                    <currentPersonaObj.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 space-y-2 min-w-0">
                    {msg.modelName && (
                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-gray-500 font-medium select-none">
                        <span>{msg.modelName}</span>
                        {msg.thoughtTimeSeconds !== undefined && <><span>•</span><span>Thought for {msg.thoughtTimeSeconds}s</span></>}
                        {msg.durationSeconds !== undefined && <><span>•</span><span>Ran for {msg.durationSeconds}s</span></>}
                      </div>
                    )}
                    <ActionHistoryAccordion msg={msg} />
                    <div className="text-gray-800 leading-relaxed text-sm p-4 bg-white border border-gray-150 rounded-2xl shadow-3xs">
                      {renderMarkdownMessage(msg.content)}
                    </div>
                    <span className="text-[9px] font-mono text-gray-400 block mt-1">
                      {currentPersonaObj.name} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              );
            }

            // Task item
            const task = item.data;
            const taskIndex = stablySortedTasks.findIndex(t => t.id === task.id) + 1;
            const isPredecessorCompleted = taskIndex === 1 || (stablySortedTasks[taskIndex - 2]?.status === "completed");
            if (!isPredecessorCompleted) return null;

            const isLocked    = stablySortedTasks.slice(0, taskIndex - 1).some(p => p.status !== "completed");
            const isCompleted = task.status === "completed";
            const isRunning   = task.status === "running";
            const isFailed    = task.status === "failed";

            return (
              <div key={item.id} className="w-full space-y-4">
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

                <div className={`w-full pl-0 sm:pl-13 space-y-3.5 transition-all duration-300 ${isLocked ? "opacity-55" : ""}`}>
                  <div className="flex items-center gap-3 select-none">
                    <div className={`h-2.5 w-2.5 rounded-full ${isCompleted ? "bg-emerald-500 shadow-emerald-200 shadow-sm" : isRunning ? "bg-blue-500 animate-pulse shadow-blue-200 shadow-sm" : isFailed ? "bg-rose-500 shadow-rose-200 shadow-sm" : "bg-gray-300"}`} />
                    <span className={`text-[10px] font-mono font-bold tracking-wider uppercase ${isCompleted ? "text-emerald-600" : isRunning ? "text-blue-600" : isFailed ? "text-rose-600" : "text-slate-400"}`}>
                      {isCompleted ? "🟢 SUCCESS" : isRunning ? "🔵 ACTIVE" : isFailed ? "🔴 FAILED" : isLocked ? "⏳ LOCKED" : "⏳ PENDING"}
                    </span>
                    <span className="text-xs text-slate-200">|</span>
                    <h3 className={`text-xs font-bold font-mono tracking-tight uppercase ${isLocked ? "text-slate-400" : "text-slate-700"}`}>
                      {isCompleted ? `Completed Task ${taskIndex}: ${task.name}` : isRunning ? `Executing Task ${taskIndex}: ${task.name}` : isFailed ? `Failed Task ${taskIndex}: ${task.name}` : `Task ${taskIndex}: ${task.name}`}
                    </h3>
                    {isLocked && <span className="inline-flex items-center gap-1 text-[9px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-md">Locked</span>}
                  </div>

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
          })}

          {/* Thinking indicator */}
          {thinkingState?.isThinking && (
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
                  <span className="text-[10px] font-mono text-zinc-400 mt-2 block">Thought for {thinkingState.elapsed.toFixed(1)}s...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Bottom input bar */}
        <div className="w-full bg-slate-50/90 pt-3 pb-1 border-t border-gray-150/50 z-30 shrink-0">
          <InputBar
            inputText={inputText}
            setInputText={setInputText}
            isSending={isSending}
            attachment={attachment}
            setAttachment={setAttachment}
            onSendPrompt={onSendPrompt}
            onKillAll={onKillAll}
            onFilePickerClick={onFilePickerClick}
            hasRunningTask={hasRunningTask}
          />
        </div>
      </div>
    </motion.div>
  );
}
