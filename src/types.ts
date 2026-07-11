export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  taskId?: string; // If this message spawned a task
  actionsTaken?: Array<{
    type: 'create_folder' | 'create_file' | 'edit_file' | 'run_command' | 'build';
    pathOrCommand: string;
    details?: string;
    success: boolean;
  }>;
  thoughtTimeSeconds?: number;
  modelName?: string;
  durationSeconds?: number;
}

export interface Task {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number; // 0 to 100
  activeSubtaskIndex: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  subtasks: Subtask[];
}

export interface Subtask {
  id: string;
  taskId: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  logs: string[];
  code?: string;
  file?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface FileNode {
  path: string;
  content: string;
  language: string;
}

export interface DatabaseStatus {
  d1: 'connected' | 'local_fallback' | 'error';
  kv: 'connected' | 'local_fallback' | 'error';
}

export interface AgentSession {
  id: string;
  name: string;
  createdAt: string;
}
