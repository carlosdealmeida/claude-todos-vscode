// Gera uma fixture de demo rodando o parser DE PRODUCAO sobre um transcript
// real, truncado progressivamente. Cada corte vira um frame. Roda em Node, onde
// `fs` existe — o site so consome o JSON resultante.
//
// Uso: npm run demo:record -- <caminho-do-.jsonl> <id-do-roteiro>
//
// O transcript de origem carrega dois dados da maquina/sessao de quem gravou:
// o `cwd` absoluto (estrutura de pastas do dono do repo) e o titulo da sessao
// (uma entrada `ai-title` que pode ser residuo de qualquer conversa anterior).
// Nenhum dos dois pode ir para um site publico. As constantes SHOWCASE_* abaixo
// sao o unico lugar que precisa mudar numa regravacao futura — editar aqui, nao
// espalhar o valor pelo resto do arquivo.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SnapshotService } from '../src/services/snapshotService';
import { SessionResolver } from '../src/services/sessionResolver';
import { TodosParser } from '../src/services/todosParser';
import { UsageParser } from '../src/services/usageParser';
import { encodeCwdToProjectDir } from '../src/services/projectDir';
import type { SessionSnapshot } from '../src/types';

const MAX_FRAMES = 120;          // teto do spec — evita inchar o bundle
const FRAME_SPACING_MS = 1000;   // 1 frame/s de roteiro

// cwd e titulo de vitrine — mesmo cwd usado pelas fixtures encenadas da Task 9,
// para consistencia visual entre roteiros. Nunca deriva do transcript real.
const SHOWCASE_CWD = '/home/dev/claude-todos-vscode';
const SHOWCASE_TITLE = 'Smoke test: main + 3 sub-agents';

const [transcriptPath, scriptId] = process.argv.slice(2);
if (!transcriptPath || !scriptId) {
  console.error('uso: npm run demo:record -- <caminho-do-.jsonl> <id>');
  process.exit(1);
}

const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean);
const sessionId = path.basename(transcriptPath, '.jsonl');

// Sub-agents nao ficam ao lado do .jsonl principal: vivem em
// <claudeDir>/projects/<cwd-encoded>/<sessionId>/subagents/, irmao do arquivo
// passado no argv. Deriva do PATH de origem (nao de uma string de cwd) — assim
// o cwd real da maquina de quem grava nunca precisa existir como valor neste
// script: localizamos com a estrutura de diretorios que o path de entrada ja
// revela, e emitimos so o valor de vitrine.
const realSubAgentsDir = path.join(path.dirname(transcriptPath), sessionId, 'subagents');
const subAgentFiles = readSubAgentFiles(realSubAgentsDir);

// Amostragem uniforme quando o transcript passa do teto de frames.
const step = Math.max(1, Math.ceil(lines.length / MAX_FRAMES));
const cuts: number[] = [];
for (let i = step; i <= lines.length; i += step) cuts.push(i);
if (cuts.at(-1) !== lines.length) cuts.push(lines.length);

// Sandbox: recria a estrutura de ~/.claude num diretorio temporario e vai
// reescrevendo o transcript truncado, para que o parser real leia do disco
// exatamente como leria numa sessao de verdade. Tudo dentro do sandbox usa
// SHOWCASE_CWD — o valor que localiza o arquivo (grava e le) e o que aparece
// no snapshot emitido sao o MESMO, entao os dois nunca podem divergir.
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-todos-demo-'));

const frames: { atMs: number; snapshot: SessionSnapshot }[] = [];

for (const [index, cut] of cuts.entries()) {
  const cutoffMs = cutoffTimestamp(cut);
  writeTruncatedMain(lines.slice(0, cut));
  writeTruncatedSubAgents(cutoffMs);
  const snapshot = buildService().build();
  if (!snapshot) continue;
  frames.push({ atMs: index * FRAME_SPACING_MS, snapshot });
}

const script = {
  id: scriptId,
  recordedAt: Date.now(),
  durationMs: frames.length * FRAME_SPACING_MS,
  // Preenchidos a mao apos inspecionar os frames (ver relatorio da Task 8).
  markers: [],
  frames,
  // O dashboard agrega a JANELA DE 7 DIAS do projeto, nao esta sessao unica: nao
  // ha o que derivar de um transcript so. A Task 9 preenche com os numeros
  // reais das fixtures encenadas.
  projectUsage: { sessions: 0, byModel: [], byAgentType: [] },
};

