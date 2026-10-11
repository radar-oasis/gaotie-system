// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LegacyLayoutElementsPage as LayoutElementsPage } from './LayoutElementsPage';

const testGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
testGlobal.IS_REACT_ACT_ENVIRONMENT = true;

const projectMock = vi.hoisted(() => ({
  currentProject: {
    id: 'project-4',
    name: '新项目 4',
  },
}));
const colorMock = vi.hoisted(()=>({setSelectedLayoutScheme:vi.fn()}));
vi.mock('../context/ColorConfigContext',()=>({useColorConfig:()=>colorMock}));

vi.mock('../projects/ProjectContext', () => ({
  useProject: () => projectMock,
}));

const flushAsync = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const renderPage = async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<LayoutElementsPage />);
  });

  return { container, root };
};

const unmount = async (root: Root, container: HTMLElement) => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
};

describe('LayoutElementsPage', () => {
  it('adopts a clicked layout directly without visiting the color module',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>[{id:'layout-one',name:'独立布局',componentsMap:{车窗带:'A1'}}]})));
    const {root,container}=await renderPage();
    await act(async()=>{vi.runOnlyPendingTimers();await flushAsync();});
    const el=[...container.querySelectorAll('h3,span,div')].find(e=>e.textContent==='独立布局') as HTMLElement;
    expect(el).toBeDefined();await act(async()=>el.click());
    expect(colorMock.setSelectedLayoutScheme).toHaveBeenCalledWith(expect.objectContaining({id:'layout-one',componentsMap:{车窗带:'A1'}}));
    await unmount(root,container);
  });
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => [],
      })),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('loads layout schemes scoped to the current project', async () => {
    const { root, container } = await renderPage();

    await act(async () => {
      vi.runOnlyPendingTimers();
      await flushAsync();
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/layout-scheme/list?projectId=project-4'),
    );

    await unmount(root, container);
  });

  it('renames a saved layout scheme', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return {
          ok: true,
          json: async () => ({
            id: 'scheme-1',
            name: '新版布局',
            componentsMap: { 车窗带: 'A2' },
            projectId: 'project-4',
          }),
        };
      }

      return {
        ok: true,
        json: async () => [
          {
            id: 'scheme-1',
            name: '方案1',
            componentsMap: { 车窗带: 'A2' },
            projectId: 'project-4',
          },
        ],
      };
    });
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(window, 'prompt', {
      configurable: true,
      value: vi.fn(() => '新版布局'),
    });
    const { root, container } = await renderPage();

    await act(async () => {
      vi.runOnlyPendingTimers();
      await flushAsync();
    });

    const renameButton = container.querySelector(
      'button[aria-label="重命名方案1"]',
    ) as HTMLButtonElement | null;

    expect(renameButton).not.toBeNull();

    await act(async () => {
      renameButton?.click();
      await flushAsync();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/layout-scheme/scheme-1'),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ name: '新版布局' }),
      }),
    );

    await unmount(root, container);
  });
});
