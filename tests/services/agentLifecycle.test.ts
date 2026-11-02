import { describe, it, expect } from 'vitest';
import { collectAgentLifecycle, mergeLifecycles, type LifecycleEntry } from '../../src/services/agentLifecycle';

const T = (min: number) => new Date(Date.parse('2026-10-01T10:00:00Z') + min * 60_000).toISOString();
const at = (min: number) => Date.parse(T(min));
const line = (o: object) => JSON.stringify(o);

// Formatos reais (Claude Code 2.1.28x), medidos no disco em 2026-10-04.
const launchText = (agentId: string) =>
  `Async agent launched successfully. (This tool result is internal metadata.)\nagentId: ${agentId} (internal ID - do not mention to user.)\nThe agent is working in the background.`;

function launch(agentId: string, min: number): string {
  return line({
    type: 'user', timestamp: T(min),
    toolUseResult: { isAsync: true, status: 'async_launched', agentId, description: 'bg', resolvedModel: 'claude-sonnet-5' },
    message: { content: [{ type: 'tool_result', tool_use_id: `toolu_${agentId}`, content: [{ type: 'text', text: launchText(agentId) }] }] },
  });
}

// Transcript de sub-agent: sem toolUseResult, o dado só existe no texto.
function launchTextOnly(agentId: string, min: number, asString = false): string {
  return line({
    type: 'user', isSidechain: true, timestamp: T(min),
    message: { content: [{ type: 'tool_result', tool_use_id: `toolu_${agentId}`,
      content: asString ? launchText(agentId) : [{ type: 'text', text: launchText(agentId) }] }] },
  });
}

function resumePayload(agentId: string) {
  return { success: true, message: `Resuming agent ${agentId.slice(0, 7)}`, resumedAgentId: agentId };
}

function resume(agentId: string, min: number): string {
  return line({
    type: 'user', timestamp: T(min), toolUseResult: resumePayload(agentId),
    message: { content: [{ type: 'tool_result', tool_use_id: `toolu_sm_${agentId}`, content: [{ type: 'text', text: JSON.stringify(resumePayload(agentId)) }] }] },
  });
}

function resumeTextOnly(agentId: string, min: number): string {
  return line({
    type: 'user', isSidechain: true, timestamp: T(min),
    message: { content: [{ type: 'tool_result', tool_use_id: `toolu_sm_${agentId}`, content: [{ type: 'text', text: JSON.stringify(resumePayload(agentId)) }] }] },
  });
}

function notification(taskId: string, min: number, status = 'completed'): string {
  return line({
    type: 'user', timestamp: T(min),
    message: { role: 'user', content: `<task-notification>\n<task-id>${taskId}</task-id>\n<tool-use-id>toolu_x</tool-use-id>\n<output-file>/tmp/${taskId}.output</output-file>\n<status>${status}</status>\n<summary>Agent "bg" finished</summary>\n</task-notification>` },
  });
}

// Notificação entregue no meio de um turno do main: attachment queued_command
// com o texto em `prompt` (formato real, medido em 2026-10-05: 15 de 112 paradas).
function notificationMidTurn(taskId: string, min: number): string {
  return line({
    type: 'attachment', isSidechain: false, timestamp: T(min),
    attachment: {
      type: 'queued_command', commandMode: 'task-notification',
      origin: { kind: 'task-notification', producer: 'session-task' },
      prompt: `<task-notification>\n<task-id>${taskId}</task-id>\n<tool-use-id>toolu_x</tool-use-id>\n<status>completed</status>\n<summary>Agent "bg" finished</summary>\n</task-notification>`,
    },
  });
}

// Aviso de agente que parou esperando o próprio trabalho em background (formato
// real, medido em 2026-11-02): status completed, mas o mesmo task-id notifica de novo.
const waitingBody = (taskId: string, summary = 'Agent "bg" is waiting on its own background work') =>
  `<task-notification>\n<task-id>${taskId}</task-id>\n<tool-use-id>toolu_x</tool-use-id>\n<output-file>/tmp/${taskId}.output</output-file>\n<status>completed</status>\n<summary>${summary}</summary>\n<note>This agent stopped with background work of its own still running. It may resume on its own when that work completes or reports, and the same task-id notifies again if it does; the result below may be interim.</note>\n<result>interim</result>\n</task-notification>`;

function waitingNotification(taskId: string, min: number): string {
  return line({ type: 'user', timestamp: T(min), message: { role: 'user', content: waitingBody(taskId) } });
}

function waitingNotificationMidTurn(taskId: string, min: number): string {
  return line({
    type: 'attachment', isSidechain: false, timestamp: T(min),
    attachment: {
      type: 'queued_command', commandMode: 'task-notification',
      origin: { kind: 'task-notification', producer: 'session-task' },
      prompt: waitingBody(taskId),
    },
  });
}

function queuedNotification(taskId: string, min: number): string {
  return line({
    type: 'queue-operation', operation: 'enqueue', timestamp: T(min),
    content: `<task-notification>\n<task-id>${taskId}</task-id>\n<status>completed</status>\n</task-notification>`,
  });
}

