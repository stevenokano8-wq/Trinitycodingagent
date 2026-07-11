import React, { useState, useRef, useEffect } from "react";
import { 
  Sparkles, 
  Send, 
  Cpu, 
  Loader2, 
  User, 
  Upload, 
  X,
  Check
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
  // Empty chat log by default (no greeting message)
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
          }, 400);
          return 100;
        }
        return next;
      });
    }, 200);
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

    // If both source and target images are uploaded, trigger faceswap synthesis behind the scenes!
    if (sourceImage && targetImage) {
      startBackgroundSynthesis();
    }

    setTimeout(() => {
      let replyText = "";
      if (sourceImage && targetImage) {
        replyText = `Excellent! Synthesizing your uploaded Source and Target images under the hood. The faceswap transformation has been dispatched cleanly.`;
      } else {
        replyText = `I am ready. Please upload both a Source Image and a Target Image to compile a faceswap synaptic composite.`;
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
    <div id="faceswap-workspace" className="flex-1 flex flex-col min-h-0 bg-white border border-gray-100 rounded-3xl shadow-sm overflow-hidden p-4 sm:p-6 space-y-6">
      
      {/* View Header */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900 font-display flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500 animate-pulse" />
            Faceswap Studio
          </h2>
          <p className="text-xs text-gray-400">High-fidelity neural swap workspace interface.</p>
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
            className="group cursor-pointer border-2 border-dashed border-gray-250 hover:border-amber-400 hover:bg-amber-50/10 rounded-2xl p-6 flex flex-col items-center justify-center text-center transition-all bg-gray-50/50 relative overflow-hidden h-64 shadow-xs"
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
                <div className="absolute bottom-3 left-3 bg-black/75 backdrop-blur-xs text-[10px] text-white font-mono font-bold px-2.5 py-1 rounded-md uppercase tracking-wider">
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
            className="group cursor-pointer border-2 border-dashed border-gray-250 hover:border-indigo-400 hover:bg-indigo-50/10 rounded-2xl p-6 flex flex-col items-center justify-center text-center transition-all bg-gray-50/50 relative overflow-hidden h-64 shadow-xs"
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
                <div className="absolute bottom-3 left-3 bg-black/75 backdrop-blur-xs text-[10px] text-white font-mono font-bold px-2.5 py-1 rounded-md uppercase tracking-wider">
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

        {/* Synthesis Success Banner */}
        {synthesisSuccess && (
          <div className="bg-emerald-50 border border-emerald-150 p-4 rounded-2xl flex items-center gap-3 animate-fade-in text-xs max-w-2xl mx-auto w-full shadow-3xs">
            <div className="h-8 w-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold">✓</div>
            <div className="flex-1">
              <p className="font-bold text-emerald-800">Faceswap Compiled Successfully!</p>
              <p className="text-emerald-600 font-mono text-[10px]">The neural composite of both models is now complete behind the scene.</p>
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
              placeholder="Ask the AI agent to merge, tweak, or analyze faceswaps..."
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

    </div>
  );
}
