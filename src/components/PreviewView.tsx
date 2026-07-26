import { API_BASE } from "../lib/api.ts";
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Play, RefreshCw, Code2, Maximize2, Minimize2, ExternalLink,
  Loader2, Monitor, Smartphone, Tablet, Zap, AlertCircle, Eye
} from "lucide-react";
import { FileNode } from "../types.js";

interface PreviewViewProps {
  files: FileNode[];
  currentPrompt?: string;
}

type Viewport = "desktop" | "tablet" | "mobile";

const VIEWPORT_SIZES: Record<Viewport, { width: string; label: string; icon: React.ReactNode }> = {
  desktop: { width: "100%",  label: "Desktop", icon: <Monitor className="h-3.5 w-3.5" /> },
  tablet:  { width: "768px", label: "Tablet",  icon: <Tablet className="h-3.5 w-3.5" /> },
  mobile:  { width: "390px", label: "Mobile",  icon: <Smartphone className="h-3.5 w-3.5" /> },
};

export default function PreviewView({ files, currentPrompt }: PreviewViewProps) {
  const [viewMode,   setViewMode]   = useState<"preview" | "source">("preview");
  const [viewport,   setViewport]   = useState<Viewport>("desktop");
  const [isLoading,  setIsLoading]  = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [blobUrl,    setBlobUrl]    = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sourceFile, setSourceFile] = useState<string>("");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const prevBlobRef = useRef<string | null>(null);

  const hasFiles = files.length > 0;

  // Auto-refresh preview when files change (live update as agent writes)
  useEffect(() => {
    if (hasFiles && viewMode === "preview") {
      buildPreview();
    }
  }, [files.map(f => f.path + f.content.length).join(",")]);

  const buildPreview = useCallback(async () => {
    if (!hasFiles) return;
    setIsLoading(true);
    setError(null);

    try {
      // Try server-side preview first
      const res = await fetch(`${API_BASE}/api/workspace/preview`);
      if (res.ok) {
        const html = await res.text();
        // Revoke old blob
        if (prevBlobRef.current) URL.revokeObjectURL(prevBlobRef.current);
        const blob = new Blob([html], { type: "text/html" });
        const url  = URL.createObjectURL(blob);
        prevBlobRef.current = url;
        setBlobUrl(url);
        setIsLoading(false);
        return;
      }
    } catch (_) {}

    // Fallback: build preview client-side from files in state
    try {
      const html = buildClientPreview(files);
      if (prevBlobRef.current) URL.revokeObjectURL(prevBlobRef.current);
      const blob = new Blob([html], { type: "text/html" });
      const url  = URL.createObjectURL(blob);
      prevBlobRef.current = url;
      setBlobUrl(url);
    } catch (e: any) {
      setError(e.message ?? "Failed to build preview");
    }
    setIsLoading(false);
  }, [files]);

  const handleCompile = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res  = await fetch(`${API_BASE}/api/workspace/compile`, { method: "POST" });
      const data = await res.json() as { ok: boolean; output?: string; error?: string };
      if (!data.ok) setError(data.error ?? data.output ?? "Compilation failed");
      else await buildPreview();
    } catch (e: any) {
      setError(e.message);
    }
    setIsLoading(false);
  };

  const openExternal = () => { if (blobUrl) window.open(blobUrl, "_blank"); };

  const htmlFiles    = files.filter(f => f.path.endsWith(".html"));
  const cssFiles     = files.filter(f => f.path.endsWith(".css"));
  const tsxFiles     = files.filter(f => f.path.endsWith(".tsx") || f.path.endsWith(".jsx"));
  const sourceFiles  = files.filter(f => f.path.endsWith(".tsx") || f.path.endsWith(".ts") || f.path.endsWith(".js") || f.path.endsWith(".html") || f.path.endsWith(".css"));

  const displayedSource = sourceFiles.find(f => f.path === sourceFile) ?? sourceFiles[0];

  return (
    <div className="flex-1 flex flex-col bg-[#1a1a1a] overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#111] border-b border-white/10 shrink-0">
        {/* Mode toggle */}
        <div className="flex gap-0.5 bg-white/5 rounded-lg p-0.5 mr-1">
          <button onClick={() => setViewMode("preview")} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${viewMode === "preview" ? "bg-white/15 text-white" : "text-white/40 hover:text-white/70"}`}>
            <Eye className="h-3 w-3" /> Preview
          </button>
          <button onClick={() => setViewMode("source")} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${viewMode === "source" ? "bg-white/15 text-white" : "text-white/40 hover:text-white/70"}`}>
            <Code2 className="h-3 w-3" /> Source
          </button>
        </div>

        {/* Viewport toggle (preview mode only) */}
        {viewMode === "preview" && (
          <div className="flex gap-0.5 bg-white/5 rounded-lg p-0.5">
            {(Object.keys(VIEWPORT_SIZES) as Viewport[]).map(vp => (
              <button key={vp} onClick={() => setViewport(vp)}
                className={`px-2 py-1 rounded-md text-[10px] transition-all flex items-center gap-1 ${viewport === vp ? "bg-amber-500 text-black font-bold" : "text-white/40 hover:text-white/70"}`}
                title={VIEWPORT_SIZES[vp].label}>
                {VIEWPORT_SIZES[vp].icon}
              </button>
            ))}
          </div>
        )}

        {/* Source file selector */}
        {viewMode === "source" && sourceFiles.length > 0 && (
          <select value={sourceFile || sourceFiles[0]?.path} onChange={e => setSourceFile(e.target.value)}
            className="bg-white/5 text-white/70 text-[10px] rounded-lg px-2 py-1.5 border border-white/10 outline-none focus:border-amber-500 font-mono max-w-[200px]">
            {sourceFiles.map(f => <option key={f.path} value={f.path}>{f.path}</option>)}
          </select>
        )}

        <div className="flex-1" />

        {/* File stats */}
        <div className="flex items-center gap-2 text-[9px] font-mono text-white/30">
          {htmlFiles.length > 0 && <span className="bg-white/5 px-1.5 py-0.5 rounded">{htmlFiles.length} HTML</span>}
          {cssFiles.length  > 0 && <span className="bg-white/5 px-1.5 py-0.5 rounded">{cssFiles.length} CSS</span>}
          {tsxFiles.length  > 0 && <span className="bg-white/5 px-1.5 py-0.5 rounded">{tsxFiles.length} TSX</span>}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          <button onClick={buildPreview} disabled={!hasFiles || isLoading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-amber-500 hover:bg-amber-400 text-black disabled:opacity-40 transition-all">
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            {isLoading ? "Rendering…" : "Render"}
          </button>
          <button onClick={handleCompile} disabled={!hasFiles || isLoading}
            title="Compile (npm install + vite build)"
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold bg-white/5 hover:bg-white/10 text-white/60 hover:text-white disabled:opacity-40 transition-all">
            <Zap className="h-3 w-3" /> Compile
          </button>
          {blobUrl && (
            <>
              <button onClick={openExternal} className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-all" title="Open in new tab">
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-all" title="Toggle fullscreen">
                {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 overflow-hidden flex flex-col items-center">
        {error && (
          <div className="w-full px-4 py-2 bg-red-900/30 border-b border-red-800/50 flex items-center gap-2 text-[10px] text-red-300 font-mono">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
            <span className="truncate">{error}</span>
          </div>
        )}

        {viewMode === "source" ? (
          // Source view
          <div className="flex-1 w-full overflow-auto bg-[#0d0d0d] p-4">
            {displayedSource
              ? <pre className="text-[11px] font-mono text-stone-300 leading-relaxed whitespace-pre-wrap">{displayedSource.content}</pre>
              : <p className="text-center text-white/30 text-xs mt-8">No source files in workspace yet</p>
            }
          </div>
        ) : blobUrl ? (
          // Preview iframe
          <div className={`flex-1 w-full flex items-start justify-center ${viewport !== "desktop" ? "py-4 overflow-auto" : ""}`}
            style={{ background: viewport !== "desktop" ? "#0d0d0d" : "transparent" }}>
            <div style={{ width: VIEWPORT_SIZES[viewport].width, height: "100%", minHeight: "100%", flexShrink: 0, position: "relative" }}
              className={viewport !== "desktop" ? "rounded-2xl overflow-hidden border border-white/10 shadow-2xl" : "h-full"}>
              <iframe
                ref={iframeRef}
                src={blobUrl}
                className="w-full h-full border-none bg-white"
                style={{ minHeight: viewport !== "desktop" ? "80vh" : "100%" }}
                title="Live Preview"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            </div>
          </div>
        ) : (
          // Empty state
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
            {isLoading ? (
              <>
                <Loader2 className="h-8 w-8 text-amber-400 animate-spin" />
                <p className="text-xs font-mono text-white/40">Building preview…</p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 bg-white/5 rounded-3xl flex items-center justify-center">
                  <Monitor className="h-8 w-8 text-white/20" />
                </div>
                <div className="space-y-1.5">
                  <p className="text-sm font-bold text-white/50">No Preview Yet</p>
                  <p className="text-xs text-white/30 max-w-xs">
                    {hasFiles
                      ? "Click Render to display your workspace files as a live preview."
                      : "Build something in the chat first. The preview will appear here as the agent writes files."}
                  </p>
                </div>
                {hasFiles && (
                  <button onClick={buildPreview} className="bg-amber-500 hover:bg-amber-400 text-black px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2">
                    <Play className="h-3.5 w-3.5" /> Render Preview
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Client-side preview builder ───────────────────────────────────────────────
function buildClientPreview(files: FileNode[]): string {
  const htmlFile = files.find(f => f.path === "index.html" || f.path.endsWith("/index.html")) ?? files.find(f => f.path.endsWith(".html"));
  const cssFiles = files.filter(f => f.path.endsWith(".css"));
  const hasReact = files.some(f => f.content?.includes("import React") || f.content?.includes("from 'react'") || f.content?.includes('from "react"'));
  const jsxFiles = files.filter(f => f.path.endsWith(".tsx") || f.path.endsWith(".jsx"));
  const jsFiles  = files.filter(f => (f.path.endsWith(".js") || f.path.endsWith(".ts")) && !f.path.endsWith(".tsx") && !f.path.endsWith(".jsx") && !f.path.includes("config") && !f.path.includes("vite"));

  const cssInline = cssFiles.map(f => f.content).join("\n\n");

  if (htmlFile) {
    let html = htmlFile.content;
    // Inline CSS
    if (cssInline) {
      html = html.replace("</head>", `<style>${cssInline}</style>\n</head>`);
    }
    // Add React CDN if needed
    if (hasReact && !html.includes("react")) {
      html = html.replace("</head>", `
  <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
</head>`);
      // Re-tag React scripts as babel
      jsxFiles.forEach(f => {
        const filename = f.path.split("/").pop() ?? "";
        html = html.replace(new RegExp(`<script[^>]+src=["'][^"']*${filename}["'][^>]*></script>`, "g"),
          `<script type="text/babel">/* ${f.path} */\n${f.content}\n</script>`);
      });
    }
    // Inline plain JS
    jsFiles.forEach(f => {
      const filename = f.path.split("/").pop() ?? "";
      html = html.replace(new RegExp(`<script[^>]+src=["'][^"']*${filename}["'][^>]*></script>`, "g"),
        `<script>/* ${f.path} */\n${f.content}\n</script>`);
    });
    return html;
  }

  // No HTML file — generate wrapper
  const allCode = [...jsxFiles, ...jsFiles].map(f => f.content).join("\n\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Workspace Preview</title>
${cssInline ? `<style>${cssInline}</style>` : ""}
${hasReact ? `
<script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>` : ""}
<style>body{margin:0;font-family:system-ui,sans-serif;background:#fff}#root{min-height:100vh}</style>
</head>
<body><div id="root"></div>
${hasReact
  ? `<script type="text/babel">${allCode}\ntry{ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(typeof App!=="undefined"?App:()=>React.createElement("div",null,"App rendered")))}catch(e){document.getElementById("root").innerHTML='<pre style="color:red;padding:1rem">'+e.message+'</pre>'}</script>`
  : `<script>${allCode}</script>`
}
</body></html>`;
}