describe('collectAgentLifecycle', () => {
  it('a launch alone means running', () => {
    expect(collectAgentLifecycle([launch('bg01', 0)]).get('bg01')).toEqual({ state: 'running', at: at(0) });
  });

  it('a notification after the launch means stopped', () => {
    expect(collectAgentLifecycle([launch('bg01', 0), notification('bg01', 8)]).get('bg01'))
      .toEqual({ state: 'stopped', at: at(8) });
  });

  it('a resume after the notification means running again, and a new notification stops it', () => {
    const lines = [launch('bg01', 0), notification('bg01', 8), resume('bg01', 20)];
    expect(collectAgentLifecycle(lines).get('bg01')).toEqual({ state: 'running', at: at(20) });
    expect(collectAgentLifecycle([...lines, notification('bg01', 31)]).get('bg01'))
      .toEqual({ state: 'stopped', at: at(31) });
  });

  // Review Focus 3
  it('failed and stopped notifications also stop the agent', () => {
    expect(collectAgentLifecycle([launch('a1', 0), notification('a1', 1, 'failed')]).get('a1')?.state).toBe('stopped');
    expect(collectAgentLifecycle([launch('a2', 0), notification('a2', 1, 'stopped')]).get('a2')?.state).toBe('stopped');
  });

  // Verificação com dados reais (fix pass): a parada que chega no meio de um turno não é mensagem user.
  it('a notification delivered mid-turn (attachment queued_command) stops the agent', () => {
    expect(collectAgentLifecycle([launch('bg01', 0), notificationMidTurn('bg01', 4)]).get('bg01'))
      .toEqual({ state: 'stopped', at: at(4) });
  });

  describe('agent waiting on its own background work', () => {
    it('the notification means waiting, not stopped', () => {
      expect(collectAgentLifecycle([launch('bg01', 0), waitingNotification('bg01', 4)]).get('bg01'))
        .toEqual({ state: 'waiting', at: at(4) });
    });

    it('delivered mid-turn (attachment queued_command) it also means waiting', () => {
      expect(collectAgentLifecycle([launch('bg01', 0), waitingNotificationMidTurn('bg01', 4)]).get('bg01'))
        .toEqual({ state: 'waiting', at: at(4) });
    });

    it('a later notification from the same task-id stops the agent', () => {
      expect(collectAgentLifecycle([launch('bg01', 0), waitingNotification('bg01', 4), notification('bg01', 9)]).get('bg01'))
        .toEqual({ state: 'stopped', at: at(9) });
    });

    it('a final report that only quotes the phrase in its <result> stops the agent', () => {
      const report = line({
        type: 'user', timestamp: T(4),
        message: { role: 'user', content: '<task-notification>\n<task-id>bg01</task-id>\n<status>completed</status>\n<summary>Agent "bg" finished</summary>\n<result>o aviso diz: is waiting on its own background work</result>\n</task-notification>' },
      });
      expect(collectAgentLifecycle([launch('bg01', 0), report]).get('bg01')?.state).toBe('stopped');
    });

    it('a final report that quotes a whole waiting notification in its <result> stops the agent', () => {
      const report = line({
        type: 'user', timestamp: T(4),
        message: { role: 'user', content: `<task-notification>\n<task-id>bg01</task-id>\n<status>completed</status>\n<summary>Agent "bg" finished</summary>\n<result>${waitingBody('other')}</result>\n</task-notification>` },
      });
      expect(collectAgentLifecycle([launch('bg01', 0), report]).get('bg01')?.state).toBe('stopped');
    });

    it('an agent whose description contains the phrase and that finished stops', () => {
      const finished = line({
        type: 'user', timestamp: T(4),
        message: { role: 'user', content: waitingBody('bg01', 'Agent "is waiting on its own background work" finished') },
      });
      expect(collectAgentLifecycle([launch('bg01', 0), finished]).get('bg01')?.state).toBe('stopped');
    });
  });

  it('a queued command that only mentions a notification mid-text does not stop the agent', () => {
    const typed = line({
      type: 'attachment', timestamp: T(4),
      attachment: { type: 'queued_command', prompt: 'olha esse <task-notification><task-id>bg01</task-id>' },
    });
    expect(collectAgentLifecycle([launch('bg01', 0), typed]).get('bg01')?.state).toBe('running');
  });

  it('the queue-operation copy of the notification alone does not stop the agent', () => {
    expect(collectAgentLifecycle([launch('bg01', 0), queuedNotification('bg01', 8)]).get('bg01')?.state)
      .toBe('running');
  });

  it('a background shell notification does not touch the agents', () => {
    const m = collectAgentLifecycle([launch('bg01', 0), notification('b5ebc2ylo', 3)]);
    expect(m.get('bg01')?.state).toBe('running');
  });

  it('reads launch and resume from the text when the transcript has no toolUseResult', () => {
    expect(collectAgentLifecycle([launchTextOnly('neto01', 0)]).get('neto01')?.state).toBe('running');
    expect(collectAgentLifecycle([launchTextOnly('neto02', 0, true)]).get('neto02')?.state).toBe('running');
    expect(collectAgentLifecycle([
      launchTextOnly('neto01', 0), notification('neto01', 2), resumeTextOnly('neto01', 5),
    ]).get('neto01')).toEqual({ state: 'running', at: at(5) });
  });

  it('a synchronous Agent result (status completed, report text) produces no event', () => {
    const sync = line({
      type: 'user', timestamp: T(0),
      toolUseResult: { status: 'completed', agentId: 'fg01', totalDurationMs: 1000 },
      message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_fg', content: [{ type: 'text', text: 'relatorio\nagentId: fg01 (use SendMessage)' }] }] },
    });
    expect(collectAgentLifecycle([sync]).has('fg01')).toBe(false);
  });

  // Review Focus 1
  it('tool output that only mentions the launch phrase mid-text does not start an agent', () => {
    const grepOutput = line({
      type: 'user', isSidechain: true, timestamp: T(0),
      message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_grep',
        content: `x.jsonl:12: ${launchText('other01')}` }] },
    });
    expect(collectAgentLifecycle([grepOutput]).has('other01')).toBe(false);
  });

  // Review Focus 2
  it('a string toolUseResult (tool error) in an enriched transcript does not fall back to the text', () => {
    const toolError = line({
      type: 'user', timestamp: T(0), toolUseResult: 'Error: something failed',
      message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_e', content: launchText('ghost01') }] },
    });
    expect(collectAgentLifecycle([toolError]).has('ghost01')).toBe(false);
  });

  // Revisão final, Important 2: só o JSON do SendMessage (resumedAgentId no topo) retoma.
  it('a transcript record pasted as tool output (cat/grep of a JSONL line) does not resume an agent', () => {
    const record = JSON.stringify({ type: 'user', toolUseResult: resumePayload('real01'), message: { content: [] } });
    const catOutput = line({
      type: 'user', isSidechain: true, timestamp: T(0),
      message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_cat', content: record }] },
    });
    expect(collectAgentLifecycle([catOutput]).has('real01')).toBe(false);
  });

  it('skips malformed lines; a record without timestamp counts with at = 0', () => {
    const noTimestamp = line({
      type: 'user', toolUseResult: { status: 'async_launched', agentId: 'nots01' },
      message: { content: [{ type: 'tool_result', tool_use_id: 't', content: 'x' }] },
    });
    const m = collectAgentLifecycle(['{ broken async_launched', '', noTimestamp]);
    expect(m.get('nots01')).toEqual({ state: 'running', at: 0 });
  });
});

