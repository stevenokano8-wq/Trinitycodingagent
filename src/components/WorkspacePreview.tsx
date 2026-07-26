import React from "react";
import { Task, FileNode } from "../types.js";
import CodeView from "./CodeView.tsx";
import PreviewView from "./PreviewView.tsx";
import { TabType } from "./Navbar.tsx";

interface WorkspacePreviewProps {
  activeTab: TabType;
  files: FileNode[];
  currentPrompt: string;
  previewReloadKey: number;
  tasks: Task[];
  isSending: boolean;
  onUpdateFile: (path: string, content: string) => void;
}

export default function WorkspacePreview({
  activeTab,
  files,
  currentPrompt,
  previewReloadKey,
  tasks,
  isSending,
  onUpdateFile,
}: WorkspacePreviewProps) {
  return (
    <div
      className={`w-full md:col-span-6 flex flex-col min-h-0 h-full overflow-hidden ${
        ["chat", "preview", "code"].includes(activeTab)
          ? ["preview", "code"].includes(activeTab)
            ? "flex flex-1"
            : "hidden md:flex"
          : "hidden"
      }`}
    >
      {activeTab === "code" ? (
        <CodeView files={files} onUpdateFile={onUpdateFile} />
      ) : (
        <PreviewView
          currentPrompt={currentPrompt}
          files={files}
          previewReloadKey={previewReloadKey}
          tasks={tasks}
          isSending={isSending}
        />
      )}
    </div>
  );
}
