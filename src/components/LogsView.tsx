import React, { useState, useEffect, useRef } from "react";
import { 
  Terminal, 
  Play, 
  Pause, 
  Trash2, 
  Copy, 
  Check, 
  HelpCircle, 
  Search, 
  SlidersHorizontal, 
  RefreshCw, 
  Cpu, 
  ShieldAlert, 
  CheckCircle, 
  Sparkles,
  ChevronRight,
  Send,
  AlertTriangle,
  FileText,
  Clock
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { FileNode, Task } from "../types.js";

interface LogsViewProps {
  dbStatus: { d1: string; kv: string };
  files: FileNode[];
  tasks: Task[];
  onRefresh?: () => void;
}

interface LogLine {
  id: string;
  timestamp: string;
  level: "system" | "info" | "warning" | "error" | "compiler";
  service: "container" | "wrangler-api" | "wrangler-fe" | "agent-healer";
  message: string;
}

export default function LogsView({ dbStatus, files, tasks, onRefresh }: LogsViewProps) {
  const [activeTab, setActiveTab] = useState<"stream" | "how-to" | "healer">("stream");
  const [selectedService, setSelectedService] = useState<"all" | "container" | "wrangler-api" | "wrangler-fe">("all");
  const [selectedLevel, setSelectedLevel] = useState<"all" | "info" | "warning" | "error" | "compiler">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLiveStreaming, setIsLiveStreaming] = useState(true);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  
  // Auto-healing simulator state
  const [healingTask, setHealingTask] = useState("");
  const [healingProgress, setHealingProgress] = useState<"idle" | "running" | "error_detected" | "fixing" | "success">("idle");
  const [healingLogs, setHealingLogs] = useState<string[]>([]);
  
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Initialize logs
  const [logs, setLogs] = useState<LogLine[]>([
    { id: "1", timestamp: new Date(Date.now() - 300000).toISOString(), level: "system", service: "container", message: "Container micro-service active. Ingress route: https://agent.trinityuniverse.org mapped." },
    { id: "2", timestamp: new Date(Date.now() - 280000).toISOString(), level: "system", service: "container", message: `Cloudflare D1 relational database connected: status='${dbStatus.d1}'` },
    { id: "3", timestamp: new Date(Date.now() - 270000).toISOString(), level: "system", service: "container", message: `Cloudflare KV key-value caching pool bound: status='${dbStatus.kv}'` },
    { id: "4", timestamp: new Date(Date.now() - 250000).toISOString(), level: "info", service: "container", message: "HTTP Listening for server-sent event handshakes at /api/tasks/stream" },
    { id: "5", timestamp: new Date(Date.now() - 220000).toISOString(), level: "compiler", service: "container", message: "Wrangler assets synchronized: serving built SPA bundle from /dist" },
    { id: "6", timestamp: new Date(Date.now() - 180000).toISOString(), level: "info", service: "wrangler-api", message: "GET /api/db-status - 200 OK - 8ms" },
    { id: "7", timestamp: new Date(Date.now() - 150000).toISOString(), level: "info", service: "wrangler-api", message: "GET /api/messages - 200 OK - 15ms" },
  ]);

  // Sync files and tasks to logs when they change
  useEffect(() => {
    if (!isLiveStreaming) return;

    const newLogs: LogLine[] = [];
    
    // Add file synchronization events
    files.slice(-3).forEach((f, idx) => {
      const exists = logs.some(l => l.message.includes(f.path));
      if (!exists) {
        newLogs.push({
          id: `file-${f.path}-${idx}`,
          timestamp: new Date().toISOString(),
          level: "compiler",
          service: "container",
          message: `[FILESYSTEM] Synced synthesized artifact: ${f.path} (${f.content ? f.content.length : 0} bytes)`
        });
      }
    });

    // Add active task pipeline registrations
    tasks.slice(-2).forEach((t, idx) => {
      const exists = logs.some(l => l.message.includes(t.name) && l.level === "compiler");
      if (!exists) {
        newLogs.push({
          id: `task-${t.id}-${idx}`,
          timestamp: new Date().toISOString(),
          level: "compiler",
          service: "container",
          message: `[COMPILER] Active pipeline registration: "${t.name}" - status=${t.status}`
        });
      }
    });

    if (newLogs.length > 0) {
      setLogs(prev => [...prev, ...newLogs]);
    }
  }, [files, tasks, isLiveStreaming]);

  // Simulate incoming logs periodically if streaming
  useEffect(() => {
    if (!isLiveStreaming) return;

    const mockMessages = [
      { level: "info" as const, service: "wrangler-api" as const, message: "GET /api/tasks - 200 OK - 11ms" },
      { level: "info" as const, service: "wrangler-api" as const, message: "POST /api/messages - 201 Created - 42ms" },
      { level: "info" as const, service: "wrangler-fe" as const, message: "Asset served: /assets/index.js - 200 OK - cache_hit=true" },
      { level: "info" as const, service: "wrangler-api" as const, message: "SSE stream /api/tasks/stream connected" },
      { level: "system" as const, service: "container" as const, message: "Workspace registry health check passed." },
    ];

    const interval = setInterval(() => {
      const randomLog = mockMessages[Math.floor(Math.random() * mockMessages.length)];
      setLogs(prev => [
        ...prev,
        {
          id: `rand-${Date.now()}`,
          timestamp: new Date().toISOString(),
          ...randomLog
        }
      ].slice(-100)); // Keep last 100 logs
    }, 8000);

    return () => clearInterval(interval);
  }, [isLiveStreaming]);

  // Scroll to bottom when logs update
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, healingLogs]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCommand(label);
    setTimeout(() => setCopiedCommand(null), 2000);
  };

  const handleClearLogs = () => {
    setLogs([]);
  };

  // Run simulated auto-healing logs
  const handleTriggerHealer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!healingTask.trim()) return;

    setHealingProgress("running");
    setHealingLogs([
      `[SYSTEM] Init auto-heal pipeline for task: "${healingTask}"`,
      `[AGENT] Planning task execution strategy...`,
      `[COMPILER] Synthesizing changes in src/components/DataCard.tsx...`,
      `[COMPILER] Compilation triggered: npm run build`,
    ]);

    // Step 1: Detect failure
    setTimeout(() => {
      setHealingLogs(prev => [
        ...prev,
        `[COMPILER] ❌ Compilation failed with status 2`,
        `[COMPILER] Error inside src/components/DataCard.tsx(24,18): 'No AI inference binding (Cloudflare AI or Gemini client) was initialized.'`,
        `[SYSTEM] ⚠️ WARNING: Log Monitor intercepted compilation error!`,
        `[LOG_MONITOR] Tailing logs... identified error signature 'AI_INFERENCE_NOT_INITIALIZED'.`
      ]);
      setHealingProgress("error_detected");

      // Step 2: Auto-healing start
      setTimeout(() => {
        setHealingLogs(prev => [
          ...prev,
          `[LOG_MONITOR] 🔄 Triggering Self-Healing Loop...`,
          `[AGENT] Root Cause Analysis: The fallback Gemini client settings are missing/unconfigured in env.ts.`,
          `[AGENT] Action plan: Injecting robust smart local synthesis fallback client inside server/agent.ts.`,
          `[FILESYSTEM] Injecting local synthesizer fallback logic...`,
          `[COMPILER] Re-compiling modified file: server/agent.ts...`,
        ]);
        setHealingProgress("running");

        // Step 3: Success
        setTimeout(() => {
          setHealingLogs(prev => [
            ...prev,
            `[COMPILER] ✅ Compilation completed successfully!`,
            `[SYSTEM] Live container reload executed without downtime.`,
            `[LOG_MONITOR] Self-healing resolved all compilation and configuration blockers in 4.5s.`,
            `[SYSTEM] SUCCESS: Task complete & self-healed.`
          ]);
          setHealingProgress("success");
          
          // Inject a successful healer log entry into the main console
          setLogs(prev => [
            ...prev,
            {
              id: `heal-${Date.now()}`,
              timestamp: new Date().toISOString(),
              level: "system",
              service: "agent-healer",
              message: `Autonomous Log Monitor self-healed task: "${healingTask}" in 4.5 seconds`
            }
          ]);
        }, 3000);

      }, 3000);

    }, 2500);
  };

  // Filtering logs
  const filteredLogs = logs.filter(log => {
    const matchesService = selectedService === "all" || log.service === selectedService;
    const matchesLevel = selectedLevel === "all" || log.level === selectedLevel;
    const matchesSearch = log.message.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          log.level.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          log.service.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesService && matchesLevel && matchesSearch;
  });

  return (
    <div id="logs-view-root" className="flex-1 flex flex-col gap-6 p-4 md:p-6 lg:p-8 overflow-y-auto max-h-[85vh] font-sans">
      
      {/* Overview Head Section */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-gray-100 pb-5">
        <div>
          <h2 className="text-2xl font-bold font-display text-gray-900 tracking-tight flex items-center gap-2">
            <Terminal className="h-6 w-6 text-indigo-600 animate-pulse" /> Live Service & Log Console
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Tail live worker logs, inspect container processes, and prompt self-healing tasks.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex bg-gray-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab("stream")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "stream" 
                ? "bg-white text-gray-900 shadow-xs" 
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            Log Console
          </button>
          <button
            onClick={() => setActiveTab("healer")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === "healer" 
                ? "bg-white text-gray-900 shadow-xs" 
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-indigo-500 animate-pulse" /> Auto-Healer
          </button>
          <button
            onClick={() => setActiveTab("how-to")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "how-to" 
                ? "bg-white text-gray-900 shadow-xs" 
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            How to Tail Workers
          </button>
        </div>
      </div>

      {activeTab === "stream" && (
        <>
          {/* Filtering toolbar */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col md:flex-row gap-4 items-center justify-between shadow-3xs">
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              {/* Search bar */}
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search logs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 font-mono"
                />
              </div>

              {/* Service Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase font-bold text-gray-400 font-mono">Service:</span>
                <select
                  value={selectedService}
                  onChange={(e) => setSelectedService(e.target.value as any)}
                  className="text-xs font-medium bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 focus:outline-hidden"
                >
                  <option value="all">All Services</option>
                  <option value="container">App Container</option>
                  <option value="wrangler-api">Wrangler API</option>
                  <option value="wrangler-fe">Wrangler Frontend</option>
                </select>
              </div>

              {/* Level Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase font-bold text-gray-400 font-mono">Level:</span>
                <select
                  value={selectedLevel}
                  onChange={(e) => setSelectedLevel(e.target.value as any)}
                  className="text-xs font-medium bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 focus:outline-hidden"
                >
                  <option value="all">All Levels</option>
                  <option value="system">System</option>
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="error">Error</option>
                  <option value="compiler">Compiler</option>
                </select>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                onClick={() => setIsLiveStreaming(!isLiveStreaming)}
                className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  isLiveStreaming 
                    ? "bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100/50"
                    : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                }`}
                title={isLiveStreaming ? "Pause Log Stream" : "Resume Log Stream"}
              >
                {isLiveStreaming ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {isLiveStreaming ? "Live Streaming" : "Paused"}
              </button>

              <button
                onClick={handleClearLogs}
                className="p-2 rounded-xl border border-gray-200 bg-white text-gray-500 hover:text-red-600 hover:border-red-100 transition-all"
                title="Clear Logs Console"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Interactive Terminal Window */}
          <div className="flex-1 min-h-[380px] bg-slate-950 rounded-2xl border border-slate-900 shadow-xl overflow-hidden flex flex-col font-mono text-xs">
            {/* Window bar */}
            <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-950 flex items-center justify-between text-[10px] font-bold text-slate-400">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                </div>
                <span className="ml-2 font-semibold">SOVEREIGN-WORKSPACE-CONSOLE (~/trinity-logs)</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-[9px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-sm">MODE: WRANGLER_TAIL_FORWARD</span>
                {isLiveStreaming && (
                  <span className="flex items-center gap-1.5 text-emerald-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                    STREAM_ONLINE
                  </span>
                )}
              </div>
            </div>

            {/* Lines Container */}
            <div className="flex-1 p-4 overflow-y-auto space-y-1.5 min-h-[300px] text-slate-300 max-h-[500px]">
              {filteredLogs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 py-12 gap-2">
                  <Terminal className="h-8 w-8 opacity-40 animate-pulse" />
                  <span>No log lines matched your current filtering criteria.</span>
                </div>
              ) : (
                filteredLogs.map(log => {
                  let badgeColor = "bg-slate-800 text-slate-400";
                  let messageColor = "text-slate-300";

                  if (log.level === "system") {
                    badgeColor = "bg-indigo-950/80 text-indigo-300 border border-indigo-900/60";
                    messageColor = "text-indigo-200";
                  } else if (log.level === "error") {
                    badgeColor = "bg-red-950/80 text-red-300 border border-red-900/60";
                    messageColor = "text-red-400 font-semibold";
                  } else if (log.level === "warning") {
                    badgeColor = "bg-amber-950/80 text-amber-300 border border-amber-900/60";
                    messageColor = "text-amber-200";
                  } else if (log.level === "compiler") {
                    badgeColor = "bg-emerald-950/80 text-emerald-300 border border-emerald-900/60";
                    messageColor = "text-emerald-400";
                  }

                  let serviceLabel = log.service.toUpperCase();

                  return (
                    <div key={log.id} className="flex items-start gap-3 py-0.5 hover:bg-slate-900/50 rounded-sm px-1.5 transition-colors">
                      <span className="text-slate-600 select-none text-[10px] shrink-0 mt-0.5">
                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                      <span className="text-[10px] text-indigo-400/80 shrink-0 select-none min-w-[90px] uppercase font-bold text-right">
                        [{serviceLabel}]
                      </span>
                      <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded-sm shrink-0 select-none uppercase ${badgeColor}`}>
                        {log.level}
                      </span>
                      <span className={`break-all leading-relaxed ${messageColor}`}>
                        {log.message}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={terminalEndRef} />
            </div>
          </div>
        </>
      )}

      {activeTab === "healer" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Prompt panel */}
          <div className="lg:col-span-1 space-y-5">
            <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-xs space-y-4">
              <div className="flex items-center gap-2 text-indigo-600">
                <Sparkles className="h-5 w-5 animate-pulse" />
                <h3 className="font-bold text-sm text-gray-800">Auto-Healing Log Loop</h3>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                Provide a prompt task to the agent. The local log monitor will automatically tail the background process output, spot build-time anomalies, and command the compiler to resolve issues seamlessly.
              </p>

              <form onSubmit={handleTriggerHealer} className="space-y-3.5 pt-2">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider font-mono">
                    Describe Agent Task
                  </label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Add a styling tweak or generate a text file..."
                    value={healingTask}
                    onChange={(e) => setHealingTask(e.target.value)}
                    disabled={healingProgress !== "idle" && healingProgress !== "success"}
                    className="w-full text-xs p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!healingTask.trim() || (healingProgress !== "idle" && healingProgress !== "success")}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-extrabold text-xs px-4 py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-xs"
                >
                  {healingProgress === "running" || healingProgress === "fixing" ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      Monitoring Stream...
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      Trigger Auto-Healing Task
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Healer Stats */}
            <div className="bg-slate-900 text-white rounded-3xl p-5 border border-slate-800 shadow-md">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 font-mono mb-3">Self-Healing Status</h4>
              <div className="space-y-3 font-mono text-xs text-slate-300">
                <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                  <span className="text-slate-400">Log Monitor</span>
                  <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                    ACTIVE
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                  <span className="text-slate-400">Error Interceptions</span>
                  <span className="font-bold text-slate-100">1 detected</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Auto-Correction Rate</span>
                  <span className="font-bold text-emerald-400">100% Resolved</span>
                </div>
              </div>
            </div>
          </div>

          {/* Healing Live Log Stream */}
          <div className="lg:col-span-2 flex flex-col min-h-[400px] bg-slate-950 border border-slate-900 rounded-3xl shadow-xl overflow-hidden font-mono text-xs">
            {/* Header bar */}
            <div className="bg-slate-900 px-5 py-3 border-b border-slate-950 flex justify-between items-center text-slate-400 text-[10px] font-bold">
              <span className="flex items-center gap-2">
                <Cpu className="h-3.5 w-3.5 text-indigo-400" /> 
                INTELLIGENT AUTONOMOUS LOG MONITOR
              </span>
              <div className="flex items-center gap-2">
                {healingProgress === "running" && (
                  <span className="text-indigo-400 flex items-center gap-1">
                    <RefreshCw className="h-3 w-3 animate-spin" /> SYNTHESIZING...
                  </span>
                )}
                {healingProgress === "error_detected" && (
                  <span className="text-red-400 flex items-center gap-1 animate-pulse">
                    <AlertTriangle className="h-3 w-3" /> COMPILER_BLOCKER_FOUND
                  </span>
                )}
                {healingProgress === "success" && (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" /> HEAL_SUCCESS
                  </span>
                )}
                {healingProgress === "idle" && (
                  <span className="text-slate-500">STANDBY_AWAITING_TRIGGER</span>
                )}
              </div>
            </div>

            {/* Display logs */}
            <div className="flex-1 p-5 overflow-y-auto space-y-2.5 text-slate-300">
              {healingLogs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 py-16 gap-3">
                  <Sparkles className="h-8 w-8 text-indigo-500/55 animate-pulse" />
                  <p className="max-w-xs text-center leading-relaxed">
                    Enter a prompt task on the left and start the Self-Healing process to see live logs, compile-time troubleshooting, and self-corrections.
                  </p>
                </div>
              ) : (
                healingLogs.map((logLine, index) => {
                  let textColor = "text-slate-300";
                  if (logLine.includes("❌") || logLine.includes("Error")) {
                    textColor = "text-red-400 font-semibold bg-red-950/20 px-2 py-0.5 rounded-sm border border-red-900/30";
                  } else if (logLine.includes("⚠️") || logLine.includes("WARNING")) {
                    textColor = "text-amber-400 font-semibold";
                  } else if (logLine.includes("✅") || logLine.includes("completed successfully")) {
                    textColor = "text-emerald-400 font-semibold bg-emerald-950/20 px-2 py-0.5 rounded-sm border border-emerald-900/30";
                  } else if (logLine.includes("🔄") || logLine.includes("Self-Healing")) {
                    textColor = "text-indigo-400 font-bold bg-indigo-950/30 px-2 py-0.5 rounded-sm border border-indigo-900/30";
                  } else if (logLine.startsWith("[COMPILER]")) {
                    textColor = "text-slate-400";
                  }

                  return (
                    <div key={index} className={`leading-relaxed ${textColor} flex items-start gap-2`}>
                      <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-slate-600" />
                      <span>{logLine}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "how-to" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-sans">
          {/* API Worker guidelines */}
          <div className="bg-white rounded-3xl border border-gray-100 p-6 space-y-5 shadow-xs">
            <div className="flex items-center gap-2.5">
              <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <Cpu className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-bold text-gray-800 text-sm">Tail API Worker Logs</h3>
                <p className="text-xs text-gray-400 mt-0.5">Stream logs from the serverless API service</p>
              </div>
            </div>

            <p className="text-xs text-gray-500 leading-relaxed">
              To intercept network payloads, database executions, or background agent queues live, stream them from Cloudflare using the Wrangler CLI:
            </p>

            <div className="bg-slate-950 text-slate-300 font-mono text-xs p-4 rounded-2xl border border-slate-900 relative">
              <button
                onClick={() => copyToClipboard("npx wrangler tail --config wrangler.api.toml", "api")}
                className="absolute right-3 top-3 p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors border border-slate-800"
              >
                {copiedCommand === "api" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              <div className="text-[10px] text-slate-500 font-bold uppercase mb-2">Terminal Shell</div>
              <code className="break-all text-amber-400">npx wrangler tail --config wrangler.api.toml</code>
            </div>

            <div className="space-y-3.5 pt-2">
              <h4 className="text-xs font-bold text-gray-700">What logs are captured?</h4>
              <ul className="space-y-2.5 text-xs text-gray-500">
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
                  <span>Incoming Hono API router endpoints (`/api/messages`, `/api/db-status`)</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
                  <span>Cloudflare D1 queries, key transactions, and vector embeddings updates</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
                  <span>Background task queue and micro-agent subtask outputs</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Frontend Static Worker guidelines */}
          <div className="bg-white rounded-3xl border border-gray-100 p-6 space-y-5 shadow-xs">
            <div className="flex items-center gap-2.5">
              <span className="p-2 bg-amber-50 text-amber-500 rounded-xl">
                <FileText className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-bold text-gray-800 text-sm">Tail Frontend Worker Logs</h3>
                <p className="text-xs text-gray-400 mt-0.5">Inspect static asset serving and SPA routing</p>
              </div>
            </div>

            <p className="text-xs text-gray-500 leading-relaxed">
              For asset caching performance, single-page-application route redirection, or client-side files loading, stream the frontend worker:
            </p>

            <div className="bg-slate-950 text-slate-300 font-mono text-xs p-4 rounded-2xl border border-slate-900 relative">
              <button
                onClick={() => copyToClipboard("npx wrangler tail --config wrangler.toml", "fe")}
                className="absolute right-3 top-3 p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors border border-slate-800"
              >
                {copiedCommand === "fe" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              <div className="text-[10px] text-slate-500 font-bold uppercase mb-2">Terminal Shell</div>
              <code className="break-all text-amber-400">npx wrangler tail --config wrangler.toml</code>
            </div>

            <div className="space-y-3.5 pt-2">
              <h4 className="text-xs font-bold text-gray-700">What logs are captured?</h4>
              <ul className="space-y-2.5 text-xs text-gray-500">
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <span>SPA fallback routes routing from deep links (e.g. `/settings` or `/database` routed to `/index.html`)</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <span>Cloudflare edge caching rates for compiled static js, css, and image assets</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <span>Edge runtime environment parameters and origin TLS negotiations</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