describe('mergeLifecycles', () => {
  it('for the same agentId, the latest event wins across transcripts', () => {
    const fromParent = new Map<string, LifecycleEntry>([['neto01', { state: 'stopped', at: at(5) }]]);
    const fromMain = new Map<string, LifecycleEntry>([['neto01', { state: 'running', at: at(10) }]]);
    expect(mergeLifecycles([fromMain, fromParent]).get('neto01')).toEqual({ state: 'running', at: at(10) });
    expect(mergeLifecycles([fromParent, fromMain]).get('neto01')).toEqual({ state: 'running', at: at(10) });
  });

  // A ponte grava o fim do turno na mesma fração de segundo do aviso: medido em
  // 2026-11-02, de -10 s a +1,8 s da notificação (665 agentes). É o mesmo evento,
  // e "o mais recente vence" apagaria o aviso em 44% das vezes.
  describe('a stop right next to a waiting notification is the same event', () => {
    const waiting = (ms: number) => new Map<string, LifecycleEntry>([['a1', { state: 'waiting', at: ms }]]);
    const stopped = (ms: number) => new Map<string, LifecycleEntry>([['a1', { state: 'stopped', at: ms }]]);
    const base = at(10);

    it('a stop 2 s after the warning keeps waiting, in either map order', () => {
      expect(mergeLifecycles([waiting(base), stopped(base + 2000)]).get('a1')).toEqual({ state: 'waiting', at: base });
      expect(mergeLifecycles([stopped(base + 2000), waiting(base)]).get('a1')).toEqual({ state: 'waiting', at: base });
    });

    it('a stop before the warning loses to it, in either map order', () => {
      expect(mergeLifecycles([waiting(base), stopped(base - 10_000)]).get('a1')).toEqual({ state: 'waiting', at: base });
      expect(mergeLifecycles([stopped(base - 10_000), waiting(base)]).get('a1')).toEqual({ state: 'waiting', at: base });
    });

    it('a stop well after the warning is a real stop: the agent woke up and ended, in either map order', () => {
      expect(mergeLifecycles([waiting(base), stopped(base + 60_000)]).get('a1')).toEqual({ state: 'stopped', at: base + 60_000 });
      expect(mergeLifecycles([stopped(base + 60_000), waiting(base)]).get('a1')).toEqual({ state: 'stopped', at: base + 60_000 });
    });
  });

  it('keeps agents that appear in only one map', () => {
    const a = new Map<string, LifecycleEntry>([['a1', { state: 'running', at: 1 }]]);
    const b = new Map<string, LifecycleEntry>([['b1', { state: 'stopped', at: 2 }]]);
    expect([...mergeLifecycles([a, b]).keys()].sort()).toEqual(['a1', 'b1']);
  });
});
