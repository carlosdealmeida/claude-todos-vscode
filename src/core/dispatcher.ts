import { SessionCore, type SessionCoreDeps } from './sessionCore';
import type { SessionSnapshot, SessionSummary, ProjectUsage, AwaitingInput } from '../types';
import type { NotificationKind } from '../services/sessionNotifier';

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

  return (cmd: CoreCommand): void => {
    if (cmd.cmd === 'init') {
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
        if (cmd.on) core.onChange(() => emit({ ev: 'snapshot', snapshot: core!.buildSnapshot() }));
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
