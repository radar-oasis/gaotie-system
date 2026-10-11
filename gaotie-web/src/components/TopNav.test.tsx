// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import TopNav from './TopNav';

const testGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
testGlobal.IS_REACT_ACT_ENVIRONMENT = true;

const renderTopNav = async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<TopNav activeTab="demand" onTabChange={vi.fn()} />);
  });

  return { container, root };
};

describe('TopNav', () => {
  it('keeps color configuration in the shared sidebar', async () => {
    const host = document.createElement('div'); const root = createRoot(host);
    await act(async () => root.render(<TopNav activeTab="color" onTabChange={vi.fn()} />));
    expect(host.querySelector('nav.pattern-workspace-nav')).not.toBeNull();
    expect(host.querySelector('[aria-current="page"]')?.textContent).toBe('色彩配置');
    await act(async () => root.unmount());
  });
  it('keeps layout inside the same sidebar including assets', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => root.render(<TopNav activeTab="layout" onTabChange={vi.fn()} />));
    expect(container.querySelector('nav.pattern-workspace-nav')).not.toBeNull();
    expect(container.querySelector('[aria-current="page"]')?.textContent).toBe('车身布局');
    expect(container.querySelectorAll('nav button')).toHaveLength(8);
    expect(container.textContent).toContain('案例检索');
    await act(async () => root.unmount());
  });
  it('uses a sidebar on motif search without losing case navigation', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const change = vi.fn();
    await act(async () => root.render(<TopNav activeTab="image" onTabChange={change} />));
    expect(container.querySelector('nav[aria-label="工作台模块"]')).not.toBeNull();
    const active = container.querySelector('[aria-current="page"]');
    expect(active?.textContent).toBe('纹样检索');
    expect(active?.querySelector('svg')).not.toBeNull();
    const caseButton = [...container.querySelectorAll('button')].find(button => button.textContent === '案例检索')!;
    await act(async () => caseButton.click());
    expect(change).toHaveBeenCalledWith('case');
    expect(container.textContent).not.toContain('项目进度');
    await act(async () => root.unmount());
  });
  it('renders the updated workflow labels in the requested order', async () => {
    const { container, root } = await renderTopNav();
    const labels = Array.from(container.querySelectorAll('button')).map(
      (button) => button.textContent?.trim(),
    );

    expect(labels).toEqual([
      '文化主题解读',
      '纹样检索',
      '纹样转化画布',
      '车身布局',
      '色彩配置',
      '案例检索',
      '效果生成',
      '资产沉淀',
    ]);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
