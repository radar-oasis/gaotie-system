// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PromptEnhancementPanel from './PromptEnhancementPanel';
import { enhancePrompt } from './promptEnhancement';

vi.mock('./promptEnhancement', () => ({ enhancePrompt: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const result = {
  originalPrompt: '更有速度感', ruleVersion: '1', model: 'test', contextMode: 'metadata-only' as const, maxPromptLength: 500,
  warnings: ['未读取图像像素'],
  directions: [
    { id: 'preserve' as const, title: '保留型', prompt: '保留主体，轻微横向延展', retained: ['主体'], changes: ['横向延展'], checks: [{ label: '原意', status: 'warning' as const, detail: '需用户确认' }] },
    { id: 'explore' as const, title: '探索型', prompt: '提取走势，转化为带状图案', retained: ['母题'], changes: ['抽象带状'], checks: [] },
  ],
};
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => { await act(async () => { roots.splice(0).forEach(root => root.unmount()); }); vi.clearAllMocks(); });
const refs = [{ id: 'layer-1', name: '龙纹', motifs: ['龙'] }];
async function mount() {
  const host = document.createElement('div'); const root = createRoot(host); roots.push(root);
  const onApply = vi.fn();
  const render = async (prompt = '更有速度感', scopeKey = 'p1', referenceKey = 'same') => {
    await act(async () => root.render(<PromptEnhancementPanel prompt={prompt} references={refs} scopeKey={scopeKey} referenceKey={referenceKey} disabled={false} onApply={onApply} />));
  };
  await render();
  const click = async (label: string) => { const button = [...host.querySelectorAll('button')].find(node => node.textContent === label); expect(button).toBeDefined(); await act(async () => button!.click()); };
  return { host, render, click, onApply };
}
describe('PromptEnhancementPanel', () => {
  it('cancels pending optimization and ignores late completion', async () => {
    let resolve!: (value: typeof result) => void;
    vi.mocked(enhancePrompt).mockReturnValue(new Promise(done => { resolve = done; }));
    const page = await mount(); await page.click('优化提示词'); await page.click('取消优化');
    expect(vi.mocked(enhancePrompt).mock.calls[0][1].aborted).toBe(true);
    await act(async () => resolve(result));
    expect(page.host.querySelectorAll('textarea')).toHaveLength(0);
    expect(page.onApply).not.toHaveBeenCalled();
  });
  it('blocks stale directions when reference layers change', async () => {
    vi.mocked(enhancePrompt).mockResolvedValue(result);
    const page = await mount(); await page.click('优化提示词');
    await page.render('更有速度感', 'p1', 'changed'); await page.click('填入保留型（不生图）');
    expect(page.onApply).not.toHaveBeenCalled();
    expect(page.host.textContent).toContain('输入或参考图已变化');
  });
  it('applies edited text and blocks text above the returned budget', async () => {
    vi.mocked(enhancePrompt).mockResolvedValue(result);
    const page = await mount(); await page.click('优化提示词');
    const textarea = page.host.querySelector('textarea')!;
    const edit = async (value: string) => act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, value);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await edit('长'.repeat(501)); await page.click('填入保留型（不生图）');
    expect(page.onApply).not.toHaveBeenCalled();
    await edit('保留龙纹，向右渐收'); await page.click('填入保留型（不生图）');
    expect(page.onApply).toHaveBeenLastCalledWith('保留龙纹，向右渐收');
  });
  it('keeps the original, only applies after selection, and can restore it', async () => {
    vi.mocked(enhancePrompt).mockResolvedValue(result);
    const page = await mount(); await page.click('优化提示词');
    expect(page.onApply).not.toHaveBeenCalled();
    expect(page.host.textContent).toContain('更有速度感');
    expect(page.host.querySelectorAll('textarea')).toHaveLength(2);
    expect(page.host.textContent).not.toContain('优化规则与参考依据');
    expect(page.host.querySelector('.prompt-enhancer__header')?.textContent).toContain('收起建议');
    await page.click('收起建议');
    expect(page.host.querySelectorAll('textarea')).toHaveLength(0);
    await page.click('查看建议');
    await page.click('填入保留型（不生图）'); expect(page.onApply).toHaveBeenLastCalledWith(result.directions[0].prompt);
    await page.render(result.directions[0].prompt);
    await page.click('恢复原始输入'); expect(page.onApply).toHaveBeenLastCalledWith('更有速度感');
  });
  it('discards a response when the user edits the original input', async () => {
    let resolve!: (value: typeof result) => void;
    vi.mocked(enhancePrompt).mockReturnValue(new Promise(done => { resolve = done; }));
    const page = await mount(); await page.click('优化提示词');
    const signal = vi.mocked(enhancePrompt).mock.calls[0][1];
    await page.render('换成蓝色');
    await act(async () => resolve(result));
    expect(signal.aborted).toBe(true);
    expect(page.host.querySelectorAll('textarea')).toHaveLength(0);
    expect(page.onApply).not.toHaveBeenCalled();
  });
  it('clears a finished comparison when switching project', async () => {
    vi.mocked(enhancePrompt).mockResolvedValue(result);
    const page = await mount(); await page.click('优化提示词');
    await page.render('更有速度感', 'p2');
    expect(page.host.querySelectorAll('textarea')).toHaveLength(0);
  });
  it('shows an API error without replacing the user input or inventing results', async () => {
    vi.mocked(enhancePrompt).mockRejectedValue(new Error('模型暂不可用'));
    const page = await mount(); await page.click('优化提示词');
    expect(page.host.textContent).toContain('模型暂不可用');
    expect(page.host.querySelectorAll('textarea')).toHaveLength(0);
    expect(page.onApply).not.toHaveBeenCalled();
  });
});
