import { describe, expect, it } from 'vitest';
import { colorFromWheelPoint, wheelPointerPosition } from './colorWheelUtils';

describe('color wheel utilities', () => {
  it('maps wheel edge points to saturated colors', () => {
    expect(colorFromWheelPoint(200, 100, 200)).toBe('#ff0000');
    expect(colorFromWheelPoint(100, 0, 200)).toBe('#8000ff');
  });

  it('keeps the pointer inside the circular wheel', () => {
    const position = wheelPointerPosition({ h: 0, s: 100, l: 50 }, 200);
    expect(position.left).toBeCloseTo(200);
    expect(position.top).toBeCloseTo(100);
  });
});
