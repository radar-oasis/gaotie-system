// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import GraphNodePicker from './GraphNodePicker';
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
it('opens with the arrow, selects with the keyboard, and dismisses without changing selection', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); const change = vi.fn();
  try {
    await act(async () => root.render(<GraphNodePicker value="a" options={[{value:'a',label:'龙'},{value:'b',label:'唐'}]} onChange={change} />));
    const input = host.querySelector('input')!;
    await act(async () => host.querySelector('button')!.click());
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('[aria-selected="true"]')?.textContent).toBe('龙');
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
    expect(change).toHaveBeenCalledWith('b');
    expect(host.querySelector('[role="listbox"]')).toBeNull();
    await act(async () => host.querySelector('button')!.click());
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    expect(host.querySelector('[role="listbox"]')).toBeNull();
    expect(change).toHaveBeenCalledTimes(1);
  } finally { await act(async () => root.unmount()); host.remove(); }
});
