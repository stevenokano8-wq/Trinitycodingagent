<<<<<<< HEAD
import React from "react";

export default function App() {
  return (
    <div className="min-h-screen bg-black text-white p-8 flex flex-col items-center justify-center font-sans">
      <h1 className="text-3xl font-bold mb-4">React + Vite Workspace</h1>
      <p className="text-stone-400">Created for: create a react vite project with blue backgrounf</p>
=======
import React, { useState } from "react";
import { Palette, Sparkles, Code2, RefreshCw, Layers } from "lucide-react";

export default function App() {
  const [activeTab, setActiveTab] = useState<"preview" | "features" | "theme">("preview");
  const [bgHue, setBgHue] = useState<string>("from-blue-600 via-indigo-700 to-blue-900");
  const [counter, setCounter] = useState<number>(0);

  const presets = [
    { name: "Royal Blue", class: "from-blue-600 via-indigo-700 to-blue-900" },
    { name: "Ocean Sky", class: "from-sky-500 via-blue-600 to-indigo-800" },
    { name: "Midnight Navy", class: "from-slate-900 via-blue-950 to-indigo-950" },
    { name: "Cyan Spark", class: "from-cyan-600 via-blue-600 to-indigo-900" },
  ];

  return (
    <div className={`min-h-screen bg-gradient-to-br ${bgHue} text-white font-sans transition-all duration-500 flex flex-col`}>
      {/* Navigation Header */}
      <header className="border-b border-white/15 bg-black/20 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl border border-white/20 shadow-inner">
              <Code2 className="w-5 h-5 text-blue-200" />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight flex items-center gap-2">
                React Vite App
                <span className="px-2 py-0.5 text-xs bg-blue-400/20 text-blue-200 border border-blue-300/30 rounded-full font-mono">
                  v1.0
                </span>
              </h1>
              <p className="text-xs text-blue-200/80">Custom Styled Workspace</p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-white/10 p-1 rounded-xl border border-white/15">
            <button
              onClick={() => setActiveTab("preview")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "preview" ? "bg-white text-blue-900 shadow-md" : "text-white/80 hover:text-white"
              }`}
            >
              Preview
            </button>
            <button
              onClick={() => setActiveTab("features")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "features" ? "bg-white text-blue-900 shadow-md" : "text-white/80 hover:text-white"
              }`}
            >
              Features
            </button>
            <button
              onClick={() => setActiveTab("theme")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "theme" ? "bg-white text-blue-900 shadow-md" : "text-white/80 hover:text-white"
              }`}
            >
              Themes
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-12 flex flex-col justify-center items-center text-center">
        {activeTab === "preview" && (
          <div className="w-full bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 md:p-12 shadow-2xl space-y-8 animate-fade-in">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/20 border border-blue-300/30 text-blue-100 text-xs font-medium">
              <Sparkles className="w-3.5 h-3.5" />
              Blue Background Theme Applied
            </div>

            <div className="space-y-3">
              <h2 className="text-4xl md:text-5xl font-black tracking-tight text-white drop-shadow-sm">
                Vite + React Canvas
              </h2>
              <p className="text-blue-100/80 max-w-lg mx-auto text-sm md:text-base leading-relaxed">
                Your custom Vite React workspace is initialized and running with custom Tailwind styling and fast component state updates.
              </p>
            </div>

            {/* Interactive Counter Card */}
            <div className="bg-black/20 rounded-2xl p-6 border border-white/10 max-w-xs mx-auto flex flex-col items-center gap-4">
              <span className="text-xs uppercase font-mono tracking-widest text-blue-200/70">Interactive State</span>
              <div className="text-5xl font-extrabold text-white font-mono">{counter}</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCounter(c => c - 1)}
                  className="px-4 py-2 bg-white/15 hover:bg-white/25 active:scale-95 rounded-xl text-sm font-bold border border-white/20 transition-all"
                >
                  -
                </button>
                <button
                  onClick={() => setCounter(0)}
                  className="px-3 py-2 bg-white/10 hover:bg-white/20 active:scale-95 rounded-xl text-xs text-blue-200 border border-white/10 transition-all flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Reset
                </button>
                <button
                  onClick={() => setCounter(c => c + 1)}
                  className="px-4 py-2 bg-white hover:bg-blue-50 text-blue-900 active:scale-95 rounded-xl text-sm font-bold shadow-lg transition-all"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "features" && (
          <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in">
            <div className="bg-white/10 backdrop-blur-md p-6 rounded-2xl border border-white/15 text-left space-y-3">
              <div className="p-2.5 bg-blue-500/20 w-fit rounded-xl border border-blue-300/30">
                <Sparkles className="w-5 h-5 text-blue-200" />
              </div>
              <h3 className="font-bold text-lg text-white">Fast HMR Reloads</h3>
              <p className="text-xs text-blue-100/75 leading-relaxed">
                Vite engine serves modules instantaneously with native browser ES import support.
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-md p-6 rounded-2xl border border-white/15 text-left space-y-3">
              <div className="p-2.5 bg-indigo-500/20 w-fit rounded-xl border border-indigo-300/30">
                <Layers className="w-5 h-5 text-indigo-200" />
              </div>
              <h3 className="font-bold text-lg text-white">Tailwind Styling</h3>
              <p className="text-xs text-blue-100/75 leading-relaxed">
                Full access to utility-first Tailwind CSS classes, responsive break points, and background gradients.
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-md p-6 rounded-2xl border border-white/15 text-left space-y-3">
              <div className="p-2.5 bg-sky-500/20 w-fit rounded-xl border border-sky-300/30">
                <Palette className="w-5 h-5 text-sky-200" />
              </div>
              <h3 className="font-bold text-lg text-white">Dynamic Themes</h3>
              <p className="text-xs text-blue-100/75 leading-relaxed">
                Easily customize color themes, custom backgrounds, dark themes, and responsive design systems.
              </p>
            </div>
          </div>
        )}

        {activeTab === "theme" && (
          <div className="w-full bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl space-y-6 animate-fade-in">
            <div className="space-y-1">
              <h3 className="text-2xl font-bold">Select Blue Palette Accent</h3>
              <p className="text-xs text-blue-200">Customize the background gradient hue</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
              {presets.map(p => (
                <button
                  key={p.name}
                  onClick={() => setBgHue(p.class)}
                  className={`p-4 rounded-2xl border text-left flex flex-col justify-between h-28 transition-all ${
                    bgHue === p.class
                      ? "border-white bg-white/20 shadow-lg ring-2 ring-white/50 scale-105"
                      : "border-white/15 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full bg-gradient-to-tr ${p.class} border border-white/40`} />
                  <span className="text-xs font-semibold">{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-white/10 bg-black/20 text-center text-xs text-blue-200/60">
        Built with React + Vite & Tailwind CSS
      </footer>
>>>>>>> 4f33561 (fix: enable dynamic prompt theme extraction for background colors and update App.tsx with custom blue background)
    </div>
  );
}
