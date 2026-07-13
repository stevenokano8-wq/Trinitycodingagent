import React, { useState, useMemo } from "react";
import { Task, Subtask } from "../types.js";
import { ChevronDown, ChevronRight, CheckCircle, RefreshCw, Clock, Copy, Terminal, Play } from "lucide-react";

interface TaskAccordionProps {
  tasks: Task[];
  // Optional callbacks so parent can react to user actions
  onCancelTask?: (taskId: string) => void;
  onOpenSubtask?: (taskId: string, subtaskIndex: number) => void;
}

function Spinner({ size = 14 }: { size?: number }) {
  return <RefreshCw className={`h-${size} w-${size} animate-spin text-amber-400`} />;
}

function extractLatestStepDescription(sub: Subtask): string | null {
  // Heuristic: treat logs that start with "STEP" or contain "step:" as step markers
  for (let i = sub.logs.length - 1; i >= 0; i--) {
    const l = sub.logs[i];
    if (!l) continue;
    const normalized = l.toLowerCase();
    if (normalized.startsWith("step") || normalized.includes("step:") || normalized.startsWith("[step]") ) {
      // Trim any leading marker and return human-friendly text
      return l.replace(/^\[?step\]?[:\-\s]*/i, "").trim();
    }
  }
  return null;
}

function isStepLog(line: string) {
  if (!line) return false;
  const l = line.toLowerCase();
  return l.startsWith("step") || l.startsWith("[step]") || l.includes("step:");
}

export default function TaskAccordion({ tasks, onCancelTask, onOpenSubtask }: TaskAccordionProps) {
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [openSubtask, setOpenSubtask] = useState<Record<string, number | null>>({});

  const toggleTask = (id: string) => setOpenTaskId((cur) => (cur === id ? null : id));
  const toggleSubtask = (taskId: string, idx: number) => {
    setOpenSubtask((prev) => ({ ...prev, [taskId]: prev[taskId] === idx ? null : idx }));
    onOpenSubtask?.(taskId, idx);
  };

  if (!tasks || tasks.length === 0) {
    return (
      <div className="p-4 text-sm text-gray-500 font-mono">No tasks available.</div>
    );
  }

  return (
    <div className="space-y-3">
      {tasks.map((task) => {
        const isOpen = openTaskId === task.id;
        const subtaskCount = task.subtasks?.length || 0;
        const currentSub = task.subtasks?.[task.activeSubtaskIndex] ?? null;
        const currentStepDesc = currentSub ? extractLatestStepDescription(currentSub) : null;

        return (
          <div key={task.id} className="bg-white border border-gray-100 rounded-2xl shadow-xs overflow-hidden">
            {/* Header */}
            <div className="p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  aria-expanded={isOpen}
                  onClick={() => toggleTask(task.id)}
                  className="p-2 rounded-md hover:bg-gray-50 text-gray-700"
                  title={isOpen ? "Collapse" : "Expand"}
                >
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-bold text-gray-800 truncate" title={task.name}>{task.name}</div>

                    {/* N steps badge pill */}
                    <div className="ml-1 text-[11px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full font-mono">
                      {subtaskCount} steps
                    </div>

                    {/* status indicator: spinner + color when running, check when completed */}
                    <div className="ml-2">
                      {task.status === "running" ? (
                        <div className="flex items-center gap-1 text-amber-400">
                          <RefreshCw className="h-4 w-4 animate-spin text-amber-400" />
                          <span className="sr-only">Running</span>
                        </div>
                      ) : task.status === "completed" ? (
                        <CheckCircle className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <Clock className="h-4 w-4 text-gray-400" />
                      )}
                    </div>

                  </div>

                  {/* current step description chip (latest step) */}
                  {currentStepDesc && (
                    <div className="mt-1 text-[12px] text-gray-500 truncate max-w-[48rem] font-mono">
                      <span className="inline-block bg-gray-50 px-2 py-0.5 rounded-md text-[11px] text-gray-600">{currentStepDesc}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-xs text-gray-500 font-mono">{task.progress}%</div>
                <div>
                  {/* Cancel button if running */}
                  {task.status === "running" && (
                    <button
                      id={`btn-cancel-${task.id}`}
                      onClick={() => onCancelTask?.(task.id)}
                      className="text-[11px] bg-rose-50 text-rose-600 px-2 py-1 rounded-xl font-bold hover:bg-rose-100"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Expanded content */}
            {isOpen && (
              <div className="border-t border-gray-100">
                <div className="p-3 space-y-3">
                  {/* Subtasks list */}
                  {task.subtasks && task.subtasks.length > 0 ? (
                    <div className="space-y-2">
                      {task.subtasks.map((sub, sIdx) => {
                        const subOpen = openSubtask[task.id] === sIdx;
                        const latestStep = extractLatestStepDescription(sub);
                        return (
                          <div key={sub.id} className="bg-gray-50 border border-gray-100 rounded-xl overflow-hidden">
                            <div className="p-3 flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3 min-w-0">
                                <button
                                  onClick={() => toggleSubtask(task.id, sIdx)}
                                  className="p-1.5 rounded-md hover:bg-gray-100 text-gray-700"
                                >
                                  {subOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                </button>

                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <div className="text-sm font-semibold text-gray-800 truncate" title={sub.name}>{sub.name}</div>

                                    <div className="text-[11px] bg-white px-2 py-0.5 rounded-full text-gray-600 border border-gray-100 font-mono">
                                      {sub.logs?.filter(Boolean).length ?? 0} steps
                                    </div>
                                  </div>

                                  {latestStep && (
                                    <div className="mt-1 text-[12px] text-gray-500 truncate font-mono">
                                      <span className="inline-block bg-white/30 px-2 py-0.5 rounded-sm">{latestStep}</span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => navigator.clipboard?.writeText(sub.code ?? "")}
                                  className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1 rounded-md"
                                  title="Copy code snippet"
                                >
                                  <Copy className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => navigator.clipboard?.writeText(sub.logs?.join("\n") ?? "")}
                                  className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1 rounded-md"
                                  title="Copy logs"
                                >
                                  <Terminal className="h-4 w-4" />
                                </button>
                              </div>
                            </div>

                            {/* Subtask expanded logs */}
                            {subOpen && (
                              <div className="p-3 border-t border-gray-100 bg-white">
                                <div className="space-y-2 text-sm font-mono text-gray-700">
                                  {sub.logs && sub.logs.length > 0 ? (
                                    sub.logs.map((l, li) => {
                                      if (isStepLog(l)) {
                                        // Render a step divider with label
                                        const label = l.replace(/^\[?step\]?[:\-\s]*/i, "");
                                        return (
                                          <div key={li} className="py-2">
                                            <div className="text-[12px] font-bold text-gray-600 uppercase tracking-wider border-b border-gray-100 pb-1">{label}</div>
                                          </div>
                                        );
                                      }
                                      return (
                                        <div key={li} className="py-1 text-[13px] text-gray-700 break-words">{l}</div>
                                      );
                                    })
                                  ) : (
                                    <div className="text-gray-500">No logs for this step yet.</div>
                                  )}
                                </div>

                                {/* Code block preview */}
                                {sub.code && (
                                  <pre className="mt-3 bg-gray-900 text-gray-100 p-3 rounded-md overflow-auto text-xs">
                                    <code>{sub.code}</code>
                                  </pre>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-gray-500">No subtasks defined for this task.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