const outPath = path.join('site', 'src', 'demo', 'scripts', `${scriptId}.json`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(script, null, 2)}\n`);
console.log(`${frames.length} frames -> ${outPath}`);
console.log('Proximos passos: preencher `markers` (e conferir `projectUsage`).');

// ---- helpers ----

function sandboxProjectDir(): string {
  return path.join(sandbox, 'projects', encodeCwdToProjectDir(SHOWCASE_CWD));
}

function lineTimestampMs(line: string): number | null {
  try {
    const entry = JSON.parse(line) as { timestamp?: unknown };
    if (typeof entry.timestamp !== 'string') return null;
    const ms = Date.parse(entry.timestamp);
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

// Instante (epoch ms) de um corte do transcript principal: a ultima linha
// VISIVEL neste corte que carrega timestamp proprio. Algumas linhas de
// metadado (mode, permission-mode, bridge-session, ai-title...) nao tem
// timestamp; olhar pra tras ate achar uma linha real fica a poucos ms de
// distancia do corte de verdade — preciso o bastante pra recortar os
// sub-agents no mesmo instante.
function cutoffTimestamp(cut: number): number {
  for (let i = cut - 1; i >= 0; i--) {
    const ts = lineTimestampMs(lines[i]);
    if (ts !== null) return ts;
  }
  return -Infinity;
}

// O titulo real da sessao vem de uma entrada `ai-title` gravada DENTRO do
// transcript. Reescrever o campo aqui — antes de escrever no sandbox — em vez
// de sobrescrever `snapshot.title` depois do parser rodar, mantem o invariante
// do gravador: o titulo de vitrine sai do parser real lendo um transcript
// valido, por construcao, nao de um patch pos-hoc no resultado.
function rewriteAiTitle(line: string): string {
  if (line.indexOf('"type":"ai-title"') < 0) return line;
  try {
    const entry = JSON.parse(line) as { type?: string; aiTitle?: unknown };
    if (entry.type === 'ai-title' && typeof entry.aiTitle === 'string') {
      return JSON.stringify({ ...entry, aiTitle: SHOWCASE_TITLE });
    }
  } catch { /* linha malformada: deixa como esta, o parser real tambem ignoraria */ }
  return line;
}

function writeTruncatedMain(slice: string[]): void {
  const dir = sandboxProjectDir();
  fs.mkdirSync(dir, { recursive: true });
  const rewritten = slice.map(rewriteAiTitle);
  fs.writeFileSync(path.join(dir, `${sessionId}.jsonl`), `${rewritten.join('\n')}\n`);
}

interface SubAgentFile {
  agentId: string;         // <agentId> de agent-<agentId>.jsonl
  lines: string[];         // linhas cruas do .jsonl real, cada uma com timestamp
  metaRaw: string | null;  // conteudo cru do .meta.json irmao, se existir
}

function readSubAgentFiles(dir: string): SubAgentFile[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir).filter((f) => f.startsWith('agent-') && f.endsWith('.jsonl'));
  } catch {
    return [];
  }
  return names.map((name) => {
    const agentId = name.slice('agent-'.length, -'.jsonl'.length);
    const jsonlLines = fs.readFileSync(path.join(dir, name), 'utf8').split('\n').filter(Boolean);
    const metaPath = path.join(dir, name.replace(/\.jsonl$/, '.meta.json'));
    const metaRaw = fs.existsSync(metaPath) ? fs.readFileSync(metaPath, 'utf8') : null;
    return { agentId, lines: jsonlLines, metaRaw };
  });
}

// Sub-agents tem seu proprio transcript, truncado pelo MESMO instante de corte
// do main (nao pela contagem de linhas dele): cada linha do sub-agent ja
// carrega timestamp, entao "ainda nao aconteceu" = timestamp > cutoffMs. So
// grava o par jsonl+meta quando ao menos 1 linha ja passou do corte — antes
// disso o sub-agent simplesmente nao existe no disco, igual a uma sessao real
// onde o arquivo so aparece quando o primeiro evento do sub-agent chega.
function writeTruncatedSubAgents(cutoffMs: number): void {
  const dir = path.join(sandboxProjectDir(), sessionId, 'subagents');
  fs.mkdirSync(dir, { recursive: true });
  for (const file of subAgentFiles) {
    const visible = file.lines.filter((line) => {
      const ts = lineTimestampMs(line);
      return ts !== null && ts <= cutoffMs;
    });
    if (visible.length === 0) continue;
    fs.writeFileSync(path.join(dir, `agent-${file.agentId}.jsonl`), `${visible.join('\n')}\n`);
    if (file.metaRaw !== null) {
      fs.writeFileSync(path.join(dir, `agent-${file.agentId}.meta.json`), file.metaRaw);
    }
  }
}

function buildService(): SnapshotService {
  // O SnapshotService so chama `resolveCandidates()` no resolver; um stub evita
  // construir um BridgeFile de verdade so para apontar uma sessao.
  const resolver = {
    resolveCandidates: () => [{ cwd: SHOWCASE_CWD, sessionId, terminalPid: null, startedAt: 0 }],
  } as unknown as SessionResolver;
  return new SnapshotService(resolver, new TodosParser(sandbox), new UsageParser(sandbox));
}
