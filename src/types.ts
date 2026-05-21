export type TodoStatus = 'pending' | 'in_progress' | 'completed';

export interface Todo {
  content: string;
  status: TodoStatus;
  activeForm: string;
}

export interface AgentTodos {
  sessionId: string;
  agentId: string;
  isMain: boolean;
  todos: Todo[];
  updatedAt: number;
}

export interface SessionSnapshot {
  sessionId: string;
  cwd: string;
  agents: AgentTodos[];
}

export interface BridgeRecord {
  cwd: string;
  sessionId: string;
  terminalPid: number | null;
  startedAt: number;
}

export type ExtensionMessage =
  | { type: 'snapshot'; snapshot: SessionSnapshot | null }
  | { type: 'theme'; theme: 'dark' | 'light' | 'high-contrast' }
  | { type: 'error'; message: string };

export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'openPanel' };
