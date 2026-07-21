import { SessionCore, type SessionCoreDeps } from './sessionCore';
import type { SessionSnapshot, SessionSummary, ProjectUsage, AwaitingInput } from '../types';
import type { NotificationKind } from '../services/sessionNotifier';

export type CoreCommand = (
  | { cmd: 'init'; claudeDir: string; cwds: string[] }
  | { cmd: 'getSnapshot' }
  | { cmd: 'watch'; on: boolean }
  | { cmd: 'getProjectUsage' }
  | { cmd: 'resolveTodoSource'; sessionId: string; agentId: string; line: number }
  | { cmd: 'setPinned'; sessionId: string | null }
  | { cmd: 'listSessions' }
  | { cmd: 'observe' }
  | { cmd: 'hookStatus'; hookScriptPath: string }
  | { cmd: 'installHook'; hookScriptPath: string }
) & { id?: string };

export type CoreEvent = (
  | { ev: 'snapshot'; snapshot: SessionSnapshot | null }
  | { ev: 'projectUsage'; usage: ProjectUsage | null }
  | { ev: 'todoSource'; filePath: string; line: number }
  | { ev: 'todoSource'; filePath: null }
  | { ev: 'sessions'; sessions: SessionSummary[] }
  | { ev: 'error'; message: string }
  | { ev: 'notification'; kinds: NotificationKind[]; awaitingInput: AwaitingInput | null; title: string | null }
  | { ev: 'hookStatus'; installed: boolean }
  | { ev: 'hookInstalled' }
) & { id?: string };

type MakeCore = (deps: SessionCoreDeps) => SessionCore;

export function createDispatcher(
  emit: (ev: CoreEvent) => void,
  makeCore: MakeCore = (deps) => new SessionCore(deps),
): (cmd: CoreCommand) => void {
  let core: SessionCore | null = null;
  let cwds: string[] = [];
  let watchSub: { dispose(): void } | null = null;

  // Eco do correlation id: só respostas diretas ao comando corrente o carregam;
  // pushes de watch saem sem id (o closure do watch não usa withId).
  const withId = (ev: CoreEvent, id: string | undefined): CoreEvent =>
    id !== undefined ? { ...ev, id } : ev;

  return (cmd: CoreCommand): void => {
    if (cmd.cmd === 'init') {
      watchSub?.dispose();
      watchSub = null;
      core?.dispose();
      cwds = cmd.cwds;
      core = makeCore({ claudeDir: cmd.claudeDir, workspaceCwds: () => cwds });
      return;
    }
    if (!core) { emit(withId({ ev: 'error', message: 'not initialized' }, cmd.id)); return; }
    switch (cmd.cmd) {
      case 'getSnapshot':
        emit(withId({ ev: 'snapshot', snapshot: core.buildSnapshot() }, cmd.id));
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
        emit(withId({ ev: 'projectUsage', usage: core.getProjectUsage() }, cmd.id));
        break;
      case 'resolveTodoSource': {
        const t = core.resolveTodoSource(cmd.sessionId, cmd.agentId, cmd.line);
        emit(withId(t ? { ev: 'todoSource', filePath: t.filePath, line: t.line } : { ev: 'todoSource', filePath: null }, cmd.id));
        break;
      }
      case 'setPinned':
        core.setPinnedSession(cmd.sessionId);
        break;
      case 'listSessions':
        emit(withId({ ev: 'sessions', sessions: core.listSessions() }, cmd.id));
        break;
      case 'observe': {
        const o = core.observeForNotifications();
        emit(withId({ ev: 'notification', kinds: o.kinds, awaitingInput: o.awaitingInput, title: o.title }, cmd.id));
        break;
      }
      case 'hookStatus':
        emit(withId({ ev: 'hookStatus', installed: core.hookStatus(cmd.hookScriptPath) }, cmd.id));
        break;
      case 'installHook':
        try {
          core.installHook(cmd.hookScriptPath);
          emit(withId({ ev: 'hookInstalled' }, cmd.id));
        } catch (err) {
          emit(withId({ ev: 'error', message: String(err) }, cmd.id));
        }
        break;
      default:
        emit(withId({ ev: 'error', message: `unknown command: ${(cmd as { cmd: string }).cmd}` }, cmd.id));
    }
  };
}
