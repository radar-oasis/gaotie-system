import { describe, expect, it } from 'vitest';
import * as T from 'three';
import { buildReferenceTrain } from './referenceTrainGeometry';
import { defaultLayout3D, sampleTrainSurface } from './layout3d';
import { referencePoint, referenceSection, referenceSurfaceHeight, referenceNosePaintEdges, REFERENCE_LENGTH_SCALE } from './referenceTrainProfile';

describe('reference train continuous surface', () => {
  it('places mesh samples immediately on both sides of the moving paint contour', () => {
    const config=defaultLayout3D(); config.nose='upper';
    const mesh=buildReferenceTrain(config).getObjectByName('头车') as T.Mesh;
    const positions=mesh.geometry.getAttribute('position');
    const rows=new Map<number,number[]>();
    for(let i=0;i<positions.count;i++) {
      const x=positions.getX(i)/REFERENCE_LENGTH_SCALE;
      if(x < -14.8 || x > -10.5) continue;
      const heights=rows.get(x) ?? [];
      heights.push(referenceSurfaceHeight(x,positions.getY(i)));
      rows.set(x,heights);
    }
    for(const [x,heights] of rows) {
      const edge=referenceNosePaintEdges(x).upper;
      for(const delta of [-.0015,.0015]) {
        expect(Math.min(...heights.map(y=>Math.abs(y-edge-delta))), `contour at ${x}`).toBeLessThan(.00002);
      }
    }
  });
  it('closes the front shell at one finite rounded pole', () => {
    const group = buildReferenceTrain(defaultLayout3D());
    const mesh = group.getObjectByName('头车') as T.Mesh;
    const positions = mesh.geometry.getAttribute('position');
    const normals = mesh.geometry.getAttribute('normal');
    const front: T.Vector3[] = [];
    for (let i = 0; i < positions.count; i++) {
      const p = new T.Vector3().fromBufferAttribute(positions, i);
      expect(p.toArray().every(Number.isFinite)).toBe(true);
      expect(new T.Vector3().fromBufferAttribute(normals, i).toArray().every(Number.isFinite)).toBe(true);
      if (Math.abs(p.x + 15 * REFERENCE_LENGTH_SCALE) < 1e-5) front.push(p);
    }
    expect(front.length).toBeGreaterThan(0);
    expect(Math.max(...front.map(p => p.distanceTo(front[0])))).toBeLessThan(1e-5);
  });

  it('keeps every cab and passenger glazing triangle outside the curved shell', () => {
    const group = buildReferenceTrain(defaultLayout3D());
    group.traverse(object => {
      if (!(object instanceof T.Mesh) || !['驾驶室侧窗', '客窗', '车门玻璃'].includes(object.name)) return;
      const positions = object.geometry.getAttribute('position');
      const indices = object.geometry.index!;
      for (let i = 0; i < indices.count; i += 3) {
        const vertices = [0, 1, 2].map(j => new T.Vector3().fromBufferAttribute(positions, indices.getX(i+j)));
        expect(Math.max(...vertices.map((v, j) => v.distanceTo(vertices[(j+1)%3])))).toBeLessThan(.22);
        const p = vertices.reduce((sum, v) => sum.add(v), new T.Vector3()).divideScalar(3);
        const { top, bottom, width } = referenceSection(p.x / REFERENCE_LENGTH_SCALE);
        const radial = Math.abs((p.y-(top+bottom)/2)/((top-bottom)/2))**(2/.55) + Math.abs(p.z/width)**(2/.55);
        expect(radial).toBeGreaterThan(1);
      }
    });
  });

  it('carries upper and lower nose paint along the changing section and across the former cutoff', () => {
    for (const mode of ['upper', 'lower'] as const) {
      const c = defaultLayout3D(); c.nose = mode;
      const angle = mode === 'upper' ? .78 : 2.1;
      for (const x of [-14.5, -13.3, -12.1, -11.66, -11.64, -11.3]) {
        const [, y, z] = referencePoint(x, angle);
        expect(sampleTrainSurface(c, x, y, z).paint, `${mode} at ${x}`).toBe('nose');
      }
    }
  });

  it('flows upper paint into the roof without occupying the aft passenger-window band', () => {
    const c = defaultLayout3D(); c.nose = 'upper';
    for (const x of [-11.1, -10.8, -10.5, -10.2, -9.5, -5, 5]) {
      const [, y, z] = referencePoint(x, .78);
      expect(sampleTrainSurface(c, x, y, z).paint, `roof join ${x}`).toBe('nose');
      expect(sampleTrainSurface(c, x, 2.8, 1.5).paint, `window band ${x}`).toBe('body');
    }
    c.roofSide = 'narrow';
    expect(sampleTrainSurface(c, 5, 3.2, 1.5).paint).toBe('body');
    expect(sampleTrainSurface(c, 5, 3.5, .5).paint).toBe('roofSide');
  });

  it('flows lower paint to the window-belt underside and respects explicit lower-side settings', () => {
    const c = defaultLayout3D(); c.nose = 'lower';
    for (const x of [-11.1, -10.8, -10.5, -10.2, -9.5, -5, 5]) {
      expect(sampleTrainSurface(c, x, 2.1, 1.5).paint, `lower join ${x}`).toBe('nose');
      expect(sampleTrainSurface(c, x, 2.3, 1.5).paint, `below window ${x}`).toBe('body');
    }
    c.lowerSide = 'narrow';
    expect(sampleTrainSurface(c, 5, 1.7, 1.5).paint).toBe('body');
    expect(sampleTrainSurface(c, 5, 1.3, 1.5).paint).toBe('lowerSide');
  });

  it('meets narrow adjacent zones without a vertical paint cut at the head join', () => {
    const upper = defaultLayout3D(); upper.nose = 'upper'; upper.roofSide = 'narrow';
    const lower = defaultLayout3D(); lower.nose = 'lower'; lower.lowerSide = 'narrow';
    for (const x of [-10.51, -10.501, -10.5, -10.499, -10.49]) {
      expect(sampleTrainSurface(upper,x,3.2,1.3).paint, `upper gap at ${x}`).toBe('body');
      expect(sampleTrainSurface(upper,x,3.5,.7).paint, `upper path at ${x}`).toBe('roofSide');
      expect(sampleTrainSurface(lower,x,1.7,1.5).paint, `lower gap at ${x}`).toBe('body');
      expect(sampleTrainSurface(lower,x,1.3,1.5).paint, `lower path at ${x}`).toBe('lowerSide');
    }
  });

  it('extends roof and lower body paint continuously into the curved head', () => {
    const c = defaultLayout3D(); c.roofSide = 'wide'; c.lowerSide = 'wide';
    for (const x of [-14.6, -11.66, -11.64, -10.4, 5]) {
      for (const [angle, expected] of [[.8, 'roofSide'], [2.1, 'lowerSide']] as const) {
        const [, y, z] = referencePoint(x, angle);
        expect(sampleTrainSurface(c, x, y, z).paint, `${expected} at ${x}`).toBe(expected);
      }
    }
  });
});
