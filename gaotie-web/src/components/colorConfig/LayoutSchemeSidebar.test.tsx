// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ColorConfigProvider } from '../../context/ColorConfigContext';
import LayoutSchemeSidebar from './LayoutSchemeSidebar';

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

vi.mock('../../projects/ProjectContext', () => ({
  useProject: () => projectMock,
}));

const flushAsync = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const renderSidebar = async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <ColorConfigProvider>
        <LayoutSchemeSidebar />
      </ColorConfigProvider>,
    );
  });

  return { container, root };
};

const unmount = async (root: Root, container: HTMLElement) => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
};

describe('LayoutSchemeSidebar', () => {
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

  it('loads color configuration layout choices scoped to the current project', async () => {
    const { root, container } = await renderSidebar();

    await act(async () => {
      vi.runOnlyPendingTimers();
      await flushAsync();
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/layout-scheme/list?projectId=project-4'),
    );

    await unmount(root, container);
  });
});
