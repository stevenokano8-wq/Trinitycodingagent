import React, { useState, useEffect, useCallback } from "react";
import { Message, Task, FileNode } from "../types.js";
import { Database, ShieldAlert, Cpu, RefreshCw, Layers, Terminal, AlertCircle } from "lucide-react";

interface DbVisualizerProps {
  messages: Message[];
  tasks: Task[];
  files: FileNode[];
  onPurge: () => void;
}

interface KvEntry {
  key: string;
  val: string;
  ttl: string;
  type: string;
}

interface LogEntry {
  ts: string;
  level: string;
  msg: string;
}

interface DbStatusPayload {
  kv: KvEntry[];
  logs: LogEntry[];
  d1Status: string;
  kvStatus: string;
}

// Resolve the API base so the component works in local dev (port 3000 → 3000)
// and in production (same-origin sovereign-agent-api worker).
const API_BASE =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:3000"
    : "";

export default function DbVisualizer({ messages, tasks, files, onPurge }: DbVisualizerProps) {
  const [activeTab, setActiveTab] = useState<"sql_tables" | "kv_keys" | "logs">("sql_tables");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [kvEntries, setKvEntries]     = useState<KvEntry[]>([]);
  const [logLines,  setLogLines]      = useState<LogEntry[]>([]);
  const [d1Status,  setD1Status]      = useState<string>("—");
  const [kvStatus,  setKvStatus]      = useState<string>("—");
  const [fetchErr,  setFetchErr]      = useState<string | null>(null);

  const fetchLiveStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/db/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as DbStatusPayload;
      setKvEntries(data.kv   ?? []);
      setLogLines (data.logs ?? []);
      setD1Status (data.d1Status ?? "unknown");
      setKvStatus (data.kvStatus ?? "unknown");
      setFetchErr(null);
    } catch (e) {
      setFetchErr(String(e));
    }
  }, []);

  // Initial fetch + refresh on tab switch to kv_keys or logs
  useEffect(() => { fetchLiveStatus(); }, [fetchLiveStatus]);
  useEffect(() => {
    if (activeTab === "kv_keys" || activeTab === "logs") fetchLiveStatus();
  }, [activeTab, fetchLiveStatus]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchLiveStatus();
    setTimeout(() => setIsRefreshing(false), 600);
  };

  return (
    <div id="db-visualizer" className="flex flex-col flex-1 border border-gray-100 rounded-3xl bg-white overflow-hidden shadow-xs h-full min-h-[500px]">
      {/* Header toolbar */}
      <div className="bg-linear-to-b from-gray-50/50 to-white px-5 py-4 border-b border-gray-150 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl">
            <Database className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-gray-900 font-display">Sovereign DB Visualizer</h3>
            <p className="text-[10px] text-gray-500 font-mono">
              D1: <span className={d1Status === "ok" ? "text-emerald-600" : "text-amber-600"}>{d1Status}</span>
              &nbsp;·&nbsp;KV: <span className={kvStatus === "ok" ? "text-emerald-600" : "text-amber-600"}>{kvStatus}</span>
              &nbsp;·&nbsp;Live from sovereign-agent-api
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {fetchErr && (
            <span className="text-[10px] text-red-500 font-mono max-w-[140px] truncate" title={fetchErr}>
              <AlertCircle className="inline h-3 w-3 mr-1" />{fetchErr}
            </span>
          )}
          <button
            id="btn-db-refresh"
            onClick={handleRefresh}
            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition-all"
            title="Refresh tables"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin text-emerald-500" : ""}`} />
          </button>
          <button
            id="btn-db-purge"
            onClick={() => onPurge()}
            className="text-[10px] bg-red-50 text-red-600 hover:bg-red-100 px-3 py-1.5 rounded-xl border border-red-200 font-bold font-sans"
          >
            Flush Cluster
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 px-4 bg-gray-50/50">
        {[
          { id: "sql_tables", name: "D1 Tables (Relational SQL)" },
          { id: "kv_keys",    name: "Workers KV Key-Value Cache" },
          { id: "logs",       name: "System Log Output" },
        ].map(tab => (
          <button
            id={`tab-db-${tab.id}`}
            key={tab.id}
            onClick={() => setActiveTab(tab.id as "sql_tables" | "kv_keys" | "logs")}
            className={`px-4 py-3 text-xs font-bold border-b-2 transition-all font-mono ${
              activeTab === tab.id
                ? "border-emerald-500 text-emerald-700"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {tab.name}
          </button>
        ))}
      </div>

      {/* Body panel */}
      <div className="flex-1 p-5 overflow-y-auto">
        {activeTab === "sql_tables" ? (
          <div className="space-y-6">
            {/* Table: messages */}
            <div className="border border-gray-150 rounded-2xl overflow-hidden shadow-xs">
              <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-150 flex items-center justify-between text-xs font-bold text-gray-700 font-mono">
                <span>TABLE: messages</span>
                <span className="text-[10px] text-gray-400 font-normal">{messages.length} Rows</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="bg-gray-50/70 text-gray-500 text-[10px] uppercase tracking-wide">
                      <th className="px-3 py-2 font-semibold">id</th>
                      <th className="px-3 py-2 font-semibold">role</th>
                      <th className="px-3 py-2 font-semibold">content (truncated)</th>
                      <th className="px-3 py-2 font-semibold">timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {messages.slice(-8).map(m => (
                      <tr key={m.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-3 py-2 text-gray-400">{String(m.id).slice(0, 8)}…</td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            m.role === "user"      ? "bg-blue-50 text-blue-700"
                            : m.role === "assistant" ? "bg-purple-50 text-purple-700"
                            : "bg-gray-100 text-gray-600"
                          }`}>{m.role}</span>
                        </td>
                        <td className="px-3 py-2 text-gray-600 max-w-[200px] truncate">
                          {typeof m.content === "string" ? m.content.slice(0, 80) : JSON.stringify(m.content).slice(0, 80)}
                        </td>
                        <td className="px-3 py-2 text-gray-400">
                          {m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : "—"}
                        </td>
                      </tr>
                    ))}
                    {messages.length === 0 && (
                      <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">No messages yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Table: tasks */}
            <div className="border border-gray-150 rounded-2xl overflow-hidden shadow-xs">
              <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-150 flex items-center justify-between text-xs font-bold text-gray-700 font-mono">
                <span>TABLE: tasks</span>
                <span className="text-[10px] text-gray-400 font-normal">{tasks.length} Rows</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="bg-gray-50/70 text-gray-500 text-[10px] uppercase tracking-wide">
                      <th className="px-3 py-2 font-semibold">id</th>
                      <th className="px-3 py-2 font-semibold">title</th>
                      <th className="px-3 py-2 font-semibold">status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tasks.slice(-8).map(t => (
                      <tr key={t.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-3 py-2 text-gray-400">{String(t.id).slice(0, 8)}…</td>
                        <td className="px-3 py-2 text-gray-700 max-w-[200px] truncate">{t.title ?? t.id}</td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            t.status === "done"    ? "bg-emerald-50 text-emerald-700"
                            : t.status === "failed" ? "bg-red-50 text-red-600"
                            : t.status === "running"? "bg-amber-50 text-amber-700"
                            : "bg-gray-100 text-gray-600"
                          }`}>{t.status ?? "pending"}</span>
                        </td>
                      </tr>
                    ))}
                    {tasks.length === 0 && (
                      <tr><td colSpan={3} className="px-3 py-4 text-center text-gray-400">No tasks yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : activeTab === "kv_keys" ? (
          <div className="border border-gray-150 rounded-2xl overflow-hidden shadow-xs">
            <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-150 flex items-center justify-between text-xs font-bold text-gray-700 font-mono">
              <span>Workers KV — Live Cache Keys</span>
              <span className="text-[10px] text-gray-400">{kvEntries.length} keys</span>
            </div>
            <div className="divide-y divide-gray-100 text-xs font-mono">
              {kvEntries.length > 0 ? kvEntries.map(item => (
                <div key={item.key} className="p-3.5 flex items-center justify-between hover:bg-gray-50/50">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[10px] bg-red-50 text-red-600 border border-red-150 px-1.5 py-0.5 rounded font-bold font-mono">
                      {item.type}
                    </span>
                    <span className="font-semibold text-gray-800">{item.key}</span>
                  </div>
                  <div className="flex items-center gap-6">
                    <span className="text-gray-600 font-semibold">{item.val}</span>
                    <span className="text-[10px] text-gray-400 w-16 text-right">{item.ttl}</span>
                  </div>
                </div>
              )) : (
                <div className="p-6 text-center text-gray-400 text-xs">
                  {fetchErr ? `Error loading KV data: ${fetchErr}` : "No KV keys found or KV not bound in this environment."}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-gray-950 rounded-2xl p-4 text-xs font-mono text-gray-300 space-y-1 h-96 overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2 text-gray-500 text-[10px]">
              <span className="flex items-center gap-1.5">
                <Terminal className="h-4 w-4 text-emerald-500" />
                SOVEREIGN API — LIVE LOG OUTPUT
              </span>
              <span>{logLines.length} entries</span>
            </div>
            {logLines.length > 0 ? logLines.map((l, i) => (
              <div key={i} className={
                l.level === "error" ? "text-red-400"
                : l.level === "warn"  ? "text-amber-400"
                : l.level === "info"  ? "text-sky-400"
                : "text-gray-300"
              }>
                [{l.ts}] {l.level?.toUpperCase()} {l.msg}
              </div>
            )) : (
              <>
                <div>[boot] sovereign-agent-api worker initialised</div>
                <div className="text-emerald-400">[db] D1 binding: {d1Status}</div>
                <div className="text-sky-400">[kv] KV binding: {kvStatus}</div>
                {fetchErr && <div className="text-red-400">[error] {fetchErr}</div>}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
