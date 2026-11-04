import type { SessionSnapshot } from '../../../src/types';
import { shiftTodo } from './reanchor';

// Acima disto, a task nao e recente de proposito: veio de um transcript antigo.
const STALE_MS = 3_600_000;

// A gravacao reproduz um transcript antigo: updatedAt fica na hora da gravacao, mas
// os carimbos das tasks continuam na data do transcript, e o visitante leria "333h".
// Cada frame e alinhado por conta propria porque a gravacao comprime o tempo: um
// deslocamento unico poria tasks no futuro, com duracao negativa. Puro.
export function alignTaskClock<F extends { atMs: number; snapshot: SessionSnapshot }>(
  recordedAt: number,
  frames: readonly F[],
): F[] {
  return frames.map((frame) => {
    const stamps = frame.snapshot.agents.flatMap((a) => [
      ...(a.todosUpdatedAt !== undefined ? [a.todosUpdatedAt] : []),
      ...a.todos.flatMap((t) => [t.startedAt ?? 0, t.completedAt ?? 0]),
    ]);
    if (stamps.length === 0) return frame;
    const at = recordedAt + frame.atMs;
    const newest = Math.max(...stamps);
    if (at - newest <= STALE_MS) return frame;
    const delta = at - newest;
    return {
      ...frame,
      snapshot: {
        ...frame.snapshot,
        agents: frame.snapshot.agents.map((a) => ({
          ...a,
          todos: a.todos.map((t) => shiftTodo(t, delta)),
          ...(a.todosUpdatedAt !== undefined ? { todosUpdatedAt: a.todosUpdatedAt + delta } : {}),
        })),
      },
    };
  });
}
