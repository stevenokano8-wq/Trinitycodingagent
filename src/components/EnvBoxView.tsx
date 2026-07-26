import { API_BASE } from "../lib/api.ts";
import React, { useState, useEffect } from "react";
import {
  Key, Eye, EyeOff, Plus, Trash2, CheckCircle, AlertCircle,
  RefreshCw, Link2, Github, Cpu, Globe, Database, Save, Copy, Check
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface EnvVar {
  key: string;
  value: string;
  description: string;
  category: "ai" | "github" | "database" | "cloudflare" | "custom";
  isSet: boolean;
}

const WELL_KNOWN_VARS: Omit<EnvVar, "value" | "isSet">[] = [
  { key: "GEMINI_API_KEY",              description: "Google Gemini API key for AI code generation",                category: "ai"          },
  { key: "GITHUB_TOKEN",                description: "GitHub Personal Access Token (repo write scope)",            category: "github"      },
  { key: "GITHUB_REPO_URL",             description: "Target GitHub repo URL (https://github.com/user/repo.git)", category: "github"      },
  { key: "CLOUDFLARE_API_TOKEN",        description: "Cloudflare API token for deployments",                      category: "cloudflare"  },
  { key: "CLOUDFLARE_ACCOUNT_ID",       description: "Cloudflare account ID",                                     category: "cloudflare"  },
  { key: "DATABASE_URL",                description: "PostgreSQL or D1 connection string",                        category: "database"    },
  { key: "UPSTASH_REDIS_REST_URL",      description: "Upstash Redis REST endpoint",                              category: "database"    },
  { key: "UPSTASH_REDIS_REST_TOKEN",    description: "Upstash Redis REST token",                                 category: "database"    },
];

const CATEGORY_META: Record<EnvVar["category"], { label: string; icon: React.ReactNode; color: string }> = {
  ai:          { label: "AI / LLM",    icon: <Cpu className="h-3.5 w-3.5" />,    color: "text-violet-600 bg-violet-50 border-violet-200"   },
  github:      { label: "GitHub",      icon: <Github className="h-3.5 w-3.5" />, color: "text-gray-800 bg-gray-100 border-gray-300"         },
  database:    { label: "Database",    icon: <Database className="h-3.5 w-3.5" />, color: "text-blue-700 bg-blue-50 border-blue-200"        },
  cloudflare:  { label: "Cloudflare",  icon: <Globe className="h-3.5 w-3.5" />,  color: "text-orange-600 bg-orange-50 border-orange-200"   },
  custom:      { label: "Custom",      icon: <Key className="h-3.5 w-3.5" />,    color: "text-zinc-600 bg-zinc-50 border-zinc-200"          },
};

export default function EnvBoxView() {
  const [envVars, setEnvVars] = useState<EnvVar[]>(
    WELL_KNOWN_VARS.map(v => ({ ...v, value: "", isSet: false }))
  );
  const [customKey,   setCustomKey]   = useState("");
  const [customValue, setCustomValue] = useState("");
  const [customDesc,  setCustomDesc]  = useState("");
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [saving,      setSaving]      = useState<string | null>(null);
  const [saved,       setSaved]       = useState<Set<string>>(new Set());
  const [copied,      setCopied]      = useState<string | null>(null);
  const [cloneUrl,    setCloneUrl]    = useState("");
  const [cloneToken,  setCloneToken]  = useState("");
  const [cloning,     setCloning]     = useState(false);
  const [cloneResult, setCloneResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [activeTab,   setActiveTab]   = useState<"env" | "clone" | "connect">("env");

  useEffect(() => {
    // Load saved config status from API
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings/github`);
      if (res.ok) {
        const data = await res.json() as { repoUrl?: string; hasToken?: boolean };
        setEnvVars(prev => prev.map(v => {
          if (v.key === "GITHUB_REPO_URL" && data.repoUrl) return { ...v, value: data.repoUrl, isSet: true };
          if (v.key === "GITHUB_TOKEN"    && data.hasToken)  return { ...v, value: "••••••••••••••••••••", isSet: true };
          return v;
        }));
      }
    } catch (_) {}
  };

  const toggleVisibility = (key: string) => {
    setVisibleKeys(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const saveVar = async (v: EnvVar) => {
    if (!v.value.trim()) return;
    setSaving(v.key);
    try {
      const body: Record<string, string> = {};
      if (v.key === "GEMINI_API_KEY")   body.geminiApiKey   = v.value;
      if (v.key === "GITHUB_TOKEN")     body.githubToken    = v.value;
      if (v.key === "GITHUB_REPO_URL")  body.githubRepoUrl  = v.value;

      const endpoint = Object.keys(body).length > 0 ? "/api/settings" : "/api/settings/env";
      await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.keys(body).length > 0 ? body : { key: v.key, value: v.value }),
      });
      setSaved(prev => new Set([...prev, v.key]));
      setEnvVars(prev => prev.map(ev => ev.key === v.key ? { ...ev, isSet: true } : ev));
      setTimeout(() => setSaved(prev => { const n = new Set(prev); n.delete(v.key); return n; }), 2500);
    } catch (_) {}
    setSaving(null);
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const updateValue = (key: string, value: string) =>
    setEnvVars(prev => prev.map(v => v.key === key ? { ...v, value } : v));

  const addCustom = () => {
    if (!customKey.trim()) return;
    const newVar: EnvVar = { key: customKey.trim(), value: customValue, description: customDesc || "Custom variable", category: "custom", isSet: false };
    setEnvVars(prev => [...prev, newVar]);
    setCustomKey(""); setCustomValue(""); setCustomDesc("");
  };

  const removeVar = (key: string) =>
    setEnvVars(prev => prev.filter(v => v.key !== key || WELL_KNOWN_VARS.some(w => w.key === key)));

  const handleClone = async () => {
    if (!cloneUrl.trim()) return;
    setCloning(true);
    setCloneResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/clone-repo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: cloneUrl, token: cloneToken || undefined }),
      });
      const data = await res.json() as { ok?: boolean; message?: string; error?: string };
      setCloneResult({ ok: res.ok, message: (data as any).message || (data as any).error || "Done" });
    } catch (e: any) {
      setCloneResult({ ok: false, message: e.message });
    }
    setCloning(false);
  };

  const grouped = ["ai", "github", "database", "cloudflare", "custom"] as const;

  return (
    <div id="env-panel-root" className="flex-1 flex flex-col gap-0 overflow-y-auto max-h-full font-sans">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gray-900 rounded-xl text-white"><Key className="h-4 w-4" /></div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Environment & Connections</h2>
            <p className="text-[10px] text-gray-400 font-mono">API keys · Source URLs · Git tokens</p>
          </div>
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {(["env", "clone", "connect"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${activeTab === tab ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
              {tab === "clone" ? "Clone Repo" : tab === "connect" ? "Connect Source" : "Env Variables"}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 space-y-6">
        <AnimatePresence mode="wait">
          {activeTab === "env" && (
            <motion.div key="env" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-6">
              {grouped.map(cat => {
                const vars = envVars.filter(v => v.category === cat);
                if (!vars.length) return null;
                const meta = CATEGORY_META[cat];
                return (
                  <div key={cat} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-xs">
                    <div className={`px-4 py-3 border-b border-gray-100 flex items-center gap-2 text-xs font-bold ${meta.color} bg-opacity-50`}>
                      {meta.icon} {meta.label}
                    </div>
                    <div className="divide-y divide-gray-50">
                      {vars.map(v => (
                        <div key={v.key} className="p-4 flex flex-col sm:flex-row gap-3">
                          <div className="flex-1 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <button onClick={() => copyKey(v.key)} className="font-mono text-xs font-bold text-gray-700 hover:text-gray-900 flex items-center gap-1 group">
                                {v.key}
                                {copied === v.key ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-gray-300 group-hover:text-gray-500" />}
                              </button>
                              {v.isSet && <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full font-bold">✓ Set</span>}
                            </div>
                            <p className="text-[10px] text-gray-400">{v.description}</p>
                          </div>
                          <div className="flex gap-2 items-center sm:w-64">
                            <div className="relative flex-1">
                              <input
                                type={visibleKeys.has(v.key) ? "text" : "password"}
                                placeholder={v.isSet ? "••••••••••••••••" : "Paste value…"}
                                value={v.value}
                                onChange={e => updateValue(v.key, e.target.value)}
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-gray-400 pr-8"
                              />
                              <button onClick={() => toggleVisibility(v.key)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                {visibleKeys.has(v.key) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                            <button onClick={() => saveVar(v)} disabled={saving === v.key || !v.value.trim()}
                              className="shrink-0 bg-gray-900 text-white text-[10px] font-bold px-3 py-2 rounded-lg disabled:opacity-40 hover:bg-gray-700 transition-all flex items-center gap-1">
                              {saving === v.key ? <RefreshCw className="h-3 w-3 animate-spin" /> : saved.has(v.key) ? <CheckCircle className="h-3 w-3 text-green-400" /> : <Save className="h-3 w-3" />}
                              {saved.has(v.key) ? "Saved!" : "Save"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Add custom variable */}
              <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-xs space-y-3">
                <h3 className="text-xs font-bold text-gray-700 flex items-center gap-2"><Plus className="h-3.5 w-3.5" /> Add Custom Variable</h3>
                <div className="flex gap-2 flex-wrap">
                  <input placeholder="KEY_NAME" value={customKey} onChange={e => setCustomKey(e.target.value.toUpperCase())}
                    className="flex-1 min-w-28 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-gray-400" />
                  <input placeholder="value" value={customValue} onChange={e => setCustomValue(e.target.value)}
                    type="password"
                    className="flex-1 min-w-36 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-gray-400" />
                  <input placeholder="Description (optional)" value={customDesc} onChange={e => setCustomDesc(e.target.value)}
                    className="flex-1 min-w-40 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-gray-400" />
                  <button onClick={addCustom} disabled={!customKey.trim()}
                    className="bg-gray-900 text-white text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-40 hover:bg-gray-700 transition-all">
                    Add
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "clone" && (
            <motion.div key="clone" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="bg-white border border-gray-100 rounded-2xl p-6 shadow-xs space-y-5">
              <div className="flex items-center gap-3">
                <Github className="h-6 w-6 text-gray-800" />
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Clone Repository</h3>
                  <p className="text-xs text-gray-400">Paste any public or private GitHub repo URL to clone it into the agent workspace</p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1.5">Repository URL</label>
                  <input
                    type="url"
                    placeholder="https://github.com/owner/repo.git"
                    value={cloneUrl}
                    onChange={e => setCloneUrl(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1.5">GitHub Token (for private repos)</label>
                  <input
                    type="password"
                    placeholder="ghp_••••••••••••••••••••"
                    value={cloneToken}
                    onChange={e => setCloneToken(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-gray-400"
                  />
                </div>

                {cloneResult && (
                  <div className={`p-4 rounded-xl border text-xs flex items-start gap-2.5 ${cloneResult.ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"}`}>
                    {cloneResult.ok ? <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" /> : <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />}
                    <span className="font-mono">{cloneResult.message}</span>
                  </div>
                )}

                <button onClick={handleClone} disabled={cloning || !cloneUrl.trim()}
                  className="w-full bg-gray-900 text-white font-bold text-sm py-3 rounded-xl disabled:opacity-40 hover:bg-gray-700 transition-all flex items-center justify-center gap-2">
                  {cloning ? <><RefreshCw className="h-4 w-4 animate-spin" /> Cloning…</> : <><Link2 className="h-4 w-4" /> Clone Repository</>}
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === "connect" && (
            <motion.div key="connect" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
              {[
                { name: "GitHub API", desc: "Read/write repos, issues, PRs", icon: <Github className="h-5 w-5" />, keyHint: "GITHUB_TOKEN" },
                { name: "Supabase",   desc: "Postgres DB + Auth + Storage",  icon: <Database className="h-5 w-5 text-green-600" />, keyHint: "SUPABASE_ANON_KEY" },
                { name: "Gemini AI",  desc: "Code gen, vision, embeddings",  icon: <Cpu className="h-5 w-5 text-violet-600" />, keyHint: "GEMINI_API_KEY" },
                { name: "Cloudflare", desc: "Workers, D1, KV, R2, Pages",    icon: <Globe className="h-5 w-5 text-orange-500" />, keyHint: "CLOUDFLARE_API_TOKEN" },
              ].map(src => {
                const matched = envVars.find(v => v.key === src.keyHint);
                const isConnected = matched?.isSet;
                return (
                  <div key={src.name} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-xs flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-gray-50 rounded-xl">{src.icon}</div>
                      <div>
                        <p className="text-sm font-bold text-gray-900">{src.name}</p>
                        <p className="text-xs text-gray-400">{src.desc}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isConnected
                        ? <span className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold px-3 py-1.5 rounded-full flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" /> Connected</span>
                        : <button onClick={() => setActiveTab("env")} className="text-xs bg-gray-900 text-white font-bold px-3 py-1.5 rounded-full hover:bg-gray-700 transition-all">Add Key →</button>
                      }
                    </div>
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
