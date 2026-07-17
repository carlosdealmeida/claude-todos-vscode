import { describe, it, expect, vi } from 'vitest';
import { createVscodeBridge, createJcefBridge, createBridge } from '../../src/webview/bridge';

describe('createVscodeBridge', () => {
  it('post delegates to acquireVsCodeApi().postMessage', () => {
    const postMessage = vi.fn();
    const bridge = createVscodeBridge({ addEventListener: vi.fn() } as any, () => ({ postMessage }));
    bridge.post({ type: 'ready' });
    expect(postMessage).toHaveBeenCalledWith({ type: 'ready' });
  });

  it('onMessage receives event.data from window message events', () => {
    let captured: ((e: any) => void) | null = null;
    const win = { addEventListener: (_: string, cb: (e: any) => void) => { captured = cb; } };
    const bridge = createVscodeBridge(win as any, () => ({ postMessage: vi.fn() }));
    const seen: unknown[] = [];
    bridge.onMessage((msg) => seen.push(msg));
    captured!({ data: { type: 'snapshot', snapshot: null } });
    expect(seen).toEqual([{ type: 'snapshot', snapshot: null }]);
  });
});

describe('createJcefBridge', () => {
  it('throws until SP1 implements it', () => {
    expect(() => createJcefBridge()).toThrow(/SP1/);
  });
});

describe('createBridge', () => {
  it('falls into the jcef branch when acquireVsCodeApi is absent (node env)', () => {
    // Em env node, `acquireVsCodeApi` não existe em runtime → ramo JCEF → throw.
    expect(() => createBridge()).toThrow(/SP1/);
  });
});
