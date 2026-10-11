import { describe, expect, it } from 'vitest';
import { resolveBackendImageUrl } from './imageUrls';
import {
  createImageLayer,
  getLayerBounds,
  resolveDropPoint,
  resizeImageLayer,
  rotateImageLayer,
  scaleImageLayer,
  updateImageLayerCrop,
} from './layerMath';

describe('layerMath', () => {
  it('creates an image layer centered on the drop point', () => {
    const layer = createImageLayer({
      id: 'layer-1',
      name: '长城纹样',
      src: '/images/a.png',
      dropPoint: { x: 500, y: 300 },
      naturalWidth: 800,
      naturalHeight: 400,
    });

    expect(layer).toMatchObject({
      id: 'layer-1',
      type: 'image',
      name: '长城纹样',
      x: 380,
      y: 240,
      width: 240,
      height: 120,
      rotation: 0,
      opacity: 1,
    });
    expect(layer).not.toHaveProperty('naturalWidth');
    expect(layer).not.toHaveProperty('naturalHeight');
  });

  it('keeps source pattern metadata when creating a canvas layer', () => {
    const layer = createImageLayer({
      id: 'layer-1',
      name: '飞凤纹',
      src: '/images/phoenix.png',
      dropPoint: { x: 300, y: 200 },
      naturalWidth: 200,
      naturalHeight: 100,
      sourcePattern: {
        id: 'pattern-1',
        name: '飞凤纹',
        imageUrl: '/images/phoenix.png',
        dynasty: '唐代',
        description: '飞凤纹样',
        carriers: ['金银器'],
        materials: ['金'],
        motifs: ['凤纹'],
        layouts: ['连续纹样'],
      },
    });

    expect(layer.sourcePattern).toMatchObject({
      id: 'pattern-1',
      name: '飞凤纹',
      motifs: ['凤纹'],
      carriers: ['金银器'],
    });
  });

  it('scales an image layer around its center', () => {
    const layer = createImageLayer({
      id: 'layer-1',
      name: '纹样',
      src: '/images/a.png',
      dropPoint: { x: 100, y: 100 },
      naturalWidth: 100,
      naturalHeight: 100,
    });

    const scaled = scaleImageLayer(layer, 2);

    expect(getLayerBounds(scaled)).toEqual({
      left: 0,
      top: 0,
      right: 200,
      bottom: 200,
    });
  });

  it('rotates and resizes image layers around their center', () => {
    const layer = createImageLayer({
      id: 'layer-1',
      name: '纹样',
      src: '/images/a.png',
      dropPoint: { x: 100, y: 100 },
      naturalWidth: 200,
      naturalHeight: 100,
    });

    const rotated = rotateImageLayer(layer, 45);
    const resized = resizeImageLayer(rotated, { width: 300, height: 90 });

    expect(rotated.rotation).toBe(45);
    expect(resized).toMatchObject({
      rotation: 45,
      x: -50,
      y: 55,
      width: 300,
      height: 90,
    });
  });

  it('clamps crop values so a visible image area remains', () => {
    const layer = createImageLayer({
      id: 'layer-1',
      name: '纹样',
      src: '/images/a.png',
      dropPoint: { x: 100, y: 100 },
      naturalWidth: 200,
      naturalHeight: 100,
    });

    const cropped = updateImageLayerCrop(layer, 'left', 0.4);
    const clamped = updateImageLayerCrop(cropped, 'right', 0.8);

    expect(cropped.crop).toEqual({
      left: 0.4,
      right: 0,
      top: 0,
      bottom: 0,
    });
    expect(clamped.crop).toEqual({
      left: 0.4,
      right: 0.55,
      top: 0,
      bottom: 0,
    });
  });

  it('resolves pointer coordinates inside a zoomed canvas', () => {
    const point = resolveDropPoint({
      clientX: 260,
      clientY: 180,
      canvasRect: { left: 20, top: 30 },
      pan: { x: 100, y: 50 },
      zoom: 2,
    });

    expect(point).toEqual({ x: 70, y: 50 });
  });

  it('rejects zero, negative, and non-finite canvas zoom values', () => {
    const resolveWithZoom = (zoom: number) =>
      resolveDropPoint({
        clientX: 260,
        clientY: 180,
        canvasRect: { left: 20, top: 30 },
        pan: { x: 100, y: 50 },
        zoom,
      });

    expect(() => resolveWithZoom(0)).toThrow(
      'Canvas zoom must be a finite positive number.',
    );
    expect(() => resolveWithZoom(-1)).toThrow(
      'Canvas zoom must be a finite positive number.',
    );
    expect(() => resolveWithZoom(Number.NaN)).toThrow(
      'Canvas zoom must be a finite positive number.',
    );
    expect(() => resolveWithZoom(Number.POSITIVE_INFINITY)).toThrow(
      'Canvas zoom must be a finite positive number.',
    );
  });

  it('keeps image scaling above the minimum dimension', () => {
    const layer = createImageLayer({
      id: 'layer-1',
      name: 'small',
      src: '/images/a.png',
      dropPoint: { x: 50, y: 50 },
      naturalWidth: 100,
      naturalHeight: 50,
    });

    const scaled = scaleImageLayer(layer, 0.1);

    expect(scaled.width).toBe(48);
    expect(scaled.height).toBe(24);
    expect(getLayerBounds(scaled)).toEqual({
      left: 26,
      top: 38,
      right: 74,
      bottom: 62,
    });
  });

  it('rejects invalid natural image dimensions', () => {
    const createLayer = (naturalWidth: number, naturalHeight: number) =>
      createImageLayer({
        id: 'layer-1',
        name: 'invalid',
        src: '/images/a.png',
        dropPoint: { x: 50, y: 50 },
        naturalWidth,
        naturalHeight,
      });

    expect(() => createLayer(0, 100)).toThrow(
      'Image natural dimensions must be finite positive numbers.',
    );
    expect(() => createLayer(100, -1)).toThrow(
      'Image natural dimensions must be finite positive numbers.',
    );
    expect(() => createLayer(Number.NaN, 100)).toThrow(
      'Image natural dimensions must be finite positive numbers.',
    );
    expect(() => createLayer(100, Number.POSITIVE_INFINITY)).toThrow(
      'Image natural dimensions must be finite positive numbers.',
    );
  });

  it('rejects zero, negative, and non-finite image scale values', () => {
    const layer = createImageLayer({
      id: 'layer-1',
      name: '纹样',
      src: '/images/a.png',
      dropPoint: { x: 100, y: 100 },
      naturalWidth: 100,
      naturalHeight: 100,
    });

    expect(() => scaleImageLayer(layer, 0)).toThrow(
      'Image scale must be a finite positive number.',
    );
    expect(() => scaleImageLayer(layer, -1)).toThrow(
      'Image scale must be a finite positive number.',
    );
    expect(() => scaleImageLayer(layer, Number.NaN)).toThrow(
      'Image scale must be a finite positive number.',
    );
    expect(() => scaleImageLayer(layer, Number.NEGATIVE_INFINITY)).toThrow(
      'Image scale must be a finite positive number.',
    );
  });
});

