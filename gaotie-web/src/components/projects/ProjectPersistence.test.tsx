// @vitest-environment happy-dom
import { act, useEffect, useRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { CaseSearchContextProvider, useCaseSearch } from '../../context/CaseSearchContext';
import { ChatProvider } from '../../context/ChatContext';
import { ColorConfigProvider, useColorConfig } from '../../context/ColorConfigContext';
import { FinalProposalProvider, useFinalProposal } from '../../context/FinalProposalContext';
import { ImageSearchProvider, useImageSearch } from '../../context/ImageSearchContext';
import { SharedTagsProvider } from '../../context/SharedTagsContext';
import { SuperCanvasProvider, useSuperCanvas } from '../../context/SuperCanvasContext';
import { createEmptyWorkspaceSnapshot } from '../../projects/workspaceSnapshot';
import ProjectPersistence from './ProjectPersistence';

const mocks = vi.hoisted(() => ({
  getProjectSnapshot: vi.fn(),
  saveProjectSnapshot: vi.fn(),
  markSaved: vi.fn(),
  currentProject: null as typeof project | null,
}));

const project = {
  id: 'project-1',
  userId: 'user-1',
  name: '新项目 4',
  description: null,
  status: 'active',
  currentStep: 'canvas',
};

const secondProject = {
  ...project,
  id: 'project-2',
  name: '默认项目',
  currentStep: 'demand',
};

vi.mock('../../projects/projectApi', () => ({
  getProjectSnapshot: mocks.getProjectSnapshot,
  saveProjectSnapshot: mocks.saveProjectSnapshot,
}));

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', username: 'sanmu', displayName: 'sanmu' },
    logout: vi.fn(),
  }),
}));

vi.mock('../../projects/ProjectContext', () => ({
  useProject: () => ({
    projects: [project, secondProject],
    currentProject: mocks.currentProject,
    isLoading: false,
    error: '',
    lastSavedAt: null,
    selectProject: vi.fn(),
    createProject: vi.fn(),
    renameProject: vi.fn(),
    markSaved: mocks.markSaved,
    refreshProjects: vi.fn(),
  }),
}));

const testGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
testGlobal.IS_REACT_ACT_ENVIRONMENT = true;

function Providers({ children }: { children: ReactNode }) {
  return (
    <ChatProvider>
      <SharedTagsProvider>
        <ImageSearchProvider>
          <CaseSearchContextProvider>
            <ColorConfigProvider>
              <SuperCanvasProvider>
                <FinalProposalProvider>{children}</FinalProposalProvider>
              </SuperCanvasProvider>
            </ColorConfigProvider>
          </CaseSearchContextProvider>
        </ImageSearchProvider>
      </SharedTagsProvider>
    </ChatProvider>
  );
}

function StateMutator({ enabled }: { enabled: boolean }) {
  const image = useImageSearch();
  const caseSearch = useCaseSearch();
  const colorConfig = useColorConfig();
  const canvas = useSuperCanvas();
  const finalProposal = useFinalProposal();
  const didApply = useRef(false);

  useEffect(() => {
    if (!enabled || didApply.current) {
      return;
    }

    didApply.current = true;
    image.setPatterns([
      {
        id: 'pattern-1',
        name: '龙纹',
        imageUrl: '/images/dragon.png',
        dynasty: '唐代',
        description: '龙纹图案',
      },
    ]);
    image.setSelectedPatterns([
      {
        id: 'pattern-1',
        name: '龙纹',
        imageUrl: '/images/dragon.png',
        dynasty: '唐代',
        description: '龙纹图案',
      },
    ]);
    caseSearch.setSelectedCases([
      {
        id: 'case-1',
        title: 'CR400BF',
        image: '/cases/train.png',
        userDescription: '参考红色车窗带布局',
      },
    ]);
    colorConfig.setCurrentColorScheme({
      id: 'color-1',
      name: '红色方案',
      layoutSchemeId: 'layout-1',
      regions: [{ id: 'region-1', name: '车窗带', color: '#c53b3b' }],
      createdAt: '2026-05-26T00:00:00.000Z',
    });
    canvas.setLayers([
      {
        id: 'layer-1',
        type: 'image',
        name: '画布龙纹',
        src: '/generated/super-canvas/dragon.png',
        x: 10,
        y: 20,
        width: 120,
        height: 60,
        rotation: 0,
        opacity: 1,
      },
    ]);
    canvas.setCaptures([
      {
        id: 'capture-1',
        name: '画布截取',
        src: 'data:image/png;base64,Y2FwdHVyZQ==',
        createdAt: '2026-05-26T00:00:00.000Z',
      },
    ]);
    finalProposal.setCurrentProposal({
      id: 'proposal-1',
      version: 1,
      imageUrl: '/generated/final-proposals/final.png',
      promptUsed: '生成最终效果',
      designRationale: '采用红色龙纹',
      createdAt: '2026-05-26T00:00:00.000Z',
    });
  }, [canvas, caseSearch, colorConfig, enabled, finalProposal, image]);

  return <div>工作区</div>;
}

