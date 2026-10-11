// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TopNav from '../TopNav';
import { ImageSearchProvider } from '../../context/ImageSearchContext';
import { SuperCanvasProvider, useSuperCanvas } from '../../context/SuperCanvasContext';
import SuperCanvasPage from './SuperCanvasPage';
import { exportLayersToPng } from './renderCanvas';
import * as assetApi from '../assets/assetApi';
import { canvasReferenceIdentity, provenanceForGeneration } from '../assets/provenance';
import type { ImageLayer } from './types';
import { generateTransparentAsset } from './superCanvasApi';

vi.mock('./renderCanvas', () => ({
  exportLayersToPng: vi.fn(async () => 'data:image/png;base64,capture'),
}));

vi.mock('./superCanvasApi', () => ({
  generateTransparentAsset: vi.fn(async () => ({
    imageUrl: '/generated/super-canvas/ai.png',
    taskId: 'task-1',
    confidence: 'high',
    transparentPixelRatio: 0.9,
  })),
}));

const mockedExportLayersToPng = vi.mocked(exportLayersToPng);
const mockedGenerateTransparentAsset = vi.mocked(generateTransparentAsset);
const testGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

class MockImage {
  crossOrigin = '';
  naturalWidth = 100;
  naturalHeight = 50;
  onerror: ((event: Event) => void) | null = null;
  onload: ((event: Event) => void) | null = null;
  private currentSrc = '';

  get src() {
    return this.currentSrc;
  }

  set src(value: string) {
    this.currentSrc = value;
    queueMicrotask(() => this.onload?.(new Event('load')));
  }
}

const flushAsyncWork = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

let observedCanvas: ReturnType<typeof useSuperCanvas>;
function ObserveCanvas() { observedCanvas = useSuperCanvas(); return null; }
const renderPage = async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <ImageSearchProvider>
        <SuperCanvasProvider>
          <SuperCanvasPage /><ObserveCanvas />
        </SuperCanvasProvider>
      </ImageSearchProvider>,
    );
  });

  return { container, root };
};

const renderPageShell = async (showCanvas = true) => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <ImageSearchProvider>
        <SuperCanvasProvider>
          {showCanvas ? <SuperCanvasPage /> : <div>其他模块</div>}
        </SuperCanvasProvider>
      </ImageSearchProvider>,
    );
  });

  const rerender = async (nextShowCanvas: boolean) => {
    await act(async () => {
      root.render(
        <ImageSearchProvider>
          <SuperCanvasProvider>
            {nextShowCanvas ? <SuperCanvasPage /> : <div>其他模块</div>}
          </SuperCanvasProvider>
        </ImageSearchProvider>,
      );
      await flushAsyncWork();
    });
  };

  return { container, rerender, root };
};

const unmountPage = async (root: Root, container: HTMLElement) => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
};

const dispatchDragDrop = async (
  target: Element,
  data: string,
  clientX = 100,
  clientY = 80,
) => {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY },
    dataTransfer: {
      value: {
        getData: (key: string) =>
          key === 'application/x-super-canvas-asset' ? data : '',
      },
    },
  });

  await act(async () => {
    target.dispatchEvent(event);
    await flushAsyncWork();
  });
};

const dispatchPointer = async (
  target: Element,
  type: string,
  clientX: number,
  clientY: number,
  options: PointerEventInit = {},
) => {
  const event = new PointerEvent(type, {
    bubbles: true,
    button: 0,
    clientX,
    clientY,
    pointerId: 1,
    ...options,
  });

  await act(async () => {
    target.dispatchEvent(event);
    await flushAsyncWork();
  });
};

const dispatchContextMenu = async (
  target: Element,
  clientX = 120,
  clientY = 100,
) => {
  const event = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
  });

  await act(async () => {
    target.dispatchEvent(event);
    await flushAsyncWork();
  });
};

