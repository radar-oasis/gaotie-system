import { describe, expect, it } from 'vitest';
import { updateImageLayerCrop, cropLayerFromPointer } from './layerMath';
import type { ImageLayer } from './types';

const base: ImageLayer = { id: 'test', type: 'image', name: 'test', src: 'test.png', x: 10, y: 20, width: 200, height: 100, rotation: 0, opacity: 1 };

describe('non-destructive crop geometry', () => {
  it('clips a mirrored corner with nonzero rotation without changing source scale', () => {
    const layer = { ...base, rotation: 90, flipX: true, flipY: true };
    const result = cropLayerFromPointer(layer, 'nw', { x: 0, y: 0 }, { x: -10, y: 20 });
    expect(result.crop).toEqual({ left: 0, right: .1, top: 0, bottom: .1 });
    expect(result.width).toBeCloseTo(180);
    expect(result.height).toBeCloseTo(90);
    expect(result.x + result.width / 2).toBeCloseTo(105);
    expect(result.y + result.height / 2).toBeCloseTo(80);
  });
  it('clamps an oversized drag and permits restoring the cropped edge', () => {
    const result = cropLayerFromPointer(base, 'e', { x: 0, y: 0 }, { x: -1000, y: 0 });
    expect(result.crop?.right).toBe(.95);
    expect(result.width).toBeCloseTo(10);
    const restored = cropLayerFromPointer(result, 'e', { x: 0, y: 0 }, { x: 190, y: 0 });
    expect(restored.width).toBeCloseTo(200);
    expect(restored.x).toBeCloseTo(10);
  });
  it('maps rotated dragging to local edges and full source dimensions', () => {
    const cropped = updateImageLayerCrop({ ...base, rotation: 90 }, 'left', .25);
    const result = cropLayerFromPointer(cropped, 'e', { x: 0, y: 0 }, { x: 0, y: -20 });
    expect(result.width).toBeCloseTo(130);
    expect(result.crop?.right).toBeCloseTo(.1);
  });
  it('maps visible left dragging to source right for mirrored images', () => {
    const result = cropLayerFromPointer({ ...base, flipX: true }, 'w', { x: 0, y: 0 }, { x: 50, y: 0 });
    expect(result.crop?.right).toBe(.25);
    expect(result.x).toBeCloseTo(60);
    expect(result.width).toBeCloseTo(150);
  });
  it('shrinks the frame without stretching the retained pixels', () => {
    const cropped = updateImageLayerCrop(base, 'left', .25);
    expect(cropped.width).toBe(150);
    expect(cropped.height).toBe(100);
    expect(cropped.x).toBe(60);
    expect(cropped.y).toBe(20);
    expect(cropped.src).toBe(base.src);
  });
  it('keeps source scale across repeated crops and uncropping', () => {
    const a = updateImageLayerCrop(base, 'left', .25);
    const b = updateImageLayerCrop(a, 'right', .1);
    expect(b.width).toBeCloseTo(130);
    expect(b.x).toBeCloseTo(60);
    const restored = updateImageLayerCrop(updateImageLayerCrop(b, 'left', 0), 'right', 0);
    expect(restored.width).toBeCloseTo(200);
    expect(restored.x).toBeCloseTo(10);
  });
  it('rotates the center displacement when cropping a rotated image', () => {
    const result = updateImageLayerCrop({ ...base, rotation: 90 }, 'left', .25);
    expect(result.x + result.width / 2).toBeCloseTo(110);
    expect(result.y + result.height / 2).toBeCloseTo(95);
  });
});
