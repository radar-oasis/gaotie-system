// @vitest-environment happy-dom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageSearchProvider, useImageSearch } from '../context/ImageSearchContext';
import PatternGallery from './PatternGallery';

const testGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
testGlobal.IS_REACT_ACT_ENVIRONMENT = true;

function SeedPatterns() {
  const { setPatterns } = useImageSearch();

  useEffect(() => {
    setPatterns([
      {
        id: 'pattern-1',
        name: '龙纹',
        imageUrl: 'images/missing.png',
        dynasty: '唐代',
        description: 'P001',
      },
    ]);
    // The context setter is recreated by the provider on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

const renderGallery = async (images = false) => {
  if (!vi.isMockFunction(fetch)) vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ok:true,json:async()=>({nodes:[],relationships:[],patterns:[],total:0,offset:0,pageSize:24,patternCount:0,truncated:false})}));
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <ImageSearchProvider>
        <SeedPatterns />
        <PatternGallery />
      </ImageSearchProvider>,
    );
  });

  if (images) await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="图片视图"]')!.click());
  return { container, root };
};

const unmount = async (root: Root, container: HTMLElement) => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
};

vi.mock('./NativeGraphCanvas', () => ({ default: ({onSelect}: {onSelect: (id:string)=>void}) => <button aria-label="关系画布" onClick={() => onSelect("p")} /> }));

