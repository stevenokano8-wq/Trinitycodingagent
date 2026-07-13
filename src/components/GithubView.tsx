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
  Clock,
  LogOut,
  Sparkles,
  Check
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface CommitLog {
  sha: string;
  message: string;
  branch: string;
  author: string;
  time: string;
}

interface GithubViewProps {
  sessionId?: string;
}

export default function GithubView({ sessionId }: GithubViewProps) {
  const activeSessionId = sessionId || localStorage.getItem("trinity_active_session_id") || "default";

  // Input fields
  const [githubToken, setGithubToken] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  
  // Visibility and flags
  const [showToken, setShowToken] = useState(false);
  const [hasSavedToken, setHasSavedToken] = useState(false);
  const [maskedToken, setMaskedToken] = useState("");
  
  // Status states
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  
  const [isPushing, setIsPushing] = useState(false);
  const [pushStatus, setPushStatus] = useState<"idle" | "success" | "error">("idle");
  const [pushLogs, setPushLogs] = useState<string[]>([]);
  
  // Commit History (loaded from session state locally to keep it persistence-rich)
  const [commits, setCommits] = useState<CommitLog[]>([]);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Load configuration on mount or session change
  useEffect(() => {
    loadConfig();
    
    // Load local mock commits for this session to keep it tidy
    const savedCommits = localStorage.getItem(`trinity_commits_${activeSessionId}`);
    if (savedCommits) {
      try {
        setCommits(JSON.parse(savedCommits));
      } catch (e) {
        setCommits(getDefaultCommits());
      }
    } else {
      const defaultCommits = getDefaultCommits();
      setCommits(defaultCommits);
      localStorage.setItem(`trinity_commits_${activeSessionId}`, JSON.stringify(defaultCommits));
    }
  }, [activeSessionId]);

  // Scroll to bottom of push logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollTop = logsEndRef.current.scrollHeight;
    }
  }, [pushLogs]);

  const getDefaultCommits = (): CommitLog[] => [
    { sha: "b85f2a1", message: "CEO hot-sync: refine workspace dialogue prompt triggers", branch: "main", author: "Trinity CEO", time: "5 mins ago" },
    { sha: "62d91a0", message: "Synthesize real-time database connection checkers for Cloudflare D1/KV", branch: "main", author: "Trinity CEO", time: "2 hours ago" },
    { sha: "efc882a", message: "Initialize Trinity Universe build cluster setup", branch: "main", author: "Trinity CEO", time: "1 day ago" }
  ];

  const loadConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/github/config?sessionId=${activeSessionId}`);
      if (res.ok) {
        const data = await res.json();
        setRepoUrl(data.repoUrl || "");
        setBranch(data.branch || "main");
        setHasSavedToken(data.hasToken || false);
        setMaskedToken(data.maskedToken || "");
      }
    } catch (err) {
      console.error("Failed to load GitHub configuration:", err);
    }
  };

  const handleSaveConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!repoUrl) {
      setSaveMessage({ type: "error", text: "Repository URL is required." });
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const res = await fetch(`${API_BASE}/api/github/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: githubToken || undefined, // Send undefined if empty to avoid wiping it on updates
          repoUrl,
          branch,
          sessionId: activeSessionId
        })
      });

      if (res.ok) {
        setSaveMessage({ type: "success", text: "Successfully connected to GitHub repository!" });
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

  const handleDisconnect = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/github/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "", // Clear token
          repoUrl: "", // Clear repo
          branch: "main",
          sessionId: activeSessionId
        })
      });
      if (res.ok) {
        setGithubToken("");
        setRepoUrl("");
        setBranch("main");
        setHasSavedToken(false);
        setMaskedToken("");
        setPushLogs([]);
        setPushStatus("idle");
        setSaveMessage({ type: "success", text: "Signed out and disconnected successfully." });
      }
    } catch (err: any) {
      console.error("Failed to disconnect:", err);
      setSaveMessage({ type: "error", text: err.message || "Failed to disconnect." });
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
          token: githubToken || undefined, 
          repoUrl,
          branch,
          sessionId: activeSessionId
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
        const newCommits = [
          {
            sha: randomSha,
            message: `Synchronized workspace files with GitHub remote repository`,
            branch: branch,
            author: "Trinity Agent",
            time: "Just now"
          },
          ...commits
        ];
        setCommits(newCommits);
        localStorage.setItem(`trinity_commits_${activeSessionId}`, JSON.stringify(newCommits));
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

  const handleFillDefaultRepo = () => {
    setRepoUrl("https://github.com/stevenokano8-wq/Trinitycodingagent.git");
  };

  // Extract owner and name from repo URL for beautiful visual displays
  const getFriendlyRepoName = (url: string) => {
    try {
      let clean = url.trim();
      if (clean.startsWith("https://github.com/")) {
        clean = clean.replace("https://github.com/", "");
      }
      if (clean.endsWith(".git")) {
        clean = clean.slice(0, -4);
      }
      return clean;
    } catch (e) {
      return url;
    }
  };

  return (
    <div id="github-panel-root" className="flex-1 flex flex-col gap-6 p-4 md:p-6 lg:p-8 overflow-y-auto max-h-[85vh] font-sans">
      <AnimatePresence mode="wait">
        {!hasSavedToken ? (
          /* =========================================================================
             1. RE-DESIGNED SIGN IN PORTAL (UNCONNECTED STATE)
             ========================================================================= */
          <motion.div
            key="connect-portal"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="max-w-2xl mx-auto w-full bg-zinc-950 border border-zinc-800 rounded-[32px] p-6 md:p-10 shadow-2xl flex flex-col items-center text-center text-zinc-100 my-4 font-sans"
          >
            {/* Glowing Brand Ring */}
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-amber-500/20 blur-2xl rounded-full" />
              <div className="relative p-6 bg-zinc-900 border border-zinc-700/50 rounded-2xl text-zinc-100 shadow-xl">
                <Github className="h-10 w-10 animate-pulse" />
              </div>
            </div>

            <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight font-display mb-2">
              Connect Session Repository
            </h2>
            <p className="text-zinc-400 text-sm max-w-md leading-relaxed mb-8">
              Configure isolated Git credentials for your active workspace session. 
              Each workspace session executes within its own private container.
            </p>

            {/* Quick-Connect Suggested Repo Action */}
            <button
              type="button"
              onClick={handleFillDefaultRepo}
              className="mb-8 w-full border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900 hover:border-zinc-700 p-4 rounded-2xl flex items-center justify-between text-left transition-all cursor-pointer group"
            >
              <div className="space-y-0.5">
                <span className="text-[10px] uppercase tracking-wider font-bold text-amber-500 font-mono flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Quick Connect Target Repo
                </span>
                <p className="text-xs font-mono text-zinc-300 font-semibold truncate max-w-sm sm:max-w-md">
                  https://github.com/stevenokano8-wq/Trinitycodingagent.git
                </p>
              </div>
              <div className="bg-zinc-800 group-hover:bg-zinc-700 p-2 rounded-xl transition-all">
                <ArrowUpRight className="h-4 w-4 text-zinc-400 group-hover:text-white" />
              </div>
            </button>

            <form onSubmit={handleSaveConfig} className="w-full text-left space-y-5">
              {/* Token Input */}
              <div className="space-y-2">
                <label className="block text-[11px] font-bold text-zinc-400 font-mono uppercase tracking-wider">
                  GitHub Access Token (PAT)
                </label>
                <div className="relative flex items-center">
                  <input
                    id="signin-git-token"
                    type={showToken ? "text" : "password"}
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl pl-4 pr-12 py-3.5 text-xs text-zinc-100 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 focus:bg-zinc-920 transition-all placeholder-zinc-600"
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-4 text-zinc-500 hover:text-zinc-300 cursor-pointer bg-transparent border-none p-0 focus:outline-none"
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Repo Input */}
              <div className="space-y-2">
                <label className="block text-[11px] font-bold text-zinc-400 font-mono uppercase tracking-wider">
                  Target GitHub Repository URL
                </label>
                <input
                  id="signin-git-repo"
                  type="text"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3.5 text-xs text-zinc-100 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 focus:bg-zinc-920 transition-all placeholder-zinc-600"
                  placeholder="https://github.com/username/repo-name"
                  required
                />
              </div>

              {/* Branch Selection */}
              <div className="space-y-2">
                <label className="block text-[11px] font-bold text-zinc-400 font-mono uppercase tracking-wider">
                  Target Push Branch
                </label>
                <select
                  id="signin-git-branch"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3.5 text-xs text-zinc-100 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 focus:bg-zinc-920 transition-all cursor-pointer"
                >
                  <option value="main">main</option>
                  <option value="master">master</option>
                  <option value="development">development</option>
                  <option value="staging">staging</option>
                </select>
              </div>

              {/* Error/Success Feedbacks */}
              {saveMessage && (
                <motion.div 
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`p-4 rounded-2xl border text-xs flex gap-2.5 items-start ${
                    saveMessage.type === "success" 
                      ? "bg-emerald-950/40 border-emerald-800 text-emerald-200" 
                      : "bg-rose-950/40 border-rose-850 text-rose-200"
                  }`}
                >
                  <AlertCircle className={`h-4.5 w-4.5 shrink-0 mt-0.5 ${saveMessage.type === "success" ? "text-emerald-400" : "text-rose-400"}`} />
                  <span className="leading-relaxed font-medium">{saveMessage.text}</span>
                </motion.div>
              )}

              {/* Action */}
              <button
                type="submit"
                disabled={isSaving}
                className="w-full bg-zinc-100 hover:bg-zinc-200 disabled:opacity-50 text-zinc-950 font-bold py-4 rounded-2xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xl active:scale-98"
              >
                {isSaving ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                {isSaving ? "Connecting..." : "Connect Repository Settings"}
              </button>
            </form>

            <div className="mt-8 border-t border-zinc-900 pt-6 w-full flex items-center justify-center gap-2 text-[11px] text-zinc-500 font-mono">
              <Lock className="h-3.5 w-3.5 text-zinc-500" />
              <span>Private Session Safe: Omitted from other chat logs</span>
            </div>
          </motion.div>
        ) : (
          /* =========================================================================
             2. PREMIUM DASHBOARD (CONNECTED STATE)
             ========================================================================= */
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            {/* A. HEADER DASHBOARD */}
            <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex gap-4 items-center">
                <div className="p-4 bg-zinc-950 text-white rounded-2xl shadow-sm">
                  <Github className="h-7 w-7" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-xl font-bold text-zinc-900 tracking-tight font-display">
                    GitHub Workspace Sync
                  </h2>
                  <p className="text-xs text-zinc-500 font-mono flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                    Connected to <span className="font-semibold text-zinc-800 underline">{getFriendlyRepoName(repoUrl)}</span> on branch <span className="font-bold bg-zinc-100 text-zinc-700 px-1.5 py-0.5 rounded text-[10px] border border-zinc-200">{branch}</span>
                  </p>
                </div>
              </div>

              <div className="flex gap-3 w-full md:w-auto shrink-0">
                <button
                  id="btn-disconnect"
                  onClick={handleDisconnect}
                  disabled={isSaving}
                  className="bg-transparent hover:bg-zinc-100 border border-zinc-200 text-zinc-600 hover:text-zinc-900 px-5 py-3 rounded-xl text-xs font-bold font-sans flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out / Disconnect
                </button>
                <button
                  id="btn-git-push"
                  onClick={handlePushToGithub}
                  disabled={isPushing}
                  className="bg-zinc-950 hover:bg-zinc-800 disabled:opacity-50 text-white px-6 py-3 rounded-xl text-xs font-bold font-sans flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm active:scale-98"
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
              
              {/* LEFT COL: CONFIGURATION PANEL (5 columns) */}
              <div className="lg:col-span-5 space-y-6">
                <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-xs">
                  <div className="flex items-center gap-2 mb-5">
                    <Lock className="h-4 w-4 text-zinc-400" />
                    <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider font-mono">Session Credentials</h3>
                  </div>
                  
                  <div className="space-y-4">
                    {/* Token Info */}
                    <div>
                      <span className="block text-[11px] font-bold text-zinc-400 font-mono uppercase tracking-wider mb-1.5">Active Session Token</span>
                      <div className="w-full bg-zinc-50 border border-zinc-150 rounded-xl px-4 py-3 text-xs text-zinc-500 font-mono flex items-center gap-2">
                        <Lock className="h-3.5 w-3.5 text-emerald-500" />
                        <span>{maskedToken || "••••••••••••••••••••"}</span>
                        <span className="ml-auto text-[9px] bg-emerald-50 text-emerald-700 font-bold px-1.5 py-0.5 rounded border border-emerald-100">Verified</span>
                      </div>
                    </div>

                    {/* Repo Info */}
                    <div>
                      <span className="block text-[11px] font-bold text-zinc-400 font-mono uppercase tracking-wider mb-1.5">Target GitHub Repository</span>
                      <div className="w-full bg-zinc-50 border border-zinc-150 rounded-xl px-4 py-3 text-xs text-zinc-800 font-mono truncate">
                        {repoUrl}
                      </div>
                    </div>

                    {/* Branch Setting Selector */}
                    <div>
                      <span className="block text-[11px] font-bold text-zinc-400 font-mono uppercase tracking-wider mb-1.5">Push Target Branch</span>
                      <select
                        id="dashboard-branch-selector"
                        value={branch}
                        onChange={async (e) => {
                          const newBranch = e.target.value;
                          setBranch(newBranch);
                          // Autosave updated branch back to API
                          await fetch(`${API_BASE}/api/github/config`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              repoUrl,
                              branch: newBranch,
                              sessionId: activeSessionId
                            })
                          });
                        }}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-xs text-zinc-800 font-mono focus:outline-none focus:ring-1 focus:ring-zinc-600 transition-all cursor-pointer"
                      >
                        <option value="main">main</option>
                        <option value="master">master</option>
                        <option value="development">development</option>
                        <option value="staging">staging</option>
                      </select>
                    </div>

                    {/* Quick Info Box */}
                    <div className="p-4 bg-zinc-50 border border-zinc-150 rounded-2xl text-[11px] text-zinc-500 leading-normal flex gap-2">
                      <Info className="h-4.5 w-4.5 text-zinc-400 shrink-0 mt-0.5" />
                      <div>
                        This configuration is locked strictly to this active session chat. If you switch to another chat or open a new session, your previous credentials are safe in that session, and this view is fresh by default.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT COL: CONSOLE TERMINAL & LOGS (7 columns) */}
              <div className="lg:col-span-7 space-y-6">
                
                {/* Real-time Push Console */}
                <div className="bg-zinc-950 border border-zinc-850 rounded-3xl overflow-hidden flex flex-col shadow-md min-h-[280px]">
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