function ReferenceProbe() {
  const final = useFinalProposal();
  const canvas = useSuperCanvas();
  return <>
    <button onClick={() => {final.setSelectedReferenceAssetIds(['capture']); final.setSelectedReferenceImageUrls(['capture.png']);}}>select reference</button>
    <output data-testid="references">{JSON.stringify(final.selectedReferenceImageUrls)}</output>
    <output data-testid="reference-ids">{JSON.stringify(final.selectedReferenceAssetIds)}</output>
    <output data-testid="reference-notice">{final.referenceRemovalNotice}</output>
    <button onClick={() => canvas.setCaptures([])}>remove captures</button>
    <button onClick={() => canvas.setCaptures(c => c.filter(item => item.id !== 'capture-a'))}>remove first capture</button>
    <button onClick={() => canvas.setCaptures(c => c.map(item => item.id === 'capture-a' ? {...item,src:'updated.png'} : item))}>update first capture</button>
    <button onClick={() => canvas.setCaptures(c => [...c, {id:'new',name:'new',src:'new.png',createdAt:'now'}])}>add capture</button>
  </>;
}

function CanvasProbe() {
  const canvas = useSuperCanvas();

  return (
    <div data-testid="canvas-probe">
      {canvas.layers
        .map((layer) => ('name' in layer ? layer.name : '笔触'))
        .join(',') || '空画布'}
    </div>
  );
}

function renderTree(enabled: boolean) {
  return (
    <Providers>
      <ProjectPersistence activeTab="proposal" onRestoreTab={vi.fn()}>
        <StateMutator enabled={enabled} />
        <CanvasProbe />
        <ReferenceProbe />
      </ProjectPersistence>
    </Providers>
  );
}

async function unmount(root: Root, container: HTMLElement) {
  await act(async () => {
    root.unmount();
  });
  container.remove();
}