describe('resolveBackendImageUrl', () => {
  it('leaves empty, data, blob, protocol-relative, and absolute http URLs unchanged', () => {
    expect(resolveBackendImageUrl('')).toBe('');
    expect(resolveBackendImageUrl('data:image/png;base64,abc')).toBe(
      'data:image/png;base64,abc',
    );
    expect(resolveBackendImageUrl('blob:http://localhost:5173/abc')).toBe(
      'blob:http://localhost:5173/abc',
    );
    expect(resolveBackendImageUrl('//cdn.example.com/a.png')).toBe(
      '//cdn.example.com/a.png',
    );
    expect(resolveBackendImageUrl('https://example.com/image.png')).toBe(
      'https://example.com/image.png',
    );
  });

  it('normalizes backend image paths to localhost URLs', () => {
    expect(resolveBackendImageUrl('/generated/a.png')).toBe(
      'http://localhost:3000/generated/a.png',
    );
    expect(resolveBackendImageUrl('images/foo.png')).toBe(
      'http://localhost:3000/images/foo.png',
    );
    expect(resolveBackendImageUrl('foo.png')).toBe(
      'http://localhost:3000/images/foo.png',
    );
    expect(resolveBackendImageUrl('/generated/super-canvas/foo.png')).toBe(
      'http://localhost:3000/generated/super-canvas/foo.png',
    );
  });
});
