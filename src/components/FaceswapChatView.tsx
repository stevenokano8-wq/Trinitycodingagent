import React, { useState, useEffect, useRef } from "react";
import { 
  Sparkles, 
  Send, 
  Cpu, 
  Check, 
  Loader2, 
  Activity, 
  User, 
  RefreshCw, 
  Sliders, 
  Zap, 
  Code, 
  Database,
  ArrowRight,
  Upload,
  Image as ImageIcon,
  X
} from "lucide-react";

interface Persona {
  id: string;
  name: string;
  icon: any;
  badgeColor: string;
  avatarBg: string;
  description: string;
}

interface FaceswapChatViewProps {
  activePersona: string;
  setActivePersona: (id: string) => void;
  PERSONAS: Persona[];
  currentPersonaObj: Persona;
}

interface ChatMessage {
  id: string;
  sender: "user" | "persona";
  text: string;
  timestamp: string;
}

export default function FaceswapChatView({ 
  activePersona, 
  setActivePersona, 
  PERSONAS, 
  currentPersonaObj 
}: FaceswapChatViewProps) {
  // Chat state per persona
  const [chats, setChats] = useState<Record<string, ChatMessage[]>>({
    sovereign: [
      {
        id: "sov-init",
        sender: "persona",
        text: "Greetings, Creator. I am Sovereign Agent. My multi-threading orchestration and background fiber control systems are fully synchronized with the Trinity Universe. How shall we expand our cluster nodes today?",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      }
    ],
    coder: [
      {
        id: "cod-init",
        sender: "persona",
        text: "Type-safety verified. Titan Code-Lobe online. I'm ready to synthesize TSX modules, Express routes, and database models. No linter errors can hide in this scope. Tell me what to code.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      }
    ],
    designer: [
      {
        id: "des-init",
        sender: "persona",
        text: "Form follows function. Neo Design-Architect initialized. Let's establish elegant typography pairings, balanced padding structures, and smooth micro-interactions. What is our visual vibe today?",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      }
    ],
    db: [
      {
        id: "db-init",
        sender: "persona",
        text: "Transactional queries compiled. Postgres DB-Oracle listening. I can construct relational Drizzle schemas, seed mock data, and tune SQL indexes. How can I optimize your schema?",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      }
    ]
  });

  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Upload States and Refs
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [targetImage, setTargetImage] = useState<string | null>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const targetInputRef = useRef<HTMLInputElement>(null);

  const handleSourceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSourceImage(URL.createObjectURL(file));
    }
  };

  const handleTargetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setTargetImage(URL.createObjectURL(file));
    }
  };

  // Faceswap Synthesis Engine state
  const [blendWeight, setBlendWeight] = useState(75);
  const [cognitiveSync, setCognitiveSync] = useState(85);
  const [styleAdaptation, setStyleAdaptation] = useState(90);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthesisProgress, setSynthesisProgress] = useState(0);
  const [synthesisLogs, setSynthesisLogs] = useState<string[]>([]);
  const [synthesizedAvatar, setSynthesizedAvatar] = useState<string | null>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chats, isTyping, activePersona]);

  const activeMessages = chats[activePersona] || [];

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isTyping) return;

    const userMsgText = inputText;
    setInputText("");

    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: "user",
      text: userMsgText,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };

    // Update active chat
    setChats(prev => ({
      ...prev,
      [activePersona]: [...(prev[activePersona] || []), newMsg]
    }));

    setIsTyping(true);

    // Dynamic responses depending on persona
    setTimeout(() => {
      let replyText = "";
      switch (activePersona) {
        case "sovereign":
          replyText = `Understood. Analyzing multithreading metrics for task orchestration. Background tasks are synchronized under my orchestrator loop. Let us dispatch these instructions to the compilation core.`;
          break;
        case "coder":
          replyText = `Instruction processed. Appending type-safe handlers to your workspace. The components have been analyzed for correct imports and modular execution. Compiling with Vite & esbuild succeeds cleanly!`;
          break;
        case "designer":
          replyText = `Fascinating perspective! That enhances the visual balance. I've adapted our layout variables, employing generous negative space, sleek slate background colors, and micro-animations to reward interactions.`;
          break;
        case "db":
          replyText = `Relational check completed. Drizzle is ready for table migrations. The query plan is fully optimized, selecting primary keys with efficient indexed indexes. Let me know if we need to seed additional data logs.`;
          break;
        default:
          replyText = `System cluster response acknowledged. Executing custom instructions on behalf of the Trinity Universe.`;
      }

      const replyMsg: ChatMessage = {
        id: `msg-reply-${Date.now()}`,
        sender: "persona",
        text: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      };

      setChats(prev => ({
        ...prev,
        [activePersona]: [...(prev[activePersona] || []), replyMsg]
      }));
      setIsTyping(false);
    }, 1200);
  };

  const startFaceswapSynthesis = () => {
    if (isSynthesizing) return;
    setIsSynthesizing(true);
    setSynthesisProgress(0);
    setSynthesisLogs(["⚡ Launching faceswap compiler...", "Analyzing source facial anchors..."]);

    const interval = setInterval(() => {
      setSynthesisProgress(prev => {
        const next = prev + 10;
        if (next >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setIsSynthesizing(false);
            setSynthesizedAvatar(activePersona);
            setSynthesisLogs(prevLogs => [...prevLogs, "✓ Faceswap synthesis completed successfully!"]);
          }, 300);
          return 100;
        }

        // Add fun scifi compile logs dynamically
        if (next === 20) {
          setSynthesisLogs(prevLogs => [...prevLogs, "Aligning mesh coordinate grids..."]);
        } else if (next === 40) {
          setSynthesisLogs(prevLogs => [...prevLogs, `Merging neural synaptic weights (Blend: ${blendWeight}%)...`]);
        } else if (next === 60) {
          setSynthesisLogs(prevLogs => [...prevLogs, `Syncing cognitive frequency levels (Sync: ${cognitiveSync}%)...`]);
        } else if (next === 80) {
          setSynthesisLogs(prevLogs => [...prevLogs, `Rendering composite style filters (Adaptation: ${styleAdaptation}%)...`]);
        }

        return next;
      });
    }, 250);
  };

  return (
    <div id="faceswap-workspace" className="flex-1 flex flex-col min-h-0 bg-white border border-gray-100 rounded-3xl shadow-sm overflow-hidden p-4 sm:p-6 space-y-6">
      
      {/* View Header */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900 font-display flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500 animate-pulse" />
            Faceswap Chat Core
          </h2>
          <p className="text-xs text-gray-400">Swap neural personality maps and synthesize custom workspace assistants.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-amber-50 border border-amber-200 text-amber-800 font-bold px-2 py-1 rounded-full font-mono flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />
            SYNAPTIC CORE ONLINE
          </span>
        </div>
      </div>

      {/* Grid: Left Chat & Persona Selector, Right Synthesis Visualizer */}
      <div className="flex-grow grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
        
        {/* Left 7 Columns: Personas and Local Chat */}
        <div className="lg:col-span-7 flex flex-col gap-6 min-h-0">
          
          {/* Persona Card Selector Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {PERSONAS.map((p) => {
              const isActive = activePersona === p.id;
              const Icon = p.icon;
              return (
                <button
                  key={p.id}
                  id={`faceswap-card-${p.id}`}
                  onClick={() => setActivePersona(p.id)}
                  className={`relative flex flex-col items-center justify-center p-3.5 rounded-2xl border text-center transition-all cursor-pointer select-none group ${
                    isActive
                      ? `${p.badgeColor} border-transparent text-white shadow-md font-semibold scale-[1.02]`
                      : "bg-gray-50/50 hover:bg-gray-100 border-gray-150 text-gray-700"
                  }`}
                  title={p.description}
                >
                  {isActive && (
                    <span className="absolute top-1.5 right-1.5 h-4 w-4 rounded-full bg-white text-emerald-600 flex items-center justify-center text-[8px] font-bold shadow-xs">
                      <Check className="h-2.5 w-2.5 stroke-[3]" />
                    </span>
                  )}
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center mb-1.5 transition-transform ${
                    isActive ? "bg-white/25 scale-110" : "bg-gray-100 group-hover:scale-105"
                  }`}>
                    <Icon className={`h-4 w-4 ${isActive ? "text-white" : "text-gray-500"}`} />
                  </div>
                  <span className="text-[10px] font-extrabold tracking-tight truncate w-full">{p.name}</span>
                  <span className="text-[8px] opacity-75 font-mono mt-0.5 uppercase tracking-wide">
                    {p.id === "db" ? "DATABASE" : p.id}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Persona Chat Box */}
          <div className="flex-1 flex flex-col border border-gray-150 rounded-2xl bg-gray-50/50 overflow-hidden min-h-[300px]">
            {/* Chat Box Header */}
            <div className="bg-white border-b border-gray-150/70 p-3.5 flex items-center gap-3">
              <div className={`h-8 w-8 rounded-full ${currentPersonaObj.avatarBg} text-white flex items-center justify-center font-bold text-sm shadow-xs`}>
                <currentPersonaObj.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-800">{currentPersonaObj.name}</p>
                <p className="text-[9px] text-gray-400 font-medium">Active Assistant Interface</p>
              </div>
            </div>

            {/* Chat Messages Log */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3.5 scrollbar-thin">
              {activeMessages.map((msg) => {
                const isUser = msg.sender === "user";
                return (
                  <div 
                    key={msg.id} 
                    className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                  >
                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                      isUser 
                        ? "bg-zinc-900 text-white rounded-tr-none font-medium" 
                        : "bg-white border border-gray-150 text-gray-800 rounded-tl-none shadow-3xs"
                    }`}>
                      {msg.text}
                    </div>
                    <span className="text-[8px] text-gray-400 font-mono mt-1 px-1.5">
                      {isUser ? "You" : currentPersonaObj.name} • {msg.timestamp}
                    </span>
                  </div>
                );
              })}

              {isTyping && (
                <div className="flex flex-col items-start">
                  <div className="bg-white border border-gray-150 rounded-2xl rounded-tl-none px-4 py-3 text-xs text-gray-400 flex items-center gap-1.5 shadow-3xs">
                    <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
                    <span>{currentPersonaObj.name} is writing...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Upload Area ahead of input */}
            <div className="px-4 py-3 bg-white border-t border-gray-100 grid grid-cols-2 gap-3 z-10">
              {/* Upload Source */}
              <div 
                onClick={() => sourceInputRef.current?.click()}
                className="group cursor-pointer border border-dashed border-gray-250 hover:border-amber-400 hover:bg-amber-50/20 rounded-xl p-3 flex flex-col items-center justify-center text-center transition-all bg-white relative overflow-hidden h-20 shadow-3xs"
              >
                <input 
                  type="file" 
                  ref={sourceInputRef} 
                  onChange={handleSourceUpload} 
                  accept="image/*" 
                  className="hidden" 
                />
                {sourceImage ? (
                  <>
                    <img src={sourceImage} className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all text-white text-[9px] font-bold">
                      Change Source
                    </div>
                    <button 
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSourceImage(null);
                      }}
                      className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors z-10"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 text-gray-400 group-hover:text-amber-500 mb-1" />
                    <span className="text-[10px] font-bold text-gray-700 group-hover:text-amber-700">Upload Source Image</span>
                    <span className="text-[8px] text-gray-400">Click or drag & drop</span>
                  </>
                )}
              </div>

              {/* Upload Target */}
              <div 
                onClick={() => targetInputRef.current?.click()}
                className="group cursor-pointer border border-dashed border-gray-250 hover:border-indigo-400 hover:bg-indigo-50/20 rounded-xl p-3 flex flex-col items-center justify-center text-center transition-all bg-white relative overflow-hidden h-20 shadow-3xs"
              >
                <input 
                  type="file" 
                  ref={targetInputRef} 
                  onChange={handleTargetUpload} 
                  accept="image/*" 
                  className="hidden" 
                />
                {targetImage ? (
                  <>
                    <img src={targetImage} className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all text-white text-[9px] font-bold">
                      Change Target
                    </div>
                    <button 
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTargetImage(null);
                      }}
                      className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors z-10"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 text-gray-400 group-hover:text-indigo-500 mb-1" />
                    <span className="text-[10px] font-bold text-gray-700 group-hover:text-indigo-700">Upload Target Image</span>
                    <span className="text-[8px] text-gray-400">Click or drag & drop</span>
                  </>
                )}
              </div>
            </div>

            {/* Chat Input form - floating exactly */}
            <div className="px-4 pb-4 bg-gray-50/50">
              <form onSubmit={handleSendMessage} className="bg-white border border-gray-200 p-2 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.1)] transition-all duration-200 flex items-center gap-2 relative z-10">
                <input 
                  type="text" 
                  placeholder={`Ask ${currentPersonaObj.name} a question...`}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="flex-grow bg-transparent border-0 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-0 font-sans text-gray-800 placeholder-gray-400"
                  disabled={isTyping}
                />
                <button 
                  type="submit"
                  disabled={!inputText.trim() || isTyping}
                  className="p-2.5 bg-black hover:bg-zinc-800 text-white rounded-xl transition-all disabled:opacity-30 disabled:hover:bg-black select-none cursor-pointer shrink-0 shadow-3xs"
                >
                  <Send className="h-3.5 w-3.5 text-white" />
                </button>
              </form>
            </div>
          </div>

        </div>

        {/* Right 5 Columns: Futuristic Synthesis Engine Panel */}
        <div className="lg:col-span-5 flex flex-col gap-5">
          <div className="bg-slate-50 border border-gray-150 rounded-2xl p-4 sm:p-5 flex flex-col flex-grow shadow-3xs space-y-4">
            <span className="text-[9px] font-bold text-gray-400 font-mono tracking-wider uppercase block">Faceswap Synthesis Engine</span>
            
            {/* Visual Scan Layout */}
            <div className="relative border border-dashed border-gray-250 rounded-xl bg-white p-4 flex items-center justify-between overflow-hidden shadow-inner h-36">
              
              {/* Decorative Tech Grid Lines */}
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#f1f5f9_1px,transparent_1px),linear-gradient(to_bottom,#f1f5f9_1px,transparent_1px)] bg-[size:12px_12px] opacity-30" />

              {/* Source Face Box */}
              <div className="relative z-10 flex flex-col items-center gap-1">
                <div className="h-14 w-14 rounded-full border-2 border-slate-300 bg-slate-100 flex items-center justify-center text-slate-500 overflow-hidden relative shadow-xs">
                  {sourceImage ? (
                    <img src={sourceImage} className="w-full h-full object-cover" />
                  ) : (
                    <User className="h-7 w-7 text-slate-400" />
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-slate-900/65 text-[7px] text-white font-mono text-center py-0.5">SOURCE</div>
                </div>
                <span className="text-[9px] font-mono font-bold text-slate-500">Developer</span>
              </div>

              {/* Laser Scanning Connection Line */}
              <div className="flex-1 flex flex-col items-center justify-center relative px-2">
                <div className="w-full h-0.5 bg-gradient-to-r from-slate-300 via-amber-400 to-indigo-500 relative">
                  {isSynthesizing && (
                    <div className="absolute top-1/2 -translate-y-1/2 left-0 w-2.5 h-2.5 bg-amber-500 rounded-full animate-ping shadow-md" style={{ left: `${synthesisProgress}%` }} />
                  )}
                </div>
                <span className="text-[8px] font-mono font-bold text-amber-500 mt-1 uppercase tracking-widest animate-pulse">
                  {isSynthesizing ? "LINKING SYNAPSES..." : "READY TO SWAP"}
                </span>
              </div>

              {/* Target Face Box */}
              <div className="relative z-10 flex flex-col items-center gap-1">
                <div className={`h-14 w-14 rounded-full border-2 border-indigo-400 ${currentPersonaObj.avatarBg} text-white flex items-center justify-center relative shadow-xs transition-colors overflow-hidden`}>
                  {targetImage ? (
                    <img src={targetImage} className="w-full h-full object-cover" />
                  ) : (
                    <currentPersonaObj.icon className="h-6 w-6 text-white" />
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-indigo-900/65 text-[7px] text-white font-mono text-center py-0.5">TARGET</div>
                </div>
                <span className="text-[9px] font-mono font-bold text-indigo-600">{currentPersonaObj.id.toUpperCase()}</span>
              </div>

              {/* Scanner Line Overlay when active */}
              {isSynthesizing && (
                <div className="absolute inset-0 bg-amber-400/5 pointer-events-none flex flex-col justify-between">
                  <div className="h-0.5 w-full bg-amber-400 animate-bounce" />
                </div>
              )}
            </div>

            {/* Slider Config Adjustments */}
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center text-[10px] font-bold text-gray-500 mb-1 font-mono uppercase">
                  <span>Neural Blend Weight</span>
                  <span className="text-amber-600 font-bold">{blendWeight}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={blendWeight} 
                  onChange={(e) => setBlendWeight(Number(e.target.value))}
                  className="w-full accent-amber-500 h-1 bg-gray-200 rounded-lg cursor-pointer"
                  disabled={isSynthesizing}
                />
              </div>

              <div>
                <div className="flex justify-between items-center text-[10px] font-bold text-gray-500 mb-1 font-mono uppercase">
                  <span>Cognitive Synchronization</span>
                  <span className="text-indigo-600 font-bold">{cognitiveSync}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={cognitiveSync} 
                  onChange={(e) => setCognitiveSync(Number(e.target.value))}
                  className="w-full accent-indigo-500 h-1 bg-gray-200 rounded-lg cursor-pointer"
                  disabled={isSynthesizing}
                />
              </div>

              <div>
                <div className="flex justify-between items-center text-[10px] font-bold text-gray-500 mb-1 font-mono uppercase">
                  <span>Style Adaptation</span>
                  <span className="text-pink-600 font-bold">{styleAdaptation}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={styleAdaptation} 
                  onChange={(e) => setStyleAdaptation(Number(e.target.value))}
                  className="w-full accent-pink-500 h-1 bg-gray-200 rounded-lg cursor-pointer"
                  disabled={isSynthesizing}
                />
              </div>
            </div>

            {/* Action Trigger Button */}
            <button
              id="btn-faceswap-synthesize"
              onClick={startFaceswapSynthesis}
              disabled={isSynthesizing}
              className={`w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 via-orange-500 to-indigo-600 text-white font-bold text-xs py-3 rounded-xl shadow-md hover:shadow-lg transition-all active:scale-[0.99] select-none cursor-pointer ${
                isSynthesizing ? "opacity-60 cursor-not-allowed" : ""
              }`}
            >
              {isSynthesizing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                  <span>Synthesizing ({synthesisProgress}%)</span>
                </>
              ) : (
                <>
                  <Cpu className="h-4 w-4 text-white animate-pulse" />
                  <span>SYNTHESIZE FACESWAP</span>
                </>
              )}
            </button>

            {/* Live compiler logs stream box */}
            <div className="bg-stone-900 border border-stone-800 text-stone-300 p-3 rounded-xl font-mono text-[9px] flex-1 min-h-[90px] max-h-[120px] overflow-y-auto space-y-1 shadow-inner">
              <p className="text-stone-500 uppercase font-bold text-[8px] border-b border-stone-800 pb-1 mb-1 tracking-wider">Synthesis Status Output</p>
              {synthesisLogs.map((log, index) => (
                <div key={index} className={log.startsWith("✓") ? "text-emerald-400" : log.startsWith("⚡") ? "text-amber-400" : ""}>
                  {log}
                </div>
              ))}
              {!isSynthesizing && synthesisLogs.length === 0 && (
                <p className="text-stone-500 italic">Core pipeline idle. Tap "SYNTHESIZE" to start compiling changes.</p>
              )}
            </div>

            {/* Synthesized Result Popup / Alert */}
            {synthesizedAvatar && !isSynthesizing && (
              <div className="bg-emerald-50 border border-emerald-150 p-3 rounded-xl flex items-center gap-3 animate-fade-in text-[11px]">
                <div className="h-7 w-7 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold">✓</div>
                <div className="flex-1">
                  <p className="font-bold text-emerald-800">Faceswap Succeeded!</p>
                  <p className="text-emerald-600 font-mono text-[9px]">Loaded synaptic composite: "{synthesizedAvatar.toUpperCase()} PRO"</p>
                </div>
                <button 
                  onClick={() => setSynthesizedAvatar(null)} 
                  className="text-emerald-400 hover:text-emerald-600 font-bold"
                >
                  ✕
                </button>
              </div>
            )}

          </div>
        </div>

      </div>

    </div>
  );
}
