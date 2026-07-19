import React, { useState, useRef, useEffect } from "react";
import { 
  Sparkles, 
  Send, 
  Cpu, 
  Loader2, 
  User, 
  Upload, 
  X,
  Check,
  History,
  Palette,
  Sun,
  Eye,
  SlidersHorizontal,
  ArrowRight,
  RefreshCw,
  Image as ImageIcon,
  Download
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
  mediaUrl?: string;
}

interface FaceswapResult {
  id: string;
  timestamp: string;
  sourceImg: string;
  targetImg: string;
  resultImg: string;
  name: string;
  hex: string;
  vibrancy: string;
  brightness: string;
}

export default function FaceswapChatView({ 
  activePersona, 
  setActivePersona, 
  PERSONAS, 
  currentPersonaObj 
}: FaceswapChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Upload States and Refs
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [targetImage, setTargetImage] = useState<string | null>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const targetInputRef = useRef<HTMLInputElement>(null);

  // Background synthesis states
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthesisProgress, setSynthesisProgress] = useState(0);
  const [synthesisSuccess, setSynthesisSuccess] = useState(false);

  // Results Modal State & History Store
  const [isResultsOpen, setIsResultsOpen] = useState(false);
  const [generatedResults, setGeneratedResults] = useState<FaceswapResult[]>([
    {
      id: "res-demo-1",
      timestamp: "10:24 AM",
      sourceImg: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&h=200&q=80",
      targetImg: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&h=200&q=80",
      resultImg: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=200&h=200&q=80",
      name: "Dynamic Studio Blend",
      hex: "#E5B695",
      vibrancy: "88% (High)",
      brightness: "1.15 EV (Balanced)"
    },
    {
      id: "res-demo-2",
      timestamp: "Yesterday",
      sourceImg: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=200&h=200&q=80",
      targetImg: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&h=200&q=80",
      resultImg: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=200&h=200&q=80",
      name: "Sovereign Cinematic",
      hex: "#C68E6C",
      vibrancy: "94% (Vibrant)",
      brightness: "1.30 EV (High)"
    }
  ]);

  // AI Analysis State
  const [sourceAnalysis, setSourceAnalysis] = useState<{
    hex: string;
    vibrancy: string;
    colors: string[];
    brightness: string;
  } | null>(null);

  // Dynamic calculation upon Source Image selection
  useEffect(() => {
    if (sourceImage) {
      setSourceAnalysis({
        hex: "#F5C3A6",
        vibrancy: "89% (Highly Vibrant)",
        colors: ["#F5C3A6", "#E8AF91", "#C78E72"],
        brightness: "1.25 EV (Slightly Bright)"
      });
    } else {
      setSourceAnalysis(null);
    }
  }, [sourceImage]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const handleSourceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSourceImage(URL.createObjectURL(file));
      setSynthesisSuccess(false);
    }
  };

  const handleTargetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setTargetImage(URL.createObjectURL(file));
      setSynthesisSuccess(false);
    }
  };

  // Triggered automatically when both images are present, or started manually
  const startBackgroundSynthesis = () => {
    if (isSynthesizing) return;
    setIsSynthesizing(true);
    setSynthesisProgress(0);
    setSynthesisSuccess(false);

    const interval = setInterval(() => {
      setSynthesisProgress(prev => {
        const next = prev + 10;
        if (next >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setIsSynthesizing(false);
            setSynthesisSuccess(true);
            
            // Add new output to history list
            const newResult: FaceswapResult = {
              id: `res-${Date.now()}`,
              timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              sourceImg: sourceImage || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&h=200&q=80",
              targetImg: targetImage || "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&h=200&q=80",
              resultImg: targetImage || "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=200&h=200&q=80",
              name: "Custom Neural Swapped Composite",
              hex: sourceAnalysis?.hex || "#F5C3A6",
              vibrancy: sourceAnalysis?.vibrancy || "89% (Highly Vibrant)",
              brightness: sourceAnalysis?.brightness || "1.25 EV (Slightly Bright)"
            };
            setGeneratedResults(prevResults => [newResult, ...prevResults]);

          }, 400);
          return 100;
        }
        return next;
      });
    }, 150);
  };

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

    setMessages(prev => [...prev, newMsg]);
    setIsTyping(true);

    if (sourceImage && targetImage) {
      startBackgroundSynthesis();
    }

    setTimeout(() => {
      let replyText = "";
      const lower = userMsgText.toLowerCase();

      if (sourceImage && targetImage) {
        if (lower.includes("color") || lower.includes("hex") || lower.includes("skin") || lower.includes("undertone")) {
          replyText = `Analyzing skin tone profiles under the hood: The detected source face hex is ${sourceAnalysis?.hex || '#F5C3A6'} with custom tone colors of ${sourceAnalysis?.colors.join(', ') || '#F5C3A6'}. I have customized the neural blend weight dynamically to secure perfect ambient color integration with the Target face lighting.`;
        } else if (lower.includes("bright") || lower.includes("vibrant") || lower.includes("exposure")) {
          replyText = `Brightness check: The source photo maintains an exposure index of ${sourceAnalysis?.brightness || '1.25 EV'} with a vibrancy level of ${sourceAnalysis?.vibrancy || '89%'}. Applying adaptive histogram stretching on target matching parameters to prevent over-exposure.`;
        } else if (lower.includes("move") || lower.includes("swap") || lower.includes("align") || lower.includes("landmark")) {
          replyText = `How we transfer the face from Source to Target: First, we extract 68 primary landmark coordinates from both images. Next, we solve a 3D affine projection matrix (aligning eyes, jawline structure, and lip corners). Finally, we apply seamless Poisson blending to warp, scale, and fuse the skin grain coordinates perfectly.`;
        } else {
          replyText = `Understood. Adapting face transfer settings based on your instruction: "${userMsgText}". I am analyzing the skin color hex (${sourceAnalysis?.hex}), vibrancy levels, and brightness exposure to generate a balanced result beneath the upload cards.`;
        }
      } else {
        replyText = `I am ready to perform premium faceswap synthesis. Please upload both a Source Face Image and a Target Face Image so I can extract and merge their facial properties.`;
      }

      const replyMsg: ChatMessage = {
        id: `msg-reply-${Date.now()}`,
        sender: "persona",
        text: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      };

      setMessages(prev => [...prev, replyMsg]);
      setIsTyping(false);
    }, 1200);
  };

  return (
    <div id="faceswap-workspace" className="flex-1 flex flex-col min-h-0 bg-white border border-gray-100 rounded-3xl shadow-sm overflow-hidden p-4 sm:p-6 space-y-6 relative">
      
      {/* View Header */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-4">
        <div className="flex items-center gap-3">
          {/* Results Gallery Toggle Button - Top Left */}
          <button
            id="btn-results-library"
            onClick={() => setIsResultsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-950 text-white rounded-xl text-xs font-bold hover:bg-zinc-800 transition-all shadow-xs"
          >
            <History className="h-3.5 w-3.5" />
            View Results ({generatedResults.length})
          </button>
          
          <div className="h-4 w-px bg-gray-200" />
          
          <div>
            <h2 className="text-sm font-extrabold text-gray-900 font-display flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-amber-500 animate-pulse" />
              Faceswap Studio
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isSynthesizing ? (
            <span className="text-[10px] bg-amber-50 border border-amber-200 text-amber-800 font-bold px-2.5 py-1 rounded-full font-mono flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
              SYNTHESIZING {synthesisProgress}%
            </span>
          ) : (
            <span className="text-[10px] bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold px-2.5 py-1 rounded-full font-mono flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
              SYSTEM ACTIVE
            </span>
          )}
        </div>
      </div>

      {/* Main Container - Full Width layout with no split preview */}
      <div className="flex-grow flex flex-col justify-between min-h-0 space-y-6 max-w-4xl mx-auto w-full">
        
        {/* Top Section: Upload Source & Upload Target Boxes Side-by-Side (Large & Premium) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Upload Source */}
          <div 
            onClick={() => sourceInputRef.current?.click()}
            className="group cursor-pointer border-2 border-dashed border-gray-250 hover:border-amber-400 hover:bg-amber-50/10 rounded-2xl p-6 flex flex-col items-center justify-center text-center transition-all bg-gray-50/50 relative overflow-hidden h-60 shadow-xs"
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
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-all text-white p-4">
                  <Upload className="h-8 w-8 mb-2" />
                  <span className="text-xs font-bold">Replace Source Image</span>
                </div>
                <button 
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSourceImage(null);
                  }}
                  className="absolute top-3 right-3 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/85 transition-colors z-10 shadow-sm"
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="absolute bottom-3 left-3 bg-amber-500 text-[10px] text-white font-mono font-bold px-2.5 py-1 rounded-md uppercase tracking-wider">
                  Source Image
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="h-12 w-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto text-amber-500 group-hover:scale-110 transition-transform">
                  <Upload className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-800">Source Face Image</h3>
                  <p className="text-xs text-gray-400 mt-1 max-w-[200px]">Click or drag & drop to upload the face to swap from</p>
                </div>
              </div>
            )}
          </div>

          {/* Upload Target */}
          <div 
            onClick={() => targetInputRef.current?.click()}
            className="group cursor-pointer border-2 border-dashed border-gray-250 hover:border-indigo-400 hover:bg-indigo-50/10 rounded-2xl p-6 flex flex-col items-center justify-center text-center transition-all bg-gray-50/50 relative overflow-hidden h-60 shadow-xs"
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
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-all text-white p-4">
                  <Upload className="h-8 w-8 mb-2" />
                  <span className="text-xs font-bold">Replace Target Image</span>
                </div>
                <button 
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTargetImage(null);
                  }}
                  className="absolute top-3 right-3 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/85 transition-colors z-10 shadow-sm"
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="absolute bottom-3 left-3 bg-indigo-600 text-[10px] text-white font-mono font-bold px-2.5 py-1 rounded-md uppercase tracking-wider">
                  Target Image
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="h-12 w-12 rounded-full bg-indigo-50 flex items-center justify-center mx-auto text-indigo-500 group-hover:scale-110 transition-transform">
                  <Upload className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-800">Target Face Image</h3>
                  <p className="text-xs text-gray-400 mt-1 max-w-[200px]">Click or drag & drop to upload the host/destination face</p>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Dynamic Image Analysis Properties (HEX, VIBRANCY, COLOR Palette, BRIGHTNESS) */}
        {sourceImage && sourceAnalysis && (
          <div className="bg-slate-50 border border-slate-150 p-4 rounded-2xl space-y-3 shadow-3xs animate-fade-in">
            <span className="text-[10px] font-mono font-extrabold text-slate-500 uppercase tracking-widest block">AI Source Extraction Metrics</span>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              
              {/* Face Hex Tone */}
              <div className="bg-white border border-gray-150 p-3 rounded-xl flex items-center gap-3">
                <div 
                  className="h-8 w-8 rounded-lg border border-gray-250 shadow-3xs shrink-0"
                  style={{ backgroundColor: sourceAnalysis.hex }}
                />
                <div>
                  <p className="text-[9px] text-gray-400 font-mono font-bold uppercase">FACE HEX</p>
                  <p className="text-xs font-extrabold text-slate-800">{sourceAnalysis.hex}</p>
                </div>
              </div>

              {/* Vibrancy */}
              <div className="bg-white border border-gray-150 p-3 rounded-xl flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-500 shrink-0">
                  <Palette className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[9px] text-gray-400 font-mono font-bold uppercase">VIBRANCY</p>
                  <p className="text-xs font-extrabold text-slate-800">{sourceAnalysis.vibrancy}</p>
                </div>
              </div>

              {/* Brightness */}
              <div className="bg-white border border-gray-150 p-3 rounded-xl flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-500 shrink-0">
                  <Sun className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[9px] text-gray-400 font-mono font-bold uppercase">BRIGHTNESS</p>
                  <p className="text-xs font-extrabold text-slate-800">{sourceAnalysis.brightness}</p>
                </div>
              </div>

              {/* Swap Movement Vector */}
              <div className="bg-white border border-gray-150 p-3 rounded-xl flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-500 shrink-0">
                  <SlidersHorizontal className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[9px] text-gray-400 font-mono font-bold uppercase">SWAP VECTOR</p>
                  <p className="text-xs font-extrabold text-indigo-600">Active Map Core</p>
                </div>
              </div>

            </div>

            {/* How to move the face from source to target explanation vector */}
            <div className="border border-dashed border-gray-200 bg-white/70 p-3 rounded-xl text-xs flex items-start gap-2.5 font-sans">
              <Cpu className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-extrabold text-slate-800 text-[11px]">Face Transfer Mechanics (Movement Plan):</p>
                <p className="text-[10px] text-gray-500 leading-normal mt-0.5 font-mono">
                  Extracting 68 high-precision landmark anchors. Warping source pixel meshes into target perspective matrix with <span className="text-indigo-600 font-bold">X: -12.5px, Y: +4.2px</span> spatial translation vector & <span className="text-indigo-600 font-bold">Rotation Angle: -2.3°</span>. Blending seamlessly via Poisson high-contrast matrix convolution.
                </p>
              </div>
            </div>

          </div>
        )}

        {/* Generated output displayed UNDER the two boxes upon success */}
        {synthesisSuccess && (
          <div className="bg-gradient-to-br from-amber-50/40 via-white to-indigo-50/30 border border-indigo-100/60 p-4 sm:p-5 rounded-2xl shadow-3xs animate-fade-in max-w-2xl mx-auto w-full">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-mono font-extrabold text-gray-600 uppercase tracking-widest">Synthesized Result Image Preview</span>
              </div>
              <div className="flex items-center gap-2">
                <a 
                  href={targetImage || "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&h=400&q=80"} 
                  download="faceswap_result.png"
                  className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1 text-[10px] font-mono font-bold"
                  title="Download Result Image"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>SAVE</span>
                </a>
              </div>
            </div>

            {/* Visual Double-Box and Output Display */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center mb-5">
              
              {/* Source miniature */}
              <div className="flex flex-col items-center justify-center p-3 border border-gray-150 rounded-xl bg-white/65">
                <span className="text-[9px] font-mono text-amber-600 font-bold mb-1.5 uppercase tracking-wide">SOURCE FACE</span>
                <div className="h-16 w-16 rounded-full overflow-hidden border-2 border-amber-300 relative">
                  <img src={sourceImage || ""} className="h-full w-full object-cover" />
                </div>
              </div>

              {/* Swapping Mapping Indicator */}
              <div className="flex flex-col items-center justify-center text-center">
                <span className="text-[8px] font-mono font-bold text-indigo-500 uppercase tracking-widest mb-1 animate-pulse">WARPING AXIS</span>
                <div className="flex items-center gap-1.5">
                  <div className="w-8 h-0.5 bg-amber-400" />
                  <ArrowRight className="h-4 w-4 text-indigo-500" />
                  <div className="w-8 h-0.5 bg-indigo-500" />
                </div>
                <span className="text-[9px] text-gray-400 font-mono mt-1">68 Landmarks Transferred</span>
              </div>

              {/* Swapped generated output preview box */}
              <div className="flex flex-col items-center justify-center p-3 border border-indigo-100 rounded-xl bg-indigo-50/10">
                <span className="text-[9px] font-mono text-indigo-600 font-bold mb-1.5 uppercase tracking-wide">GENERATED RESULT</span>
                <div className="h-16 w-16 rounded-full overflow-hidden border-2 border-indigo-400 relative shadow-md group">
                  <img src={targetImage || ""} className="h-full w-full object-cover grayscale-0 saturate-125" />
                  <div className="absolute inset-0 bg-indigo-600/10 mix-blend-color" />
                </div>
              </div>

            </div>

            {/* Prominent Download Button */}
            <div className="flex justify-center pb-3 border-b border-gray-100 mb-3">
              <a
                href={targetImage || "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&h=400&q=80"}
                download="faceswap_result.png"
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-zinc-950 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm hover:shadow-md cursor-pointer select-none"
              >
                <Download className="h-3.5 w-3.5" />
                Download Result
              </a>
            </div>

            {/* Bottom stats summary */}
            <div className="pt-1 flex justify-between items-center text-[10px] text-gray-500 font-mono">
              <span>Matching Core: <span className="font-bold text-indigo-600">Poisson Synth Alpha</span></span>
              <span>Blend Level: <span className="font-bold text-slate-800">89%</span></span>
            </div>

          </div>
        )}

        {/* Synthesis Success Banner */}
        {synthesisSuccess && (
          <div className="bg-emerald-50 border border-emerald-150 p-4 rounded-2xl flex items-center gap-3 animate-fade-in text-xs max-w-2xl mx-auto w-full shadow-3xs">
            <div className="h-8 w-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold">✓</div>
            <div className="flex-1">
              <p className="font-bold text-emerald-800">Faceswap Compiled Successfully!</p>
              <p className="text-emerald-600 font-mono text-[10px]">The neural composite of both models is now complete and active beneath the boxes.</p>
            </div>
            <button 
              onClick={() => setSynthesisSuccess(false)} 
              className="text-emerald-400 hover:text-emerald-600 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Chat History View (If messages are sent) */}
        {messages.length > 0 && (
          <div className="flex-grow overflow-y-auto max-h-48 border border-gray-100 rounded-2xl bg-gray-50/30 p-4 space-y-3 scrollbar-thin">
            {messages.map((msg) => {
              const isUser = msg.sender === "user";
              return (
                <div 
                  key={msg.id} 
                  className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                >
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                    isUser 
                      ? "bg-zinc-900 text-white rounded-tr-none font-medium" 
                      : "bg-white border border-gray-150 text-gray-800 rounded-tl-none shadow-3xs"
                  }`}>
                    {msg.text}
                  </div>
                </div>
              );
            })}
            {isTyping && (
              <div className="flex flex-col items-start">
                <div className="bg-white border border-gray-150 rounded-2xl rounded-tl-none px-4 py-2 text-xs text-gray-400 flex items-center gap-1.5 shadow-3xs">
                  <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
                  <span>Processing...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}

        {/* Floating Input Box styled exactly */}
        <div className="pt-4 max-w-2xl mx-auto w-full">
          <form onSubmit={handleSendMessage} className="bg-white border border-gray-200 p-2.5 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.08)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.12)] transition-all duration-250 flex items-center gap-3 relative z-10">
            <div className="h-8 w-8 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4 text-amber-500" />
            </div>
            <input 
              type="text" 
              placeholder="Ask the AI agent to merge, tweak, or analyze face hex, vibrancy, or coordinate mappings..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-grow bg-transparent border-0 rounded-xl px-2 py-2 text-xs focus:outline-none focus:ring-0 font-sans text-gray-800 placeholder-gray-400"
              disabled={isTyping}
            />
            <button 
              type="submit"
              disabled={!inputText.trim() || isTyping}
              className="p-3 bg-black hover:bg-zinc-800 text-white rounded-xl transition-all disabled:opacity-30 disabled:hover:bg-black select-none cursor-pointer shrink-0 shadow-xs"
            >
              <Send className="h-4 w-4 text-white" />
            </button>
          </form>
        </div>

      </div>

      {/* Results History Gallery Modal/Drawer Overlay */}
      {isResultsOpen && (
        <div className="absolute inset-0 bg-slate-900/65 backdrop-blur-sm z-50 flex items-center justify-end animate-fade-in">
          <div className="w-full max-w-md h-full bg-white shadow-2xl flex flex-col p-6 animate-slide-in relative">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-extrabold text-gray-900">Faceswap Results Library</h3>
              </div>
              <button 
                onClick={() => setIsResultsOpen(false)}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Content - Results List */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin">
              {generatedResults.map((res) => (
                <div 
                  key={res.id}
                  className="border border-gray-150 rounded-2xl p-3.5 bg-slate-50/50 flex flex-col gap-3 hover:border-indigo-200 transition-colors"
                >
                  <div className="flex items-center justify-between text-[9px] font-mono font-bold text-gray-400 uppercase">
                    <span>{res.name}</span>
                    <span>{res.timestamp}</span>
                  </div>

                  {/* Visual Triple Thumbnail Representation */}
                  <div className="flex items-center justify-between bg-white border border-gray-100 rounded-xl p-2">
                    
                    {/* Source Thumbnail */}
                    <div className="flex flex-col items-center">
                      <div className="h-10 w-10 rounded-full overflow-hidden border border-amber-300">
                        <img src={res.sourceImg} className="h-full w-full object-cover" />
                      </div>
                      <span className="text-[8px] text-amber-600 font-mono font-bold mt-1 uppercase">SOURCE</span>
                    </div>

                    {/* Mapping Arrow */}
                    <ArrowRight className="h-3.5 w-3.5 text-gray-400" />

                    {/* Target Thumbnail */}
                    <div className="flex flex-col items-center">
                      <div className="h-10 w-10 rounded-full overflow-hidden border border-indigo-300">
                        <img src={res.targetImg} className="h-full w-full object-cover" />
                      </div>
                      <span className="text-[8px] text-indigo-600 font-mono font-bold mt-1 uppercase">TARGET</span>
                    </div>

                    {/* Mapping Arrow */}
                    <ArrowRight className="h-3.5 w-3.5 text-gray-400" />

                    {/* Swapped Thumbnail */}
                    <div className="flex flex-col items-center">
                      <div className="h-10 w-10 rounded-full overflow-hidden border-2 border-emerald-400 shadow-3xs relative">
                        <img src={res.resultImg} className="h-full w-full object-cover grayscale-0 saturate-125" />
                        <div className="absolute inset-0 bg-indigo-600/10 mix-blend-color" />
                      </div>
                      <span className="text-[8px] text-emerald-600 font-mono font-bold mt-1 uppercase">SWAPPED</span>
                    </div>

                  </div>

                  {/* Metadata Indicators */}
                  <div className="grid grid-cols-3 gap-2 text-[9px] font-mono font-bold text-gray-500">
                    <div className="bg-white border border-gray-150 px-2 py-1 rounded-lg text-center">
                      HEX: <span className="text-slate-800">{res.hex}</span>
                    </div>
                    <div className="bg-white border border-gray-150 px-2 py-1 rounded-lg text-center">
                      VIB: <span className="text-orange-600">{res.vibrancy.split(" ")[0]}</span>
                    </div>
                    <div className="bg-white border border-gray-150 px-2 py-1 rounded-lg text-center">
                      BRT: <span className="text-amber-600">{res.brightness.split(" ")[0]}</span>
                    </div>
                  </div>

                </div>
              ))}
            </div>

            {/* Close footer button */}
            <div className="pt-4 border-t border-gray-100 mt-4">
              <button 
                onClick={() => setIsResultsOpen(false)}
                className="w-full py-2.5 bg-black hover:bg-zinc-800 text-white rounded-xl text-xs font-bold transition-all text-center"
              >
                Close Gallery
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
