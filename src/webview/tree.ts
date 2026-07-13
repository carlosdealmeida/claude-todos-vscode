import type { AgentTodos } from '../types';

export interface AgentNode {
  agent: AgentTodos;
  children: AgentNode[];
}

// Sub-agent que já terminou e nunca teve todos: só faz sentido como histórico.
export function isHistory(agent: AgentTodos): boolean {
  return !agent.isMain && agent.status !== 'running' && agent.todos.length === 0;
}

// Monta a floresta a partir da lista plana do snapshot. Regras:
// - main agents viram raízes;
// - filho vai para o parentAgentId quando esse agente está na lista;
// - pai ausente/desconhecido → filho do primeiro main (órfão nunca some);
// - sem main na lista → o agente vira raiz;
// - a ordem relativa da lista é preservada entre irmãos (o parser já ordena).
export function buildTree(agents: AgentTodos[]): AgentNode[] {
  const nodes = new Map<string, AgentNode>();
  for (const a of agents) nodes.set(a.agentId, { agent: a, children: [] });
  const mainNode = agents.filter(a => a.isMain).map(a => nodes.get(a.agentId)!)[0];

  const roots: AgentNode[] = [];
  for (const a of agents) {
    const node = nodes.get(a.agentId)!;
    if (a.isMain) {
      roots.push(node);
      continue;
    }
    const parent = a.parentAgentId !== undefined ? nodes.get(a.parentAgentId) : undefined;
    if (parent !== undefined && parent !== node) parent.children.push(node);
    else if (mainNode !== undefined && mainNode !== node) mainNode.children.push(node);
    else roots.push(node);
  }
  return roots;
}
