// Gerador dos casos de paridade da coluna Sessão do Kairós.
//
// Cada cenário monta, num claudeDir temporário, os arquivos que o Claude Code
// grava (transcript principal, sub-agents, metas), roda o núcleo de produção
// (SessionCore) e guarda o que ele devolve. O claude-ops (Python) e o Kairós
// (C#) leem os mesmos arquivos e têm de chegar aos mesmos números.
//
// Os cenários são sintéticos: o repositório é público. Nada aqui depende do
// relógio: o `agora` é injetado em cada caso e todo timestamp sai dele.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SessionCore } from '../../src/core/sessionCore';
import { encodeCwdToProjectDir } from '../../src/services/projectDir';
import { completedTaskDurations, summarizeTiming } from '../../src/webview/format';
import type { Todo } from '../../src/types';
import pkg from '../../package.json';

// ---------------------------------------------------------------- formato

export interface ArquivoCaso {
  caminho: string;   // relativo a projects/<encodeCwdToProjectDir(cwd)>
  conteudo: string;
  mtime: number;     // epoch ms, aplicado com utimes
}

export interface CasoPainel {
  nome: string;
  agora: number;
  cwd: string;
  sessao: string;
  viva: boolean;
  viva_desde: number | null;
  arquivos: ArquivoCaso[];
  esperado: { agents: any[]; usage: any; projectUsage: any };
}

export interface CasosPainel {
  versao: 1;
  gerado_por: string;
  casos: CasoPainel[];
}

export interface CasoTempos {
  nome: string;
  agora: number;
  todos: Todo[];
  esperado: {
    summary: { elapsedMs: number; estimateMs: number; hasEstimate: boolean };
    durations: (number | null)[];
  };
}

export interface CasosTempos {
  versao: 1;
  casos: CasoTempos[];
}

// ---------------------------------------------------------------- tempo

const AGORA = 1_793_000_000_000;
const CWD = '/projeto';
const SESSAO = 'sess-1';
const MODELO = 'claude-opus-4-8';

// Instante a `seg` segundos antes do agora.
const antes = (seg: number): number => AGORA - seg * 1000;
const iso = (seg: number): string => new Date(antes(seg)).toISOString();

// ---------------------------------------------------------------- helpers de linha

type Obj = Record<string, unknown>;
type Linha = Obj | string;

const jsonl = (linhas: Linha[]): string =>
  linhas.map(l => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n';

function user(texto: string, seg: number): Obj {
  return { type: 'user', timestamp: iso(seg), message: { role: 'user', content: texto } };
}

interface OpcoesAssistant {
  seg: number;
  sidechain?: boolean;
  agentId?: string;
  model?: string;
  usage?: Obj;
  requestId?: string;
  id?: string;
  stop?: string | null;
  version?: string;
}

function assistant(blocos: Obj[], o: OpcoesAssistant): Obj {
  const message: Obj = {};
  if (o.id !== undefined) message.id = o.id;
  if (o.model !== undefined) message.model = o.model;
  message.role = 'assistant';
  message.content = blocos;
  if (o.stop !== undefined) message.stop_reason = o.stop;
  if (o.usage !== undefined) message.usage = o.usage;
  const linha: Obj = { type: 'assistant' };
  if (o.sidechain) linha.isSidechain = true;
  if (o.agentId !== undefined) linha.agentId = o.agentId;
  linha.timestamp = iso(o.seg);
  if (o.requestId !== undefined) linha.requestId = o.requestId;
  if (o.version !== undefined) linha.version = o.version;
  linha.message = message;
  return linha;
}

function usage(input: number, output: number, cacheCreation = 0, cacheRead = 0, extra: Obj = {}): Obj {
  return {
    input_tokens: input,
    cache_creation_input_tokens: cacheCreation,
    cache_read_input_tokens: cacheRead,
    output_tokens: output,
    ...extra,
  };
}

const texto = (t: string): Obj => ({ type: 'text', text: t });

// Resposta com uso, uma requisição completa.
function resposta(seg: number, requestId: string, uso: Obj, model = MODELO, extra: Partial<OpcoesAssistant> = {}): Obj {
  return assistant([texto('ok')], {
    seg, requestId, id: `msg_${requestId}`, model, stop: 'end_turn', usage: uso, version: '2.1.310', ...extra,
  });
}

interface Tarefa { content: string; activeForm: string; status: string }
const tarefa = (content: string, activeForm: string, status: string): Tarefa => ({ content, activeForm, status });

function todoWrite(todos: unknown[], seg: number, extra: Partial<OpcoesAssistant> = {}): Obj {
  return assistant([{ type: 'tool_use', id: `toolu_tw${seg}`, name: 'TodoWrite', input: { todos } }], { seg, ...extra });
}

function taskCreate(toolUseId: string, subject: string, activeForm: string, seg: number): Obj {
  return assistant(
    [{ type: 'tool_use', id: toolUseId, name: 'TaskCreate', input: { subject, description: subject, activeForm } }],
    { seg },
  );
}

// `como`: 'resultado' traz toolUseResult.task.id; 'texto' só o "Task #N" do texto.
function taskResult(toolUseId: string, taskId: string, subject: string, seg: number, como: 'resultado' | 'texto'): Obj {
  const linha: Obj = { type: 'user', timestamp: iso(seg) };
  if (como === 'resultado') linha.toolUseResult = { task: { id: taskId, subject } };
  linha.message = {
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id: toolUseId, content: `Task #${taskId} created successfully: ${subject}` }],
  };
  return linha;
}

function taskUpdate(toolUseId: string, taskId: unknown, status: string, seg: number): Obj {
  return assistant([{ type: 'tool_use', id: toolUseId, name: 'TaskUpdate', input: { taskId, status } }], { seg });
}

function agentCall(
  toolUseId: string, descricao: string | undefined, prompt: string, seg: number,
  opcoes: { name?: string; sidechain?: boolean; agentId?: string } = {},
): Obj {
  const input: Obj = {};
  if (opcoes.name !== undefined) input.name = opcoes.name;
  if (descricao !== undefined) input.description = descricao;
  input.subagent_type = 'general-purpose';
  input.prompt = prompt;
  return assistant([{ type: 'tool_use', id: toolUseId, name: 'Agent', input }], {
    seg, ...(opcoes.sidechain ? { sidechain: true } : {}), ...(opcoes.agentId ? { agentId: opcoes.agentId } : {}),
  });
}

