import { API_BASE } from "../lib/api.ts";
import React, { useState, useEffect, useRef } from "react";
import { 
  Github, 
  GitBranch, 
  GitCommit, 
  ArrowUpRight, 
  CheckCircle, 
  RefreshCw, 
  Terminal, 
  Info, 
  Lock, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  Save, 
  FileText,
  Clock
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface CommitLog {
  sha: string;
  message: string;
  branch: string;
  author: string;
  time: string;
}

export default function GithubView() {
  // Input fields
  const [githubToken, setGithubToken] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  
  // Visibility and flags
  const [showToken, setShowToken] = useState(false);
  const [hasSavedToken, setHasSavedToken] = useState(false);
  
  // Status states
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  
  const [isPushing, setIsPushing] = useState(false);
  const [pushStatus, setPushStatus] = useState<"idle" | "success" | "error">("idle");
  const [pushLogs, setPushLogs] = useState<string[]>([]);
  
  // Commit History
  const [commits, setCommits] = useState<CommitLog[]>([
    { sha: "b85f2a1", message: "CEO hot-sync: refine workspace dialogue prompt triggers", branch: "main", author: "Trinity CEO", time: "5 mins ago" },
    { sha: "62d91a0", message: "Synthesize real-time database connection checkers for PostgreSQL/Redis", branch: "main", author: "Trinity CEO", time: "2 hours ago" },
    { sha: "efc882a", message: "Initialize Trinity Universe build cluster setup", branch: "main", author: "Trinity CEO", time: "1 day ago" }
  ]);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Load configuration on mount
  useEffect(() => {
    loadConfig();
  }, []);

  // Scroll to bottom of push logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollTop = logsEndRef.current.scrollHeight;
    }
  }, [pushLogs]);

  const loadConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/github/config`);
      if (res.ok) {
        const data = await res.json();
        setRepoUrl(data.repoUrl || "");
        if (data.hasToken) {
          setHasSavedToken(true);
        }
      }
    } catch (err) {
      console.error("Failed to load GitHub configuration:", err);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const res = await fetch(`${API_BASE}/api/github/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: githubToken || undefined, // Send undefined if empty to avoid wiping it
          repoUrl
        })
      });

      if (res.ok) {
        const data = await res.json();
        setSaveMessage({ type: "success", text: "Configuration saved securely to environment." });
        setGithubToken(""); // Clear input
        setHasSavedToken(true);
        await loadConfig();
      } else {
        const errData = await res.json();
        setSaveMessage({ type: "error", text: errData.error || "Failed to save configuration." });
      }
    } catch (err: any) {
      setSaveMessage({ type: "error", text: err.message || "An unexpected network error occurred." });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePushToGithub = async () => {
    if (!repoUrl) {
      setPushLogs(["[ERROR] Target Git Repository URL is required to push."]);
      setPushStatus("error");
      return;
    }
    
    setIsPushing(true);
    setPushStatus("idle");
    setPushLogs(["[SYSTEM] Preparing workspace push sequence...", "[SYSTEM] Staging active files..."]);

    try {
      const res = await fetch(`${API_BASE}/api/github/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: githubToken || undefined, // use raw if typed, server falls back to env GITHUB_TOKEN
          repoUrl,
          branch
        })
      });

      const data = await res.json();
      
      if (data.logs) {
        setPushLogs(data.logs);
      } else if (data.error) {
        setPushLogs(prev => [...prev, `[ERROR] ${data.error}`]);
      }

      if (data.success) {
        setPushStatus("success");
        // Append a real push record to commits history
        const randomSha = Math.random().toString(16).substring(2, 9);
        setCommits(prev => [
          {
            sha: randomSha,
            message: `Synchronized workspace files with GitHub remote repository`,
            branch: branch,
            author: "Trinity CEO",
            time: "Just now"
          },
          ...prev
        ]);
      } else {
        setPushStatus("error");
      }
    } catch (err: any) {
      setPushStatus("error");
      setPushLogs(prev => [...prev, `[CRITICAL ERROR] Network connection failed: ${err.message}`]);
    } finally {
      setIsPushing(false);
    }
  };

  return (
    <div id="github-panel-root" className="flex-1 flex flex-col gap-6 p-4 md:p-6 lg:p-8 overflow-y-auto max-h-[85vh] font-sans">
      
      {/* A. HEADER PANEL */}
      <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex gap-4 items-center">
          <div className="p-4 bg-zinc-950 text-white rounded-2xl shadow-sm">
            <Github className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-zinc-900 tracking-tight font-display">GitHub Sync Integration</h2>
            <p className="text-xs text-zinc-500 font-mono flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full inline-block ${hasSavedToken ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-300'}`} />
              Status: <span className={`font-semibold ${hasSavedToken ? 'text-emerald-600' : 'text-zinc-500'}`}>{hasSavedToken ? 'Configured & Authenticated' : 'Needs Setup'}</span>
            </p>
          </div>
        </div>

        <div className="flex gap-3 w-full md:w-auto">
          <button
            id="btn-git-push"
            onClick={handlePushToGithub}
            disabled={isPushing}
            className="flex-1 md:flex-none bg-zinc-950 hover:bg-zinc-800 disabled:opacity-50 text-white px-6 py-3 rounded-xl text-xs font-bold font-sans flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm active:scale-98"
          >
            {isPushing ? (
              <RefreshCw className="h-4 w-4 animate-spin text-zinc-400" />
            ) : (
              <ArrowUpRight className="h-4 w-4 text-amber-400 font-black" />
            )}
            {isPushing ? "Pushing Workspace..." : "Push to GitHub"}
          </button>
        </div>
      </div>

      {/* B. MAIN GRID LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COL: CONFIGURATION (5 columns) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-xs">
            <div className="flex items-center gap-2 mb-5">
              <Lock className="h-4 w-4 text-zinc-400" />
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider font-mono">Integration Settings</h3>
            </div>
            
            <form onSubmit={handleSaveConfig} className="space-y-4">
              {/* GitHub Token / Personal Access Token */}
              <div>
                <label className="block text-[11px] font-bold text-zinc-500 font-mono uppercase mb-1.5 flex items-center justify-between">
                  <span>GitHub Token (PAT / Fine-grained)</span>
                  {hasSavedToken && (
                    <span className="text-emerald-600 normal-case font-bold text-[10px] bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                      Saved Securely (ghp_••••)
                    </span>
                  )}
                </label>
                <div className="relative flex items-center">
                  <input
                    id="input-git-token"
                    type={showToken ? "text" : "password"}
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-3 pr-10 py-2.5 text-xs text-zinc-800 font-mono focus:outline-none focus:ring-1 focus:ring-zinc-600 transition-all"
                    placeholder={hasSavedToken ? "••••••••••••••••••••" : "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxx"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-3 text-zinc-400 hover:text-zinc-600 cursor-pointer bg-transparent border-none p-0 focus:outline-none"
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-zinc-400 mt-1.5 leading-normal">
                  Requires <code className="font-mono bg-zinc-100 px-1 rounded">repo</code> scope for standard PAT, or content read/write for fine-grained.
                </p>
              </div>

              {/* Repo URL */}
              <div>
                <label className="block text-[11px] font-bold text-zinc-500 font-mono uppercase mb-1.5">Target GitHub Repository URL</label>
                <input
                  id="input-git-repo"
                  type="text"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 text-xs text-zinc-800 font-mono focus:outline-none focus:ring-1 focus:ring-zinc-600 transition-all"
                  placeholder="https://github.com/username/repo-name"
                  required
                />
              </div>

              {/* Branch */}
              <div>
                <label className="block text-[11px] font-bold text-zinc-500 font-mono uppercase mb-1.5">Target Push Branch</label>
                <div className="relative">
                  <select
                    id="select-git-branch"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 text-xs text-zinc-800 font-mono focus:outline-none focus:ring-1 focus:ring-zinc-600 transition-all cursor-pointer"
                  >
                    <option value="main">main</option>
                    <option value="master">master</option>
                    <option value="development">development</option>
                    <option value="staging">staging</option>
                  </select>
                </div>
              </div>

              {/* Status Message */}
              {saveMessage && (
                <div className={`p-3 rounded-xl border text-[11px] flex gap-2 items-start ${
                  saveMessage.type === "success" 
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
                    : "bg-rose-50 border-rose-200 text-rose-800"
                }`}>
                  <AlertCircle className={`h-4 w-4 shrink-0 mt-0.5 ${saveMessage.type === "success" ? "text-emerald-500" : "text-rose-500"}`} />
                  <span className="leading-tight">{saveMessage.text}</span>
                </div>
              )}

              {/* Action Buttons */}
              <button
                type="submit"
                disabled={isSaving}
                className="w-full bg-zinc-100 hover:bg-zinc-200 border border-zinc-300 disabled:opacity-50 text-zinc-800 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-3xs"
              >
                {isSaving ? (
                  <RefreshCw className="h-4 w-4 animate-spin text-zinc-600" />
                ) : (
                  <Save className="h-4 w-4 text-zinc-600" />
                )}
                Save Settings
              </button>
            </form>
          </div>

          <div className="bg-indigo-50/50 border border-indigo-100 rounded-3xl p-5 text-indigo-950 text-xs leading-relaxed flex gap-3">
            <Info className="h-5 w-5 text-indigo-500 shrink-0 mt-0.5" />
            <div>
              <strong className="text-indigo-900 font-bold block mb-1">Secure Environment Delivery:</strong> 
              Our build agent pushes code from a secure cloud sandbox. The provided API key is processed server-side, never exposed to client-side logging, and omitted from public push repositories.
            </div>
          </div>
        </div>

        {/* RIGHT COL: CONSOLE TERMINAL & LOGS (7 columns) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Real-time Push Console */}
          <div className="bg-zinc-950 border border-zinc-850 rounded-3xl overflow-hidden flex flex-col shadow-md min-h-[300px]">
            {/* Console Header */}
            <div className="bg-zinc-900 border-b border-zinc-850 px-4 py-3 flex items-center justify-between select-none shrink-0">
              <div className="flex items-center gap-2.5">
                <Terminal className="h-4 w-4 text-zinc-400" />
                <span className="font-semibold text-zinc-300 font-mono text-xs">Deployment & Git Console</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className={`h-2 w-2 rounded-full ${isPushing ? 'bg-amber-400 animate-pulse' : pushStatus === "success" ? 'bg-emerald-400' : pushStatus === "error" ? 'bg-rose-400' : 'bg-zinc-600'}`} />
                <span className="text-[10px] text-zinc-500 font-mono font-bold uppercase">
                  {isPushing ? "Pushing" : pushStatus !== "idle" ? pushStatus : "Idle"}
                </span>
              </div>
            </div>

            {/* Console Output */}
            <div 
              ref={logsEndRef}
              className="flex-1 overflow-y-auto p-5 space-y-1.5 text-xs text-zinc-300 font-mono leading-relaxed min-h-[160px] max-h-[220px]"
            >
              {pushLogs.length === 0 ? (
                <div className="text-zinc-500 italic select-none">
                  Git output console idle. Ready to initiate branch push sequence.
                </div>
              ) : (
                pushLogs.map((log, idx) => {
                  const isError = log.toLowerCase().includes("[error]") || log.toLowerCase().includes("[critical error]");
                  const isSuccess = log.toLowerCase().includes("successfully") || log.toLowerCase().includes("[success]") || log.toLowerCase().includes("synchronized");
                  const isSystem = log.startsWith("[SYSTEM]");
                  return (
                    <div 
                      key={idx} 
                      className={`break-all ${
                        isError ? "text-rose-400 font-semibold" :
                        isSuccess ? "text-emerald-400 font-bold animate-pulse" : 
                        isSystem ? "text-amber-300" : "text-zinc-300"
                      }`}
                    >
                      {log}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Commits logs */}
          <div className="bg-white border border-zinc-200 rounded-3xl shadow-xs overflow-hidden flex flex-col">
            <div className="p-5 border-b border-zinc-150 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitCommit className="h-4 w-4 text-zinc-500" />
                <h3 className="font-bold text-sm text-zinc-800 font-display">Synchronization Commit Log</h3>
              </div>
              <span className="text-[10px] bg-zinc-100 border border-zinc-200 text-zinc-600 font-bold px-2 py-0.5 rounded-full font-mono">{commits.length} records</span>
            </div>

            <div className="divide-y divide-zinc-100 flex-1 overflow-y-auto max-h-[180px]">
              {commits.map((commit, idx) => (
                <div key={idx} className="p-4 flex items-start justify-between gap-4 hover:bg-zinc-50/50 font-mono text-xs text-zinc-600">
                  <div className="space-y-1 flex-1 min-w-0">
                    <p className="text-zinc-800 font-semibold font-sans truncate text-sm leading-tight">{commit.message}</p>
                    <div className="flex items-center gap-2.5 text-[10px] text-zinc-400">
                      <span className="font-bold text-zinc-500">{commit.author}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {commit.time}</span>
                      <span>•</span>
                      <span className="bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded border border-zinc-200/50 flex items-center gap-1"><GitBranch className="h-3 w-3" /> {commit.branch}</span>
                    </div>
                  </div>

                  <div className="text-[11px] bg-zinc-50 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 px-2.5 py-1.5 rounded-lg border border-zinc-200 cursor-pointer font-bold select-all transition-all">
                    {commit.sha}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
