import type { EngineInterface, Register } from 'claude-code'
import {
  applyEvent, liveDirFor, restoreFile, sessionFilePath, toText,
  type BridgeEvent, type BridgeFile,
} from './state.ts'

// Ponte de dados do Claude Todos (ROADMAP item 25; spec
// docs/specs/2026-10-06-ponte-de-dados-mod-design.md, decisão 2). Sem UI: grava,
// por sessão, o arquivo que o painel lê. Regras da API que este arquivo segue,
// medidas no spike de 2026-10-05: o `$` só é passado a funções declaradas no
// topo; todo trabalho é aguardado dentro do hook; uma chamada que falha não
// derruba as outras; as gravações saem em ordem, uma de cada vez.

let state: BridgeFile | null = null
let liveDir: string | null | undefined
let tail: Promise<void> = Promise.resolve()

async function resolveLiveDir($: EngineInterface): Promise<string | null> {
  if (liveDir !== undefined) return liveDir
  const [claudeConfigDir, userProfile, home] = await Promise.all([
    $.env.get('CLAUDE_CONFIG_DIR'),
    $.env.get('USERPROFILE'),
    $.env.get('HOME'),
  ])
  liveDir = liveDirFor($.plugin.root, { claudeConfigDir, userProfile, home })
  return liveDir
}

async function readText($: EngineInterface, file: string): Promise<string | undefined> {
  try {
    return await $.fs.read(file)
  } catch {
    return undefined
  }
}

// Aplica os eventos de `build(now)` ao estado da sessão e regrava o arquivo.
// Serializado: cada chamada espera a anterior, então o arquivo termina com o
// estado mais novo. `sessionId` explícito só no session.end (o id que termina).
async function record(
  $: EngineInterface,
  build: (now: number) => BridgeEvent[],
  withUsage: boolean,
  sessionId?: string,
): Promise<void> {
  const previous = tail
  let release: () => void = () => undefined
  tail = new Promise<void>(resolve => { release = resolve })
  try {
    await previous
    const dir = await resolveLiveDir($)
    if (dir === null) return
    const [id, now] = await Promise.all([
      sessionId !== undefined ? Promise.resolve(sessionId) : $.session.id(),
      $.clock.now(),
    ])
    const file = sessionFilePath(dir, id)
    if (file === null) return
    let current = state !== null && state.sessionId === id ? state : restoreFile(await readText($, file), id, now)
    const events = build(now)
    if (current.engineVersion === undefined) {
      const version = await $.session.version().then(v => v.version, () => undefined)
      if (version !== undefined) events.push({ kind: 'engine', version })
    }
    if (withUsage) {
      const usage = await $.session.usage().catch(() => undefined)
      if (usage !== undefined) events.push({ kind: 'usage', at: now, usage })
    }
    for (const ev of events) current = applyEvent(current, ev)
    state = current
    await $.fs.write(file, toText(current, now))
  } catch (err) {
    $.ui.log(`claude-todos-bridge: ${String(err)}`, { to: 'debug' })
  } finally {
    release()
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await record($, () => [], true)
    return result
  })

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    const agentId = result.agentId
    if (agentId !== undefined) {
      await record($, now => [{
        kind: 'spawn',
        at: now,
        agentId,
        type: e.subagentType,
        description: e.description,
        background: e.background,
        model: result.model,
        ...(e.parentAgentId !== undefined ? { parentId: e.parentAgentId } : {}),
      }], false)
    }
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const agentId = e.agentId
    const reason = e.reason
    await record($, now => (agentId !== undefined
      ? [{ kind: 'agentEnd', at: now, agentId, reason }]
      : [{ kind: 'mainTurnEnd', at: now, reason }]), true)
    return result
  })

  on('session.end', async ($, e, next) => {
    const reason = e.reason
    await record($, now => [{ kind: 'sessionEnd', at: now, reason }], false, e.sessionId)
    return next(e)
  })
}
