import { describe, expect, it } from 'vitest';
import { nextViewportZoom, viewportZoomPercent } from './viewportZoom';

describe('viewport zoom controls', () => {
  it('zooms in and out with the same limits as mouse interaction', () => {
    expect(nextViewportZoom(1, 1)).toBeCloseTo(1.2);
    expect(nextViewportZoom(1.2, -1)).toBeCloseTo(1);
    expect(nextViewportZoom(5, 1)).toBe(5);
    expect(nextViewportZoom(.6, -1)).toBe(.6);
  });
  it('reports actual camera zoom as a percentage', () => {
    expect(viewportZoomPercent(1)).toBe(100);
    expect(viewportZoomPercent(1.234)).toBe(123);
  });
});
