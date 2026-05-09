import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CanvasLayer } from './types';

type FakeCanvasContext = {
  strokeStyle: string;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  globalAlpha: number;
  translate: ReturnType<typeof vi.fn>;
  beginPath: ReturnType<typeof vi.fn>;
  moveTo: ReturnType<typeof vi.fn>;
  lineTo: ReturnType<typeof vi.fn>;
  stroke: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
};

const createContext = (): FakeCanvasContext => ({
  strokeStyle: '',
  lineWidth: 0,
  lineCap: 'butt',
  lineJoin: 'miter',
  globalAlpha: 1,
  translate: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  drawImage: vi.fn(),
});

const stubCanvas = (context: FakeCanvasContext | null) => {
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn().mockReturnValue(context),
    toDataURL: vi.fn().mockReturnValue('data:image/png;base64,canvas'),
  };
  vi.stubGlobal('document', {
    createElement: vi.fn().mockReturnValue(canvas),
  });

  return canvas;
};

const stubImage = (shouldFail = false) => {
  class FakeImage {
    private source = '';
    crossOrigin = '';
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    get src() {
      return this.source;
    }

    set src(value: string) {
      this.source = value;
      queueMicrotask(() => {
        if (shouldFail) {
          this.onerror?.();
          return;
        }
        this.onload?.();
      });
    }
  }

  vi.stubGlobal('Image', FakeImage);
};

describe('exportLayersToPng', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('draws strokes and images into a rounded capture canvas', async () => {
    const context = createContext();
    const canvas = stubCanvas(context);
    stubImage();
    const { exportLayersToPng } = await import('./renderCanvas');
    const layers: CanvasLayer[] = [
      {
        id: 'stroke-1',
        type: 'stroke',
        color: '#123456',
        size: 4,
        points: [
          { x: 6, y: -2 },
          { x: 7, y: -1 },
          { x: 9, y: 2 },
        ],
      },
      {
        id: 'empty-stroke',
        type: 'stroke',
        color: '#ffffff',
        size: 8,
        points: [],
      },
      {
        id: 'image-1',
        type: 'image',
        name: 'asset',
        src: 'https://cdn.example.com/asset.png',
        x: 12,
        y: 14,
        width: 120,
        height: 80,
        rotation: 0,
        opacity: 0.35,
      },
    ];

    await expect(
      exportLayersToPng(layers, { x: 5, y: -3, width: 9.6, height: 0.2 }),
    ).resolves.toBe('data:image/png;base64,canvas');

    expect(canvas.width).toBe(10);
    expect(canvas.height).toBe(1);
    expect(canvas.getContext).toHaveBeenCalledWith('2d');
    expect(context.translate).toHaveBeenCalledWith(-5, 3);
    expect(context.strokeStyle).toBe('#123456');
    expect(context.lineWidth).toBe(4);
    expect(context.lineCap).toBe('round');
    expect(context.lineJoin).toBe('round');
    expect(context.beginPath).toHaveBeenCalledTimes(1);
    expect(context.moveTo).toHaveBeenCalledWith(6, -2);
    expect(context.lineTo).toHaveBeenNthCalledWith(1, 7, -1);
    expect(context.lineTo).toHaveBeenNthCalledWith(2, 9, 2);
    expect(context.stroke).toHaveBeenCalledTimes(1);
    expect(context.drawImage).toHaveBeenCalledWith(
      expect.objectContaining({
        crossOrigin: 'anonymous',
        src: 'https://cdn.example.com/asset.png',
      }),
      12,
      14,
      120,
      80,
    );
    expect(context.globalAlpha).toBe(1);
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/png');
  });

  it('throws when the 2D context is not available', async () => {
    stubCanvas(null);
    const { exportLayersToPng } = await import('./renderCanvas');

    await expect(
      exportLayersToPng([], { x: 0, y: 0, width: 10, height: 10 }),
    ).rejects.toThrow('Canvas 2D context is not available');
  });

  it('rejects when an image layer fails to load', async () => {
    const context = createContext();
    stubCanvas(context);
    stubImage(true);
    const { exportLayersToPng } = await import('./renderCanvas');
    const layers: CanvasLayer[] = [
      {
        id: 'image-1',
        type: 'image',
        name: 'asset',
        src: 'https://cdn.example.com/fail.png',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        rotation: 0,
        opacity: 1,
      },
    ];

    await expect(
      exportLayersToPng(layers, { x: 0, y: 0, width: 10, height: 10 }),
    ).rejects.toThrow(
      'Failed to load image: https://cdn.example.com/fail.png',
    );
  });
});