// Resultado de um disparo aceito no transcript principal (com toolUseResult).
function agentResult(toolUseId: string, agentId: string, seg: number): Obj {
  return {
    type: 'user', timestamp: iso(seg),
    toolUseResult: { agentId, status: 'completed' },
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, content: 'done' }] },
  };
}

// Disparo recusado: o tool_result chega sem toolUseResult.
function agentRecusado(toolUseId: string, seg: number): Obj {
  return {
    type: 'user', timestamp: iso(seg),
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, content: 'The user rejected this tool use.' }] },
  };
}

// toolUseResult presente mas sem agentId: também conta como recusado.
function agentSemId(toolUseId: string, seg: number): Obj {
  return {
    type: 'user', timestamp: iso(seg),
    toolUseResult: { status: 'completed' },
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, content: 'done' }] },
  };
}

// Resposta imediata de um disparo em segundo plano.
function asyncLaunched(toolUseId: string, agentId: string, seg: number): Obj {
  return {
    type: 'user', timestamp: iso(seg),
    toolUseResult: { status: 'async_launched', agentId },
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolUseId, content: `Async agent launched successfully.\nagentId: ${agentId}` }],
    },
  };
}

// Lançamento visto de dentro do transcript de um sub-agent: sem toolUseResult,
// o mesmo dado vem no texto.
function asyncLaunchedTexto(toolUseId: string, agentId: string, seg: number): Obj {
  return {
    type: 'user', isSidechain: true, timestamp: iso(seg),
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolUseId, content: `Async agent launched successfully.\nagentId: ${agentId}` }],
    },
  };
}

// Retomada por SendMessage: o resultado traz resumedAgentId.
function resumed(toolUseId: string, agentId: string, seg: number): Obj {
  return {
    type: 'user', timestamp: iso(seg),
    toolUseResult: { success: true, resumedAgentId: agentId },
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolUseId, content: JSON.stringify({ success: true, resumedAgentId: agentId }) }],
    },
  };
}

const textoNotificacao = (agentId: string): string =>
  `<task-notification>\n<task-id>${agentId}</task-id>\n<status>completed</status>\n</task-notification>`;

// 'usuario': entre turnos, mensagem do usuário em string. 'anexo': no meio de um
// turno, attachment queued_command com o texto em `prompt`.
function taskNotification(agentId: string, seg: number, como: 'usuario' | 'anexo'): Obj {
  if (como === 'usuario') {
    return { type: 'user', timestamp: iso(seg), message: { role: 'user', content: textoNotificacao(agentId) } };
  }
  return { type: 'attachment', timestamp: iso(seg), attachment: { type: 'queued_command', prompt: textoNotificacao(agentId) } };
}

// ---------------------------------------------------------------- helpers de arquivo

const arquivo = (caminho: string, linhas: Linha[], mtimeSeg: number): ArquivoCaso =>
  ({ caminho, conteudo: jsonl(linhas), mtime: antes(mtimeSeg) });

const principal = (linhas: Linha[], mtimeSeg: number, sessao = SESSAO): ArquivoCaso =>
  arquivo(`${sessao}.jsonl`, linhas, mtimeSeg);

// Transcript de sub-agent: o primeiro registro é o prompt, em string.
function subagente(
  agentId: string, prompt: string | null, linhas: Linha[], mtimeSeg: number, sessao = SESSAO,
): ArquivoCaso {
  const abertura: Linha[] = prompt === null
    ? []
    : [{ type: 'user', isSidechain: true, agentId, message: { role: 'user', content: prompt } }];
  return arquivo(`${sessao}/subagents/agent-${agentId}.jsonl`, [...abertura, ...linhas], mtimeSeg);
}

function meta(
  agentId: string, m: { toolUseId: string; agentType?: string; description?: string; spawnDepth?: number },
  mtimeSeg: number, sessao = SESSAO,
): ArquivoCaso {
  return {
    caminho: `${sessao}/subagents/agent-${agentId}.meta.json`,
    conteudo: JSON.stringify(m),
    mtime: antes(mtimeSeg),
  };
}

const todoSub = (agentId: string, todos: unknown[], seg: number): Obj =>
  todoWrite(todos, seg, { sidechain: true, agentId });

const usoSub = (agentId: string, requestId: string, uso: Obj, seg: number, model = MODELO): Obj =>
  resposta(seg, requestId, uso, model, { sidechain: true, agentId });

// ---------------------------------------------------------------- cenários

interface Entrada {
  nome: string;
  arquivos: ArquivoCaso[];
  viva?: boolean;
  viva_desde?: number | null;
}

const A = 'Escrever a especificação';
const B = 'Montar o gerador';
const C = 'Conferir os casos';
const D = 'Publicar o resultado';
const t = (conteudo: string, status: string): Tarefa => tarefa(conteudo, `${conteudo} (em andamento)`, status);

