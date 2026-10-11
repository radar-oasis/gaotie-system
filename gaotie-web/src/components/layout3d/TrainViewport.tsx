import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildTrain, disposeTrain, updateTrainHighlight } from './trainGeometry';
import { REFERENCE_LENGTH_SCALE } from './referenceTrainProfile';
import { REGIONS, sampleTrainSurface, type Layout3DConfig, type Layout3DView, type Region, type View } from './layout3d';
import { MAX_VIEWPORT_ZOOM, MIN_VIEWPORT_ZOOM, nextViewportZoom, viewportZoomPercent } from './viewportZoom';
import { createTrainScene } from './trainScene';
import { workspaceFrameOffset, workspaceFrameScale } from './cameraFraming';

export interface TrainViewportHandle { exportViews: (config: Layout3DConfig) => Promise<Layout3DView[]> }
interface Props { config: Layout3DConfig; selectedRegion: Region; onSelect: (region: Region) => void; onReady: (ready: boolean) => void }
type CameraView = View | 'top' | 'head';
function setView(camera: THREE.OrthographicCamera, view: CameraView, aspect: number, controls?: OrbitControls, scale = 1) {
  const span = view === 'front' ? 5.5 : view === 'head' ? 14 : (view === 'perspective' ? 34 : 33) * scale;
  const halfHeight = Math.max(view === 'front' ? 3.4 : 4.1, span / (2 * aspect)) * workspaceFrameScale(view, aspect, !!controls);
  camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect;
  const offset = workspaceFrameOffset(view, halfHeight, aspect, !!controls);
  camera.top = halfHeight + offset; camera.bottom = -halfHeight + offset; camera.zoom = 1;
  const target = new THREE.Vector3(view === 'front' ? -12 * scale : view === 'head' ? -12 * scale : 0, 1.9, 0);
  camera.up.set(0, 1, 0);
  if (view === 'front') camera.position.set(-48, 1.9, 0);
  else if (view === 'head') camera.position.set(-12 * scale - 15, 6.5, 16);
  else if (view === 'side') camera.position.set(0, 1.9, 38);
  else if (view === 'top') { camera.position.set(0, 40, .01); camera.up.set(0, 0, -1); }
  else camera.position.set(-21 * scale, 10, 32);
  camera.lookAt(target); camera.updateProjectionMatrix();
  if (controls) { controls.target.copy(target); controls.update(); }
}