describe('ProjectPersistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.currentProject = project;
    mocks.getProjectSnapshot.mockResolvedValue({
      project,
      snapshot: createEmptyWorkspaceSnapshot(),
      version: 1,
      updatedAt: '2026-05-26T00:00:00.000Z',
    });
    mocks.saveProjectSnapshot.mockResolvedValue({
      project,
      snapshot: null,
      version: 1,
      updatedAt: '2026-05-26T00:01:00.000Z',
    });
    mocks.markSaved.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('restores references after initial empty state, keeps selection on additions, and removes deleted assets', async () => {
    const snapshot = createEmptyWorkspaceSnapshot();
    snapshot.canvas.captures = [{id:'capture', name:'capture', src:'capture.png', createdAt:'now'}];
    snapshot.finalProposal.selectedReferenceImageUrls = ['capture.png'];
    snapshot.finalProposal.selectedReferenceAssetIds = null;
    snapshot.finalProposal.archivedProposals = [{id:'foreign'} as never];
    let restore!: (response: unknown) => void;
    mocks.getProjectSnapshot.mockReturnValueOnce(new Promise(resolve => {restore = resolve;}));
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => root.render(renderTree(false)));
    await act(async () => restore({snapshot}));
    expect(container.querySelector('[data-testid="references"]')?.textContent).toBe('["capture.png"]');
    await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'add capture')!.click());
    expect(container.querySelector('[data-testid="references"]')?.textContent).toBe('["capture.png"]');
    await act(async () => vi.advanceTimersByTime(1600));
    expect(mocks.saveProjectSnapshot.mock.lastCall?.[1].snapshot.finalProposal).toMatchObject({selectedReferenceImageUrls:['capture.png'],archivedProposals:[]});
    await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'remove captures')!.click());
    expect(container.querySelector('[data-testid="references"]')?.textContent).toBe('[]');
    mocks.currentProject = secondProject;
    mocks.getProjectSnapshot.mockResolvedValueOnce({snapshot});
    await act(async () => root.render(renderTree(false)));
    expect(container.querySelector('[data-testid="references"]')?.textContent).toBe('["capture.png"]');
    await unmount(root, container);
    const reopened = createRoot(container);
    mocks.getProjectSnapshot.mockResolvedValueOnce({snapshot});
    await act(async () => reopened.render(renderTree(false)));
    expect(container.querySelector('[data-testid="references"]')?.textContent).toBe('["capture.png"]');
    await unmount(reopened, container);
  });

  it('flushes a just-changed selection before switching and waits for that save before reopening', async () => {
    const snapshot = createEmptyWorkspaceSnapshot();
    snapshot.canvas.captures = [{id:'capture',name:'capture',src:'capture.png',createdAt:'now'}];
    mocks.getProjectSnapshot.mockResolvedValueOnce({snapshot});
    let finishSave!: (response: unknown) => void;
    mocks.saveProjectSnapshot.mockReturnValueOnce(new Promise(resolve => {finishSave = resolve;}));
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => root.render(renderTree(false)));
    await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'select reference')!.click());
    mocks.currentProject = secondProject;
    await act(async () => root.render(renderTree(false)));
    expect(mocks.saveProjectSnapshot).toHaveBeenCalledWith(project.id, expect.objectContaining({snapshot:expect.objectContaining({finalProposal:expect.objectContaining({selectedReferenceImageUrls:['capture.png']})})}));
    mocks.getProjectSnapshot.mockClear();
    mocks.currentProject = project;
    await act(async () => root.render(renderTree(false)));
    expect(mocks.getProjectSnapshot).not.toHaveBeenCalled();
    await act(async () => finishSave({project}));
    expect(mocks.getProjectSnapshot).toHaveBeenCalledWith(project.id);
    await unmount(root, container);
  });

  it('tracks selected asset identity when another capture has the same URL and reports its removal', async () => {
    const snapshot = createEmptyWorkspaceSnapshot();
    snapshot.canvas.captures = [
      {id:'capture-a',name:'选中的龙纹',src:'same.png',createdAt:'now'},
      {id:'capture-b',name:'另一个龙纹',src:'same.png',createdAt:'now'},
    ];
    snapshot.finalProposal.selectedReferenceAssetIds = ['capture-a'];
    snapshot.finalProposal.selectedReferenceImageUrls = ['same.png'];
    mocks.getProjectSnapshot.mockResolvedValueOnce({snapshot});
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => root.render(renderTree(false)));
    expect(container.querySelector('[data-testid="reference-ids"]')?.textContent).toBe('["capture-a"]');
    await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'remove first capture')!.click());
    expect(container.querySelector('[data-testid="reference-ids"]')?.textContent).toBe('[]');
    expect(container.querySelector('[data-testid="references"]')?.textContent).toBe('[]');
    expect(container.querySelector('[data-testid="reference-notice"]')?.textContent).toContain('选中的龙纹');
    mocks.currentProject = secondProject;
    await act(async () => root.render(renderTree(false)));
    expect(container.querySelector('[data-testid="reference-notice"]')?.textContent).toBe('');
    await unmount(root, container);
  });

  it('keeps a selected material ID and updates its URL when its image changes', async () => {
    const snapshot = createEmptyWorkspaceSnapshot();
    snapshot.canvas.captures = [{id:'capture-a',name:'龙纹',src:'same.png',createdAt:'now'}];
    snapshot.finalProposal.selectedReferenceAssetIds = ['capture-a'];
    snapshot.finalProposal.selectedReferenceImageUrls = ['same.png'];
    mocks.getProjectSnapshot.mockResolvedValueOnce({snapshot});
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => root.render(renderTree(false)));
    await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'update first capture')!.click());
    expect(container.querySelector('[data-testid="reference-ids"]')?.textContent).toBe('["capture-a"]');
    expect(container.querySelector('[data-testid="references"]')?.textContent).toBe('["updated.png"]');
    expect(container.querySelector('[data-testid="reference-notice"]')?.textContent).toBe('');
    await act(async () => vi.advanceTimersByTime(1600));
    expect(mocks.saveProjectSnapshot.mock.lastCall?.[1].snapshot.finalProposal).toMatchObject({selectedReferenceAssetIds:['capture-a'],selectedReferenceImageUrls:['updated.png']});
    await unmount(root, container);
  });

  it('auto-saves the full workspace snapshot after project state changes', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(renderTree(false));
    });
    await act(async () => {
      await Promise.resolve();
    });

    mocks.saveProjectSnapshot.mockClear();

    await act(async () => {
      root.render(renderTree(true));
    });
    await act(async () => {
      await Promise.resolve();
      vi.advanceTimersByTime(1600);
      await Promise.resolve();
    });

    expect(mocks.saveProjectSnapshot).toHaveBeenCalledTimes(1);
    const [, payload] = mocks.saveProjectSnapshot.mock.calls[0];

    expect(payload.snapshot.image.selectedPatterns[0]?.name).toBe('龙纹');
    expect(payload.snapshot.caseSearch.selectedCases[0]?.title).toBe('CR400BF');
    expect(payload.snapshot.colorConfig.currentColorScheme?.name).toBe('红色方案');
    expect(payload.snapshot.canvas.layers[0]?.type).toBe('image');
    expect(payload.snapshot.canvas.captures[0]?.name).toBe('画布截取');
    expect(payload.snapshot.finalProposal.currentProposal?.imageUrl).toBe(
      '/generated/final-proposals/final.png',
    );

    await unmount(root, container);
  });

  it('clears stale workspace state while switching projects before the next snapshot loads', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(renderTree(false));
    });
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      root.render(renderTree(true));
      await Promise.resolve();
    });
    expect(container.textContent).toContain('画布龙纹');

    const pendingSecondSnapshot = new Promise(() => undefined);
    mocks.getProjectSnapshot.mockReturnValueOnce(pendingSecondSnapshot);
    mocks.currentProject = secondProject;
    mocks.saveProjectSnapshot.mockClear();

    await act(async () => {
      root.render(renderTree(false));
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(container.textContent).toContain('空画布');
    expect(container.textContent).not.toContain('画布龙纹');
    expect(mocks.saveProjectSnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.saveProjectSnapshot.mock.calls[0][0]).toBe(project.id);

    await unmount(root, container);
  });
});
