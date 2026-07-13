import React, { useState } from "react";
import { Task, Subtask } from "../types.js";
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  RefreshCw,
  Clock,
  Copy,
  Terminal,
  BookOpen,
  PenLine,
  Brain,
  XCircle,
} from "lucide-react";

interface TaskAccordionProps {
  task: Task;
  isInitiallyExpanded?: boolean;
  isLocked?: boolean;
  taskIndex?: number;
  onCancelTask?: (taskId: string) => void;
}

// Logs prefixed with "[Sovereign Agent]" / "[SYSTEM]" that describe a shift in
// what the agent is doing are treated as "step" markers — in the expanded
// view these render as bold section dividers instead of plain log lines,
// mirroring how a real coding agent groups a burst of actions under a
// heading (e.g. "Planning ActionsGroup component redesign").
function isStepLog(line: string): boolean {
  if (!line) return false;
  return /^\[(sovereign agent|system)\]/i.test(line.trim());
}

function stepLabel(line: string): string {
  return line.replace(/^\[[^\]]*\]\s*/i, "").replace(/\.\.\.$/, "").trim();
}

// Classify a single log line into an icon + kind so the collapsed action
// list can show "Opened X", "Edited Y", "Planning Z" the way a real agent
// transcript does, instead of a wall of raw log text.
type LogKind = "opened" | "edited" | "planning" | "command" | "success" | "info";

function classifyLog(line: string): { kind: LogKind; label: string } {
  const trimmed = line.replace(/^\[[0-9:APM\s]+\]\s*/i, "");
  if (/^cmd>/i.test(trimmed)) {
    return { kind: "command", label: trimmed.replace(/^cmd>\s*/i, "") };
  }
  if (/^\[success\]/i.test(trimmed)) {
    return { kind: "success", label: trimmed.replace(/^\[success\]\s*/i, "") };
  }
  if (/analyzing|planning|routing|requesting ai/i.test(trimmed)) {
    return { kind: "planning", label: stepLabel(trimmed) };
  }
  if (/writing code implementation|generated and stored|initialized code module/i.test(trimmed)) {
    return { kind: "edited", label: stepLabel(trimmed) };
  }
  if (/^\[info\]/i.test(trimmed)) {
    return { kind: "info", label: trimmed.replace(/^\[info\]\s*/i, "") };
  }
  return { kind: "opened", label: stepLabel(trimmed) };
}

function LogIcon({ kind }: { kind: LogKind }) {
  const cls = "h-3.5 w-3.5 shrink-0";
  switch (kind) {
    case "edited":
      return <PenLine className={`${cls} text-indigo-500`} />;
    case "planning":
      return <Brain className={`${cls} text-violet-500`} />;
    case "command":
      return <Terminal className={`${cls} text-slate-500`} />;
    case "success":
      return <CheckCircle2 className={`${cls} text-emerald-500`} />;
    default:
      return <BookOpen className={`${cls} text-slate-400`} />;
  }
}

function extractLatestStepDescription(sub: Subtask | null): string | null {
  if (!sub) return null;
  for (let i = sub.logs.length - 1; i >= 0; i--) {
    const l = sub.logs[i];
    if (isStepLog(l)) return stepLabel(l);
  }
  return null;
}