function cenariosTodoWrite(): Entrada[] {
  return [
    {
      nome: 'todowrite-anda',
      arquivos: [principal([
        user('Fazer o trabalho', 700),
        todoWrite([t(A, 'pending'), t(B, 'pending'), t(C, 'pending'), t(D, 'pending')], 690),
        todoWrite([t(A, 'in_progress'), t(B, 'pending'), t(C, 'pending'), t(D, 'pending')], 600),
        todoWrite([t(A, 'completed'), t(B, 'in_progress'), t(C, 'pending'), t(D, 'pending')], 500),
        // D vai de pendente direto a concluída: tem fim, mas nenhum início visto.
        todoWrite([t(A, 'completed'), t(B, 'completed'), t(C, 'in_progress'), t(D, 'completed')], 300),
        resposta(290, 'req_1', usage(10, 200, 500, 4000)),
      ], 290)],
    },
    {
      nome: 'todowrite-volta-a-pendente',
      arquivos: [principal([
        user('Fazer o trabalho', 700),
        todoWrite([t(A, 'in_progress'), t(B, 'in_progress'), t(C, 'completed'), t(D, 'pending')], 600),
        todoWrite([t(A, 'completed'), t(B, 'in_progress'), t(C, 'completed'), t(D, 'pending')], 500),
        // A volta a pendente (zera os tempos), B sai de em andamento sem concluir, C reabre.
        todoWrite([t(A, 'pending'), t(B, 'pending'), t(C, 'pending'), t(D, 'pending')], 400),
        todoWrite([t(A, 'in_progress'), t(B, 'pending'), t(C, 'completed'), t(D, 'pending')], 300),
        resposta(290, 'req_1', usage(10, 80, 100, 900)),
      ], 290)],
    },
    {
      nome: 'todowrite-some-e-volta',
      arquivos: [principal([
        user('Fazer o trabalho', 700),
        todoWrite([t(A, 'in_progress'), t(B, 'completed'), t(C, 'pending')], 600),
        // A e B somem da lista; ao reaparecer, A começa um novo trecho e B guarda o fim antigo.
        todoWrite([t(C, 'pending')], 500),
        todoWrite([t(A, 'in_progress'), t(B, 'completed'), t(C, 'in_progress')], 400),
        resposta(390, 'req_1', usage(10, 80, 100, 900)),
      ], 390)],
    },
    {
      nome: 'todowrite-muda-de-lugar',
      arquivos: [principal([
        user('Fazer o trabalho', 700),
        todoWrite([t(A, 'in_progress'), t(B, 'pending'), t(C, 'pending')], 600),
        todoWrite([t(C, 'pending'), t(A, 'completed'), t(B, 'in_progress')], 500),
        todoWrite([t(C, 'in_progress'), t(A, 'completed'), t(B, 'completed')], 400),
        resposta(390, 'req_1', usage(10, 80, 100, 900)),
      ], 390)],
    },
  ];
}

function cenariosTask(): Entrada[] {
  return [
    {
      nome: 'task-id-pelo-resultado',
      arquivos: [principal([
        user('Fazer o trabalho', 700),
        taskCreate('toolu_c1', A, 'Escrevendo a especificação', 690),
        taskResult('toolu_c1', '1', A, 689, 'resultado'),
        taskCreate('toolu_c2', B, 'Montando o gerador', 680),
        taskResult('toolu_c2', '2', B, 679, 'resultado'),
        taskCreate('toolu_c3', C, 'Conferindo os casos', 670),
        taskResult('toolu_c3', '3', C, 669, 'resultado'),
        taskUpdate('toolu_u1', '1', 'in_progress', 600),
        taskUpdate('toolu_u2', '1', 'completed', 500),
        taskUpdate('toolu_u3', '2', 'in_progress', 400),
        resposta(390, 'req_1', usage(10, 80, 100, 900)),
      ], 390)],
    },
    {
      nome: 'task-id-pelo-texto',
      arquivos: [principal([
        user('Fazer o trabalho', 700),
        taskCreate('toolu_c1', A, 'Escrevendo a especificação', 690),
        taskResult('toolu_c1', '7', A, 689, 'texto'),
        taskCreate('toolu_c2', B, 'Montando o gerador', 680),
        taskResult('toolu_c2', '8', B, 679, 'texto'),
        // id numérico no resultado não vale: cai para o texto "Task #9".
        taskCreate('toolu_c3', C, 'Conferindo os casos', 670),
        { ...taskResult('toolu_c3', '9', C, 669, 'texto'), toolUseResult: { task: { id: 9, subject: C } } },
        // sem id em lugar nenhum: a tarefa nunca nasce.
        taskCreate('toolu_c4', D, 'Publicando o resultado', 660),
        {
          type: 'user', timestamp: iso(659),
          message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_c4', content: 'created' }] },
        },
        taskUpdate('toolu_u1', '7', 'in_progress', 600),
        taskUpdate('toolu_u2', '8', 'completed', 500),
        resposta(390, 'req_1', usage(10, 80, 100, 900)),
      ], 390)],
    },
    {
      nome: 'task-update-ignorado',
      arquivos: [principal([
        user('Fazer o trabalho', 700),
        taskCreate('toolu_c1', A, 'Escrevendo a especificação', 600),
        taskResult('toolu_c1', '1', A, 599, 'resultado'),
        taskUpdate('toolu_u1', '1', 'in_progress', 500),
        // id desconhecido com status válido: não muda nenhuma tarefa, mas conta como evento.
        taskUpdate('toolu_u2', '99', 'completed', 400),
        // status inválido, e taskId que não é texto: nada acontece, nem o carimbo de evento.
        taskUpdate('toolu_u3', '1', 'whatever', 300),
        taskUpdate('toolu_u4', 1, 'completed', 200),
        resposta(190, 'req_1', usage(10, 80, 100, 900)),
      ], 190)],
    },
    {
      nome: 'task-update-apagada',
      arquivos: [principal([
        user('Fazer o trabalho', 700),
        taskCreate('toolu_c1', A, 'Escrevendo a especificação', 600),
        taskResult('toolu_c1', '1', A, 599, 'resultado'),
        taskCreate('toolu_c2', B, 'Montando o gerador', 590),
        taskResult('toolu_c2', '2', B, 589, 'resultado'),
        taskUpdate('toolu_u1', '1', 'in_progress', 500),
        // deleted tira a tarefa da lista e conta como evento; o update seguinte não a traz de volta.
        taskUpdate('toolu_u2', '1', 'deleted', 400),
        taskUpdate('toolu_u3', '1', 'completed', 300),
        resposta(190, 'req_1', usage(10, 80, 100, 900)),
      ], 190)],
    },
  ];
}

