<script lang="ts">
  import type { SessionUsage } from '../../types';
  import { usageHeadline, formatCompact, shortModel, contextLevel, cacheLevel } from '../format';
  import { todosStore } from '../stores.svelte';

  let { usage }: { usage: SessionUsage } = $props();
  let h = $derived(usageHeadline(usage));
  let top = $derived(Math.max(1, ...h.models.map((m) => m.total)));
  type Tile = { key: string; label: string; big: string; unit: string; pct: number; tone: string };
  let tiles = $derived<Tile[]>([
    ...(h.ctxPct !== null ? [{ key: 'ctx', label: todosStore.t('gauge.ctx'), big: String(Math.round(h.ctxPct * 100)), unit: '%', pct: h.ctxPct, tone: contextLevel(h.ctxPct) }] : []),
    ...h.models.map((m) => ({ key: m.model, label: shortModel(m.model).toUpperCase(), big: formatCompact(m.total), unit: '', pct: m.total / top, tone: 'info' })),
    ...(h.cacheRate !== null ? [{ key: 'cache', label: todosStore.t('gauge.cache'), big: String(Math.round(h.cacheRate * 100)), unit: '%', pct: h.cacheRate, tone: cacheLevel(h.cacheRate) }] : []),
  ]);
</script>

{#if tiles.length > 0}
  <!-- A grade vai direto no style: cssTokens.test.ts nao reconhece uma definicao
       --n: logo depois de aspas e reprovaria o var(--n). -->
  <div class="gauges" style="grid-template-columns: repeat({tiles.length}, minmax(0, 1fr))">
    {#each tiles as t (t.key)}
      <div class="g {t.tone}">
        <div class="gl">{t.label}</div>
        <div class="gv">{t.big}<small>{t.unit}</small></div>
        <div class="gb" aria-hidden="true"><span style="width: {Math.round(t.pct * 100)}%"></span></div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .gauges { display: grid; gap: 1px; background: var(--ct-border); border: 1px solid var(--ct-border); border-radius: var(--radius); overflow: hidden; margin-bottom: var(--sp-2); }
  .g { background: var(--ct-header-bg); padding: var(--sp-2); min-width: 0; }
  .gl { font-size: 0.68em; font-weight: 700; letter-spacing: 0.12em; color: var(--ct-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gv { font-family: var(--ct-mono); font-size: 1.25em; font-weight: 600; font-variant-numeric: tabular-nums; margin: 2px 0 4px; }
  .gv small { font-size: 0.6em; color: var(--ct-muted); font-weight: 400; }
  .gb { height: 3px; background: var(--ct-track); }
  .gb span { display: block; height: 3px; background: var(--ct-info); }
  /* Niveis: contextLevel devolve ok/warn/danger; cacheLevel, good/mid/low. */
  .g.warn .gv, .g.mid .gv { color: var(--ct-warn); }
  .g.warn .gb span, .g.mid .gb span { background: var(--ct-warn); }
  .g.danger .gv, .g.low .gv { color: var(--ct-danger); }
  .g.danger .gb span, .g.low .gb span { background: var(--ct-danger); }
</style>
