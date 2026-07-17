<script lang="ts">
  import AgentTree from './AgentTree.svelte';
  import AgentSection from './AgentSection.svelte';
  import { isHistory, type AgentNode } from '../tree';
  import { agentTotalTokens } from '../format';
  import { todosStore } from '../stores.svelte';
  import type { SessionUsage } from '../../types';

  let { node, level = 0, usage, history = false, hasRunningSubAgent = false, mainModel }:
    { node: AgentNode; level?: number; usage?: SessionUsage; history?: boolean; hasRunningSubAgent?: boolean; mainModel?: string } = $props();

  // Cap de recuo: a partir do 4º nível a árvore achata (o painel é estreito e
  // spawnDepth > 3 é raríssimo).
  let childLevel = $derived(Math.min(level + 1, 3));

  // Usage deste nó — alimenta o badge de modelo do cabeçalho.
  let agentUsage = $derived(usage?.byAgent.find(a => a.agentId === node.agent.agentId));

  function isFirstHistory(children: AgentNode[], i: number): boolean {
    return isHistory(children[i].agent) && (i === 0 || !isHistory(children[i - 1].agent));
  }
</script>

<AgentSection
  agent={node.agent}
  {history}
  defaultExpanded={node.agent.isMain || node.agent.status === 'running'}
  tokens={agentTotalTokens(usage?.byAgent, node.agent.agentId)}
  {hasRunningSubAgent}
  currentModel={agentUsage?.currentModel}
  usedModels={agentUsage?.models.map(m => m.model) ?? []}
  {mainModel}
/>
{#if node.children.length > 0}
  <div class="kids" class:railed={level < 3}>
    {#each node.children as child, i (child.agent.agentId)}
      {#if level === 0 && isFirstHistory(node.children, i)}
        <div class="history-divider">{todosStore.t('app.historyDivider')}</div>
      {/if}
      <div class="branch" class:railed={level < 3}>
        <AgentTree node={child} level={childLevel} {usage} history={isHistory(child.agent)} {mainModel} />
      </div>
    {/each}
  </div>
{/if}

<style>
  /* Linhas-guia (layout A do design): recuo + trilho vertical no contêiner dos
     filhos e um conector horizontal curto por filho, na altura do cabeçalho. */
  .kids.railed {
    margin-left: var(--sp-2);
    padding-left: var(--sp-2);
    border-left: 1px solid var(--vscode-panel-border);
  }
  .branch.railed {
    position: relative;
  }
  .branch.railed::before {
    content: '';
    position: absolute;
    left: calc(-1 * var(--sp-2));
    top: 16px;
    width: calc(var(--sp-2) - 2px);
    height: 1px;
    background: var(--vscode-panel-border);
  }
  .history-divider {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    text-transform: uppercase;
    font-size: 0.7em;
    letter-spacing: 0.5px;
    color: var(--muted);
    margin: var(--sp-2) var(--sp-1) var(--sp-1);
  }
  .history-divider::before,
  .history-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--vscode-panel-border);
  }
</style>
