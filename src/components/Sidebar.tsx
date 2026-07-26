import React, { useState } from "react";
import {
  MessageSquare,
  Plus,
  Trash2,
  Key,
  ShieldCheck,
  Code,
  Zap,
  Database,
  Github,
  Settings,
  Bell,
  Camera,
  Cpu,
  Bot,
  Layers,
  ChevronRight,
  Server,
  Activity,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { TabType, PersonaObj } from "./Navbar.tsx";
import { AgentSession, DatabaseStatus } from "../types.js";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  sessions: AgentSession[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  dbStatus: DatabaseStatus;
  currentPersona: PersonaObj;
  personas: PersonaObj[];
  onSelectPersona: (p: PersonaObj) => void;
}

export default function Sidebar({
  isOpen,
  onClose,
  activeTab,
  setActiveTab,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  dbStatus,
  currentPersona,
  personas,
  onSelectPersona,
}: SidebarProps) {
  const [showPersonaMenu, setShowPersonaMenu] = useState(false);

  const navItems = [
    { id: "chat" as TabType, label: "Agent Chat & Workspace", icon: MessageSquare, color: "text-indigo-600" },
    { id: "code" as TabType, label: "Code Explorer", icon: Code, color: "text-blue-600" },
    { id: "preview" as TabType, label: "Live App Preview", icon: Layers, color: "text-purple-600" },
    { id: "database" as TabType, label: "D1 Database & KV", icon: Database, color: "text-cyan-600" },
    { id: "deploy" as TabType, label: "Deploy / Cloudflare", icon: Zap, color: "text-amber-600" },
    { id: "github" as TabType, label: "GitHub Integration", icon: Github, color: "text-gray-800" },
    { id: "simulation" as TabType, label: "Sub-Tasks Simulator", icon: Cpu, color: "text-pink-600" },
    { id: "notifications" as TabType, label: "Notifications & Events", icon: Bell, color: "text-red-600" },
    { id: "permissions" as TabType, label: "Permissions Audit", icon: ShieldCheck, color: "text-emerald-600" },
    { id: "screenshots" as TabType, label: "Screenshots & Assets", icon: Camera, color: "text-teal-600" },
    { id: "settings" as TabType, label: "Settings & Keys", icon: Settings, color: "text-gray-600" },
  ];

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-gray-900/40 backdrop-blur-xs z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar Panel */}
      <motion.aside
        initial={{ x: "-100%" }}
        animate={{ x: isOpen ? 0 : "-100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className={`fixed top-0 left-0 bottom-0 w-80 bg-white border-r border-gray-150 z-50 flex flex-col shadow-2xl font-sans select-none ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-linear-to-b from-gray-50/80 to-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-xs">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-gray-900 font-display">Trinity Agent</h2>
              <p className="text-[10px] text-gray-500 font-mono">Sovereign Agentic System</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Active Persona Card */}
        <div className="p-3 mx-3 mt-3 bg-gray-50 rounded-2xl border border-gray-200/70 relative">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Active Persona</span>
            <button
              onClick={() => setShowPersonaMenu(!showPersonaMenu)}
              className="text-[10px] text-indigo-600 font-semibold hover:underline flex items-center gap-0.5"
            >
              Change
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          <div className="flex items-center gap-2.5 mt-2">
            <div className={`p-2 ${currentPersona.avatarBg} text-white rounded-xl shadow-2xs`}>
              <currentPersona.icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-xs text-gray-900 truncate">{currentPersona.name}</div>
              <p className="text-[10px] text-gray-500 truncate">{currentPersona.description}</p>
            </div>
          </div>

          {/* Persona selector dropdown */}
          {showPersonaMenu && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 p-2 space-y-1">
              {personas.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    onSelectPersona(p);
                    setShowPersonaMenu(false);
                  }}
                  className={`w-full flex items-center gap-2.5 p-2 rounded-xl text-xs text-left transition-colors ${
                    p.id === currentPersona.id ? "bg-indigo-50 text-indigo-900 font-bold" : "hover:bg-gray-50 text-gray-700"
                  }`}
                >
                  <div className={`p-1.5 ${p.avatarBg} text-white rounded-lg shrink-0`}>
                    <p.icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{p.name}</div>
                    <div className="text-[10px] text-gray-400 truncate">{p.description}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sessions Section */}
        <div className="px-3 pt-4 pb-2 border-b border-gray-100 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Agent Workspaces</span>
            <button
              onClick={onNewSession}
              className="p-1 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex items-center gap-1 text-[11px] font-semibold"
              title="Start New Agent Session"
            >
              <Plus className="h-3.5 w-3.5" />
              New
            </button>
          </div>

          <div className="space-y-1">
            {sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                className={`group flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer transition-all ${
                  session.id === activeSessionId
                    ? "bg-indigo-50/80 text-indigo-900 font-bold border border-indigo-150"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                  <span className="truncate">{session.name}</span>
                </div>
                {sessions.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(session.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-600 rounded transition-opacity"
                    title="Delete workspace"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Nav Items */}
          <div className="mt-4 pt-3 border-t border-gray-100">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 mb-2 block">
              Navigation
            </span>
            <div className="space-y-0.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      onClose();
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium transition-all ${
                      isActive
                        ? "bg-gray-900 text-white font-bold shadow-xs"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${isActive ? "text-white" : item.color}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Infrastructure Health */}
        <div className="p-3 bg-gray-50 border-t border-gray-100 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-gray-600 flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5 text-indigo-600" />
              Cloudflare D1 DB
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                dbStatus.d1 === "connected"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {dbStatus.d1 === "connected" ? "ONLINE" : "FALLBACK"}
            </span>
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-gray-600 flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-amber-600" />
              Workers KV Cache
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                dbStatus.kv === "connected"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {dbStatus.kv === "connected" ? "ACTIVE" : "FALLBACK"}
            </span>
          </div>
        </div>
      </motion.aside>
    </>
  );
}
