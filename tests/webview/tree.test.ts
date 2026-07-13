import { describe, it, expect } from 'vitest';
import { buildTree, isHistory } from '../../src/webview/tree';
import type { AgentTodos } from '../../src/types';

function agent(over: Partial<AgentTodos> & { agentId: string }): AgentTodos {
  return {
    sessionId: 's1', name: over.agentId, isMain: false, todos: [], updatedAt: 0,
    ...over,
  };
}

describe('buildTree', () => {
  it('nests direct children under the main agent', () => {
    const main = agent({ agentId: 's1', isMain: true });
    const a = agent({ agentId: 'a', parentAgentId: 's1' });
    const b = agent({ agentId: 'b', parentAgentId: 's1' });
    const roots = buildTree([main, a, b]);
    expect(roots).toHaveLength(1);
    expect(roots[0].agent.agentId).toBe('s1');
    expect(roots[0].children.map(c => c.agent.agentId)).toEqual(['a', 'b']);
  });

  it('nests a depth-2 agent under its dispatching sub-agent', () => {
    const main = agent({ agentId: 's1', isMain: true });
    const pai = agent({ agentId: 'pai', parentAgentId: 's1' });
    const filho = agent({ agentId: 'filho', parentAgentId: 'pai', depth: 2 });
    const roots = buildTree([main, pai, filho]);
    expect(roots[0].children).toHaveLength(1);
    expect(roots[0].children[0].children.map(c => c.agent.agentId)).toEqual(['filho']);
  });

  it('attaches legacy agents (no parentAgentId) to the main agent', () => {
    const main = agent({ agentId: 's1', isMain: true });
    const legacy = agent({ agentId: 'leg' });
    const roots = buildTree([main, legacy]);
    expect(roots[0].children.map(c => c.agent.agentId)).toEqual(['leg']);
  });

  it('attaches agents whose parent is not in the list to the main agent', () => {
    const main = agent({ agentId: 's1', isMain: true });
    const orfao = agent({ agentId: 'x', parentAgentId: 'sumiu' });
    const roots = buildTree([main, orfao]);
    expect(roots[0].children.map(c => c.agent.agentId)).toEqual(['x']);
  });

  it('promotes agents to roots when there is no main in the list', () => {
    const a = agent({ agentId: 'a' });
    const b = agent({ agentId: 'b', parentAgentId: 'a' });
    const roots = buildTree([a, b]);
    expect(roots.map(r => r.agent.agentId)).toEqual(['a']);
    expect(roots[0].children.map(c => c.agent.agentId)).toEqual(['b']);
  });

  it('preserves the input order among siblings', () => {
    const main = agent({ agentId: 's1', isMain: true });
    const c = agent({ agentId: 'c', parentAgentId: 's1' });
    const a = agent({ agentId: 'a', parentAgentId: 's1' });
    const roots = buildTree([main, c, a]);
    expect(roots[0].children.map(x => x.agent.agentId)).toEqual(['c', 'a']);
  });

  it('does not attach a self-parenting agent to itself', () => {
    const main = agent({ agentId: 's1', isMain: true });
    const weird = agent({ agentId: 'w', parentAgentId: 'w' });
    const roots = buildTree([main, weird]);
    expect(roots[0].children.map(c => c.agent.agentId)).toEqual(['w']);
    expect(roots[0].children[0].children).toEqual([]);
  });

  it('attaches a child that appears before its parent in the input', () => {
    const main = agent({ agentId: 's1', isMain: true });
    const filho = agent({ agentId: 'filho', parentAgentId: 'pai' });
    const pai = agent({ agentId: 'pai', parentAgentId: 's1' });
    const roots = buildTree([main, filho, pai]);
    const paiNode = roots[0].children.find(c => c.agent.agentId === 'pai')!;
    expect(paiNode.children.map(c => c.agent.agentId)).toEqual(['filho']);
  });
});

describe('isHistory', () => {
  it('is true only for non-main, non-running agents without todos', () => {
    expect(isHistory(agent({ agentId: 'x', status: 'completed' }))).toBe(true);
    expect(isHistory(agent({ agentId: 'x' }))).toBe(true);  // status undefined (órfão)
    expect(isHistory(agent({ agentId: 'x', status: 'running' }))).toBe(false);
    expect(isHistory(agent({ agentId: 's1', isMain: true }))).toBe(false);
    expect(isHistory(agent({
      agentId: 'x', status: 'completed',
      todos: [{ content: 'c', activeForm: 'C', status: 'completed' }],
    }))).toBe(false);
  });
});
