// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import TrainViewport from './TrainViewport';
import { defaultLayout3D } from './layout3d';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');
  return { ...actual, WebGLRenderer: class {
    domElement = document.createElement('canvas');
    setPixelRatio() {} setSize() {} render() {} dispose() {} forceContextLoss() {}
    getContext() { return { isContextLost: () => false }; }
  } };
});
vi.mock('three/addons/controls/OrbitControls.js', async () => {
  const { EventDispatcher, Vector3 } = await import('three');
  return { OrbitControls: class extends EventDispatcher<{ change: object }> {
    target = new Vector3();
    // OrbitControls need not emit change when zoom is assigned externally.
    update() {}
    dispose() {}
  } };
});
vi.mock('./trainGeometry', async () => {
  const { Group } = await import('three');
  return { buildTrain: () => new Group(), disposeTrain: vi.fn(), updateTrainHighlight: vi.fn() };
});
afterEach(() => vi.unstubAllGlobals());

it('connects zoom controls and camera presets to the camera percentage', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const host = document.createElement('div'), root = createRoot(host);
  await act(async () => root.render(<TrainViewport config={defaultLayout3D()} selectedRegion="nose" onSelect={vi.fn()} onReady={vi.fn()} />));
  const output = () => host.querySelector('output')!.textContent;
  const button = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  expect(output()).toBe('100%');
  await act(async () => button('放大模型').click());
  expect(output()).toBe('120%');
  await act(async () => button('缩小模型').click());
  expect(output()).toBe('100%');
  await act(async () => button('放大模型').click());
  await act(async () => button('复位模型视角').click());
  expect(output()).toBe('100%');
  await act(async () => root.unmount());
});
