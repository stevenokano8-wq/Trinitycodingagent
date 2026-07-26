import React, { useRef, useState, useEffect } from "react";
import {
  Menu,
  Zap,
  MessageSquare,
  ChevronDown,
  Code,
  FileText,
  Github,
  ShieldCheck,
  Settings,
  Database,
  Bell,
  Camera,
  Copy,
  Download,
  FolderOpen,
  Play,
  Cpu,
  Check,
  Key,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Task } from "../types.js";
import { API_BASE } from "../lib/api.ts";

export type TabType =
  | "chat"
  | "preview"
  | "code"
  | "database"
  | "logs"
  | "deploy"
  | "github"
  | "permissions"
  | "settings"
  | "supabase"
  | "notifications"
  | "screenshots"
  | "simulation"
  | "faceswap"
  | "env";

export interface PersonaObj {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeColor: string;
  avatarBg: string;
  description: string;
}

interface NavbarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  currentPersonaObj: PersonaObj;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (v: boolean) => void;
  isMoreMenuOpen: boolean;
  setIsMoreMenuOpen: (v: boolean) => void;
  tasks: Task[];
}

export default function Navbar({
  activeTab,
  setActiveTab,
  currentPersonaObj,
  isSidebarOpen,
  setIsSidebarOpen,
  isMoreMenuOpen,
  setIsMoreMenuOpen,
}: NavbarProps) {
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const [menuCoords, setMenuCoords] = useState<{ top: number; right: number } | null>(null);

  const moreItems = [
    { id: "simulation", name: "Sub-Tasks Simulator", icon: Cpu, color: "text-pink-500" },
    { id: "code",       name: "Code",                icon: Code,       color: "text-blue-500" },
    { id: "deploy",     name: "Deploy",              icon: Zap,        color: "text-amber-500" },
    { id: "database",   name: "D1 Database Explorer",icon: Database,   color: "text-cyan-500" },
    { id: "logs",       name: "Logs",                icon: FileText,   color: "text-gray-500" },
    { id: "github",     name: "GitHub",              icon: Github,     color: "text-neutral-800" },
    { id: "permissions",name: "Permissions",         icon: ShieldCheck,color: "text-emerald-500" },
    { id: "settings",   name: "Settings",            icon: Settings,   color: "text-gray-600" },
    { id: "env",        name: "Env Box (API Keys)",  icon: Key,        color: "text-amber-500" },
    { id: "supabase",   name: "Supabase",            icon: Zap,        color: "text-emerald-600" },
    { id: "notifications",name:"Notifications",      icon: Bell,       color: "text-red-500" },
    { id: "screenshots",name: "Screenshots",         icon: Camera,     color: "text-indigo-500" },
  ] as const;

  const activeMoreItem = moreItems.find((item) => item.id === activeTab);
  const isMoreActive = Boolean(activeMoreItem) && !["chat", "preview", "faceswap"].includes(activeTab);

  const updateMenuPosition = () => {
    if (moreButtonRef.current) {
      const rect = moreButtonRef.current.getBoundingClientRect();
      setMenuCoords({
        top: rect.bottom + 6,
        right: Math.max(12, window.innerWidth - rect.right),
      });
    }
  };

  const handleToggleMore = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isMoreMenuOpen) {
      updateMenuPosition();
    }
    setIsMoreMenuOpen(!isMoreMenuOpen);
  };

  useEffect(() => {
    if (isMoreMenuOpen) {
      updateMenuPosition();
      window.addEventListener("resize", updateMenuPosition);
      window.addEventListener("scroll", updateMenuPosition, true);
      return () => {
        window.removeEventListener("resize", updateMenuPosition);
        window.removeEventListener("scroll", updateMenuPosition, true);
      };
    }
  }, [isMoreMenuOpen]);

  const handleDownloadZip = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMoreMenuOpen(false);
    try {
      const res = await fetch(`${API_BASE}/api/files`);
      if (res.ok) {
        const filesData = await res.json();
        const jsonStr = JSON.stringify(filesData, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "trinity-workspace-export.json";
        a.click();
        URL.revokeObjectURL(url);
      } else {
        alert("Failed to export workspace files.");
      }
    } catch (err) {
      alert("Error exporting workspace: " + (err as Error).message);
    }
  };

  const handleDuplicateProject = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMoreMenuOpen(false);
    const newSessionId = "session-" + Date.now();
    localStorage.setItem("trinity_active_session_id", newSessionId);
    sessionStorage.setItem("trinity_tab_session_id", newSessionId);
    window.location.reload();
  };

  return (
    <header className="bg-white/95 backdrop-blur-md border-b border-gray-100 px-2 sm:px-6 py-2 sm:py-3.5 flex items-center justify-between sticky top-0 z-50 shadow-xs gap-1 sm:gap-3 w-full select-none flex-none">
      {/* Left: Brand badge & menu toggle */}
      <div className="flex items-center gap-1 sm:gap-3 shrink-0">
        <button
          id="btn-sidebar-toggle"
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-1 sm:p-1.5 hover:bg-gray-100 rounded-xl text-gray-500 hover:text-gray-900 transition-colors shrink-0 cursor-pointer"
          title="Toggle Sidebar Navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-1">
          <div
            onClick={() => setIsSidebarOpen(true)}
            className={`flex items-center gap-1 sm:gap-1.5 ${currentPersonaObj.badgeColor} text-white font-bold text-[10px] sm:text-xs px-2 sm:px-3 py-1 sm:py-1.5 rounded-full shadow-xs whitespace-nowrap select-none shrink-0 cursor-pointer transition-colors`}
            title="Click to Faceswap agent persona"
          >
            <currentPersonaObj.icon className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
            <span className="hidden sm:inline-block">{currentPersonaObj.name}</span>
            <ChevronDown className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
          </div>
        </div>
      </div>

      {/* Center: Tabs */}
      <div className="flex items-center bg-gray-100/90 p-0.5 sm:p-1 rounded-full border border-gray-200/80 shrink-0 max-w-[calc(100vw-110px)] sm:max-w-none overflow-x-auto scrollbar-none">
        {/* Chat */}
        <button
          id="tab-btn-chat"
          onClick={() => setActiveTab("chat")}
          className={`flex items-center gap-1 sm:gap-2 px-2.5 sm:px-5 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === "chat" ? "bg-white text-gray-900 shadow-xs" : "text-gray-500 hover:text-gray-900"
          }`}
        >
          <MessageSquare className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          <span>Chat</span>
        </button>

        {/* Preview */}
        <button
          id="tab-btn-preview"
          onClick={() => setActiveTab("preview")}
          className={`flex items-center gap-1 sm:gap-2 px-2.5 sm:px-5 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === "preview" ? "bg-white text-gray-900 shadow-xs" : "text-gray-500 hover:text-gray-900"
          }`}
        >
          <Play className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          <span>Preview</span>
        </button>

        {/* Files */}
        <button
          id="tab-btn-files"
          onClick={() => setActiveTab("code")}
          className={`flex items-center gap-1 sm:gap-2 px-2.5 sm:px-5 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === "code" ? "bg-white text-gray-900 shadow-xs" : "text-gray-500 hover:text-gray-900"
          }`}
        >
          <FolderOpen className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          <span>Files</span>
        </button>

        {/* More button */}
        <button
          ref={moreButtonRef}
          id="tab-btn-more"
          onClick={handleToggleMore}
          className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
            isMoreActive || isMoreMenuOpen ? "bg-white text-gray-900 shadow-xs ring-1 ring-gray-200" : "text-gray-500 hover:text-gray-900"
          }`}
        >
          <span>{activeMoreItem && isMoreActive ? activeMoreItem.name : "More"}</span>
          <ChevronDown className={`h-2.5 w-2.5 sm:h-3 sm:w-3 transition-transform duration-200 ${isMoreMenuOpen ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* Fixed Dropdown Menu Portal */}
      <AnimatePresence>
        {isMoreMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-[9998] bg-black/5"
              onClick={(e) => {
                e.stopPropagation();
                setIsMoreMenuOpen(false);
              }}
            />
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.96 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              style={{
                position: "fixed",
                top: menuCoords ? `${menuCoords.top}px` : "56px",
                right: menuCoords ? `${menuCoords.right}px` : "16px",
              }}
              className="w-64 bg-[#FEF0E4] backdrop-blur-xl border border-[#E8D5C4] rounded-2xl shadow-2xl p-2 z-[9999] overflow-hidden font-sans text-xs max-h-[80vh] overflow-y-auto scrollbar-thin"
            >
              <div className="px-3 py-1.5 mb-1 text-[10px] font-bold text-amber-900/60 uppercase tracking-wider font-mono">
                System Views
              </div>
              {moreItems.map((item) => {
                const isSelected = activeTab === item.id;
                return (
                  <button
                    id={`more-menu-item-${item.id}`}
                    key={item.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMoreMenuOpen(false);
                      setActiveTab(item.id as TabType);
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left text-xs font-medium transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[#F8D8C0] text-amber-950 font-bold border border-amber-300/80 shadow-3xs"
                        : "text-gray-800 hover:bg-[#FBE4D2]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className={`h-4 w-4 ${item.color}`} />
                      <span>{item.name}</span>
                    </div>
                    {isSelected && <Check className="h-3.5 w-3.5 text-amber-700" />}
                  </button>
                );
              })}

              <div className="border-t border-[#E8D5C4]/80 my-1.5" />

              <div className="px-3 py-1 text-[10px] font-bold text-amber-900/60 uppercase tracking-wider font-mono">
                Actions
              </div>
              <button
                id="more-menu-item-duplicate"
                onClick={handleDuplicateProject}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-[#FBE4D2] rounded-xl text-left text-xs font-medium text-gray-800 transition-colors cursor-pointer"
              >
                <Copy className="h-4 w-4 text-amber-800/60" />
                Duplicate Project Session
              </button>
              <button
                id="more-menu-item-download"
                onClick={handleDownloadZip}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-[#FBE4D2] rounded-xl text-left text-xs font-medium text-gray-800 transition-colors cursor-pointer"
              >
                <Download className="h-4 w-4 text-amber-800/60" />
                Export Workspace Data (.json)
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Spacer for mobile flex balance */}
      <div className="w-10 sm:w-12 md:hidden block" />
    </header>
  );
}

