import { useMemo } from 'react';
import { GRAYS, sampleTrainSurface, type Layout3DConfig, type Paint } from './layout3d';
import { referencePoint, sideAngle, REFERENCE_LENGTH_SCALE, REFERENCE_DOORS, REFERENCE_WINDOWS } from './referenceTrainProfile';
import { bodyPoint } from './trainGeometry';

// Common side projection; coverage comes from the actual paint sampler.
export default function PaintFormPreview({ config }: { config: Layout3DConfig }) {
  const isReference = config.model === 'reference-train-v2';
  const paths = useMemo(() => {
    const groups = new Map<Paint, string[]>();
    const pointAt = (x: number, angle: number) => isReference ? referencePoint(x, angle) : bodyPoint(x, angle, x < 0);
    const project = (point: [number, number, number]) => `${(12 + (point[0] / (isReference ? REFERENCE_LENGTH_SCALE : 1) + 15) * 10.2).toFixed(2)},${(76 - point[1] * 16).toFixed(2)}`;
    const nx = 180;
    const lineWidth = { thin: .055, medium: .085, wide: .12 }[config.waist.width];
    const angles = Array.from({ length: 43 }, (_, j) => Math.PI * j / 42);
    for (const y of [1.18, 1.52, 2.05, 2.2, 3.05, 3.63 - .58 / 3,
      ...[1.72, 1.92].flatMap(center => [center - lineWidth / 2, center + lineWidth / 2])]) {
      angles.push(sideAngle(5, y));
    }
    angles.sort((a, b) => a - b);
    for (let i = 0; i < nx; i++) {
      const x0 = -15 + 30 * i / nx, x1 = -15 + 30 * (i + 1) / nx;
      if (Math.abs((x0 + x1) / 2) < .35) continue;
      let runStart = 0, previous: Paint | undefined;
      const append = (paint: Paint, start: number, end: number) => {
        const path = `M${project(pointAt(x0, start))}L${project(pointAt(x1, start))}L${project(pointAt(x1, end))}L${project(pointAt(x0, end))}Z`;
        if (!groups.has(paint)) groups.set(paint, []);
        groups.get(paint)!.push(path);
      };
      for (let j = 0; j < angles.length - 1; j++) {
        const center = pointAt((x0 + x1) / 2, (angles[j] + angles[j+1]) / 2);
        const { paint } = sampleTrainSurface(config, (x0 + x1) / 2, center[1], center[2]);
        if (previous && paint !== previous) { append(previous, runStart, angles[j]); runStart = angles[j]; }
        previous = paint;
      }
      if (previous) append(previous, runStart, Math.PI);
    }
    return [...groups].map(([paint, parts]) => ({ paint, d: parts.join('') }));
  }, [config, isReference]);
  return <svg className="layout3d-form-preview" data-model={config.model} viewBox="0 0 330 88" aria-hidden="true" focusable="false">
    <rect width="330" height="88" rx="10" fill="#f0f1f4" />
    {paths.map(({ paint, d }) => <path key={paint} d={d} fill={paint === 'body' ? '#fff' : GRAYS[paint]} stroke={paint === 'body' ? '#fff' : GRAYS[paint]} strokeWidth=".18" />)}
    {isReference && <g data-reference-details="true">
    {REFERENCE_WINDOWS.map(x => <rect key={x} x={12 + (x + 15) * 10.2 - 3.4} y="29.4" width="6.8" height="6.6" rx="1.2" fill="#252a30" />)}
    {REFERENCE_DOORS.map(x => <rect key={x} x={12 + (x + 15) * 10.2 - 2.8} y="26" width="5.6" height="31" rx="1.5" fill="none" stroke="#81858b" strokeWidth=".65" />)}
    <path d="M22 44 Q30 28 54 21 L48 26 Q33 30 22 44Z" fill="#252a30" />
    </g>}
    {(isReference ? [-11.5, -2.3, 2.35, 12.9] : [-7.675, -2.775, 2.825, 12.125]).map(x => <g key={x} fill="#555961"><rect x={12+(x+15)*10.2-7} y="63" width="14" height="3" rx="1" /><circle cx={12+(x+15)*10.2-4} cy="67" r="2.8" /><circle cx={12+(x+15)*10.2+4} cy="67" r="2.8" /></g>)}
  </svg>;
}
