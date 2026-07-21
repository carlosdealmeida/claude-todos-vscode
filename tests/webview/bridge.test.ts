import { describe, it, expect, vi } from 'vitest';
import { createVscodeBridge, createJcefBridge } from '../../src/webview/bridge';

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
  it('post stringifies and delegates to window.__jcefPost', () => {
    const __jcefPost = vi.fn();
    const win = { __jcefPost, addEventListener: vi.fn() };
    const bridge = createJcefBridge(win as any);
    bridge.post({ type: 'refresh' });
    expect(__jcefPost).toHaveBeenCalledWith(JSON.stringify({ type: 'refresh' }));
  });

  it('onMessage receives event.data from message events', () => {
    let captured: ((e: any) => void) | null = null;
    const win = { __jcefPost: vi.fn(), addEventListener: (_: string, cb: (e: any) => void) => { captured = cb; } };
    const bridge = createJcefBridge(win as any);
    const seen: unknown[] = [];
    bridge.onMessage((msg) => seen.push(msg));
    captured!({ data: { type: 'locale', locale: 'pt-br' } });
    expect(seen).toEqual([{ type: 'locale', locale: 'pt-br' }]);
  });
});
