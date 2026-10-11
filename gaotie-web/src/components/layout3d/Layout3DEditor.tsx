import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useProject } from '../../projects/ProjectContext';
import { useColorConfig, type LayoutScheme } from '../../context/ColorConfigContext';
import { apiUrl, resolveBackendImageUrl } from '../../utils/backendUrls';
import TrainViewport, { type TrainViewportHandle } from './TrainViewport';
import { defaultLayout3D, describeLayout3D, FORM_LABELS, REGIONS, withPaintForm, type Layout3DConfig, type Region } from './layout3d';
import './Layout3DEditor.css';
import PaintFormPreview from './PaintFormPreview';

const options: Record<Region, string[]> = {
  windowBand: ['none', 'long', 'short'], doors: ['inherit', 'full', 'upper', 'white'],
  waist: ['none', 'single', 'double'], nose: ['none', 'full', 'upper', 'lower', 'front'],
  roofSide: ['none', 'narrow', 'wide'], lowerSide: ['none', 'narrow', 'wide'], skirt: ['false', 'true'],
};
export default function Layout3DEditor({ modeSwitch }: { modeSwitch?: ReactNode }) {
  const { currentProject } = useProject();
  const { selectedLayoutScheme, setSelectedLayoutScheme } = useColorConfig();
  const projectId = currentProject?.id;
  const viewport = useRef<TrainViewportHandle>(null);
  const request = useRef<AbortController | null>(null);
  const selectedRef = useRef(selectedLayoutScheme);
  useEffect(() => { selectedRef.current = selectedLayoutScheme; }, [selectedLayoutScheme]);
  const [config, setConfig] = useState(defaultLayout3D);
  const [region, setRegion] = useState<Region>('windowBand');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('三维布局方案');
  const [schemes, setSchemes] = useState<LayoutScheme[]>([]);
  const [savedKey, setSavedKey] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const dirty = useRef(false);
  const loadedProject = useRef<string | undefined>(undefined);
  const [reload, setReload] = useState(0);
  const currentKey = JSON.stringify(config);

  useEffect(() => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    if (loadedProject.current !== projectId) {
      loadedProject.current = projectId;
      setConfig(defaultLayout3D()); setSavedKey(''); setSchemes([]); setName('三维布局方案'); setMessage(''); dirty.current = false;
    }
    setError(''); setBusy(false);
    if (!projectId) { setLoading(false); return () => controller.abort(); }
    setLoading(true);
    void fetch(apiUrl(`/layout-scheme/list?projectId=${encodeURIComponent(projectId)}`), { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error('布局列表加载失败'); return response.json(); })
      .then((data: LayoutScheme[]) => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(data)) throw new Error('布局列表格式异常');
        const entries = data.filter(item => item.layout3d?.config?.version === 1 && ['generic-train-v1', 'reference-train-v2'].includes(item.layout3d.config.model));
        setSchemes(entries);
        const selected = entries.find(item => item.id === selectedRef.current?.id);
        if (selected?.layout3d && !dirty.current) { setConfig(structuredClone(selected.layout3d.config)); setSavedKey(JSON.stringify(selected.layout3d.config)); setName(selected.name); }
      })
      .catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '布局加载失败'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [projectId, reload]);

  const update = (next: Layout3DConfig) => { setConfig(next); dirty.current = true; setMessage(''); };
  const choose = (value: string) => {
    update(withPaintForm(config, region, value));
  };
  const activeValue = region === 'windowBand' || region === 'waist' ? config[region].mode : String(config[region]);
  const save = async () => {
    if (!projectId || !viewport.current || !ready || busy || loading) return;
    const frozen = structuredClone(config), frozenName = name.trim();
    if (!frozenName) { setError('请填写方案名称'); return; }
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(''); setMessage('正在导出三视图并保存…');
    try {
      const views = await viewport.current.exportViews(frozen);
      if (controller.signal.aborted) return;
      const response = await fetch(apiUrl('/layout-scheme/save'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ name: frozenName, projectId, componentsMap: {}, layout3d: { config: frozen, views } }) });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.message === 'string' ? data.message : '保存失败，请重试');
      if (!data.id || !data.layout3d?.config || data.layout3d.views?.length !== 3) throw new Error('保存结果不完整，未选用此版本');
      if (controller.signal.aborted) return;
      const saved = data as LayoutScheme;
      setSchemes(prev => [saved, ...prev]); setSelectedLayoutScheme(saved); setSavedKey(JSON.stringify(frozen)); dirty.current = false;
      setMessage('已保存并用于最终生图');
    } catch (err) { if (!controller.signal.aborted) { setError(err instanceof Error ? err.message : '保存失败'); setMessage(''); } }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const load = (scheme: LayoutScheme) => {
    if (!scheme.layout3d || busy) return;
    if (dirty.current && !window.confirm('载入此版本会替换尚未保存的布局，是否继续？')) return;
    setConfig(structuredClone(scheme.layout3d.config)); setSavedKey(JSON.stringify(scheme.layout3d.config)); setName(scheme.name);
    setSelectedLayoutScheme(scheme); dirty.current = false; setError(''); setMessage('已载入，并设为最终生图使用的布局');
  };
  return <div className="layout3d-editor">
    <header className="layout3d-heading"><div className="layout3d-heading-main"><h2>车身布局</h2>{modeSwitch}</div>
      <div className="layout3d-heading-actions">
      <span className={`layout3d-status ${currentKey === savedKey ? 'saved' : ''}`}>{currentKey === savedKey ? '已保存版本' : '未保存草稿'}</span>
      {config.model === 'generic-train-v1' && <button disabled={busy || loading} onClick={() => { update({ ...config, model: 'reference-train-v2' }); setName(`${name} · 新模型`); }}>沿用布局，升级参考图模型</button>}
      <button disabled={busy || loading} onClick={() => { if (!dirty.current || window.confirm('放弃未保存布局并新建白模？')) { update(defaultLayout3D()); setName('参考图白模方案'); } }}>新建参考图白模</button>
      </div></header>
    <div className="layout3d-workspace">
      <nav className="layout3d-regions" aria-label="车体分区"><h3>车体分区 <small>07</small></h3>
        {REGIONS.map((item, index) => <button data-region={item.id} key={item.id} disabled={busy} aria-pressed={region === item.id} onClick={() => setRegion(item.id)}>
          <span className="region-index">0{index + 1}</span><span>{item.label}</span>{region === item.id && <svg className="layout3d-region-check" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10 3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}</button>)}
        <p>点击分区或模型表面选择</p>
      </nav>
      <TrainViewport ref={viewport} config={config} selectedRegion={region} onSelect={setRegion} onReady={setReady} />
      <span className="layout3d-model-version">{config.model === 'reference-train-v2' ? '参考图重建 V2' : '旧版通用模型 V1'}</span>
      <aside className="layout3d-options"><h3>{REGIONS.find(item => item.id === region)?.label}<small>涂装形式</small></h3>
        <fieldset disabled={busy} aria-label="涂装形式"><legend>涂装形式</legend>
          <div className="layout3d-form-grid">{options[region].map(value => <button type="button" className="layout3d-form" key={value}
            aria-label={region === 'skirt' ? value === 'true' ? '涂装' : '不涂装' : FORM_LABELS[value]}
            aria-pressed={activeValue === value} onClick={() => choose(value)}>
            <PaintFormPreview config={withPaintForm(config, region, value)} />
            {activeValue === value && <svg className="layout3d-form-check" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10 3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </button>)}</div>
          {(region === 'windowBand' || region === 'waist') && <label className="layout3d-checkbox"><input type="checkbox" checked={config[region].crossDoors}
            onChange={e => update({ ...config, [region]: { ...config[region], crossDoors: e.target.checked } })} />跨越车门</label>}
          {region === 'waist' && <label>线宽<select value={config.waist.width} onChange={e => update({ ...config, waist: { ...config.waist, width: e.target.value as Layout3DConfig['waist']['width'] } })}>
            <option value="thin">细</option><option value="medium">中</option><option value="wide">宽</option></select></label>}
        </fieldset>
      </aside>
    </div>
    <div className="layout3d-version-tray">
    <div className="layout3d-savebar"><label>版本名称<input aria-label="布局版本名称" value={name} maxLength={80} disabled={busy} onChange={e => setName(e.target.value)} /></label>
      <button className="layout3d-save" disabled={!projectId || !ready || busy || loading} onClick={() => void save()}>{busy ? '保存中…' : '保存为新版本'}</button>
      {!projectId && <p>请登录并选择项目后保存</p>}</div>
    {message && <div role="status" className="layout3d-message">{message}</div>}
    {error && <div role="alert" className="layout3d-error">{error} <button disabled={busy} onClick={() => setReload(n => n + 1)}>重新加载列表</button></div>}
    <section className="layout3d-versions"><h3>已保存版本 <small>{loading ? '加载中…' : `${schemes.length} 个`}</small></h3>
      {!schemes.length && <p className="layout3d-empty">{loading ? '正在加载布局版本…' : '暂无版本，保存当前布局后将在这里显示'}</p>}
      <div className="layout3d-version-grid">{schemes.map(scheme => <button key={scheme.id} disabled={busy} onClick={() => load(scheme)} aria-pressed={selectedLayoutScheme?.id === scheme.id}>
        <img src={resolveBackendImageUrl(scheme.layout3d!.views.find(view => view.view === 'perspective')?.imageUrl ?? '')} alt={`${scheme.name}布局预览`} />
        <span className="layout3d-version-info"><strong>{scheme.name}</strong><small title={describeLayout3D(scheme.layout3d!.config)}>{scheme.createdAt ? new Date(scheme.createdAt).toLocaleDateString() : '布局版本'}</small>
        {selectedLayoutScheme?.id === scheme.id && <b>当前使用</b>}</span>
      </button>)}</div>
    </section>
    </div>
  </div>;
}