afterEach(() => vi.unstubAllGlobals());
describe('PatternGallery', () => {
  it('loads the native data view without a Browser and keeps images available', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok:true,json:async()=>({nodes:[],relationships:[],patterns:[],total:0,offset:0,pageSize:40,patternCount:0,truncated:false})}));
    const { container, root } = await renderGallery();
    try {
      expect(container.querySelector('[aria-label="图谱视图"]')?.getAttribute('aria-pressed')).toBe('true');
      expect(container.querySelector('.pattern-view-switch button')?.textContent).toBe('图谱');
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/image-search/native-graph'), expect.objectContaining({method:'POST'}));
      expect(container.querySelectorAll('.pattern-view-switch button')).toHaveLength(2);
      expect(container.querySelector('[aria-label="Neo4j 原生视图"]')).toBeNull();
      expect(container.querySelector('iframe')).toBeNull();
      expect(container.textContent).not.toContain('点击运行');
      await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="图片视图"]')!.click());
      expect(container.querySelector('[aria-label="放大 龙纹"]')).not.toBeNull();
    } finally { await unmount(root, container); vi.unstubAllGlobals(); }
  });
  it('switches to the native graph, shows details and shares selection with images', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      nodes: [{id:'p',labels:['Pattern'],label:'龙纹',properties:{Pattern_ID:'pattern-1'}}],
      relationships: [],
      patterns: [{id:'pattern-1',name:'龙纹',imageUrl:'images/missing.png',dynasty:'唐代',description:'P001'}],
      total:1, offset:0, pageSize:24, patternCount:1, truncated:false,
    }) }));
    const {container,root} = await renderGallery();
    try {
      const graph = container.querySelector<HTMLButtonElement>('[aria-label="图谱视图"]');
      expect(graph).not.toBeNull();
      await act(async () => graph!.click());
      expect(fetch).toHaveBeenCalled();
      expect(container.querySelector('[aria-label="关系画布"]')).not.toBeNull();
      await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="关系画布"]')!.click());
      expect(container.textContent).toContain('龙纹');
      await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === '加入已选纹样')!.click());
      await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="图片视图"]')!.click());
      expect(container.querySelector('[aria-label="取消选择 龙纹"]')).not.toBeNull();
    } finally { await unmount(root,container); vi.unstubAllGlobals(); }
  });
  it('keeps the image results usable when graph loading fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const {container,root} = await renderGallery();
    try {
      await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="图谱视图"]')!.click());
      expect(container.textContent).toContain('图谱暂时无法加载');
      await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="图片视图"]')!.click());
      expect(container.querySelector('[aria-label="放大 龙纹"]')).not.toBeNull();
    } finally { await unmount(root,container); vi.unstubAllGlobals(); }
  });
  it('separates imagery groups and inspiration, preserves one selected copy and loads the active lane', async () => {
    const { vi } = await import('vitest');
    const loadMore = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok:true,json:async()=>({nodes:[],relationships:[],patterns:[],total:0,offset:0,pageSize:24,patternCount:0,truncated:false})}));
    function SeedGroups() {
      const { setPatterns, setSearchGroups, selectedPatterns } = useImageSearch();
      useEffect(() => {
        const base = { imageUrl: '1.png', dynasty: '', description: '' };
        setPatterns([
          { ...base, id: '1', name: '龙云组合', matches: [{ groupId: '龙', kind: 'direct', reasons: ['母题匹配：龙'] }, { groupId: '云', kind: 'direct', reasons: ['母题匹配：云'] }] },
          { ...base, id: '2', name: '凤凰灵感', matches: [{ groupId: '龙', kind: 'related', reasons: ['同类母题扩展：瑞兽神禽'] }] },
          { ...base, id: '3', name: '云纹独有' },
        ]);
        setSearchGroups([
          { id: '龙', label: '龙', keywords: ['龙'], directTotal: 1, relatedTotal: 5, directIds: ['1'], relatedIds: ['2'] },
          { id: '云', label: '云', keywords: ['云'], directTotal: 2, relatedTotal: 0, directIds: ['1', '3'], relatedIds: [] },
        ]);
      }, [setPatterns, setSearchGroups]);
      return <span data-testid="selected">{selectedPatterns.length}</span>;
    }
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => root.render(<ImageSearchProvider><SeedGroups /><PatternGallery onLoadMore={loadMore} /></ImageSearchProvider>));
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="图片视图"]')!.click());
    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(container.textContent).toContain('母题匹配：龙');
    expect(container.textContent).not.toContain('云纹独有');
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="选择 龙云组合"]')!.click());
    await act(async () => container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click());
    expect(container.querySelectorAll('img')).toHaveLength(2);
    expect(container.querySelector('[data-testid="selected"]')!.textContent).toBe('1');
    expect(container.textContent).toContain('母题匹配：云');
    await act(async () => container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[0].click());
    const inspirationButton = [...container.querySelectorAll('button')].find(button => button.textContent === '相关灵感')!;
    await act(async () => inspirationButton.click());
    expect(container.textContent).toContain('凤凰灵感');
    expect(container.textContent).not.toContain('龙云组合');
    expect(container.textContent).toContain('同类母题扩展：瑞兽神禽');
    await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === '加载更多灵感')!.click());
    expect(loadMore).toHaveBeenCalledWith('龙', 'related');
    await unmount(root, container);
  });
  it('replaces the loading placeholder with a clear fallback when an image fails', async () => {
    const { container, root } = await renderGallery(true);
    const img = container.querySelector('img');

    expect(img).not.toBeNull();

    await act(async () => {
      img?.dispatchEvent(new Event('error'));
    });

    expect(container.textContent).toContain('图片加载失败');

    await unmount(root, container);
  });

  it('selects only with the corner control, previews independently and restores focus on close', async () => {
    const { container, root } = await renderGallery(true);
    const select = container.querySelector<HTMLButtonElement>('[aria-label="选择 龙纹"]');
    expect(select).not.toBeNull();
    await act(async () => select!.click());
    expect(container.querySelector('[aria-label="取消选择 龙纹"]')?.getAttribute('aria-pressed')).toBe('true');
    const preview = container.querySelector<HTMLButtonElement>('[aria-label="放大 龙纹"]')!;
    preview.focus();
    await act(async () => preview.click());
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(container.querySelector('[aria-label="取消选择 龙纹"]')).not.toBeNull();
    await act(async () => dialog!.querySelector<HTMLButtonElement>('[aria-label="放大图片"]')!.click());
    expect(dialog!.textContent).toContain('125%');
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(preview);
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="取消选择 龙纹"]')!.click());
    expect(container.querySelector('[aria-label="选择 龙纹"]')?.getAttribute('aria-pressed')).toBe('false');
    await unmount(root, container);
  });

  it('flips from the motif information area and resets on pointer leave or Escape', async () => {
    const { container, root } = await renderGallery(true);
    const details = container.querySelector<HTMLButtonElement>('[aria-label="查看 龙纹 的信息"]');
    expect(details).not.toBeNull();
    const card = container.querySelector('[data-pattern-id="pattern-1"]')!;
    await act(async () => details!.click());
    expect(card.getAttribute('data-flipped')).toBe('true');
    expect(card.textContent).toContain('唐代');
    expect(card.textContent).toContain('暂无记录');
    await act(async () => card.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })));
    expect(card.getAttribute('data-flipped')).toBe('false');
    await act(async () => details!.click());
    await act(async () => card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(card.getAttribute('data-flipped')).toBe('false');
    expect(container.querySelector('[aria-label="选择 龙纹"]')?.getAttribute('aria-pressed')).toBe('false');
    await unmount(root, container);
  });
});