const updateInputValue = async (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const valueSetter = Object.getOwnPropertyDescriptor(
    input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
    'value',
  )?.set;

  await act(async () => {
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
};

describe('SuperCanvasPage interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal('Image', MockImage);

    if (!globalThis.PointerEvent) {
      vi.stubGlobal('PointerEvent', MouseEvent);
    }

    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  });

  it('renders the super canvas page shell and nav tab', async () => {
    const { container, root } = await renderPage();
    const navContainer = document.createElement('div');
    const navRoot = createRoot(navContainer);

    await act(async () => {
      navRoot.render(<TopNav activeTab="canvas" onTabChange={vi.fn()} />);
    });

    expect(container.querySelector('.super-canvas')).not.toBeNull();
    expect(container.textContent).toContain('AI 转化');
    expect(navContainer.textContent).toContain('纹样转化画布');
    expect(navContainer.querySelector('nav[aria-label="工作台模块"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="移动已选纹样"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="移动参考图"]')).not.toBeNull();
    expect(container.querySelector('.super-canvas__panel--right')?.textContent).not.toContain('用作生成参考');

    await unmountPage(root, container);
    navRoot.unmount();
  });

  it('moves floating cards within the workspace and retains headings when collapsed', async () => {
    const { container, root } = await renderPage();
    const workspace = container.querySelector('.super-canvas') as HTMLElement;
    const panel = container.querySelector('.super-canvas__panel--left') as HTMLElement;
    Object.defineProperties(workspace, { clientWidth: { value: 1000 }, clientHeight: { value: 700 } });
    Object.defineProperties(panel, { offsetWidth: { value: 300 }, offsetHeight: { value: 200 }, offsetLeft: { value: 20 }, offsetTop: { value: 68 } });
    const drag = panel.querySelector('[aria-label="移动已选纹样"]')!;
    await dispatchPointer(drag, 'pointerdown', 40, 90);
    await dispatchPointer(drag, 'pointermove', 140, 190);
    expect(panel.style.left).toBe('120px');
    expect(panel.style.top).toBe('168px');
    await dispatchPointer(drag, 'pointermove', 4000, 4000);
    expect(panel.style.left).toBe('692px');
    expect(panel.style.top).toBe('492px');
    await dispatchPointer(drag, 'pointercancel', 4000, 4000);
    await dispatchPointer(drag, 'pointermove', 100, 100);
    expect(panel.style.left).toBe('692px');
    await act(async () => (panel.querySelector('[aria-label="收起已选纹样"]') as HTMLButtonElement).click());
    expect(panel.textContent).toContain('已选纹样');
    expect(panel.querySelector('.super-canvas__asset-list')).toBeNull();
    await act(async () => (panel.querySelector('[aria-label="展开已选纹样"]') as HTMLButtonElement).click());
    expect(panel.querySelector('.super-canvas__asset-list')).not.toBeNull();
    await unmountPage(root, container);
  });

  it('pans the workspace without moving image layers', async () => {
    const { container, root } = await renderPage();
    const stage = container.querySelector('.super-canvas__stage') as HTMLElement;
    await act(async () => (container.querySelector('[aria-label="平移画布"]') as HTMLButtonElement).click());
    await dispatchPointer(stage, 'pointerdown', 400, 300);
    await dispatchPointer(stage, 'pointermove', 300, 250);
    expect(stage.scrollLeft).toBe(100);
    expect(stage.scrollTop).toBe(50);
    await dispatchPointer(stage, 'pointerup', 300, 250);
    await unmountPage(root, container);
  });

  it('opens image editing on double click and offers editing in the context menu', async () => {
    const { container, root } = await renderPage();
    await dispatchDragDrop(container.querySelector('.super-canvas__stage')!, JSON.stringify({ name: '龙', src: 'data:image/png;base64,dragon' }));
    const layer = container.querySelector('.super-canvas__image-layer')!;
    await act(async () => layer.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(container.querySelector('[aria-label="图片快捷编辑"]')).not.toBeNull();
    await dispatchContextMenu(layer);
    const menu = container.querySelector('.super-canvas__context-menu')!;
    expect(menu.textContent).toContain('编辑图片');
    expect(menu.textContent).toContain('截取区域');
    expect(menu.textContent).not.toContain('⌘');
    await unmountPage(root, container);
  });

  it('creates and selects an image layer when a valid custom asset is dropped', async () => {
    const { container, root } = await renderPage();
    const stage = container.querySelector('.super-canvas__stage');

    expect(stage).not.toBeNull();

    await dispatchDragDrop(
      stage as Element,
      JSON.stringify({
        name: '自定义素材',
        src: 'data:image/png;base64,asset',
      }),
    );

    const selectedImage = container.querySelector(
      '.super-canvas__image-layer.is-selected img',
    ) as HTMLImageElement | null;

    expect(selectedImage).not.toBeNull();
    expect(selectedImage?.alt).toBe('自定义素材');
    expect(selectedImage?.src).toContain('data:image/png;base64,asset');
    expect(container.textContent).toContain('已添加 自定义素材');

    await unmountPage(root, container);
  });

  it('shows compact mirror actions only after double click and removes numeric parameters', async () => {
    const { container, root } = await renderPage();
    await dispatchDragDrop(container.querySelector('.super-canvas__stage')!, JSON.stringify({ name: '可编辑素材', src: 'data:image/png;base64,editable' }));
    expect(container.querySelector('[aria-label="图片快捷编辑"]')).toBeNull();
    const layer = container.querySelector('.super-canvas__image-layer')!;
    await act(async () => layer.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(container.querySelector('[aria-label="图片快捷编辑"]')).not.toBeNull();
    expect(container.querySelector('input[type="number"]')).toBeNull();
    expect(container.querySelector('button[title="截取"] rect[stroke-dasharray]')).not.toBeNull();
    const horizontal = container.querySelector<HTMLButtonElement>('[aria-label="水平镜像"]')!;
    const vertical = container.querySelector<HTMLButtonElement>('[aria-label="垂直镜像"]')!;
    await act(async () => horizontal.click());
    const clip = layer.querySelector<HTMLElement>('.super-canvas__image-layer-clip')!;
    expect(clip.style.transform).toBe('scale(-1, 1)');
    await act(async () => vertical.click());
    expect(clip.style.transform).toBe('scale(-1, -1)');
    await act(async () => (container.querySelector('[aria-label="关闭图片编辑"]') as HTMLButtonElement).click());
    expect(container.querySelector('[aria-label="图片快捷编辑"]')).toBeNull();
    await unmountPage(root, container);
  });

  it('shows direct transform handles on selected images', async () => {
    const { container, root } = await renderPage();
    const stage = container.querySelector('.super-canvas__stage');

    expect(stage).not.toBeNull();

    await dispatchDragDrop(
      stage as Element,
      JSON.stringify({
        name: '直接编辑素材',
        src: 'data:image/png;base64,direct',
      }),
    );

    expect(
      container.querySelector('[aria-label="旋转选中图层"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[aria-label$="旋转选中图层"]'),
    ).toHaveLength(4);
    expect(
      container.querySelectorAll('[aria-label$="缩放选中图层"]'),
    ).toHaveLength(4);

    await unmountPage(root, container);
  });

  it('rotates and scales selected images from direct handles', async () => {
    const { container, root } = await renderPage();
    const stage = container.querySelector('.super-canvas__stage');

    expect(stage).not.toBeNull();

    await dispatchDragDrop(
      stage as Element,
      JSON.stringify({
        name: '手柄编辑素材',
        src: 'data:image/png;base64,handles',
      }),
      100,
      80,
    );

    const rotateHandle = container.querySelector(
      '[aria-label="右上旋转选中图层"]',
    ) as HTMLButtonElement | null;
    const resizeHandle = container.querySelector(
      '[aria-label="右下缩放选中图层"]',
    ) as HTMLButtonElement | null;

    expect(rotateHandle).not.toBeNull();
    expect(resizeHandle).not.toBeNull();

    await dispatchPointer(rotateHandle!, 'pointerdown', 100, 40);
    await act(async () => {
      window.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: 150,
          clientY: 80,
          pointerId: 1,
        }),
      );
      window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
      await flushAsyncWork();
    });

    let selectedLayer = container.querySelector(
      '.super-canvas__image-layer.is-selected',
    ) as HTMLElement | null;
    expect(selectedLayer?.style.transform).not.toBe('rotate(0deg)');

    await dispatchPointer(resizeHandle!, 'pointerdown', 150, 105);
    await act(async () => {
      window.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: 220,
          clientY: 140,
          pointerId: 1,
        }),
      );
      window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
      await flushAsyncWork();
    });

    selectedLayer = container.querySelector(
      '.super-canvas__image-layer.is-selected',
    ) as HTMLElement | null;
    expect(Number.parseFloat(selectedLayer?.style.width ?? '0')).toBeGreaterThan(
      100,
    );

    await unmountPage(root, container);
  });

  it('crops selected images from an on-canvas crop frame', async () => {
    const { container, root } = await renderPage();
    const stage = container.querySelector('.super-canvas__stage');

    expect(stage).not.toBeNull();

    await dispatchDragDrop(
      stage as Element,
      JSON.stringify({
        name: '框选裁剪素材',
        src: 'data:image/png;base64,crop-frame',
      }),
      100,
      80,
    );

    const cropFrameButton = container.querySelector(
      'button[title="裁剪图片"]',
    ) as HTMLButtonElement | null;

    expect(cropFrameButton).not.toBeNull();

    await act(async () => {
      cropFrameButton!.click();
      await flushAsyncWork();
    });

    expect(container.querySelector('.super-canvas__crop-frame')).not.toBeNull();

    const rightCropHandle = container.querySelector(
      '[aria-label="右侧裁剪框"]',
    ) as HTMLButtonElement | null;

    expect(rightCropHandle).not.toBeNull();

    await dispatchPointer(rightCropHandle!, 'pointerdown', 220, 120);
    await act(async () => {
      window.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: 180,
          clientY: 120,
          pointerId: 1,
        }),
      );
      window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
      await flushAsyncWork();
    });

    const selectedImage = container.querySelector(
      '.super-canvas__image-layer.is-selected img',
    ) as HTMLImageElement | null;

    expect(Number.parseFloat(selectedImage?.style.width ?? '0')).toBeGreaterThan(
      100,
    );

    await unmountPage(root, container);
  });

  it('duplicates selected image layers from double click actions, not the bottom toolbar', async () => {
    const { container, root } = await renderPage();
    const stage = container.querySelector('.super-canvas__stage');

    expect(stage).not.toBeNull();

    await dispatchDragDrop(
      stage as Element,
      JSON.stringify({
        name: '复制素材',
        src: 'data:image/png;base64,duplicate',
      }),
    );

    expect(container.querySelector('.super-canvas__toolbar button[title="复制"]')).toBeNull();
    await act(async () => container.querySelector('.super-canvas__image-layer')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    const duplicateButton = [...container.querySelectorAll<HTMLButtonElement>('.super-canvas__quick-edit button')].find(button => button.textContent === '复制');

    expect(duplicateButton).not.toBeNull();

    await act(async () => {
      duplicateButton!.click();
      await flushAsyncWork();
    });

    const layerImages = Array.from(
      container.querySelectorAll('.super-canvas__image-layer img'),
    );

    expect(layerImages).toHaveLength(2);
    expect(layerImages.map((image) => image.getAttribute('alt'))).toEqual([
      '复制素材',
      '复制素材 副本',
    ]);
    expect(container.textContent).toContain('已复制 1 个图层');

    await unmountPage(root, container);
  });

  it('keeps canvas layers when the canvas module is unmounted and remounted', async () => {
    const { container, rerender, root } = await renderPageShell(true);
    const stage = container.querySelector('.super-canvas__stage');

    expect(stage).not.toBeNull();

    await dispatchDragDrop(
      stage as Element,
      JSON.stringify({
        name: '跨模块保留素材',
        src: 'data:image/png;base64,persistent',
      }),
    );

    expect(container.textContent).toContain('已添加 跨模块保留素材');

    await rerender(false);
    expect(container.textContent).toContain('其他模块');

    await rerender(true);

    const restoredImage = container.querySelector(
      '.super-canvas__image-layer.is-selected img',
    ) as HTMLImageElement | null;

    expect(restoredImage).not.toBeNull();
    expect(restoredImage?.alt).toBe('跨模块保留素材');
    expect(restoredImage?.src).toContain('data:image/png;base64,persistent');

    await unmountPage(root, container);
  });

  it('rejects invalid custom drag data before loading an image', async () => {
    const imageConstructor = vi.fn(() => new MockImage());
    vi.stubGlobal('Image', imageConstructor);
    const { container, root } = await renderPage();
    const stage = container.querySelector('.super-canvas__stage');

    expect(stage).not.toBeNull();

    await dispatchDragDrop(
      stage as Element,
      JSON.stringify({ name: '', src: 'data:image/png;base64,asset' }),
    );

    expect(imageConstructor).not.toHaveBeenCalled();
    expect(container.textContent).toContain('拖入素材数据无效');

    await unmountPage(root, container);
  });

  it('rejects non-image and oversized uploads before FileReader', async () => {
    const fileReaderConstructor = vi.fn();
    vi.stubGlobal('FileReader', fileReaderConstructor);
    const { container, root } = await renderPage();
    const uploadInput = container.querySelector(
      '.super-canvas__file-input',
    ) as HTMLTextAreaElement | null;

    expect(uploadInput).not.toBeNull();

    await act(async () => {
      Object.defineProperty(uploadInput, 'files', {
        configurable: true,
        value: [new File(['plain text'], 'note.txt', { type: 'text/plain' })],
      });
      uploadInput!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(fileReaderConstructor).not.toHaveBeenCalled();
    expect(container.textContent).toContain('仅支持图片文件');

    const largeImage = new File(['x'], 'large.png', { type: 'image/png' });
    Object.defineProperty(largeImage, 'size', {
      configurable: true,
      value: 21 * 1024 * 1024,
    });

    await act(async () => {
      Object.defineProperty(uploadInput, 'files', {
        configurable: true,
        value: [largeImage],
      });
      uploadInput!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(fileReaderConstructor).not.toHaveBeenCalled();
    expect(container.textContent).toContain('图片不能超过 20 MB');

    await unmountPage(root, container);
  });

  it('cleans active resize listeners on cancel and unmount', async () => {
    const addListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeListenerSpy = vi.spyOn(window, 'removeEventListener');
    const { container, root } = await renderPage();
    const resizeHandle = container.querySelector(
      '.super-canvas__resize--left',
    ) as HTMLButtonElement | null;

    expect(resizeHandle).not.toBeNull();

    await dispatchPointer(resizeHandle as Element, 'pointerdown', 300, 20);

    expect(addListenerSpy).toHaveBeenCalledWith(
      'pointercancel',
      expect.any(Function),
    );

    removeListenerSpy.mockClear();
    await dispatchPointer(resizeHandle as Element, 'pointerdown', 320, 20);

    expect(removeListenerSpy).toHaveBeenCalledWith(
      'pointermove',
      expect.any(Function),
    );
    expect(removeListenerSpy).toHaveBeenCalledWith(
      'pointerup',
      expect.any(Function),
    );
    expect(removeListenerSpy).toHaveBeenCalledWith(
      'pointercancel',
      expect.any(Function),
    );

    removeListenerSpy.mockClear();
    await act(async () => {
      window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }));
    });

    expect(removeListenerSpy).toHaveBeenCalledWith(
      'pointermove',
      expect.any(Function),
    );
    expect(removeListenerSpy).toHaveBeenCalledWith(
      'pointerup',
      expect.any(Function),
    );
    expect(removeListenerSpy).toHaveBeenCalledWith(
      'pointercancel',
      expect.any(Function),
    );

    await dispatchPointer(resizeHandle as Element, 'pointerdown', 300, 20);
    removeListenerSpy.mockClear();
    await unmountPage(root, container);

    expect(removeListenerSpy).toHaveBeenCalledWith(
      'pointermove',
      expect.any(Function),
    );
    expect(removeListenerSpy).toHaveBeenCalledWith(
      'pointerup',
      expect.any(Function),
    );
    expect(removeListenerSpy).toHaveBeenCalledWith(
      'pointercancel',
      expect.any(Function),
    );
  });

  it('captures a dragged rectangle and adds it to the right panel', async () => {
    const { container, root } = await renderPage();
    const captureButton = container.querySelector(
      'button[title="截取"]',
    ) as HTMLButtonElement | null;
    const stage = container.querySelector('.super-canvas__stage');

    expect(captureButton).not.toBeNull();
    expect(stage).not.toBeNull();

    await act(async () => {
      captureButton?.click();
    });
    await dispatchPointer(stage as Element, 'pointerdown', 20, 30);
    await dispatchPointer(stage as Element, 'pointermove', 110, 120);
    await dispatchPointer(stage as Element, 'pointerup', 110, 120);

    expect(mockedExportLayersToPng).toHaveBeenCalledWith(
      expect.any(Array),
      { x: 20, y: 30, width: 90, height: 90 },
    );
    expect(container.querySelector('.super-canvas__capture-row img')?.getAttribute('alt')).toBe('截取 1');
    expect(container.textContent).toContain('已保存截取素材');
    expect(container.querySelector('.super-canvas__capture-row strong')).toBeNull();

    await unmountPage(root, container);
  });

  it('deletes a captured material from the right panel', async () => {
    const { container, root } = await renderPage();
    const captureButton = container.querySelector(
      'button[title="截取"]',
    ) as HTMLButtonElement | null;
    const stage = container.querySelector('.super-canvas__stage');

    expect(captureButton).not.toBeNull();
    expect(stage).not.toBeNull();

    await act(async () => {
      captureButton!.click();
    });
    await dispatchPointer(stage as Element, 'pointerdown', 20, 30);
    await dispatchPointer(stage as Element, 'pointermove', 110, 120);
    await dispatchPointer(stage as Element, 'pointerup', 110, 120);

    expect(container.querySelector('.super-canvas__capture-row img')?.getAttribute('alt')).toBe('截取 1');

    const deleteCaptureButton = container.querySelector(
      'button[title="删除截取素材"]',
    ) as HTMLButtonElement | null;

    expect(deleteCaptureButton).not.toBeNull();

    await act(async () => {
      deleteCaptureButton!.click();
      await flushAsyncWork();
    });

    expect(container.textContent).not.toContain('截取 1');
    expect(container.textContent).toContain('暂无截取素材');
    expect(container.textContent).toContain('已删除截取素材');

    await unmountPage(root, container);
  });

  it('adds a captured material back onto the canvas from the right panel', async () => {
    const { container, root } = await renderPage();
    const captureButton = container.querySelector(
      'button[title="截取"]',
    ) as HTMLButtonElement | null;
    const stage = container.querySelector('.super-canvas__stage');

    expect(captureButton).not.toBeNull();
    expect(stage).not.toBeNull();

    await act(async () => {
      captureButton!.click();
    });
    await dispatchPointer(stage as Element, 'pointerdown', 20, 30);
    await dispatchPointer(stage as Element, 'pointermove', 110, 120);
    await dispatchPointer(stage as Element, 'pointerup', 110, 120);

    const addCaptureButton = container.querySelector(
      'button[title="添加到画布"]',
    ) as HTMLButtonElement | null;

    expect(addCaptureButton).not.toBeNull();

    await act(async () => {
      addCaptureButton!.click();
      await flushAsyncWork();
    });

    const selectedImage = container.querySelector(
      '.super-canvas__image-layer.is-selected img',
    ) as HTMLImageElement | null;

    expect(selectedImage).not.toBeNull();
    expect(selectedImage?.alt).toBe('截取 1');
    expect(container.textContent).toContain('已添加 截取 1');

    await unmountPage(root, container);
  });

  it('resolves a relative generated image URL before creating the AI layer', async () => {
    const { container, root } = await renderPage();
    const promptInput = container.querySelector(
      '.super-canvas__generate-bar textarea',
    ) as HTMLTextAreaElement | null;
    const generateButton = container.querySelector(
      '.super-canvas__generate-button',
    ) as HTMLButtonElement | null;

    expect(promptInput).not.toBeNull();
    expect(generateButton).not.toBeNull();

    await updateInputValue(promptInput!, '生成透明纹样');

    await act(async () => {
      generateButton!.click();
      await flushAsyncWork();
    });

    const selectedImage = container.querySelector(
      '.super-canvas__image-layer.is-selected img',
    ) as HTMLImageElement | null;

    expect(mockedGenerateTransparentAsset).toHaveBeenCalledWith(
      { prompt: '生成透明纹样' },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(selectedImage?.alt).toBe('转化纹样-1');
    const generatedLayer = selectedImage?.closest('.super-canvas__image-layer') as HTMLElement;
    expect(parseFloat(generatedLayer.style.width) / parseFloat(generatedLayer.style.height)).toBeCloseTo(2);
    expect(selectedImage?.src).toBe(
      'http://localhost:3000/generated/super-canvas/ai.png',
    );
    expect(container.textContent).toContain('已生成透明底 PNG');

    await unmountPage(root, container);
  });

  it('shows actual progress while running and prompt details only after success', async () => {
    const generation = createDeferred<Awaited<ReturnType<typeof generateTransparentAsset>>>();
    mockedGenerateTransparentAsset.mockImplementationOnce((_input, options) => {
      options?.onProgress?.('optimizing');
      return generation.promise;
    });
    const { container, root } = await renderPage();
    await updateInputValue(container.querySelector('textarea')!, '简化龙纹');
    await act(async () => (container.querySelector('.super-canvas__generate-button') as HTMLButtonElement).click());
    expect(container.textContent).toContain('正在优化提示词');
    expect(container.querySelector('.super-canvas__prompt-details')).toBeNull();
    await act(async () => {
      mockedGenerateTransparentAsset.mock.calls.at(-1)?.[1]?.onProgress?.('generating');
    });
    expect(container.textContent).toContain('正在生成图片');
    await act(async () => {
      generation.resolve({ imageUrl: '/a.png', taskId: '1', confidence: 'high', transparentPixelRatio: 1,
        promptTrace: { originalPrompt: '简化龙纹', optimizedPrompt: '保留主体，简化碎线。', mode: 'detail' } });
      await flushAsyncWork();
    });
    const details = container.querySelector('details.super-canvas__prompt-details') as HTMLDetailsElement;
    expect(details).not.toBeNull();
    expect(details.open).toBe(false);
    expect(details.textContent).toContain('保留主体，简化碎线。');
    await unmountPage(root, container);
  });

  it('keeps optimization hidden and edits the selected generated image on the next request', async () => {
    const { container, root } = await renderPage();
    const stage = container.querySelector('.super-canvas__stage');
    const promptInput = container.querySelector(
      '.super-canvas__generate-bar textarea',
    ) as HTMLTextAreaElement | null;
    const generateButton = container.querySelector(
      '.super-canvas__generate-button',
    ) as HTMLButtonElement | null;

    expect(stage).not.toBeNull();
    expect(promptInput).not.toBeNull();
    expect(generateButton).not.toBeNull();

    await dispatchDragDrop(
      stage as Element,
      JSON.stringify({
        name: '飞凤纹',
        src: 'data:image/png;base64,phoenix',
        sourcePattern: {
          id: 'pattern-phoenix-1',
          name: '飞凤纹',
          imageUrl: '/images/phoenix.png',
          carriers: ['金银器'],
          motifs: ['凤纹'],
          layouts: ['连续纹样'],
        },
      }),
    );
    await updateInputValue(
      promptInput!,
      '转化为简约流畅的凤纹线描，强化翅膀走势',
    );

    await act(async () => {
      generateButton!.click();
      await flushAsyncWork();
    });

    expect(container.querySelector('.super-canvas__image-layer.is-selected img')?.getAttribute('alt')).toBe('飞凤纹-1');
    expect(container.textContent).not.toContain('这版提示词效果还不错吗');
    expect(container.textContent).not.toContain('优化提示词');
    expect(container.textContent).not.toContain('推荐提示词');
    expect(container.textContent).not.toContain('专业表达建议');
    await updateInputValue(promptInput!, '只把尾巴缩短，其他不变');
    await act(async () => {
      generateButton!.click();
      await flushAsyncWork();
    });
    expect(container.querySelector('.super-canvas__image-layer.is-selected img')?.getAttribute('alt')).toBe('飞凤纹-2');
    expect(mockedGenerateTransparentAsset).toHaveBeenLastCalledWith(
      { prompt: '只把尾巴缩短，其他不变', referenceImageUrl: expect.stringContaining('/generated/super-canvas/ai.png') },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    await unmountPage(root, container);
  });

  it('sends local selected images to the backend for public reference publishing', async () => {
    const { container, root } = await renderPage();
    const stage = container.querySelector('.super-canvas__stage');
    const promptInput = container.querySelector(
      '.super-canvas__generate-bar textarea',
    ) as HTMLTextAreaElement | null;
    const generateButton = container.querySelector(
      '.super-canvas__generate-button',
    ) as HTMLButtonElement | null;

    expect(stage).not.toBeNull();
    expect(promptInput).not.toBeNull();
    expect(generateButton).not.toBeNull();

    await dispatchDragDrop(
      stage as Element,
      JSON.stringify({
        name: '本地素材',
        src: 'data:image/png;base64,asset',
      }),
    );
    await updateInputValue(promptInput!, '生成透明纹样');

    await act(async () => {
      generateButton!.click();
      await flushAsyncWork();
    });

    expect(mockedGenerateTransparentAsset).toHaveBeenCalledWith(
      {
        prompt: '生成透明纹样',
        referenceImageUrl: 'data:image/png;base64,asset',
      },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    await unmountPage(root, container);
  });

  it('sends localhost selected images to the backend for public reference publishing', async () => {
    const { container, root } = await renderPage();
    const stage = container.querySelector('.super-canvas__stage');
    const promptInput = container.querySelector(
      '.super-canvas__generate-bar textarea',
    ) as HTMLTextAreaElement | null;
    const generateButton = container.querySelector(
      '.super-canvas__generate-button',
    ) as HTMLButtonElement | null;

    expect(stage).not.toBeNull();
    expect(promptInput).not.toBeNull();
    expect(generateButton).not.toBeNull();

    await dispatchDragDrop(
      stage as Element,
      JSON.stringify({
        name: '本地后端素材',
        src: 'http://localhost:3000/images/source.png',
      }),
    );
    await updateInputValue(promptInput!, '生成透明纹样');

    await act(async () => {
      generateButton!.click();
      await flushAsyncWork();
    });

    expect(mockedGenerateTransparentAsset).toHaveBeenCalledWith(
      {
        prompt: '生成透明纹样',
        referenceImageUrl: 'http://localhost:3000/images/source.png',
      },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    await unmountPage(root, container);
  });

  it('shift-selects multiple images and sends them all as generation references', async () => {
    const { container, root } = await renderPage();
    const stage = container.querySelector('.super-canvas__stage');
    const promptInput = container.querySelector(
      '.super-canvas__generate-bar textarea',
    ) as HTMLTextAreaElement | null;
    const generateButton = container.querySelector(
      '.super-canvas__generate-button',
    ) as HTMLButtonElement | null;

    expect(stage).not.toBeNull();
    expect(promptInput).not.toBeNull();
    expect(generateButton).not.toBeNull();

    await dispatchDragDrop(
      stage as Element,
      JSON.stringify({
        name: '提示图一',
        src: 'data:image/png;base64,first',
      }),
      120,
      120,
    );
    await dispatchDragDrop(
      stage as Element,
      JSON.stringify({
        name: '提示图二',
        src: 'data:image/png;base64,second',
      }),
      260,
      160,
    );

    const [firstLayer] = Array.from(
      container.querySelectorAll('.super-canvas__image-layer'),
    );
    expect(firstLayer).toBeDefined();

    await dispatchPointer(firstLayer!, 'pointerdown', 120, 120, {
      shiftKey: true,
    });
    await dispatchPointer(firstLayer!, 'pointerup', 120, 120, {
      shiftKey: true,
    });
    expect(
      container.querySelectorAll('.super-canvas__image-layer.is-selected'),
    ).toHaveLength(2);
    await updateInputValue(promptInput!, '融合两张提示图');

    await act(async () => {
      generateButton!.click();
      await flushAsyncWork();
    });

    expect(mockedGenerateTransparentAsset).toHaveBeenCalledWith({
      prompt: '融合两张提示图',
      referenceImageUrls: [
        'data:image/png;base64,first',
        'data:image/png;base64,second',
      ],
    }, expect.objectContaining({ signal: expect.any(AbortSignal) }));

    await unmountPage(root, container);
  });

  it('shows a loading layer on the canvas while generation is pending', async () => {
    const generation = createDeferred<{
      imageUrl: string;
      taskId: string;
      confidence: 'high';
      transparentPixelRatio: number;
    }>();
    mockedGenerateTransparentAsset.mockReturnValueOnce(generation.promise);
    const { container, root } = await renderPage();
    const promptInput = container.querySelector(
      '.super-canvas__generate-bar textarea',
    ) as HTMLTextAreaElement | null;
    const generateButton = container.querySelector(
      '.super-canvas__generate-button',
    ) as HTMLButtonElement | null;

    expect(promptInput).not.toBeNull();
    expect(generateButton).not.toBeNull();

    await updateInputValue(promptInput!, '生成透明纹样');

    await act(async () => {
      generateButton!.click();
      await flushAsyncWork();
    });

    expect(
      container.querySelector('.super-canvas__generation-placeholder'),
    ).not.toBeNull();
    expect(container.textContent).toContain('生成中');
    expect(container.querySelector('.super-canvas__generation-placeholder')?.getAttribute('aria-busy')).toBe('true');

    await act(async () => {
      generation.resolve({
        imageUrl: '/generated/super-canvas/ai.png',
        taskId: 'task-1',
        confidence: 'high',
        transparentPixelRatio: 0.9,
      });
      await flushAsyncWork();
    });

    expect(
      container.querySelector('.super-canvas__generation-placeholder'),
    ).toBeNull();
    expect(
      container.querySelector('.super-canvas__image-layer.is-selected img'),
    ).not.toBeNull();

    await unmountPage(root, container);
  });

  it('cancels a pending canvas generation and removes the loading layer', async () => {
    const generation = createDeferred<{
      imageUrl: string;
      taskId: string;
      confidence: 'high';
      transparentPixelRatio: number;
    }>();
    mockedGenerateTransparentAsset.mockReturnValueOnce(generation.promise);
    const { container, root } = await renderPage();
    const promptInput = container.querySelector(
      '.super-canvas__generate-bar textarea',
    ) as HTMLTextAreaElement | null;
    const generateButton = container.querySelector(
      '.super-canvas__generate-button',
    ) as HTMLButtonElement | null;

    await updateInputValue(promptInput!, '生成透明纹样');

    await act(async () => {
      generateButton!.click();
      await flushAsyncWork();
    });

    const cancelButton = Array.from(
      container.querySelectorAll('.super-canvas__generate-bar button'),
    ).find((button) => button.textContent === '取消生成') as
      | HTMLButtonElement
      | undefined;

    expect(cancelButton).toBeDefined();
    expect(
      container.querySelector('.super-canvas__generation-placeholder'),
    ).not.toBeNull();

    await act(async () => {
      cancelButton!.click();
      await flushAsyncWork();
    });

    expect(
      container.querySelector('.super-canvas__generation-placeholder'),
    ).toBeNull();
    expect(container.textContent).toContain('已取消生成');

    const [, options] = mockedGenerateTransparentAsset.mock.calls[0];
    expect(options?.signal?.aborted).toBe(true);

    await unmountPage(root, container);
  });

  it('moves an image layer to the top from its right-click menu', async () => {
    const { container, root } = await renderPage();
    const stage = container.querySelector('.super-canvas__stage');

    expect(stage).not.toBeNull();

    await dispatchDragDrop(
      stage as Element,
      JSON.stringify({
        name: '底层素材',
        src: 'data:image/png;base64,bottom',
      }),
    );
    await dispatchDragDrop(
      stage as Element,
      JSON.stringify({
        name: '上层素材',
        src: 'data:image/png;base64,top',
      }),
      180,
      140,
    );

    const firstLayer = container.querySelector(
      '.super-canvas__image-layer',
    ) as HTMLElement | null;

    expect(firstLayer).not.toBeNull();

    await dispatchContextMenu(firstLayer!);

    const bringToFrontButton = Array.from(
      container.querySelectorAll('.super-canvas__context-menu button'),
    ).find((button) => button.textContent === '置于顶层') as
      | HTMLButtonElement
      | undefined;

    expect(bringToFrontButton).toBeDefined();

    await act(async () => {
      bringToFrontButton!.click();
      await flushAsyncWork();
    });

    const imageNames = Array.from(
      container.querySelectorAll('.super-canvas__image-layer img'),
    ).map((image) => image.getAttribute('alt'));

    expect(imageNames).toEqual(['上层素材', '底层素材']);
    expect(container.textContent).toContain('已置于顶层');

    await unmountPage(root, container);
  });

  it('erases brush strokes without affecting image layers', async () => {
    const { container, root } = await renderPage();
    const brushButton = container.querySelector(
      'button[title="画笔"]',
    ) as HTMLButtonElement | null;
    const eraserButton = container.querySelector(
      'button[title="橡皮擦"]',
    ) as HTMLButtonElement | null;
    const stage = container.querySelector('.super-canvas__stage');

    expect(brushButton).not.toBeNull();
    expect(eraserButton).not.toBeNull();
    expect(stage).not.toBeNull();

    await act(async () => {
      brushButton!.click();
    });
    await dispatchPointer(stage as Element, 'pointerdown', 30, 30);
    await dispatchPointer(stage as Element, 'pointermove', 35, 35);
    await dispatchPointer(stage as Element, 'pointerup', 35, 35);

    expect(container.querySelector('.super-canvas__stroke-layer')).not.toBeNull();

    await dispatchDragDrop(
      stage as Element,
      JSON.stringify({
        name: '图片素材',
        src: 'data:image/png;base64,image',
      }),
      120,
      120,
    );

    await act(async () => {
      eraserButton!.click();
    });
    await dispatchPointer(stage as Element, 'pointerdown', 32, 32);
    await dispatchPointer(stage as Element, 'pointermove', 35, 35);
    await dispatchPointer(stage as Element, 'pointerup', 35, 35);

    expect(container.querySelector('.super-canvas__stroke-layer')).toBeNull();
    expect(
      container.querySelector('.super-canvas__image-layer img'),
    ).not.toBeNull();
    expect(container.textContent).toContain('已擦除画笔笔迹');

    await unmountPage(root, container);
  });
  it('preserves a favorited capture identity when re-added unchanged and forks after crop', async () => {
    const favorite = vi.spyOn(assetApi, 'favoriteImage').mockResolvedValue({ id:'capture-favorite', name:'截取收藏', kind:'pattern', imageUrl:'/assets/capture-favorite/image', projectId:'p', projectName:'p', theme:'', imagery:'', createdAt:'' });
    const {container,root}=await renderPage();
    try {
      await act(async () => (container.querySelector('button[title="截取"]') as HTMLButtonElement).click());
      const stage=container.querySelector('.super-canvas__stage')!;
      await dispatchPointer(stage,'pointerdown',20,30);await dispatchPointer(stage,'pointermove',110,120);await dispatchPointer(stage,'pointerup',110,120);
      await act(async () => { (container.querySelector('.super-canvas__capture-row .asset-favorite') as HTMLButtonElement).click(); await flushAsyncWork(); });
      expect(observedCanvas.captures[0].sourceAssetId).toBe('capture-favorite');
      await act(async () => { (container.querySelector('button[title="添加到画布"]') as HTMLButtonElement).click(); await flushAsyncWork(); });
      const layer=observedCanvas.layers.find(l=>l.type==='image') as ImageLayer;
      expect(provenanceForGeneration([layer], 'next','/out').references[0]).toMatchObject({referenceKind:'capture',sourceAssetId:'capture-favorite',transformFingerprint:''});
      const changed={...layer,crop:{left:.2,right:0,top:0,bottom:0}};
      expect(canvasReferenceIdentity(changed)).toMatchObject({referenceKind:'derived',sourceAssetId:'capture-favorite'});
      expect(canvasReferenceIdentity(changed).transformFingerprint).not.toBe('');
    } finally { favorite.mockRestore(); await unmountPage(root,container); }
  });

});
