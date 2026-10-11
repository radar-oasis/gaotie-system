// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useReusePattern } from './useReusePattern';
import type { Asset } from './assetApi';
const context = vi.hoisted(() => ({ isGenerating: false, setLayers: vi.fn(), setSelectedLayerIds: vi.fn(), setSelectedLayerId: vi.fn(), setPrompt: vi.fn(), setTool: vi.fn(), setStatusMessage: vi.fn() }));
vi.mock('../../context/SuperCanvasContext', () => ({ useSuperCanvas: () => context }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let pending: (() => void)[];
let reuse: (asset: Asset) => Promise<void>;
const ready = vi.fn();
const asset: Asset = { id: 'asset', name: '收藏', kind: 'pattern', imageUrl: 'data:image/png;base64,saved', projectId: 'source', projectName: '来源项目', createdAt: '', theme: '', imagery: '', payload: { provenance: { version: 1, originalPrompt: '提取龙纹', sourcePatterns: [{ id: 'P1', name: '龙', imageUrl: '/dragon.png' }], references: [{ imageUrl: 'data:image/png;base64,source', name: '原图', sourcePatterns: [{ id: 'P1', name: '龙', imageUrl: '/dragon.png' }] }] } } };
function Probe({ project }: { project: string }) { reuse = useReusePattern(ready, project); return null; }
beforeEach(() => {
  vi.clearAllMocks(); pending = [];
  vi.stubGlobal('Image', class { naturalWidth = 400; naturalHeight = 200; onload?: () => void; set src(_: string) { pending.push(() => this.onload?.()); } });
});
afterEach(() => vi.unstubAllGlobals());
it('restores actual saved references, root identities and original prompt without replacing existing canvas work', async () => {
  const root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Probe project="target" />));
  let promise: Promise<void>;
  await act(async () => { promise = reuse(asset); });
  expect(context.setLayers).not.toHaveBeenCalled();
  await act(async () => { pending.forEach(run => run()); await promise; });
  const update = context.setLayers.mock.calls[0][0];
  const layers = update([{ id: 'existing' }]);
  expect(layers).toHaveLength(2);
  expect(layers[0].id).toBe('existing');
  expect(layers[1].src).toBe('data:image/png;base64,source');
  expect(layers[1].provenance.sourcePatterns[0].id).toBe('P1');
  expect(context.setPrompt).toHaveBeenCalledWith('提取龙纹');
  expect(ready).toHaveBeenCalledOnce();
  await act(async () => root.unmount());
});
it('does not append a completed old load into a newly selected project', async () => {
  const root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Probe project="first" />));
  let outcome: Promise<unknown>;
  await act(async () => { outcome = reuse(asset).catch(error => error); });
  await act(async () => root.render(<Probe project="second" />));
  await act(async () => { pending.forEach(run => run()); });
  expect(await outcome!).toEqual(new Error('项目已切换，已取消载入'));
  expect(context.setLayers).not.toHaveBeenCalled();
  expect(ready).not.toHaveBeenCalled();
  await act(async () => root.unmount());
});