export default function TaskAccordion({ task, isInitiallyExpanded, isLocked, onCancelTask }: TaskAccordionProps) {
  const [isOpen, setIsOpen] = useState<boolean>(!!isInitiallyExpanded);
  const [openSubtask, setOpenSubtask] = useState<number | null>(
    task.status === "running" ? task.activeSubtaskIndex : null
  );

  const subtaskCount = task.subtasks?.length || 0;
  const currentSub = task.subtasks?.[task.activeSubtaskIndex] ?? null;
  const currentStepDesc = task.status === "running" ? extractLatestStepDescription(currentSub) : null;
  const totalSteps = task.subtasks.reduce((n, s) => n + (s.logs?.filter(isStepLog).length ?? 0), 0);

  const toggleSubtask = (idx: number) => {
    setOpenSubtask((cur) => (cur === idx ? null : idx));
  };

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-xs overflow-hidden">
      {/* Header */}
      <div className="p-3.5 flex items-center justify-between gap-3">
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((v) => !v)}
          disabled={isLocked}
          className="flex items-center gap-3 min-w-0 flex-1 text-left group"
        >
          <span className="p-1.5 rounded-md group-hover:bg-gray-50 text-gray-500 shrink-0">
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4 rotate-90" />}
          </span>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-gray-800 truncate" title={task.name}>
                {task.name}
              </span>

              {/* "N steps" badge pill (renamed from "N actions") */}
              <span className="text-[11px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full font-mono">
                {totalSteps > 0 ? totalSteps : subtaskCount} steps
              </span>

              {/* Status indicator: spinner + color while running, no "RUNNING" text badge */}
              <span className="inline-flex items-center">
                {task.status === "running" ? (
                  <RefreshCw className="h-4 w-4 animate-spin text-amber-500" aria-label="Running" />
                ) : task.status === "completed" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-label="Completed" />
                ) : task.status === "failed" ? (
                  <XCircle className="h-4 w-4 text-rose-500" aria-label="Failed" />
                ) : (
                  <Clock className="h-4 w-4 text-gray-300" aria-label="Pending" />
                )}
              </span>
            </div>

            {/* Current/latest step description shown live in the chip header while running */}
            {currentStepDesc && (
              <div className="mt-1 text-[12px] text-gray-500 truncate max-w-[36rem] font-mono">
                <span className="inline-block bg-gray-50 px-2 py-0.5 rounded-md text-[11px] text-gray-600">
                  {currentStepDesc}
                </span>
              </div>
            )}
          </div>
        </button>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-gray-400 font-mono">{task.progress}%</span>
          {task.status === "running" && (
            <button
              type="button"
              onClick={() => onCancelTask?.(task.id)}
              className="text-[11px] bg-rose-50 text-rose-600 px-2 py-1 rounded-xl font-bold hover:bg-rose-100"
            >
              Cancel
            </button>
          )}
          {/* Explicit text-labeled toggle, matching "Show less / Show more" */}
          <button
            type="button"
            onClick={() => setIsOpen((v) => !v)}
            className="text-[11px] font-semibold text-gray-500 hover:text-gray-800 flex items-center gap-1"
          >
            {isOpen ? "Show less" : "Show more"}
            {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Expanded content: flowing list of steps grouped as section dividers */}
      {isOpen && (
        <div className="border-t border-gray-100">
          <div className="p-3 space-y-2">
            {task.subtasks && task.subtasks.length > 0 ? (
              task.subtasks.map((sub, sIdx) => {
                const subOpen = openSubtask === sIdx;
                const latestStep = extractLatestStepDescription(sub);
                return (
                  <div key={sub.id} className="bg-gray-50 border border-gray-100 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleSubtask(sIdx)}
                      className="w-full p-3 flex items-start justify-between gap-3 text-left"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="mt-0.5 text-gray-500 shrink-0">
                          {subOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4 rotate-90" />}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-800 truncate" title={sub.name}>
                              {sub.name}
                            </span>
                            <span className="text-[11px] bg-white px-2 py-0.5 rounded-full text-gray-600 border border-gray-100 font-mono">
                              {sub.logs?.filter(Boolean).length ?? 0} logs
                            </span>
                            {sub.status === "running" && <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-500" />}
                            {sub.status === "completed" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                            {sub.status === "failed" && <XCircle className="h-3.5 w-3.5 text-rose-500" />}
                          </div>
                          {latestStep && (
                            <div className="mt-1 text-[12px] text-gray-500 truncate font-mono">
                              <span className="inline-block bg-white/70 px-2 py-0.5 rounded-sm">{latestStep}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => navigator.clipboard?.writeText(sub.code ?? "")}
                          className="text-gray-400 hover:text-gray-800 p-1.5 rounded-md hover:bg-white"
                          title="Copy code snippet"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => navigator.clipboard?.writeText(sub.logs?.join("\n") ?? "")}
                          className="text-gray-400 hover:text-gray-800 p-1.5 rounded-md hover:bg-white"
                          title="Copy logs"
                        >
                          <Terminal className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </button>

                    {subOpen && (
                      <div className="p-3 border-t border-gray-100 bg-white">
                        <div className="space-y-1.5 text-sm font-mono text-gray-700">
                          {sub.logs && sub.logs.length > 0 ? (
                            sub.logs.map((l, li) => {
                              if (isStepLog(l)) {
                                return (
                                  <div key={li} className="pt-3 first:pt-0">
                                    <div className="text-[11px] font-bold text-gray-600 uppercase tracking-wider border-b border-gray-100 pb-1.5">
                                      {stepLabel(l)}
                                    </div>
                                  </div>
                                );
                              }
                              const { kind, label } = classifyLog(l);
                              return (
                                <div key={li} className="flex items-center gap-2 py-1 text-[13px] text-gray-700 break-words">
                                  <LogIcon kind={kind} />
                                  <span>{label}</span>
                                </div>
                              );
                            })
                          ) : (
                            <div className="text-gray-400">No logs for this step yet.</div>
                          )}
                        </div>

                        {sub.code && (
                          <pre className="mt-3 bg-gray-900 text-gray-100 p-3 rounded-md overflow-auto text-xs">
                            <code>{sub.code}</code>
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-gray-400 text-sm">No subtasks defined for this task.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
