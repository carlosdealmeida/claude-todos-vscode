import type { SessionSnapshot, AgentTodos, Todo } from '../../../src/types';

// Campos ausentes tem que continuar ausentes: `undefined + delta` viraria NaN,
// e a UI trata ausencia como "sem informacao de tempo", nao como zero.
function shift(value: number | undefined, deltaMs: number): number | undefined {
  return value === undefined ? undefined : value + deltaMs;
}

function shiftTodo(todo: Todo, deltaMs: number): Todo {
  const out: Todo = { ...todo };
  if (todo.startedAt !== undefined) out.startedAt = todo.startedAt + deltaMs;
  if (todo.completedAt !== undefined) out.completedAt = todo.completedAt + deltaMs;
  return out;
}

function shiftAgent(agent: AgentTodos, deltaMs: number): AgentTodos {
  const out: AgentTodos = {
    ...agent,
    updatedAt: agent.updatedAt + deltaMs,
    todos: agent.todos.map((t) => shiftTodo(t, deltaMs)),
  };
  const todosUpdatedAt = shift(agent.todosUpdatedAt, deltaMs);
  if (todosUpdatedAt !== undefined) out.todosUpdatedAt = todosUpdatedAt;
  return out;
}

// Desloca todo o eixo temporal de um snapshot gravado para a janela do "agora"
// do visitante. Puro: nao muta a entrada.
export function reanchor(snapshot: SessionSnapshot, deltaMs: number): SessionSnapshot {
  return {
    ...snapshot,
    agents: snapshot.agents.map((a) => shiftAgent(a, deltaMs)),
  };
}
