import { SessionCore, type SessionCoreDeps } from './sessionCore';
import type { SessionSnapshot, SessionSummary, ProjectUsage } from '../types';

export type CoreCommand =
  | { cmd: 'init'; claudeDir: string; cwds: string[] }
  | { cmd: 'getSnapshot' }
  | { cmd: 'watch'; on: boolean }
  | { cmd: 'getProjectUsage' }
  | { cmd: 'resolveTodoSource'; sessionId: string; agentId: string; line: number }
  | { cmd: 'setPinned'; sessionId: string | null }
  | { cmd: 'listSessions' };

export type CoreEvent =
  | { ev: 'snapshot'; snapshot: SessionSnapshot | null }
  | { ev: 'projectUsage'; usage: ProjectUsage | null }
  | { ev: 'todoSource'; filePath: string; line: number }
  | { ev: 'todoSource'; filePath: null }
  | { ev: 'sessions'; sessions: SessionSummary[] }
  | { ev: 'error'; message: string };

type MakeCore = (deps: SessionCoreDeps) => SessionCore;

export function createDispatcher(
  emit: (ev: CoreEvent) => void,
  makeCore: MakeCore = (deps) => new SessionCore(deps),
): (cmd: CoreCommand) => void {
  let core: SessionCore | null = null;
  let cwds: string[] = [];
  let watchSub: { dispose(): void } | null = null;

  return (cmd: CoreCommand): void => {
    if (cmd.cmd === 'init') {
      watchSub?.dispose();
      watchSub = null;
      core?.dispose();
      cwds = cmd.cwds;
      core = makeCore({ claudeDir: cmd.claudeDir, workspaceCwds: () => cwds });
      return;
    }
    if (!core) { emit({ ev: 'error', message: 'not initialized' }); return; }
    switch (cmd.cmd) {
      case 'getSnapshot':
        emit({ ev: 'snapshot', snapshot: core.buildSnapshot() });
        break;
      case 'watch':
        if (cmd.on) {
          if (watchSub === null) {
            watchSub = core.onChange(() => emit({ ev: 'snapshot', snapshot: core!.buildSnapshot() }));
          }
        } else {
          watchSub?.dispose();
          watchSub = null;
        }
        break;
      case 'getProjectUsage':
        emit({ ev: 'projectUsage', usage: core.getProjectUsage() });
        break;
      case 'resolveTodoSource': {
        const t = core.resolveTodoSource(cmd.sessionId, cmd.agentId, cmd.line);
        emit(t ? { ev: 'todoSource', filePath: t.filePath, line: t.line } : { ev: 'todoSource', filePath: null });
        break;
      }
      case 'setPinned':
        core.setPinnedSession(cmd.sessionId);
        break;
      case 'listSessions':
        emit({ ev: 'sessions', sessions: core.listSessions() });
        break;
      default:
        emit({ ev: 'error', message: `unknown command: ${(cmd as { cmd: string }).cmd}` });
    }
  };
}