function cenariosTrocaDeEsquema(): Entrada[] {
  const tasks = (base: number): Linha[] => [
    taskCreate('toolu_c1', B, 'Montando o gerador', base),
    taskResult('toolu_c1', '1', B, base - 1, 'resultado'),
    taskUpdate('toolu_u1', '1', 'in_progress', base - 10),
  ];
  return [
    {
      // TodoWrite primeiro, Task depois: vale a lista do fluxo de Task.
      nome: 'troca-de-esquema',
      arquivos: [principal([
        user('Fazer o trabalho', 700),
        todoWrite([t(A, 'completed'), t(C, 'pending')], 600),
        ...tasks(500),
        resposta(300, 'req_1', usage(10, 80, 100, 900)),
      ], 300)],
    },
    {
      // Task primeiro, TodoWrite depois: vale o TodoWrite.
      nome: 'troca-de-esquema-inversa',
      arquivos: [principal([
        user('Fazer o trabalho', 700),
        ...tasks(600),
        todoWrite([t(A, 'completed'), t(C, 'pending')], 500),
        resposta(300, 'req_1', usage(10, 80, 100, 900)),
      ], 300)],
    },
  ];
}

function cenarioIgnorados(): Entrada[] {
  const copia = (role: string, blocos: Obj[]): Obj =>
    ({ type: 'api-request-blob', sessionId: SESSAO, hash: 'b'.repeat(64), message: { role, content: blocos } });
  const tw = (conteudo: string): Obj =>
    ({ type: 'tool_use', id: 'toolu_copia', name: 'TodoWrite', input: { todos: [t(conteudo, 'in_progress')] } });
  return [{
    nome: 'ignorados',
    arquivos: [principal([
      user('Fazer o trabalho', 700),
      todoWrite([t(A, 'in_progress'), t(B, 'pending')], 600),
      // linha de sub-agent dentro do principal: nem a lista nem o uso valem.
      todoWrite([t('Tarefa do sub-agent', 'in_progress')], 590, { sidechain: true }),
      resposta(580, 'req_lateral', usage(9999, 9999, 9999, 9999), MODELO, { sidechain: true }),
      // cópias da conversa e registros de requisição (2.1.300+).
      { type: 'api-request', sessionId: SESSAO, requestId: 'req_x', message: { model: MODELO, usage: usage(7777, 7777, 7777, 7777) } },
      copia('assistant', [tw('Copia da lista')]),
      { type: 'api-request-shape', sessionId: SESSAO, shape: { keys: ['model', 'messages'] } },
      // `type` fora do primeiro lugar: o atalho pelo prefixo não pega, o filtro por tipo sim.
      { sessionId: SESSAO, type: 'api-request-blob', hash: 'c'.repeat(64), message: { role: 'assistant', content: [tw('Outra copia')] } },
      // erro de API sintético não é uso do modelo.
      assistant([texto('API Error')], {
        seg: 570, requestId: 'req_sintetico', id: 'msg_sintetico', model: '<synthetic>', stop: 'stop_sequence',
        usage: usage(5555, 5555, 5555, 5555),
      }),
      resposta(560, 'req_1', usage(10, 120, 300, 2000)),
    ], 560)],
  }];
}

