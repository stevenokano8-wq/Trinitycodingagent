import React, { useState } from "react";
import { FileNode } from "../types.js";
import { FileText, Folder, HardDrive, Edit3, Code, Save, Check, Menu, ArrowLeft, Laptop, FolderPlus, FilePlus, X, Plus } from "lucide-react";

interface CodeViewProps {
  files: FileNode[];
  onUpdateFile: (path: string, newContent: string) => void;
}

function buildFileTree(files: FileNode[]): Record<string, FileNode[]> {
  const tree: Record<string, FileNode[]> = {};
  for (const file of files) {
    const parts = file.path.split("/");
    const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : "(root)";
    if (!tree[folder]) tree[folder] = [];
    tree[folder].push(file);
  }
  return tree;
}

export default function CodeView({ files, onUpdateFile }: CodeViewProps) {
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(
    files.length > 0 ? files[0].path : null
  );
  const [editorContent, setEditorContent] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isSavedSuccessfully, setIsSavedSuccessfully] = useState(false);
  const [mobileView, setMobileView] = useState<"tree" | "editor">("tree");

  // Creation States
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemError, setNewItemError] = useState("");

  // Ref trackers for auto-detecting updates from agent
  const prevFilesLengthRef = React.useRef(files.length);
  const prevFilesRef = React.useRef(files);

  const selectedFile = files.find(f => f.path === selectedFilePath) || files[0];

  React.useEffect(() => {
    // If the list of files grows or a file content was modified by the agent, auto-select the most recently mutated file!
    if (files.length > 0) {
      if (files.length > prevFilesLengthRef.current) {
        // New file added! Select the newest one
        const newestFile = files[files.length - 1];
        setSelectedFilePath(newestFile.path);
      } else {
        // Check if any file content was modified (updated) compared to previous files
        const changedFile = files.find((f, idx) => {
          const prevF = prevFilesRef.current[idx];
          return prevF && prevF.path === f.path && prevF.content !== f.content;
        });
        if (changedFile) {
          setSelectedFilePath(changedFile.path);
        }
      }
    }
    prevFilesLengthRef.current = files.length;
    prevFilesRef.current = files;
  }, [files]);

  React.useEffect(() => {
    if (selectedFile) {
      setEditorContent(selectedFile.content);
      setIsEditing(false);
    }
  }, [selectedFilePath, selectedFile]);

  const handleSave = () => {
    if (selectedFile) {
      onUpdateFile(selectedFile.path, editorContent);
      setIsEditing(false);
      setIsSavedSuccessfully(true);
      setTimeout(() => setIsSavedSuccessfully(false), 2000);
    }
  };

  const handleCreateFolder = () => {
    if (!newItemName.trim()) {
      setNewItemError("Folder name cannot be empty");
      return;
    }
    let folderPath = newItemName.trim().replace(/\/+$/, ""); // remove trailing slashes
    // Default prefix if none is provided
    if (!folderPath.startsWith("src/") && !folderPath.startsWith("server/") && !folderPath.startsWith("public/")) {
      folderPath = `src/components/${folderPath}`;
    }
    
    const targetFilePath = `${folderPath}/.gitkeep`;
    
    if (files.some(f => f.path.startsWith(folderPath + "/"))) {
      setNewItemError("Folder path already exists");
      return;
    }

    onUpdateFile(targetFilePath, "");
    setSelectedFilePath(targetFilePath);
    setIsCreatingFolder(false);
    setNewItemName("");
    setNewItemError("");
  };

  const handleCreateFile = () => {
    if (!newItemName.trim()) {
      setNewItemError("File name cannot be empty");
      return;
    }
    let filePath = newItemName.trim();
    // Default prefix if none is provided
    if (!filePath.startsWith("src/") && !filePath.startsWith("server/") && !filePath.startsWith("public/")) {
      filePath = `src/components/${filePath}`;
    }

    // Default extension if none is provided
    if (!filePath.includes(".")) {
      filePath = `${filePath}.tsx`;
    }

    if (files.some(f => f.path === filePath)) {
      setNewItemError("File path already exists");
      return;
    }

    onUpdateFile(filePath, "");
    setSelectedFilePath(filePath);
    setIsCreatingFile(false);
    setNewItemName("");
    setNewItemError("");
  };

  return (
    <div id="code-view-container" className="flex flex-col md:flex-row flex-1 h-full min-h-[500px] border border-gray-100 rounded-3xl bg-white overflow-hidden shadow-xs">
      
      {/* File Tree Left Rail - Hidden on mobile if viewing editor */}
      <div className={`w-full md:w-64 border-r border-gray-50 bg-gray-50/50 p-4 flex flex-col h-full ${
        mobileView === "editor" ? "hidden md:flex" : "flex"
      }`}>
        <div className="flex items-center justify-between pb-3 border-b border-gray-150 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <HardDrive className="h-3.5 w-3.5 text-gray-500 shrink-0" />
            <span className="text-[10px] font-bold tracking-wider uppercase text-gray-500 font-mono truncate">Workspace</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              id="btn-trigger-folder-creation"
              onClick={() => {
                setIsCreatingFolder(true);
                setIsCreatingFile(false);
                setNewItemName("");
                setNewItemError("");
              }}
              className="p-1 hover:bg-gray-200 rounded text-gray-500 hover:text-gray-900 transition-all cursor-pointer"
              title="New Folder (.gitkeep)"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
            <button
              id="btn-trigger-file-creation"
              onClick={() => {
                setIsCreatingFile(true);
                setIsCreatingFolder(false);
                setNewItemName("");
                setNewItemError("");
              }}
              className="p-1 hover:bg-gray-200 rounded text-gray-500 hover:text-gray-900 transition-all cursor-pointer"
              title="New File"
            >
              <FilePlus className="h-3.5 w-3.5" />
            </button>
          </div>
          {/* Mobile view only helper */}
          <span className="md:hidden text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-bold">Explorer</span>
        </div>

        {/* Inline Folder/File Creation UI */}
        {(isCreatingFolder || isCreatingFile) && (
          <div className="bg-white border border-gray-200 rounded-xl p-2.5 mb-3 space-y-2 shadow-xs animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-gray-400 font-mono uppercase">
                {isCreatingFolder ? "New Folder Path" : "New File Path"}
              </span>
              <button
                onClick={() => {
                  setIsCreatingFolder(false);
                  setIsCreatingFile(false);
                  setNewItemName("");
                  setNewItemError("");
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            
            <input
              id="input-new-item-name"
              type="text"
              placeholder={isCreatingFolder ? "e.g., my_new_folder" : "e.g., Button.tsx"}
              value={newItemName}
              onChange={(e) => {
                setNewItemName(e.target.value);
                setNewItemError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (isCreatingFolder) handleCreateFolder();
                  else handleCreateFile();
                }
              }}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-mono text-gray-800 placeholder-gray-400 focus:outline-none focus:border-gray-400"
              autoFocus
            />
            
            {newItemError && (
              <p className="text-[9px] text-red-500 font-mono leading-none">{newItemError}</p>
            )}
            
            <div className="flex justify-end gap-1.5">
              <button
                id="btn-cancel-create"
                onClick={() => {
                  setIsCreatingFolder(false);
                  setIsCreatingFile(false);
                  setNewItemName("");
                  setNewItemError("");
                }}
                className="px-2 py-1 text-[10px] text-gray-500 hover:text-gray-800 font-medium"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-create"
                onClick={isCreatingFolder ? handleCreateFolder : handleCreateFile}
                className="bg-gray-900 text-white hover:bg-gray-800 px-2.5 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 shadow-xs"
              >
                <Check className="h-3 w-3" /> Create
              </button>
            </div>
          </div>
        )}

        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-4">
            <Folder className="h-8 w-8 text-gray-300 stroke-1 mb-2" />
            <p className="text-[11px] text-gray-400 font-mono">No synthesized files yet. Run a build to generate code.</p>
          </div>
        ) : (
          <div className="space-y-1 overflow-y-auto flex-1 max-h-[300px] md:max-h-none">
            {Object.entries(buildFileTree(files)).map(([folder, folderFiles]) => (
              <div key={folder}>
                <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold text-gray-400 uppercase font-mono mt-2 mb-0.5 select-none">
                  <Folder className="h-3 w-3 text-amber-400" />
                  <span className="truncate">{folder}</span>
                </div>
                {folderFiles.map(file => {
                  const isActive = file.path === selectedFilePath || (!selectedFilePath && file.path === files[0].path);
                  const fileName = file.path.split("/").pop() || file.path;
                  return (
                    <button
                      id={`file-node-${file.path.replace(/[^a-z0-9]/g, "-")}`}
                      key={file.path}
                      onClick={() => {
                        setSelectedFilePath(file.path);
                        setMobileView("editor");
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left text-xs font-mono transition-all ${
                        isActive
                          ? "bg-gray-900 text-white font-semibold shadow-xs"
                          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      }`}
                    >
                      <FileText className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-amber-400" : "text-gray-400"}`} />
                      <span className="truncate">{fileName}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Code Editor Right Container - Hidden on mobile if viewing tree */}
      <div className={`flex-1 flex flex-col h-full bg-gray-950 ${
        mobileView === "tree" ? "hidden md:flex" : "flex"
      }`}>
        {selectedFile ? (
          <>
            {/* Editor Toolbar */}
            <div className="flex items-center justify-between px-4 md:px-5 py-3 border-b border-gray-900 bg-gray-920 text-gray-300 font-mono text-[11px]">
              <div className="flex items-center gap-2 min-w-0">
                {/* Back to tree button for mobile screens */}
                <button
                  id="btn-editor-back-to-tree"
                  onClick={() => setMobileView("tree")}
                  className="md:hidden p-1 bg-gray-850 hover:bg-gray-800 text-gray-300 rounded-lg mr-1 flex items-center justify-center shrink-0"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                
                <Code className="h-4 w-4 text-amber-400 shrink-0" />
                <span className="text-gray-200 font-semibold truncate text-[10px] sm:text-xs" title={selectedFile.path}>{selectedFile.path.split("/").pop()}</span>
                <span className="text-[8px] sm:text-[9px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded-sm uppercase shrink-0">{selectedFile.language}</span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {isSavedSuccessfully && (
                  <span className="text-emerald-400 flex items-center gap-1 text-[9px] sm:text-[10px]">
                    <Check className="h-3.5 w-3.5" /> Saved
                  </span>
                )}
                
                {isEditing ? (
                  <>
                    <button
                      id="btn-editor-cancel"
                      onClick={() => {
                        setEditorContent(selectedFile.content);
                        setIsEditing(false);
                      }}
                      className="px-2 py-1 text-gray-400 hover:text-gray-200 text-[9px] sm:text-[10px] uppercase font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      id="btn-editor-save"
                      onClick={handleSave}
                      className="bg-emerald-600 text-white hover:bg-emerald-500 px-2.5 py-1 rounded-md flex items-center gap-1 text-[9px] sm:text-[10px] font-bold shadow-sm"
                    >
                      <Save className="h-3 w-3" /> Save
                    </button>
                  </>
                ) : (
                  <button
                    id="btn-editor-edit"
                    onClick={() => setIsEditing(true)}
                    className="bg-gray-800 text-gray-200 hover:bg-gray-700 px-2.5 py-1 rounded-md flex items-center gap-1.5 text-[9px] sm:text-[10px] font-bold"
                  >
                    <Edit3 className="h-3 w-3" /> Mod File
                  </button>
                )}
              </div>
            </div>

            {/* Editor Body */}
            <div className="flex-1 relative flex overflow-hidden min-h-[350px]">
              {/* Line numbers mock column */}
              <div className="bg-gray-920 text-gray-600 px-2 md:px-3.5 py-4 select-none font-mono text-[10px] md:text-xs text-right border-r border-gray-900 space-y-[4px]">
                {Array.from({ length: Math.max(15, editorContent.split("\n").length) }).map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>
              
              {isEditing ? (
                <textarea
                  id="textarea-code-editor"
                  value={editorContent}
                  onChange={(e) => setEditorContent(e.target.value)}
                  className="flex-1 w-full h-full bg-transparent text-gray-100 p-4 font-mono text-[11px] md:text-xs focus:outline-none resize-none leading-relaxed space-y-[4px]"
                  spellCheck="false"
                />
              ) : (
                <pre className="flex-1 p-4 overflow-y-auto leading-relaxed text-[11px] md:text-xs font-mono text-gray-200 select-text scrollbar-thin">
                  <code>{selectedFile.content}</code>
                </pre>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 text-center p-8 text-gray-500 font-mono">
            {/* Mobile Back button if empty and in editor state */}
            <button onClick={() => setMobileView("tree")} className="md:hidden mb-4 bg-gray-800 px-3 py-1.5 rounded-xl text-xs text-gray-300">Show Explorer</button>
            <Code className="h-12 w-12 text-gray-700 stroke-1 mb-3 animate-pulse" />
            <h4 className="text-sm font-bold text-gray-400">No File Loaded</h4>
            <p className="text-[11px] max-w-xs mt-1 text-gray-600">
              When Sovereign Agent begins building, the synthesized code files will appear in this workspace workspace.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