export default forwardRef<TrainViewportHandle, Props>(function TrainViewport({ config, selectedRegion, onSelect, onReady }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.OrthographicCamera; controls: OrbitControls; train: THREE.Group } | null>(null);
  const latest = useRef({ config, onSelect, onReady });
  useEffect(() => { latest.current = { config, onSelect, onReady }; }, [config, onSelect, onReady]);
  const [error, setError] = useState('');
  const [hovered, setHovered] = useState<Region | null>(null);
  const hoveredRef = useRef<Region | null>(null);
  const [cameraView, setCameraView] = useState<CameraView>('perspective');
  const [zoomPercent, setZoomPercent] = useState(100);
  const viewRef = useRef<CameraView>('perspective');

  useImperativeHandle(ref, () => ({ exportViews: async frozenConfig => {
    if (!engine.current || engine.current.renderer.getContext().isContextLost()) throw new Error('三维预览不可用，无法导出布局。');
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    const scene = createTrainScene(), train = buildTrain(frozenConfig);
    scene.add(train); renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace;
    try {
      const views: Layout3DView[] = [];
      for (const view of ['side', 'front', 'perspective'] as const) {
        const width = view === 'front' ? 900 : 1600, height = view === 'front' ? 900 : 720;
        renderer.setSize(width, height, false);
        const camera = new THREE.OrthographicCamera(-20, 20, 10, -10, .1, 200);
        setView(camera, view, width / height, undefined, frozenConfig.model === 'reference-train-v2' ? REFERENCE_LENGTH_SCALE : 1); renderer.render(scene, camera);
        views.push({ view, imageUrl: renderer.domElement.toDataURL('image/png') });
      }
      return views;
    } finally { disposeTrain(train); renderer.dispose(); renderer.forceContextLoss(); }
  } }), []);

  useEffect(() => {
    const container = host.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
    catch { setError('此设备暂不支持三维预览。可查看已保存参考图，或切换旧版二维布局。'); latest.current.onReady(false); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute('aria-label', '通用高铁三维模型，一节头车与一节车厢');
    container.appendChild(renderer.domElement);
    const scene = createTrainScene(true), train = buildTrain(latest.current.config); scene.add(train);
    const camera = new THREE.OrthographicCamera(-20, 20, 10, -10, .1, 200);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.enablePan = true; controls.minZoom = MIN_VIEWPORT_ZOOM; controls.maxZoom = MAX_VIEWPORT_ZOOM;
    const reportZoom = () => setZoomPercent(viewportZoomPercent(camera.zoom));
    controls.addEventListener('change', reportZoom);
    controls.maxPolarAngle = Math.PI * .49;
    engine.current = { renderer, scene, camera, controls, train };
    const resize = () => { const w = container.clientWidth || 900, h = container.clientHeight || 520; renderer.setSize(w, h); setView(camera, viewRef.current, w / h, controls, latest.current.config.model === 'reference-train-v2' ? REFERENCE_LENGTH_SCALE : 1); reportZoom(); };
    resize(); const observer = new ResizeObserver(resize); observer.observe(container);
    const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
    const pick = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      ray.setFromCamera(mouse, camera);
      const hit = ray.intersectObjects(engine.current?.train.children.filter(child => child.userData.trainBody) ?? [], false)[0];
      return hit ? sampleTrainSurface(latest.current.config, hit.point.x / (latest.current.config.model === 'reference-train-v2' ? REFERENCE_LENGTH_SCALE : 1), hit.point.y, hit.point.z).region : null;
    };
    let down: { x: number; y: number } | null = null;
    const pointerDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const pointerMove = (e: PointerEvent) => {
      if (e.buttons) return;
      const region = pick(e);
      if (hoveredRef.current !== region) { hoveredRef.current = region; setHovered(region); }
      renderer.domElement.style.cursor = region ? 'pointer' : 'grab';
    };
    const pointerUp = (e: PointerEvent) => {
      if (down && Math.hypot(down.x - e.clientX, down.y - e.clientY) < 5) { const region = pick(e); if (region) latest.current.onSelect(region); }
      down = null;
    };
    const leave = () => { hoveredRef.current = null; setHovered(null); down = null; };
    const lost = (e: Event) => { e.preventDefault(); setError('三维显示连接已中断，请切换页面后重试；已保存方案不受影响。'); latest.current.onReady(false); };
    renderer.domElement.addEventListener('pointerdown', pointerDown);
    renderer.domElement.addEventListener('pointermove', pointerMove);
    renderer.domElement.addEventListener('pointerup', pointerUp);
    renderer.domElement.addEventListener('pointerleave', leave);
    renderer.domElement.addEventListener('webglcontextlost', lost);
    let frame = 0;
    const animate = () => { frame = requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); }; animate();
    latest.current.onReady(true);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); controls.removeEventListener('change', reportZoom); controls.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      renderer.domElement.removeEventListener('pointerdown', pointerDown); renderer.domElement.removeEventListener('pointermove', pointerMove);
      renderer.domElement.removeEventListener('pointerup', pointerUp); renderer.domElement.removeEventListener('pointerleave', leave);
      if (engine.current) disposeTrain(engine.current.train);
      const ground = scene.getObjectByName('workspace-ground');
      if (ground) disposeTrain(ground);
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); engine.current = null;
    };
  }, []);

  useEffect(() => {
    const e = engine.current; if (!e) return;
    const next = buildTrain(config);
    e.scene.remove(e.train); disposeTrain(e.train); e.train = next; e.scene.add(next);
  }, [config]);

  useEffect(() => {
    const e = engine.current;
    if (e) updateTrainHighlight(e.train,config,hovered ?? selectedRegion);
  }, [config, hovered, selectedRegion]);

  useEffect(() => {
    const e = engine.current;
    if (e && host.current) {
      setView(e.camera, viewRef.current, host.current.clientWidth / host.current.clientHeight, e.controls, config.model === 'reference-train-v2' ? REFERENCE_LENGTH_SCALE : 1);
      setZoomPercent(viewportZoomPercent(e.camera.zoom));
    }
  }, [config.model]);

  const chooseView = (view: CameraView) => {
    setCameraView(view); viewRef.current = view;
    const e = engine.current; if (e && host.current) {
      setView(e.camera, view, host.current.clientWidth / host.current.clientHeight, e.controls, config.model === 'reference-train-v2' ? REFERENCE_LENGTH_SCALE : 1);
      setZoomPercent(viewportZoomPercent(e.camera.zoom));
    }
  };
  const zoomBy = (direction: 1 | -1) => {
    const e = engine.current;
    if (!e || error) return;
    e.camera.zoom = nextViewportZoom(e.camera.zoom, direction);
    e.camera.updateProjectionMatrix(); e.controls.update();
    setZoomPercent(viewportZoomPercent(e.camera.zoom));
  };
  return <div className="train-viewport-shell">
    <div className="train-view-controls" aria-label="模型视角">
      {([['perspective', '斜前视'], ['head', '车头细节'], ['side', '侧视'], ['front', '正视'], ['top', '俯视']] as const).map(([view, label]) =>
        <button key={view} aria-pressed={cameraView === view} onClick={() => chooseView(view)}>{label}</button>)}
    </div>
    <div className="train-viewport" ref={host} />
    {error && <div className="train-view-error" role="alert">{error}</div>}
    <div className="train-view-caption">{hovered ? `点击编辑：${REGIONS.find(r => r.id === hovered)?.label}` : '拖拽旋转 · 滚轮缩放 · 点击车身区域编辑'}</div>
    <div className="train-zoom-controls" role="group" aria-label="模型缩放">
      <button type="button" aria-label="缩小模型" title="缩小模型" disabled={!!error || zoomPercent <= MIN_VIEWPORT_ZOOM * 100} onClick={() => zoomBy(-1)}>−</button>
      <output aria-label="模型缩放比例">{zoomPercent}%</output>
      <button type="button" aria-label="放大模型" title="放大模型" disabled={!!error || zoomPercent >= MAX_VIEWPORT_ZOOM * 100} onClick={() => zoomBy(1)}>+</button>
      <button type="button" aria-label="复位模型视角" title="复位模型视角" disabled={!!error} onClick={() => chooseView('perspective')}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" /><rect x="8" y="8" width="8" height="8" rx="2" /></svg>
      </button>
    </div>
  </div>;
});