function cenariosSubagentes(): Entrada[] {
  const concluida = [t(A, 'completed'), t(B, 'in_progress')];
  return [
    {
      nome: 'subagente-com-meta',
      arquivos: [
        principal([
          user('Fazer o trabalho', 700),
          agentCall('toolu_a', 'Explorar o código', 'Procure os pontos de entrada', 600),
          agentResult('toolu_a', 'a1', 580),
          resposta(570, 'req_1', usage(10, 120, 300, 2000)),
        ], 570),
        subagente('a1', 'Procure os pontos de entrada', [
          todoSub('a1', concluida, 590),
          usoSub('a1', 'req_s1', usage(5, 60, 100, 800), 585),
        ], 580),
        meta('a1', { toolUseId: 'toolu_a', agentType: 'Explore', description: 'Explorar o código', spawnDepth: 1 }, 580),
        // meta que não aponta para nenhum disparo conhecido: o nome vem do meta.
        subagente('a2', 'Outra busca', [usoSub('a2', 'req_s2', usage(3, 30, 0, 400), 560)], 560),
        meta('a2', { toolUseId: 'toolu_desconhecido', description: 'Busca solta' }, 560),
      ],
    },
    {
      nome: 'subagente-aninhado',
      arquivos: [
        principal([
          user('Fazer o trabalho', 700),
          agentCall('toolu_a', 'Coordenar a revisão', 'Coordene a revisão', 600),
          agentResult('toolu_a', 'a1', 580),
          resposta(570, 'req_1', usage(10, 120, 300, 2000)),
        ], 570),
        subagente('a1', 'Coordene a revisão', [
          agentCall('toolu_b', 'Revisar o módulo', 'Revise o módulo', 595, { sidechain: true, agentId: 'a1' }),
          { type: 'user', isSidechain: true, agentId: 'a1', timestamp: iso(585),
            message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_b', content: 'done' }] } },
          // este neto nunca recebeu resposta: segue rodando.
          agentCall('toolu_c', 'Revisar os testes', 'Revise os testes', 584, { sidechain: true, agentId: 'a1' }),
          usoSub('a1', 'req_s1', usage(5, 60, 100, 800), 583),
        ], 583),
        meta('a1', { toolUseId: 'toolu_a', agentType: 'general-purpose', spawnDepth: 1 }, 583),
        subagente('a2', 'Revise o módulo', [
          todoSub('a2', concluida, 590),
          usoSub('a2', 'req_s2', usage(3, 40, 0, 500), 588),
        ], 588),
        meta('a2', { toolUseId: 'toolu_b', agentType: 'Explore', spawnDepth: 2 }, 588),
        subagente('a3', 'Revise os testes', [usoSub('a3', 'req_s3', usage(2, 20, 0, 300), 582)], 582),
        meta('a3', { toolUseId: 'toolu_c', spawnDepth: 2 }, 582),
      ],
    },
    {
      nome: 'subagente-recusado',
      arquivos: [
        principal([
          user('Fazer o trabalho', 700),
          agentCall('toolu_a', 'Disparo recusado', 'Prompt recusado', 650),
          agentRecusado('toolu_a', 649),
          agentCall('toolu_b', 'Disparo aceito', 'Prompt aceito', 640),
          agentResult('toolu_b', 'a2', 630),
          agentCall('toolu_c', 'Disparo sem id', 'Prompt sem id', 620),
          agentSemId('toolu_c', 619),
          resposta(570, 'req_1', usage(10, 120, 300, 2000)),
        ], 570),
        subagente('a1', 'Prompt recusado', [usoSub('a1', 'req_s1', usage(1, 10, 0, 100), 640)], 640),
        meta('a1', { toolUseId: 'toolu_a' }, 640),
        subagente('a2', 'Prompt aceito', [todoSub('a2', concluida, 620), usoSub('a2', 'req_s2', usage(3, 40, 0, 500), 610)], 610),
        meta('a2', { toolUseId: 'toolu_b', agentType: 'Explore', spawnDepth: 1 }, 610),
        subagente('a3', 'Prompt sem id', [usoSub('a3', 'req_s3', usage(1, 10, 0, 100), 600)], 600),
        meta('a3', { toolUseId: 'toolu_c' }, 600),
        // sem meta, casado pelo prompt de um disparo recusado: também some.
        subagente('a4', 'Prompt recusado', [usoSub('a4', 'req_s4', usage(1, 10, 0, 100), 590)], 590),
      ],
    },
    {
      nome: 'subagente-sem-meta',
      arquivos: [
        principal([
          user('Fazer o trabalho', 700),
          agentCall('toolu_a', 'Analisar os logs', 'P1', 650),
          agentResult('toolu_a', 'a1', 640),
          agentCall('toolu_b', 'Resumir', 'P2', 630),
          agentResult('toolu_b', 'a2', 620),
          // `name` ganha da `description` como rótulo.
          agentCall('toolu_c', 'Descricao ignorada', 'P3', 610, { name: 'revisor' }),
          agentResult('toolu_c', 'a3', 600),
          // sem rótulo nenhum: não casa por prompt.
          agentCall('toolu_d', undefined, 'P4', 590),
          agentResult('toolu_d', 'a7', 580),
          resposta(570, 'req_1', usage(10, 120, 300, 2000)),
        ], 570),
        subagente('a1', 'P1', [todoSub('a1', concluida, 645), usoSub('a1', 'req_s1', usage(1, 10, 0, 100), 640)], 640),
        subagente('a2', 'P2', [usoSub('a2', 'req_s2', usage(2, 20, 0, 200), 620)], 620),
        subagente('a3', 'P3', [usoSub('a3', 'req_s3', usage(3, 30, 0, 300), 600)], 600),
        // prompt sem disparo, prompt repetido (o par já foi usado), arquivo sem prompt e prompt de disparo sem rótulo.
        subagente('a4', 'P-sem-par', [usoSub('a4', 'req_s4', usage(1, 10, 0, 100), 590)], 590),
        subagente('a5', 'P1', [usoSub('a5', 'req_s5', usage(1, 10, 0, 100), 580)], 580),
        subagente('a6', null, [usoSub('a6', 'req_s6', usage(1, 10, 0, 100), 570)], 570),
        subagente('a7', 'P4', [usoSub('a7', 'req_s7', usage(1, 10, 0, 100), 560)], 560),
      ],
    },
  ];
}

// Sub-agent em segundo plano: transcript curto e meta apontando para o disparo.
function agenteFundo(agentId: string, toolUseId: string, descricao: string, mtimeSeg: number): ArquivoCaso[] {
  return [
    subagente(agentId, `Prompt de ${agentId}`, [
      usoSub(agentId, `req_${agentId}`, usage(2, 20, 0, 200), mtimeSeg + 5),
    ], mtimeSeg),
    meta(agentId, { toolUseId, agentType: 'general-purpose', description: descricao, spawnDepth: 1 }, mtimeSeg),
  ];
}

function cenariosSegundoPlano(): Entrada[] {
  const vivaDesde = antes(3000);
  return [
    {
      nome: 'segundo-plano-vivo',
      viva: true, viva_desde: vivaDesde,
      arquivos: [
        principal([
          user('Fazer o trabalho', 3500),
          agentCall('toolu_a', 'Vigiar o build', 'Prompt de a1', 1100),
          asyncLaunched('toolu_a', 'a1', 1000),
          resposta(900, 'req_1', usage(10, 120, 300, 2000)),
        ], 900),
        // a1 lança um neto em segundo plano; o lançamento aparece no texto do resultado.
        subagente('a1', 'Prompt de a1', [
          agentCall('toolu_b', 'Vigiar os testes', 'Prompt de a2', 950, { sidechain: true, agentId: 'a1' }),
          asyncLaunchedTexto('toolu_b', 'a2', 940),
          usoSub('a1', 'req_a1', usage(2, 20, 0, 200), 930),
        ], 800),
        meta('a1', { toolUseId: 'toolu_a', agentType: 'general-purpose', description: 'Vigiar o build', spawnDepth: 1 }, 800),
        ...agenteFundo('a2', 'toolu_b', 'Vigiar os testes', 700),
      ],
    },
    {
      nome: 'segundo-plano-retomado',
      viva: true, viva_desde: vivaDesde,
      arquivos: [
        principal([
          user('Fazer o trabalho', 9000),
          // a1, a2 e a3 foram lançados pelo processo anterior (antes de viva_desde).
          agentCall('toolu_a', 'Primeiro', 'Prompt de a1', 6100),
          asyncLaunched('toolu_a', 'a1', 6000),
          agentCall('toolu_b', 'Segundo', 'Prompt de a2', 5100),
          asyncLaunched('toolu_b', 'a2', 5000),
          agentCall('toolu_c', 'Terceiro', 'Prompt de a3', 4100),
          asyncLaunched('toolu_c', 'a3', 4000),
          taskNotification('a3', 3800, 'usuario'),
          // o processo novo retoma a2 e a3.
          resumed('toolu_r1', 'a2', 2000),
          resumed('toolu_r2', 'a3', 1500),
          resposta(900, 'req_1', usage(10, 120, 300, 2000)),
        ], 900),
        ...agenteFundo('a1', 'toolu_a', 'Primeiro', 800),
        ...agenteFundo('a2', 'toolu_b', 'Segundo', 700),
        ...agenteFundo('a3', 'toolu_c', 'Terceiro', 600),
      ],
    },
    {
      nome: 'segundo-plano-notificado',
      viva: true, viva_desde: vivaDesde,
      arquivos: [
        principal([
          user('Fazer o trabalho', 3500),
          agentCall('toolu_a', 'Notificado entre turnos', 'Prompt de a1', 2900),
          asyncLaunched('toolu_a', 'a1', 2800),
          agentCall('toolu_b', 'Notificado no meio do turno', 'Prompt de a2', 2700),
          asyncLaunched('toolu_b', 'a2', 2600),
          agentCall('toolu_c', 'Sem notificação', 'Prompt de a3', 2500),
          asyncLaunched('toolu_c', 'a3', 2400),
          agentCall('toolu_d', 'Só citado', 'Prompt de a4', 2300),
          asyncLaunched('toolu_d', 'a4', 2200),
          taskNotification('a1', 1500, 'usuario'),
          taskNotification('a2', 1400, 'anexo'),
          // o texto só menciona a notificação no meio: não encerra o a4.
          { type: 'user', timestamp: iso(1300), message: { role: 'user', content: `Veja ${textoNotificacao('a4')}` } },
          resposta(900, 'req_1', usage(10, 120, 300, 2000)),
        ], 900),
        ...agenteFundo('a1', 'toolu_a', 'Notificado entre turnos', 800),
        ...agenteFundo('a2', 'toolu_b', 'Notificado no meio do turno', 700),
        ...agenteFundo('a3', 'toolu_c', 'Sem notificação', 600),
        ...agenteFundo('a4', 'toolu_d', 'Só citado', 500),
      ],
    },
    {
      nome: 'segundo-plano-sessao-parada',
      viva: false, viva_desde: null,
      arquivos: [
        principal([
          user('Fazer o trabalho', 3500),
          agentCall('toolu_a', 'Lançado e sem processo', 'Prompt de a1', 1100),
          asyncLaunched('toolu_a', 'a1', 1000),
          // disparo que nunca recebeu resposta: roda, mesmo sem processo.
          agentCall('toolu_b', 'Sem resposta', 'Prompt de a2', 900),
          resposta(800, 'req_1', usage(10, 120, 300, 2000)),
        ], 800),
        ...agenteFundo('a1', 'toolu_a', 'Lançado e sem processo', 700),
        ...agenteFundo('a2', 'toolu_b', 'Sem resposta', 600),
      ],
    },
  ];
}

function cenariosTokens(): Entrada[] {
  const bloco = (n: number): Obj => ({ type: 'text', text: `parte ${n}` });
  const linhaReq = (
    seg: number, requestId: string | undefined, uso: Obj, stop: string | null | undefined, extra: Partial<OpcoesAssistant> = {},
  ): Obj => assistant([bloco(seg)], {
    seg, model: MODELO, usage: uso, version: '2.1.310',
    ...(requestId !== undefined ? { requestId } : {}),
    ...(stop !== undefined ? { stop } : {}),
    ...extra,
  });
  const simples = (nome: string, linhas: Linha[]): Entrada =>
    ({ nome, arquivos: [principal([user('Fazer o trabalho', 700), ...linhas], 100)] });

  return [
    simples('tokens-registros-iguais', [
      // um registro por bloco de conteúdo, todos com o mesmo uso final.
      linhaReq(600, 'req_1', usage(10, 100, 200, 3000), 'end_turn'),
      linhaReq(599, 'req_1', usage(10, 100, 200, 3000), 'end_turn'),
      linhaReq(598, 'req_1', usage(10, 100, 200, 3000), 'end_turn'),
      // os mesmos três como prévias de saída igual.
      linhaReq(500, 'req_2', usage(20, 50, 0, 4000), null),
      linhaReq(499, 'req_2', usage(20, 50, 0, 4000), null),
      linhaReq(498, 'req_2', usage(20, 50, 0, 4000), null),
    ]),
    simples('tokens-previa-e-final', [
      linhaReq(600, 'req_1', usage(10, 5, 200, 3000), null),
      linhaReq(599, 'req_1', usage(10, 40, 200, 3000), null),
      linhaReq(598, 'req_1', usage(10, 120, 200, 3000), 'end_turn'),
      // prévia atrasada, com saída maior: o final já decidiu.
      linhaReq(597, 'req_1', usage(10, 200, 200, 3000), null),
      // dois finais: vale o último.
      linhaReq(500, 'req_2', usage(30, 70, 0, 4000), 'tool_use'),
      linhaReq(499, 'req_2', usage(30, 90, 0, 4000), 'tool_use'),
    ]),
    simples('tokens-so-previas', [
      // a saída cresce e depois cai: vale a maior.
      linhaReq(600, 'req_1', usage(10, 10, 0, 1000), null),
      linhaReq(599, 'req_1', usage(10, 30, 0, 1000), null),
      linhaReq(598, 'req_1', usage(10, 20, 0, 1000), null),
      // saída igual: vale a mais recente (aqui só o cache de leitura difere).
      linhaReq(500, 'req_2', usage(20, 15, 0, 2000), null),
      linhaReq(499, 'req_2', usage(20, 15, 0, 2500), null),
    ]),
    simples('tokens-sem-request-id', [
      // sem requestId, vale o id da mensagem: dois registros do mesmo id contam uma vez.
      linhaReq(600, undefined, usage(10, 100, 0, 1000), 'end_turn', { id: 'msg_x' }),
      linhaReq(599, undefined, usage(10, 100, 0, 1000), 'end_turn', { id: 'msg_x' }),
      // sem requestId nem id: cada linha é uma requisição.
      linhaReq(500, undefined, usage(5, 50, 0, 500), 'end_turn'),
      linhaReq(499, undefined, usage(5, 50, 0, 500), 'end_turn'),
    ]),
    simples('tokens-requisicoes-distintas', [
      linhaReq(600, 'req_1', usage(10, 100, 200, 3000), 'end_turn'),
      linhaReq(500, 'req_2', usage(8, 60, 0, 3500), 'tool_use', { model: 'claude-sonnet-4-6' }),
      linhaReq(400, 'req_3', usage(12, 140, 100, 4000), 'end_turn'),
      linhaReq(300, 'req_4', usage(4, 30, 0, 600), 'end_turn', { model: 'claude-haiku-4-5' }),
    ]),
  ];
}

function cenariosContexto(): Entrada[] {
  const uso = (model: string, usoRegistro: Obj, seg = 300): Linha =>
    resposta(seg, `req_${seg}`, usoRegistro, model);
  const simples = (nome: string, linhas: Linha[]): Entrada =>
    ({ nome, arquivos: [principal([user('Fazer o trabalho', 700), ...linhas], 100)] });

  const fam = (sufixo: string, model: string): Entrada =>
    simples(`janela-1m-por-familia${sufixo}`, [uso(model, usage(100, 50, 1000, 9000))]);

  return [
    simples('contexto-iterations', [
      uso(MODELO, usage(500, 300, 4000, 90000, {
        // o top-level soma as iterations (conselheiro no servidor): o contexto real é o da última de mensagem.
        iterations: [
          { type: 'message', input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 30000, cache_creation_input_tokens: 1000 },
          { type: 'message', input_tokens: 120, output_tokens: 250, cache_read_input_tokens: 31000, cache_creation_input_tokens: 2000 },
          { type: 'advisor_message', input_tokens: 400, output_tokens: 10, cache_read_input_tokens: 59000, cache_creation_input_tokens: 1000 },
        ],
      })),
    ]),
    simples('contexto-iterations-sem-mensagem', [
      uso(MODELO, usage(500, 300, 4000, 90000, {
        iterations: [{ type: 'advisor_message', input_tokens: 400, output_tokens: 10, cache_read_input_tokens: 59000 }],
      })),
    ]),
    simples('contexto-sem-iterations', [
      uso(MODELO, usage(100, 50, 500, 20000), 400),
      uso(MODELO, usage(200, 80, 1500, 42000), 300),
    ]),
    // O contexto vem do modelo da última resposta.
    fam('', 'claude-sonnet-4-6'),
    fam('-opus', 'claude-opus-4-8'),
    fam('-haiku-4', 'claude-haiku-4-5'),
    fam('-haiku-5', 'claude-haiku-5-5'),
    fam('-fable', 'claude-fable-5'),
    fam('-sufixo-1m', 'claude-sonnet-4-5-20250929[1m]'),
    fam('-legado', 'claude-3-5-sonnet-20241022'),
    // Contexto acima de 200k prova a janela de 1M, mesmo num modelo de 200k.
    simples('janela-1m-observada', [uso('claude-haiku-4-5', usage(1000, 50, 4000, 225000))]),
    simples('janela-1m-observada-no-limite', [uso('claude-haiku-4-5', usage(1000, 50, 4000, 195000))]),
  ];
}

function cenariosSemana(): Entrada[] {
  const DIA = 86400;
  // Sessão com uma resposta datada e sub-agents opcionais.
  const sessao = (id: string, segResposta: number, uso: Obj): ArquivoCaso =>
    principal([user('Fazer o trabalho', segResposta + 60), resposta(segResposta, `req_${id}`, uso)], segResposta, id);

  return [
    {
      nome: 'semana-dentro-e-fora',
      arquivos: [
        principal([user('Fazer o trabalho', 700), resposta(600, 'req_1', usage(10, 100, 200, 3000))], 600),
        subagente('a1', 'Prompt de a1', [usoSub('a1', 'req_s1', usage(4, 40, 0, 400), 580)], 580),
        meta('a1', { toolUseId: 'toolu_a', agentType: 'Explore' }, 580),
        // 8 dias: fora.
        sessao('sess-2', 8 * DIA, usage(1000, 1000, 0, 0)),
        subagente('b1', 'Prompt de b1', [usoSub('b1', 'req_sb1', usage(500, 500, 0, 0), 8 * DIA)], 8 * DIA, 'sess-2'),
        // exatamente 7 dias: dentro (o corte é inclusivo).
        sessao('sess-3', 7 * DIA, usage(20, 200, 0, 2000)),
        // sem nenhuma mensagem datada: vale o mtime (1 dia).
        arquivo('sess-4.jsonl', [semData(MODELO, usage(30, 300, 0, 3000))], 1 * DIA),
        // conversa de 30 dias, com metadado sem data anexado há uma hora: fora (#87900).
        arquivo('sess-5.jsonl', [
          resposta(30 * DIA, 'req_5', usage(2000, 2000, 0, 0)),
          { type: 'ai-title', aiTitle: 'Titulo anexado depois' },
        ], 3600),
      ],
    },
    {
      nome: 'semana-por-tipo',
      arquivos: [
        principal([user('Fazer o trabalho', 700), resposta(600, 'req_1', usage(10, 100, 200, 3000))], 600),
        subagente('a1', 'P1', [usoSub('a1', 'req_s1', usage(100, 900, 0, 8000), 580)], 580),
        meta('a1', { toolUseId: 'toolu_a', agentType: 'Explore' }, 580),
        subagente('a2', 'P2', [usoSub('a2', 'req_s2', usage(50, 400, 0, 4000), 570)], 570),
        meta('a2', { toolUseId: 'toolu_b', agentType: 'general-purpose' }, 570),
        subagente('a3', 'P3', [usoSub('a3', 'req_s3', usage(5, 40, 0, 400), 560)], 560),
        meta('a3', { toolUseId: 'toolu_c' }, 560),
        // sem meta nenhum: também cai em "subagent".
        subagente('a4', 'P4', [usoSub('a4', 'req_s4', usage(2, 20, 0, 200), 550, 'claude-sonnet-4-6')], 550),
        // dois do mesmo tipo somam.
        subagente('a5', 'P5', [usoSub('a5', 'req_s5', usage(60, 500, 0, 5000), 540)], 540),
        meta('a5', { toolUseId: 'toolu_e', agentType: 'Explore' }, 540),
      ],
    },
  ];
}

// Resposta sem timestamp (nem na mensagem): o transcript não tem data nenhuma.
function semData(model: string, uso: Obj): Obj {
  return {
    type: 'assistant', requestId: 'req_4', version: '2.1.310',
    message: { id: 'msg_req_4', model, role: 'assistant', content: [texto('ok')], stop_reason: 'end_turn', usage: uso },
  };
}

function cenarioPrincipalSemLista(): Entrada[] {
  return [{
    nome: 'principal-sem-lista-com-subagente',
    arquivos: [
      principal([
        user('Fazer o trabalho', 700),
        agentCall('toolu_a', 'Explorar o código', 'Procure os pontos de entrada', 600),
        agentResult('toolu_a', 'a1', 580),
        resposta(570, 'req_1', usage(10, 120, 300, 2000)),
      ], 570),
      subagente('a1', 'Procure os pontos de entrada', [
        todoSub('a1', [t(A, 'completed'), t(B, 'in_progress')], 590),
        usoSub('a1', 'req_s1', usage(5, 60, 100, 800), 585),
      ], 580),
      meta('a1', { toolUseId: 'toolu_a', agentType: 'Explore', description: 'Explorar o código', spawnDepth: 1 }, 580),
    ],
  }];
}

// ---------------------------------------------------------------- montador

function semSourceLine(valor: unknown): unknown {
  return JSON.parse(JSON.stringify(valor, (chave, v) => (chave === 'sourceLine' ? undefined : v)));
}

function executar(entrada: Entrada): CasoPainel {
  const viva = entrada.viva === true;
  const vivaDesde = entrada.viva_desde ?? null;
  const claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'casos-painel-'));
  try {
    const projeto = path.join(claudeDir, 'projects', encodeCwdToProjectDir(CWD));
    for (const a of entrada.arquivos) {
      const destino = path.join(projeto, a.caminho);
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.writeFileSync(destino, a.conteudo);
      fs.utimesSync(destino, new Date(a.mtime), new Date(a.mtime));
    }
    // O núcleo só acha a sessão pelo bridge.
    const ponte = path.join(claudeDir, '.vscode-todos-bridge');
    fs.mkdirSync(ponte, { recursive: true });
    fs.writeFileSync(
      path.join(ponte, 'sessions.json'),
      JSON.stringify([{ cwd: CWD, sessionId: SESSAO, terminalPid: null, startedAt: 0 }]),
    );
    if (viva) {
      const vivas = path.join(claudeDir, 'sessions');
      fs.mkdirSync(vivas, { recursive: true });
      fs.writeFileSync(
        path.join(vivas, `${process.pid}.json`),
        JSON.stringify({ pid: process.pid, sessionId: SESSAO, cwd: CWD, startedAt: vivaDesde }),
      );
    }
    const core = new SessionCore({ claudeDir, workspaceCwds: () => [CWD], now: () => AGORA });
    try {
      core.setPinnedSession(SESSAO);
      const snapshot = core.buildSnapshot();
      if (!snapshot) throw new Error(`cenário ${entrada.nome}: o núcleo não achou a sessão`);
      return {
        nome: entrada.nome,
        agora: AGORA,
        cwd: CWD,
        sessao: SESSAO,
        viva,
        viva_desde: vivaDesde,
        arquivos: entrada.arquivos,
        esperado: {
          agents: semSourceLine(snapshot.agents) as any[],
          usage: semSourceLine(snapshot.usage),
          projectUsage: semSourceLine(core.getProjectUsage()),
        },
      };
    } finally {
      core.dispose();
    }
  } finally {
    fs.rmSync(claudeDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- tempos

function cenariosTempos(): CasoTempos[] {
  const s = (seg: number): number => antes(seg);
  const todo = (content: string, status: Todo['status'], startedAt?: number, completedAt?: number): Todo => ({
    content, activeForm: `${content} (em andamento)`, status,
    ...(startedAt !== undefined ? { startedAt } : {}),
    ...(completedAt !== undefined ? { completedAt } : {}),
  });
  const caso = (nome: string, todos: Todo[]): CasoTempos => {
    const summary = summarizeTiming(todos, AGORA);
    return {
      nome,
      agora: AGORA,
      todos,
      esperado: {
        summary: { elapsedMs: summary.elapsedMs, estimateMs: summary.estimateMs, hasEstimate: summary.hasEstimate },
        durations: completedTaskDurations(todos).map(d => (d === undefined ? null : d)),
      },
    };
  };
  return [
    // Sem início visto: cada uma começa quando a anterior terminou.
    caso('tempos-sequencial', [
      todo(A, 'completed', undefined, s(500)),
      todo(B, 'completed', undefined, s(440)),
      todo(C, 'completed', undefined, s(380)),
      todo(D, 'in_progress', s(380)),
      todo('Tarefa extra', 'pending'),
      todo('Tarefa final', 'pending'),
    ]),
    caso('tempos-com-inicio-visto', [
      todo(A, 'completed', s(500), s(440)),
      todo(B, 'completed', s(430), s(370)),
      todo(C, 'in_progress', s(360)),
      todo(D, 'pending'),
    ]),
    // Concluídas no mesmo instante: duração zero, nada medido, sem estimativa.
    caso('tempos-em-lote', [
      todo(A, 'completed', undefined, s(300)),
      todo(B, 'completed', undefined, s(300)),
      todo(C, 'completed', undefined, s(300)),
      todo(D, 'pending'),
    ]),
    // A ativa já passou da média: o que falta dela é zero, e a pendente custa a média.
    caso('tempos-ativa-passou-da-media', [
      todo(A, 'completed', s(900), s(870)),
      todo(B, 'completed', s(860), s(830)),
      todo(C, 'in_progress', s(300)),
      todo(D, 'pending'),
    ]),
    // Nada concluído: só a parte ao vivo da ativa, sem estimativa.
    caso('tempos-sem-medida', [
      todo(A, 'pending'),
      todo(B, 'in_progress', s(120)),
      todo(C, 'pending'),
    ]),
  ];
}

// ---------------------------------------------------------------- montador final

export function gerarCasos(): { painel: CasosPainel; tempos: CasosTempos } {
  const entradas: Entrada[] = [
    ...cenariosTodoWrite(),
    ...cenariosTask(),
    ...cenariosTrocaDeEsquema(),
    ...cenarioIgnorados(),
    ...cenariosSubagentes(),
    ...cenariosSegundoPlano(),
    ...cenariosTokens(),
    ...cenariosContexto(),
    ...cenariosSemana(),
    ...cenarioPrincipalSemLista(),
  ];
  return {
    painel: {
      versao: 1,
      gerado_por: `claude-todos ${pkg.version}`,
      casos: entradas.map(executar),
    },
    tempos: { versao: 1, casos: cenariosTempos() },
  };
}
