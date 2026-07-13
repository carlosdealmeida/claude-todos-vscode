import type { Locale } from './i18n/locale';

export type TodoStatus = 'pending' | 'in_progress' | 'completed';

export interface Todo {
  content: string;
  status: TodoStatus;
  activeForm: string;
  startedAt?: number;    // epoch ms — 1ª vez observada in_progress
  completedAt?: number;  // epoch ms — 1ª vez observada completed
}

export interface AgentTodos {
  sessionId: string;
  agentId: string;
  name: string;
  isMain: boolean;
  status?: 'running' | 'completed';
  todos: Todo[];
  updatedAt: number;
  agentType?: string;      // do meta.json (ex.: "general-purpose", "Explore")
  parentAgentId?: string;  // agentId do agente que disparou este; ausente = filho do main
  depth?: number;          // spawnDepth do meta.json (1 = disparado pelo main)
}

export interface ModelUsage {
  model: string;   // ex.: "claude-opus-4-8"
  input: number;   // soma de input_tokens
  output: number;  // soma de output_tokens
  cache: number;   // cache_creation_input_tokens + cache_read_input_tokens
}

export interface AgentUsage {
  agentId: string;
  name: string;        // "Main agent" ou nome do sub-agent
  isMain: boolean;
  models: ModelUsage[];
}

export interface ContextUsage {
  tokens: number;  // input + cache da última mensagem do transcript principal
  limit: number;   // 200_000 | 1_000_000
}

export interface CacheStats {
  input: number;     // entrada não-cacheada (Σ input_tokens)
  read: number;      // Σ cache_read_input_tokens
  creation: number;  // Σ cache_creation_input_tokens
}

export interface SessionUsage {
  byModel: ModelUsage[];  // totais da sessão agrupados por modelo
  byAgent: AgentUsage[];  // quebra por agente
  context?: ContextUsage;
  cache?: CacheStats;
}

export interface SessionSnapshot {
  sessionId: string;
  cwd: string;
  title: string;
  pinned: boolean;
  agents: AgentTodos[];
  usage?: SessionUsage;
}

export interface SessionSummary {
  sessionId: string;
  cwd: string;
  title: string;
  updatedAt: number;
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
  | { type: 'locale'; locale: Locale }
  | { type: 'error'; message: string };

export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'openPanel' }
  | { type: 'pickSession' };
