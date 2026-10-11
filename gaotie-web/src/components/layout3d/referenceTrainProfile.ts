/** Proportions reconstructed from supplied images, not engineering dimensions. */
export const REFERENCE_LENGTH_SCALE = 1.65;
export const REFERENCE_DOORS = [-8.8, 1.15, 14.3];
export const REFERENCE_WINDOWS = [-11.15, -10.05, -6.45, -5.15, -3.85, -2.65, 3.1, 4.3, 5.5, 6.7, 7.9, 9.1, 10.3, 11.5, 12.7];
// x, top, bottom, half width. Independent contours avoid a conical pointed nose.
const stations = [
  [-15, 1.10, 1.10, 0], [-14.85, 1.62, .70, .47],
  [-14.45, 1.92, .66, .86], [-13.7, 2.35, .67, 1.14],
  [-12.8, 2.95, .70, 1.37], [-11.7, 3.43, .74, 1.48],
  [-10.5, 3.62, .77, 1.50], [-9.6, 3.63, .77, 1.50], [15, 3.63, .77, 1.50],
];
export function referenceSection(x: number): { top: number; bottom: number; width: number } {
  const i = x >= stations.at(-1)![0] ? stations.length - 2 : Math.max(0, stations.findIndex((_, j) => j < stations.length - 1 && x <= stations[j + 1][0]));
  const a = stations[i], b = stations[i + 1], length = b[0] - a[0];
  const t = Math.min(1, Math.max(0, (x - a[0]) / length));
  const value = (field: number) => {
    const prev = stations[Math.max(0, i - 1)], next = stations[Math.min(stations.length - 1, i + 2)];
    const slope = (left: number[], mid: number[], right: number[]) => {
      const d1 = (mid[field] - left[field]) / (mid[0] - left[0] || 1);
      const d2 = (right[field] - mid[field]) / (right[0] - mid[0] || 1);
      return d1 * d2 <= 0 ? 0 : 2 * d1 * d2 / (d1 + d2);
    };
    // A square-root rise at the pole produces a rounded, closed tip instead of a cone.
    if (i === 0) {
      const delta = b[field] - a[field], endSlope = slope(a, b, next) * length;
      return a[field] + delta * Math.sqrt(t) + (endSlope - delta / 2) * t * (t - 1);
    }
    const m0 = slope(prev, a, b);
    const m1 = slope(a, b, next);
    return (2*t**3-3*t*t+1)*a[field]+(t**3-2*t*t+t)*length*m0+(-2*t**3+3*t*t)*b[field]+(t**3-t*t)*length*m1;
  };
  return { top: value(1), bottom: value(2), width: value(3) };
}
export function referencePoint(x: number, angle: number, offset = 0): [number, number, number] {
  const { top, bottom, width } = referenceSection(x);
  const center = (top + bottom) / 2, height = (top - bottom) / 2;
  const c = Math.cos(angle), s = Math.sin(angle);
  return [x * REFERENCE_LENGTH_SCALE, center + (height + offset) * Math.sign(c) * Math.abs(c)**.55,
    (width + offset) * Math.sign(s) * Math.abs(s)**.55];
}
export function sideAngle(x: number, y: number): number {
  const { top, bottom } = referenceSection(x);
  const n = Math.max(-1, Math.min(1, (y - (top+bottom)/2) / (Math.max(top-bottom, 1e-8)/2)));
  return Math.acos(Math.sign(n) * Math.abs(n)**(1/.55));
}

/** Rear-body height coordinate transported along the curved longitudinal shell. */
export function referenceSurfaceHeight(x: number, y: number): number {
  const { top, bottom } = referenceSection(x);
  return .77 + 2.86 * Math.max(0, Math.min(1, (y-bottom) / Math.max(top-bottom, 1e-8)));
}
export function referenceWindscreenHalfAngle(u: number): number {
  return .17 + .38 * Math.max(0, Math.sin(Math.PI*u))**.35;
}

/** Paint edges in transported height: crest beside the windscreen, then join body bands. */
export function referenceNosePaintEdges(x: number, roofSide: 'none' | 'narrow' | 'wide' = 'none', lowerSide: 'none' | 'narrow' | 'wide' = 'none'): { upper: number; lower: number; bottom: number } {
  const roofEdge = roofSide === 'narrow' ? 3.63-.58/3 : 3.05;
  const lowerEdge = lowerSide === 'narrow' ? 1.52 : 2.2;
  const interpolate = (points: [number, number][]) => {
    if (x <= points[0][0]) return points[0][1];
    for (let i=1;i<points.length;i++) {
      if (x > points[i][0]) continue;
      const [x0,y0]=points[i-1], [x1,y1]=points[i];
      const t=(x-x0)/(x1-x0), smooth=t*t*(3-2*t);
      return y0+(y1-y0)*smooth;
    }
    return points.at(-1)![1];
  };
  return {
    upper: interpolate([[-15,2.2],[-14.1,2.65],[-13.2,3.28],[-11.7,3.26],[-10.5,roofEdge]]),
    lower: interpolate([[-15,2.2],[-13.7,1.95],[-11.7,2.12],[-10.5,lowerEdge]]),
    bottom: interpolate([[-15,.77],[-12,.77],[-10.5,1.18]]),
  };
}
