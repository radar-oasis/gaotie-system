// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageSearchProvider, useImageSearch } from '../context/ImageSearchContext';
import ImageSearchPage from './ImageSearchPage';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('../projects/ProjectContext', () => ({ useProject: () => ({ currentProject: { id: 'test' } }) }));

vi.mock('./IntentDialogue', () => ({
  default: ({ onSearch }: { onSearch: (text: string, tags?: { label: string; topic?: string }[]) => void }) => (
    <><button onClick={() => onSearch('传统文化-龙、自然-云', [{ label: '龙', topic: '传统文化' }, { label: '云', topic: '自然' }])}>检索已选意象</button>
    <button onClick={() => onSearch('龙、云')}>手动检索</button><button onClick={() => onSearch('大象')}>大象</button><button onClick={() => onSearch('唐代的龙纹样')}>唐龙</button></>
  ),
}));
vi.mock('./PatternGallery', () => ({ default: () => null }));
vi.mock('./SelectedPatternsList', () => ({ default: () => null }));

describe('ImageSearchPage structured demand search', () => {
  it('passes the model-grounded elephant entity to retrieval', async () => {
    const groups = [{ id: 'intent-1', label: '大象', keywords: ['象'] }];
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ filters: { motifs: ['象'], groups }, reasoning: '大象 → 象' }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ patterns: [], groups: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => root.render(<ImageSearchProvider><ImageSearchPage onConfirm={() => {}} /></ImageSearchProvider>));
    await act(async () => host.querySelectorAll('button')[2].click());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ userInput: '大象' });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ motifs: ['象'], groups });
    await act(async () => root.unmount());
  });
  it('displays normalized server filters after a compound query recovers from parser failure', async () => {
    const normalized = {motifs:['龙'],dynasties:['唐'],materials:[],others:[]};
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ok:true,json:async()=>({patterns:[],groups:[],filters:normalized})});
    vi.stubGlobal('fetch',fetchMock);
    function Probe() {const {intentFilters}=useImageSearch();return <output>{intentFilters.motifs.join(',')}:{intentFilters.dynasties.join(',')}</output>;}
    const host=document.createElement('div');const root=createRoot(host);
    await act(async()=>root.render(<ImageSearchProvider><ImageSearchPage onConfirm={()=>{}}/><Probe/></ImageSearchProvider>));
    await act(async()=>host.querySelectorAll('button')[3].click());
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).userInput).toBe('唐代的龙纹样');
    expect(host.querySelector('output')!.textContent).toBe('龙:唐');
    await act(async()=>root.unmount());
  });
  it('cannot overwrite restored results when persistence aborts the shared request', async () => {
    let resolveRequest!: (value: unknown) => void;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(resolve => { resolveRequest = resolve; })));
    function RestoreProbe() {
      const state = useImageSearch();
      return <><button data-restore onClick={() => {
        state.searchRequestRef.current?.abort();
        state.setPatterns([{ id: 'saved', name: '云', imageUrl: '', description: '', dynasty: '' }]);
        state.setIntentFilters({ motifs: ['云'], dynasties: [], materials: [], others: [] });
        state.setIsSearching(false);
      }}>恢复项目</button><output>{state.intentFilters.motifs.join(',')}:{state.patterns.map(pattern => pattern.name).join(',')}</output></>;
    }
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => root.render(<ImageSearchProvider><ImageSearchPage onConfirm={() => {}} /><RestoreProbe /></ImageSearchProvider>));
    await act(async () => host.querySelector('button')!.click());
    await act(async () => host.querySelector<HTMLButtonElement>('[data-restore]')!.click());
    await act(async () => resolveRequest({ ok: true, json: async () => ({ patterns: [{ id: 'old', name: '龙' }], groups: [] }) }));
    expect(host.querySelector('output')!.textContent).toBe('云:云');
    await act(async () => root.unmount());
  });
  it('falls back to separated terms when manual intent parsing is offline', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ok: true, json: async () => ({ patterns: [], groups: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => root.render(<ImageSearchProvider><ImageSearchPage onConfirm={() => {}} /></ImageSearchProvider>));
    await act(async () => host.querySelectorAll('button')[1].click());
    expect(fetchMock.mock.calls[1][0]).toContain('/grouped-query');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).groups.map((group: { keywords: string[] }) => group.keywords)).toEqual([['龙'], ['云']]);
    await act(async () => root.unmount());
  });

  it('ignores an older response even if the server ignores cancellation', async () => {
    const pending: ((value: unknown) => void)[] = [];
    const fetchMock = vi.fn().mockImplementation((url: string) => url.includes('parse-intent') ? Promise.reject(new Error('offline')) : new Promise(resolve => pending.push(resolve)));
    vi.stubGlobal('fetch', fetchMock);
    function Probe() { const { patterns, isSearching } = useImageSearch(); return <output>{isSearching ? 'loading' : patterns.map(pattern => pattern.name).join(',')}</output>; }
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => root.render(<ImageSearchProvider><ImageSearchPage onConfirm={() => {}} /><Probe /></ImageSearchProvider>));
    await act(async () => host.querySelector('button')!.click());
    await act(async () => host.querySelector('button')!.click());
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    const response = (name: string) => ({ ok: true, json: async () => ({ patterns: [{ id: name, name }], groups: [] }) });
    await act(async () => pending[1](response('新结果')));
    await act(async () => pending[0](response('旧结果')));
    expect(host.querySelector('output')!.textContent).toBe('新结果');
    await act(async () => root.unmount());
  });
  afterEach(() => vi.unstubAllGlobals());

  it('grounds confirmed motifs through the parser while preserving separate groups', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ patterns: [], groups: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => { root.render(<ImageSearchProvider><ImageSearchPage onConfirm={() => {}} /></ImageSearchProvider>); });
    await act(async () => { host.querySelector('button')!.click(); });
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toContain('/image-search/parse-intent');
    const body = JSON.parse(request.body);
    expect(body.groups.map((group: { keywords: string[] }) => group.keywords)).toEqual([['龙'], ['云']]);
    expect(fetchMock.mock.calls[1][0]).toContain('/image-search/grouped-query');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).groups).toEqual(body.groups);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount());
  });
});
