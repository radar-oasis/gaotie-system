// @vitest-environment happy-dom
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { ChatProvider, useChat } from '../context/ChatContext';
import LeftWorkspace from './LeftWorkspace';
import RightPanel from './RightPanel';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
async function renderPage() {
  function Seed() {
    const { setChatHistory } = useChat();
    useEffect(() => setChatHistory([
      { id: 'u', role: 'user', type: 'text', content: '希望吉祥、有气势' },
      { id: 'a', role: 'ai', type: 'text', content: '**神话瑞兽**\n龙可以提取线条。\n[TAG:神话瑞兽-龙] [TAG:自然意象-祥云]' },
      { id: 'b', role: 'ai', type: 'text', content: '也可以考虑凤。 [TAG:神话瑞兽-凤] [TAG:神话瑞兽-龙]' },
    ]), [setChatHistory]);
    return null;
  }
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const send = vi.fn();
  const confirm = vi.fn();
  await act(async () => root.render(<ChatProvider><Seed /><LeftWorkspace onSendMessage={send} /><RightPanel onConfirm={confirm} /></ChatProvider>));
  return { host, send, confirm, cleanup: async () => { await act(async () => root.unmount()); host.remove(); } };
}
describe('Cultural theme workspace', () => {
  it('frames replies and selects and removes imagery independently across messages', async () => {
    const { host, confirm, cleanup } = await renderPage();
    expect(host.querySelectorAll('.theme-message__reply')).toHaveLength(2);
    expect(host.querySelector('.theme-message__reply strong')?.textContent).toBe('神话瑞兽');
    expect(host.textContent).not.toContain('[TAG:');
    const next = host.querySelector<HTMLButtonElement>('[aria-label="查找纹样"]')!;
    expect(next.disabled).toBe(true);
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="选择 龙"]')!.click());
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="选择 凤"]')!.click());
    const selected = host.querySelector('[aria-label="已选意象"]')!;
    expect(selected.querySelectorAll('.theme-selected-item')).toHaveLength(2);
    expect(selected.querySelector('.theme-selected-item > div svg')).toBeNull();
    expect(selected.querySelector('.theme-selected-item img')).toBeNull();
    expect(selected.querySelector('[aria-label="移除 龙"] .t-icon-close')).not.toBeNull();
    expect(selected.querySelector('[aria-label="移除 龙"]')?.textContent).toBe('');
    await act(async () => selected.querySelector<HTMLButtonElement>('[aria-label="移除 龙"]')!.click());
    expect(selected.querySelectorAll('.theme-selected-item')).toHaveLength(1);
    expect(selected.textContent).toContain('凤');
    await act(async () => next.click());
    expect(confirm).toHaveBeenCalledOnce();
    await cleanup();
  });
  it('synchronizes duplicate imagery and toggles off from either reply', async () => {
    const { host, cleanup } = await renderPage();
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="选择 龙"]')!.click());
    expect(host.querySelectorAll('[aria-label="取消选择 龙"][aria-pressed="true"]')).toHaveLength(2);
    await act(async () => host.querySelectorAll<HTMLButtonElement>('[aria-label="取消选择 龙"]')[1].click());
    expect(host.querySelectorAll('.theme-selected-item')).toHaveLength(0);
    await cleanup();
  });
  it('does not send IME confirmation or Shift+Enter, but sends ordinary Enter', async () => {
    const { host, send, cleanup } = await renderPage();
    const input = host.querySelector('textarea')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, '希望简洁一些');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })));
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true })));
    expect(send).not.toHaveBeenCalled();
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(send).toHaveBeenCalledWith('希望简洁一些');
    expect(input.value).toBe('');
    await cleanup();
  });
});
