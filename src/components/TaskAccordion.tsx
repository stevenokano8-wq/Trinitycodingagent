import { API_BASE } from "../lib/api.ts";
import React, { useState, useEffect, useMemo } from "react";
import { Task, Subtask } from "../types.js";
import { 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2, 
  XCircle, 
  PlayCircle,
  Loader2, 
  Terminal, 
  Copy, 
  FileText, 
  Lock 
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface CommandBlock {
  id: string;
  command: string;
  isSystem: boolean;
  status: "success" | "failed" | "info" | "running";
  output: string[];
}

function parseLogsToCommandBlocks(logs: string[]): CommandBlock[] {
  const blocks: CommandBlock[] = [];
  let currentBlock: CommandBlock | null = null;

  logs.forEach((log, idx) => {
    const trimmed = log.trim();
    if (trimmed.startsWith("cmd> ")) {
      if (currentBlock) {
        blocks.push(currentBlock);
      }
      const commandText = trimmed.replace("cmd> ", "");
      currentBlock = {
        id: `cmd-${idx}`,
        command: commandText,
        isSystem: false,
        status: "info",
        output: []
      };
    } else if (trimmed.startsWith("[Sovereign Agent]") || trimmed.startsWith("[INFO]") || trimmed.startsWith("[SYSTEM]") || trimmed.startsWith("[SUCCESS]")) {
      if (trimmed.startsWith("[Sovereign Agent]") || trimmed.startsWith("[SYSTEM]")) {
        if (currentBlock) {
          blocks.push(currentBlock);
        }
        currentBlock = {
          id: `sys-${idx}`,
          command: trimmed,
          isSystem: true,
          status: trimmed.toLowerCase().includes("success") ? "success" : trimmed.toLowerCase().includes("failed") ? "failed" : "info",
          output: []
        };
      } else {
        if (currentBlock) {
          currentBlock.output.push(log);
        } else {
          currentBlock = {
            id: `log-${idx}`,
            command: trimmed,
            isSystem: true,
            status: trimmed.toLowerCase().includes("success") ? "success" : trimmed.toLowerCase().includes("failed") ? "failed" : "info",
            output: []
          };
        }
      }
    } else {
      if (currentBlock) {
        currentBlock.output.push(log);
      } else {
        currentBlock = {
          id: `log-${idx}`,
          command: "Initialize Execution Status",
          isSystem: true,
          status: "info",
          output: [log]
        };
      }
    }

    if (currentBlock) {
      const allText = (currentBlock.command + " " + currentBlock.output.join(" ")).toLowerCase();
      if (allText.includes("failed") || allText.includes("error") || allText.includes("cancelled")) {
        currentBlock.status = "failed";
      } else if (allText.includes("success") || allText.includes("passed") || allText.includes("complete") || allText.includes("completed")) {
        currentBlock.status = "success";
      } else if (allText.includes("running") || allText.includes("loading") || allText.includes("executing")) {
        currentBlock.status = "running";
      }
    }
  });

  if (currentBlock) {
    blocks.push(currentBlock);
  }

  if (blocks.length === 0) {
    blocks.push({
      id: "empty",
      command: "Staging and allocation",
      isSystem: true,
      status: "info",
      output: ["Initialized subtask. Waiting for agent process allocation..."]
    });
  }

  return blocks;
}

const CommandAccordionItem = React.memo(function CommandAccordionItem({ 
  block, 
  subtaskFile, 
  subtaskCode 
}: { 
  block: CommandBlock; 
  subtaskFile?: string; 
  subtaskCode?: string;
}) {
  const [isOpen, setIsOpen] = useState(block.status === "running" || block.status === "failed");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (block.status === "running" || block.status === "failed") {
      setIsOpen(true);
    }
  }, [block.status]);

  const getStatusColor = () => {
    switch (block.status) {
      case "success":
        return "text-emerald-500 bg-emerald-50 border-emerald-200";
      case "failed":
        return "text-rose-500 bg-rose-50 border-rose-200 animate-pulse";
      case "running":
        return "text-blue-500 bg-blue-50 border-blue-200";
      default:
        return "text-slate-500 bg-slate-50 border-slate-200";
    }
  };

  const getStatusIcon = () => {
    switch (block.status) {
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-rose-500 shrink-0" />;
      case "running":
        return <Loader2 className="h-4 w-4 text-blue-500 shrink-0 animate-spin" />;
      default:
        return <PlayCircle className="h-4 w-4 text-slate-400 shrink-0" />;
    }
  };

  const handleCopyCode = () => {
    if (subtaskCode) {
      navigator.clipboard.writeText(subtaskCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-3xs transition-all duration-200">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-slate-50/50 transition-colors gap-3 cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {getStatusIcon()}
          <span className="text-[10px] font-mono font-semibold text-slate-400 shrink-0 select-none">
            {block.isSystem ? "SYS" : "CMD>"}
          </span>
          <span className="text-xs font-mono font-medium text-slate-700 truncate">
            {block.command}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 select-none">
          <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded-md border uppercase ${getStatusColor()}`}>
            {block.status}
          </span>
          {isOpen ? <ChevronUp className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-slate-100 bg-slate-950 text-slate-200 font-mono text-[11px] text-left"
          >
            <div className="p-3.5 space-y-1.5 max-h-56 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-850">
              {block.output.length === 0 ? (
                <div className="text-zinc-500 italic select-none">No immediate output lines returned.</div>
              ) : (
                block.output.map((line, oIdx) => {
                  const isErr = line.toLowerCase().includes("error") || line.toLowerCase().includes("failed") || line.toLowerCase().includes("cancelled");
                  const isSucc = line.toLowerCase().includes("[success]");
                  return (
                    <div
                      key={oIdx}
                      className={`leading-relaxed break-all ${
                        isErr ? "text-rose-400 font-semibold" :
                        isSucc ? "text-emerald-400 font-semibold" : "text-zinc-300"
                      }`}
                    >
                      {line}
                    </div>
                  );
                })
              )}

              {subtaskCode && !block.isSystem && (
                <div className="mt-3 bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 flex flex-col select-none">
                  <div className="flex items-center justify-between text-[9px] text-zinc-400 font-bold mb-1.5">
                    <div className="flex items-center gap-1 truncate max-w-[70%]">
                      <FileText className="h-3 w-3 text-zinc-500 shrink-0" />
                      <span className="truncate">{subtaskFile || "src/generated/module.ts"}</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="flex items-center gap-1 text-zinc-400 hover:text-white bg-transparent border-none cursor-pointer transition-colors"
                    >
                      <Copy className="h-2.5 w-2.5" />
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <pre className="text-[10px] leading-relaxed text-zinc-400 bg-zinc-950/70 p-2 rounded border border-zinc-800 max-h-24 overflow-y-auto overflow-x-auto text-left whitespace-pre">
                    {subtaskCode}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

const SubtaskAccordionItem = React.memo(function SubtaskAccordionItem({ 
  sub, 
  isInitiallyOpen,
  isLocked = false
}: { 
  sub: Subtask; 
  isInitiallyOpen: boolean;
  isLocked?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(!isLocked && (isInitiallyOpen || sub.status === "running" || sub.status === "failed"));

  useEffect(() => {
    if (!isLocked && (sub.status === "running" || sub.status === "failed")) {
      setIsOpen(true);
    }
  }, [sub.status, isLocked]);

  const getStatusIcon = () => {
    if (isLocked) {
      return <Lock className="h-4 w-4 text-zinc-350 shrink-0" />;
    }
    switch (sub.status) {
      case "completed":
        return <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500 shrink-0" />;
      case "failed":
        return <XCircle className="h-4.5 w-4.5 text-rose-500 shrink-0 animate-pulse" />;
      case "running":
        return <Loader2 className="h-4.5 w-4.5 text-blue-500 shrink-0 animate-spin" />;
      default:
        return <PlayCircle className="h-4.5 w-4.5 text-zinc-400 shrink-0 opacity-60" />;
    }
  };

  const getStatusBg = () => {
    if (isLocked) return "bg-zinc-50/50 hover:bg-zinc-50/55 border-zinc-150 text-zinc-400 cursor-not-allowed";
    if (sub.status === "running") return "bg-blue-50/40 hover:bg-blue-50/60 border-blue-100 text-blue-950";
    if (sub.status === "failed") return "bg-rose-50/40 hover:bg-rose-50/60 border-rose-100 text-rose-950";
    if (sub.status === "completed") return "bg-emerald-50/10 hover:bg-emerald-50/20 border-emerald-100 text-slate-800";
    return "hover:bg-slate-50 border-slate-200 text-slate-700";
  };

  const blocks = useMemo(() => parseLogsToCommandBlocks(sub.logs), [sub.logs]);

  return (
    <div className={`border border-slate-200 rounded-2xl bg-white shadow-2xs overflow-hidden transition-all duration-300 ${isLocked ? "opacity-75" : ""}`}>
      <button
        type="button"
        disabled={isLocked}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full p-3.5 flex items-center justify-between text-left transition-colors border-none font-sans ${getStatusBg()}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          {getStatusIcon()}
          <span className={`font-semibold text-xs truncate leading-snug ${isLocked ? "text-zinc-400" : ""}`}>{sub.name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 select-none">
          <span className="text-[10px] font-mono font-bold opacity-65 uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded border border-slate-200/50">
            {isLocked ? "LOCKED" : sub.status}
          </span>
          {!isLocked && (isOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />)}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-slate-100 bg-slate-50/30"
          >
            <div className="p-4 space-y-3">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-1 select-none flex items-center gap-1.5">
                <Terminal className="h-3 w-3 text-slate-400" />
                <span>Command Executions & Action Logs ({blocks.length})</span>
              </div>
              <div className="space-y-2">
                {blocks.map((block) => (
                  <CommandAccordionItem
                    key={block.id}
                    block={block}
                    subtaskFile={sub.file}
                    subtaskCode={sub.code}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

interface TaskAccordionProps {
  task: Task;
  isInitiallyExpanded?: boolean;
  isLocked?: boolean;
  taskIndex?: number;
}

export default function TaskAccordion({ 
  task, 
  isInitiallyExpanded = false, 
  isLocked = false, 
  taskIndex = 1 
}: TaskAccordionProps) {
  const [isExpanded, setIsExpanded] = useState(isInitiallyExpanded || task.status === "running");

  useEffect(() => {
    if (task.status === "running" || task.status === "failed") {
      setIsExpanded(true);
    }
  }, [task.status]);

  const [elapsedTime, setElapsedTime] = useState("00:00");

  const formatDuration = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    if (task.status !== "running" || !task.startedAt) {
      if ((task.status === "completed" || task.status === "failed") && task.startedAt && task.completedAt) {
        const diff = new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime();
        setElapsedTime(formatDuration(diff > 0 ? diff : 0));
      } else {
        setElapsedTime("00:00");
      }
      return;
    }

    const start = new Date(task.startedAt).getTime();
    const interval = setInterval(() => {
      const diff = Date.now() - start;
      setElapsedTime(formatDuration(diff > 0 ? diff : 0));
    }, 100);

    return () => clearInterval(interval);
  }, [task.status, task.startedAt, task.completedAt]);

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`${API_BASE}/api/tasks/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id })
      });
    } catch (err) {
      console.error("Failed to cancel task flow:", err);
    }
  };

  const getAggregatedBadge = () => {
    const hasFailed = task.subtasks.some(s => s.status === "failed") || task.status === "failed";
    const isRunning = task.status === "running";
    const isCompleted = task.status === "completed";

    if (hasFailed) {
      return (
        <span className="bg-rose-50 text-rose-600 border border-rose-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
          <span className="h-1 w-1 rounded-full bg-rose-500 animate-pulse" />
          Failed / Aborted
        </span>
      );
    }
    if (isRunning) {
      return (
        <span className="bg-blue-50 text-blue-600 border border-blue-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
          <Loader2 className="h-2.5 w-2.5 animate-spin text-blue-500" />
          Running
        </span>
      );
    }
    if (isCompleted) {
      return (
        <span className="bg-emerald-50 text-emerald-600 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
          <span className="h-1 w-1 rounded-full bg-emerald-500" />
          Completed
        </span>
      );
    }
    return (
      <span className="bg-zinc-50 text-zinc-400 border border-zinc-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
        Pending
      </span>
    );
  };

  return (
    <div className={`w-full font-sans border border-zinc-200 rounded-2xl bg-white shadow-xs overflow-hidden transition-all duration-300 ${
      isLocked ? "opacity-60 cursor-not-allowed select-none" : ""
    }`}>
      {/* A. HEADER BAR */}
      <div 
        onClick={() => !isLocked && setIsExpanded(!isExpanded)}
        className={`w-full p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 select-none text-left transition-colors ${
          isLocked ? "bg-zinc-50" : "hover:bg-zinc-50/50 cursor-pointer"
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-zinc-500 font-bold shrink-0 text-xs tracking-wider bg-zinc-100 px-2 py-0.5 rounded border border-zinc-250/50">
            [Task-{taskIndex}]
          </span>
          <h4 className="font-semibold text-zinc-800 text-sm truncate pr-2">
            {task.name}
          </h4>
        </div>

        <div className="flex items-center flex-wrap gap-2.5 shrink-0 self-end sm:self-auto">
          {getAggregatedBadge()}

          {(task.status === "running" || task.status === "completed" || task.status === "failed") && (
            <span className="text-[10px] font-mono font-bold text-zinc-500 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded-md">
              ⏱ {elapsedTime}
            </span>
          )}

          {task.status === "running" && (
            <button
              type="button"
              onClick={handleCancel}
              className="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-md hover:bg-rose-600 hover:text-white hover:border-rose-600 cursor-pointer transition-all"
            >
              Cancel
            </button>
          )}

          {isLocked ? (
            <Lock className="h-3.5 w-3.5 text-zinc-400 shrink-0 ml-1" />
          ) : (
            <div className="text-zinc-400 hover:text-zinc-600 transition-colors shrink-0 ml-1">
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          )}
        </div>
      </div>

      {/* B. DETAIL CONTENT SPECIFICATION (Nested Accordions View) */}
      <AnimatePresence initial={false}>
        {isExpanded && !isLocked && task.subtasks.length > 0 && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden border-t border-zinc-150"
          >
            <div className="p-4 flex flex-col gap-3.5 bg-slate-50/40">
              {task.subtasks.map((sub, sIdx) => {
                const isSubtaskLocked = isLocked || sIdx > task.activeSubtaskIndex || (task.status === "pending" && sIdx > 0);
                return (
                  <SubtaskAccordionItem
                    key={sub.id}
                    sub={sub}
                    isInitiallyOpen={sIdx === 0 || sub.status === "running" || sub.status === "failed"}
                    isLocked={isSubtaskLocked}
                  />
                );
              })}

              {task.status === "completed" && (
                <PhaseSummarySubAccordion 
                  taskIndex={taskIndex} 
                  taskName={task.name} 
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const PhaseSummarySubAccordion = React.memo(function PhaseSummarySubAccordion({ 
  taskIndex, 
  taskName 
}: { 
  taskIndex: number; 
  taskName: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-emerald-150 rounded-2xl bg-emerald-50/5 overflow-hidden transition-all duration-300">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-3.5 flex items-center justify-between text-left transition-colors border-none font-sans bg-emerald-50/25 hover:bg-emerald-50/35 text-emerald-950"
      >
        <div className="flex items-center gap-3 min-w-0">
          <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
          <span className="font-semibold text-xs truncate leading-snug">Summary of Phase {taskIndex}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 select-none">
          <span className="text-[9px] font-mono font-bold text-emerald-600 bg-emerald-100/50 px-2 py-0.5 rounded border border-emerald-200/40">
            SUMMARY
          </span>
          {isOpen ? <ChevronUp className="h-4 w-4 text-emerald-600" /> : <ChevronDown className="h-4 w-4 text-emerald-600" />}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-emerald-100 bg-emerald-50/10"
          >
            <div className="p-4 text-xs space-y-2 text-slate-700 leading-relaxed font-sans text-left">
              <p className="font-medium text-emerald-900">✨ Phase {taskIndex} ("{taskName}") successfully executed and verified!</p>
              <ul className="list-disc pl-4 space-y-1 mt-1 text-slate-600">
                <li>All subtasks compiled safely inside the isolated container workspace.</li>
                <li>Zero syntax errors, correct indentation, and static types validated.</li>
                <li>Live component and asset tree updated in the rendering layers.</li>
              </ul>
              <p className="text-[10px] text-slate-400 font-mono mt-2">Verified compliance with Phase {taskIndex} progressive disclosure bounds.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

