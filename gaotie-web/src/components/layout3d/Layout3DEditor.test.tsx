// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultLayout3D } from './layout3d';
import { ImageSearchProvider } from '../../context/ImageSearchContext';
import { ColorConfigProvider } from '../../context/ColorConfigContext';
import Layout3DEditor from './Layout3DEditor';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const testState = vi.hoisted(() => ({ projectId: 'p1', exportFailure: false }));
vi.mock('../../projects/ProjectContext', () => ({ useProject: () => ({ currentProject: { id: testState.projectId } }) }));
vi.mock('./TrainViewport', async () => {
  const React = await import('react');
  return { default: React.forwardRef(function MockViewport(props: { onReady: (ready: boolean) => void }, ref) {
    const { onReady } = props;
    React.useEffect(() => onReady(true), [onReady]);
    React.useImperativeHandle(ref, () => ({ exportViews: async () => {
      if (testState.exportFailure) throw new Error('导出失败');
      return ['side', 'front', 'perspective'].map(view => ({ view, imageUrl: 'data:image/png;base64,test' }));
    } }));
    return <div>两节模型</div>;
  }) };
});
afterEach(() => { vi.unstubAllGlobals(); testState.projectId = 'p1'; testState.exportFailure = false; });
describe('3D layout editor', () => {
  it('groups the title and mode switch above the stage and keeps saving with the version tray', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] })));
    const host = document.createElement('div'), root = createRoot(host);
    await act(async () => root.render(<ColorConfigProvider><ImageSearchProvider><Layout3DEditor modeSwitch={<button>2D方案</button>} /></ImageSearchProvider></ColorConfigProvider>));
    expect(host.querySelector('.layout3d-heading h2')?.textContent).toBe('车身布局');
    expect(host.querySelector('.layout3d-heading')?.textContent).toContain('2D方案');
    expect(host.querySelector('.layout3d-version-tray input[aria-label="布局版本名称"]')).not.toBeNull();
    expect(host.querySelector('.layout3d-version-tray .layout3d-versions')).not.toBeNull();
    expect(host.querySelector('[data-region="windowBand"] .layout3d-region-check')).not.toBeNull();
    expect(host.textContent).not.toContain('先确定色块，再赋予色彩');
    await act(async () => root.unmount());
  });
  it('shows named body regions and thumbnail-only forms with accessible selection', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] })));
    const host = document.createElement('div'), root = createRoot(host);
    await act(async () => root.render(<ColorConfigProvider><ImageSearchProvider><Layout3DEditor /></ImageSearchProvider></ColorConfigProvider>));
    expect(host.querySelector('nav')?.getAttribute('aria-label')).toBe('车体分区');
    for (const label of ['流线型头部', '车顶过渡区', '窗下侧墙', '裙板']) expect(host.textContent).toContain(label);
    const forms = host.querySelectorAll<HTMLButtonElement>('fieldset button');
    expect(forms).toHaveLength(3);
    for (const form of forms) {
      expect(form.querySelector('svg')).not.toBeNull();
      expect(form.textContent).toBe('');
      expect(form.getAttribute('aria-label')).toBeTruthy();
    }
    await act(async () => forms[1].click());
    expect(forms[1].getAttribute('aria-pressed')).toBe('true');
    expect(forms[1].querySelector('.layout3d-form-check')).not.toBeNull();
    await act(async () => root.unmount());
  });
  it('upgrades a legacy draft while preserving its region choices and old saved record', async () => {
    const old = { id: 'legacy', name: '历史布局', componentsMap: {}, layout3d: { config: { ...defaultLayout3D(), model: 'generic-train-v1', skirt: true }, views: [] } };
    const fetchMock = vi.fn().mockImplementation(async (_url, options) => options?.method === 'POST'
      ? { ok: true, json: async () => ({ ...JSON.parse(options.body), id: 'v2new', createdAt: 'now' }) }
      : { ok: true, json: async () => [old] });
    vi.stubGlobal('fetch', fetchMock);
    const host = document.createElement('div'), root = createRoot(host);
    await act(async () => root.render(<ColorConfigProvider><ImageSearchProvider><Layout3DEditor /></ImageSearchProvider></ColorConfigProvider>));
    await act(async () => [...host.querySelectorAll('button')].find(b => b.querySelector('strong')?.textContent === '历史布局')!.click());
    expect(host.textContent).toContain('旧版通用模型 V1');
    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === '沿用布局，升级参考图模型')!.click());
    expect(host.textContent).toContain('未保存草稿');
    expect(old.layout3d.config.model).toBe('generic-train-v1');
    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === '保存为新版本')!.click());
    const posted = JSON.parse(fetchMock.mock.calls.find(c=>c[1]?.method==='POST')![1].body);
    expect(posted.layout3d.config.model).toBe('reference-train-v2');
    expect(posted.layout3d.config.skirt).toBe(true);
    await act(async () => root.unmount());
  });
  it('does not submit partial views when export fails', async () => {
    testState.exportFailure = true;
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => [] }));
    vi.stubGlobal('fetch', fetchMock);
    const host = document.createElement('div'), root = createRoot(host);
    await act(async () => root.render(<ColorConfigProvider><ImageSearchProvider><Layout3DEditor /></ImageSearchProvider></ColorConfigProvider>));
    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === '保存为新版本')!.click());
    expect(host.textContent).toContain('导出失败');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });
  it('ignores a late list response after the project switches', async () => {
    let resolveOld!: (value: unknown) => void;
    vi.stubGlobal('fetch', vi.fn((url: string) => url.includes('p1') ? new Promise(resolve => { resolveOld = resolve; })
      : Promise.resolve({ ok: true, json: async () => [] })));
    const host = document.createElement('div'), root = createRoot(host);
    const render = () => root.render(<ColorConfigProvider><ImageSearchProvider><Layout3DEditor /></ImageSearchProvider></ColorConfigProvider>);
    await act(async () => render());
    testState.projectId = 'p2';
    await act(async () => render());
    await act(async () => resolveOld({ ok: true, json: async () => [{ id: 'old', name: '旧项目方案', layout3d: { config: defaultLayout3D(), views: [] } }] }));
    expect(host.textContent).not.toContain('旧项目方案');
    await act(async () => root.unmount());
  });
  it('retains a draft when save fails and the list is retried', async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url, options) => options?.method === 'POST'
      ? { ok: false, json: async () => ({ message: '保存失败' }) }
      : { ok: true, json: async () => [] });
    vi.stubGlobal('fetch', fetchMock);
    const host = document.createElement('div'), root = createRoot(host);
    await act(async () => root.render(<ColorConfigProvider><ImageSearchProvider><Layout3DEditor /></ImageSearchProvider></ColorConfigProvider>));
    await act(async () => host.querySelector<HTMLButtonElement>('[data-region="skirt"]')!.click());
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="涂装"]')!.click());
    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === '保存为新版本')!.click());
    expect(host.textContent).toContain('保存失败');
    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === '重新加载列表')!.click());
    expect(host.querySelector('button[aria-label="涂装"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(host.textContent).not.toContain('已保存并用于最终生图');
    await act(async () => root.unmount());
  });
  it('offers all seven regions and saves the frozen configuration plus three views', async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url, options) => options?.method === 'POST'
      ? { ok: true, json: async () => ({ ...JSON.parse(options.body), id: 'saved1', createdAt: 'now' }) }
      : { ok: true, json: async () => [] });
    vi.stubGlobal('fetch', fetchMock);
    const host = document.createElement('div'), root = createRoot(host);
    await act(async () => root.render(<ColorConfigProvider><ImageSearchProvider><Layout3DEditor /></ImageSearchProvider></ColorConfigProvider>));
    expect(host.querySelectorAll('[data-region]')).toHaveLength(7);
    await act(async () => host.querySelector<HTMLButtonElement>('[data-region="skirt"]')!.click());
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="涂装"]')!.click());
    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === '保存为新版本')!.click());
    const request = fetchMock.mock.calls.find(call => call[1]?.method === 'POST');
    expect(request).toBeTruthy();
    const data = JSON.parse(request![1].body);
    expect(data.layout3d.config.skirt).toBe(true);
    expect(data.layout3d.views.map((v: { view: string }) => v.view)).toEqual(['side', 'front', 'perspective']);
    expect(data.componentsMap).toEqual({});
    expect(host.textContent).toContain('已保存并用于最终生图');
    await act(async () => root.unmount());
  });
});
