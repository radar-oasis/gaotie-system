// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TopNav from '../TopNav';
import { ImageSearchProvider } from '../../context/ImageSearchContext';
import SuperCanvasPage from './SuperCanvasPage';
import { exportLayersToPng } from './renderCanvas';
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

const renderPage = async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <ImageSearchProvider>
        <SuperCanvasPage />
      </ImageSearchProvider>,
    );
  });

  return { container, root };
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
) => {
  const event = new PointerEvent(type, {
    bubbles: true,
    button: 0,
    clientX,
    clientY,
    pointerId: 1,
  });

  await act(async () => {
    target.dispatchEvent(event);
    await flushAsyncWork();
  });
};

const updateInputValue = async (input: HTMLInputElement, value: string) => {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;

  await act(async () => {
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
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
    expect(container.textContent).toContain('AI 生成');
    expect(navContainer.textContent).toContain('超级画布');

    await unmountPage(root, container);
    navRoot.unmount();
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
    ) as HTMLInputElement | null;

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
    expect(container.textContent).toContain('截取 1');
    expect(container.textContent).toContain('已保存截取素材');

    await unmountPage(root, container);
  });

  it('resolves a relative generated image URL before creating the AI layer', async () => {
    const { container, root } = await renderPage();
    const promptInput = container.querySelector(
      '.super-canvas__generate-bar input',
    ) as HTMLInputElement | null;
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

    expect(mockedGenerateTransparentAsset).toHaveBeenCalledWith({
      prompt: '生成透明纹样',
      referenceImageUrl: undefined,
    });
    expect(selectedImage?.alt).toBe('AI 生成纹样');
    expect(selectedImage?.src).toBe(
      'http://localhost:3000/generated/super-canvas/ai.png',
    );
    expect(container.textContent).toContain('已生成透明底 PNG');

    await unmountPage(root, container);
  });
});
