import { describe, it, expect, beforeAll } from 'vitest';
import { gerarCasos } from '../../scripts/casosPainel/cenarios';

const NOMES_PAINEL = [
  'todowrite-anda', 'todowrite-volta-a-pendente', 'todowrite-some-e-volta', 'todowrite-muda-de-lugar',
  'task-id-pelo-resultado', 'task-id-pelo-texto', 'task-update-ignorado',
  'troca-de-esquema',
  'ignorados',
  'subagente-com-meta', 'subagente-aninhado', 'subagente-recusado', 'subagente-sem-meta',
  'segundo-plano-vivo', 'segundo-plano-retomado', 'segundo-plano-notificado', 'segundo-plano-sessao-parada',
  'tokens-registros-iguais', 'tokens-previa-e-final', 'tokens-so-previas', 'tokens-sem-request-id',
  'tokens-requisicoes-distintas',
  'contexto-iterations', 'contexto-sem-iterations', 'janela-1m-por-familia', 'janela-1m-observada',
  'semana-dentro-e-fora', 'semana-por-tipo',
  'principal-sem-lista-com-subagente',
];
const NOMES_TEMPOS = [
  'tempos-sequencial', 'tempos-com-inicio-visto', 'tempos-em-lote',
  'tempos-ativa-passou-da-media', 'tempos-sem-medida',
];

describe('gerarCasos', { timeout: 60_000 }, () => {
  let gerado: ReturnType<typeof gerarCasos>;
  beforeAll(() => { gerado = gerarCasos(); }, 60_000);

  it('dois runs dão o mesmo JSON', () => {
    const b = gerarCasos();
    expect(JSON.stringify(gerado)).toBe(JSON.stringify(b));
  });

  it('os nomes são únicos e todos os cenários existem', () => {
    const { painel, tempos } = gerado;
    const nomesPainel = painel.casos.map(c => c.nome);
    const nomesTempos = tempos.casos.map(c => c.nome);
    expect(new Set(nomesPainel).size).toBe(nomesPainel.length);
    expect(new Set(nomesTempos).size).toBe(nomesTempos.length);
    for (const n of NOMES_PAINEL) expect(nomesPainel).toContain(n);
    for (const n of NOMES_TEMPOS) expect(nomesTempos).toContain(n);
  });

  it('o principal-sem-lista-com-subagente tem o principal primeiro nos tokens (Task 1)', () => {
    const { painel } = gerado;
    const caso = painel.casos.find(c => c.nome === 'principal-sem-lista-com-subagente')!;
    expect(caso.esperado.agents.every((a: any) => !a.isMain)).toBe(true);
    expect(caso.esperado.agents.length).toBeGreaterThan(0);
    expect(caso.esperado.usage.byAgent[0].isMain).toBe(true);
  });

  it('cada caso do painel produz agentes ou uso, sem sourceLine', () => {
    const { painel } = gerado;
    for (const c of painel.casos) {
      expect(c.esperado.agents.length + (c.esperado.usage?.byAgent?.length ?? 0), c.nome).toBeGreaterThan(0);
      expect(JSON.stringify(c.esperado)).not.toContain('sourceLine');
    }
  });

  it('o caminho dos arquivos é único dentro de cada caso', () => {
    const { painel } = gerado;
    for (const c of painel.casos) {
      const caminhos = c.arquivos.map(a => a.caminho);
      expect(new Set(caminhos).size, c.nome).toBe(caminhos.length);
    }
  });
});
