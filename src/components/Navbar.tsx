import React from "react";
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
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Task } from "../types.js";

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
  | "faceswap";

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
  const moreItems = [
    { id: "simulation", name: "Sub-Tasks Simulator", icon: Cpu, color: "text-pink-500 animate-pulse" },
    { id: "code",       name: "Code",                icon: Code,       color: "text-blue-500" },
    { id: "deploy",     name: "Deploy",              icon: Zap,        color: "text-amber-500" },
    { id: "database",   name: "D1 Database Explorer",icon: Database,   color: "text-cyan-500" },
    { id: "logs",       name: "Logs",                icon: FileText,   color: "text-gray-500" },
    { id: "github",     name: "GitHub",              icon: Github,     color: "text-neutral-800" },
    { id: "permissions",name: "Permissions",         icon: ShieldCheck,color: "text-emerald-500" },
    { id: "settings",   name: "Settings",            icon: Settings,   color: "text-gray-600" },
    { id: "supabase",   name: "Supabase",            icon: Zap,        color: "text-emerald-600" },
    { id: "notifications",name:"Notifications",      icon: Bell,       color: "text-red-500" },
    { id: "screenshots",name: "Screenshots",         icon: Camera,     color: "text-indigo-500" },
  ] as const;

  const isMoreActive = !["chat", "preview", "faceswap", "code"].includes(activeTab);

  return (
    <header className="bg-white/95 backdrop-blur-md border-b border-gray-100 px-2 sm:px-6 py-2 sm:py-3.5 flex items-center justify-between sticky top-0 z-50 shadow-xs gap-1 sm:gap-3 w-full select-none flex-none">
      {/* Left: Brand badge & menu toggle */}
      <div className="flex items-center gap-1 sm:gap-3 shrink-0">
        <button
          id="btn-sidebar-toggle"
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-1 sm:p-1.5 hover:bg-gray-100 rounded-xl text-gray-500 hover:text-gray-900 transition-colors shrink-0"
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
      <div className="flex items-center bg-gray-100/90 p-0.5 sm:p-1 rounded-full border border-gray-200/80 relative shrink-0 max-w-[calc(100vw-110px)] sm:max-w-none overflow-x-auto scrollbar-none">
        {/* Chat */}
        <button
          id="tab-btn-chat"
          onClick={() => setActiveTab("chat")}
          className={`flex items-center gap-1 sm:gap-2 px-2.5 sm:px-5 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
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
          className={`flex items-center gap-1 sm:gap-2 px-2.5 sm:px-5 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
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
          className={`flex items-center gap-1 sm:gap-2 px-2.5 sm:px-5 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
            activeTab === "code" ? "bg-white text-gray-900 shadow-xs" : "text-gray-500 hover:text-gray-900"
          }`}
        >
          <FolderOpen className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          <span>Files</span>
        </button>

        {/* More dropdown */}
        <div className="relative shrink-0">
          <button
            id="tab-btn-more"
            onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
            className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
              isMoreActive ? "bg-white text-gray-900 shadow-xs" : "text-gray-500 hover:text-gray-900"
            }`}
          >
            <span>More</span>
            <ChevronDown className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
          </button>

          <AnimatePresence>
            {isMoreMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsMoreMenuOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute right-0 mt-2 w-56 bg-white border border-gray-100 rounded-2xl shadow-xl p-2 z-50 overflow-hidden font-sans text-xs"
                >
                  {moreItems.map((item) => (
                    <button
                      id={`more-menu-item-${item.id}`}
                      key={item.id}
                      onClick={() => {
                        setIsMoreMenuOpen(false);
                        setActiveTab(item.id as TabType);
                      }}
                      className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-gray-50 rounded-xl text-left text-xs font-medium text-gray-700 transition-colors"
                    >
                      <item.icon className={`h-4 w-4 ${item.color}`} />
                      {item.name}
                    </button>
                  ))}

                  <div className="border-t border-gray-100 my-1" />

                  <button
                    id="more-menu-item-duplicate"
                    onClick={() => { alert("Duplicating project blueprint in background..."); setIsMoreMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-gray-50 rounded-xl text-left text-xs font-medium text-gray-500 transition-colors"
                  >
                    <Copy className="h-4 w-4" />
                    Duplicate Project
                  </button>
                  <button
                    id="more-menu-item-download"
                    onClick={() => { alert("Zipping project directory to download.zip..."); setIsMoreMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-gray-50 rounded-xl text-left text-xs font-medium text-gray-500 transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    Download ZIP
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Spacer for mobile flex balance */}
      <div className="w-10 sm:w-12 md:hidden block" />
    </header>
  );
}
