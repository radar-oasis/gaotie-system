// @vitest-environment happy-dom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ColorConfigProvider,
  useColorConfig,
} from '../../context/ColorConfigContext';
import SavedColorSchemes from './SavedColorSchemes';

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

function SeedLayoutScheme() {
  const { setSelectedLayoutScheme } = useColorConfig();

  useEffect(() => {
    setSelectedLayoutScheme({
      id: 'layout-1',
      name: '布局方案',
      componentsMap: { 车窗带: 'A2' },
    });
    // The context setter is recreated by the provider on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

const flushAsync = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const renderSavedSchemes = async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <ColorConfigProvider>
        <SeedLayoutScheme />
        <SavedColorSchemes />
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

describe('SavedColorSchemes', () => {
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

  it('loads color schemes scoped to the current project and layout scheme', async () => {
    const { root, container } = await renderSavedSchemes();

    await act(async () => {
      vi.runOnlyPendingTimers();
      await flushAsync();
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        '/color-config/schemes?projectId=project-4&layoutSchemeId=layout-1',
      ),
    );

    await unmount(root, container);
  });
});
