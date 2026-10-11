import * as THREE from 'three';
import { GRAYS, REGIONS, sampleTrainSurface, type Layout3DConfig, type Region } from './layout3d';
import { buildReferenceTrain } from './referenceTrainGeometry';
import { REFERENCE_LENGTH_SCALE } from './referenceTrainProfile';

export function bodyPoint(x: number, angle: number, head: boolean): [number, number, number] {
  const t = head ? Math.min(1, Math.max(0, (x + 15) / 4.7)) : 1;
  const smooth = Math.sin(t * Math.PI / 2);
  const width = .045 + 1.455 * smooth;
  const height = .045 + 1.385 * smooth;
  const center = 1.42 + .78 * smooth;
  const c = Math.cos(angle), s = Math.sin(angle);
  return [x, center + height * Math.sign(c) * Math.pow(Math.abs(c), .55), width * Math.sign(s) * Math.pow(Math.abs(s), .55)];
}

function createBody(start: number, end: number, head: boolean, config: Layout3DConfig, highlight?: Region): THREE.Mesh {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  // Include mask boundaries in the cross-section. Uniform angular tessellation
  // alone can miss thin lines or interpolate two painted rows into one block.
  const lineWidth = { thin: .055, medium: .085, wide: .12 }[config.waist.width];
  const boundaries = [1.18, 1.23, 1.52, 2.05, 2.2, 2.38, 2.42, 2.85, 3.05, 3.1, 3.63 - .58 / 3,
    ...[1.72, 1.92].flatMap(y => [y - lineWidth / 2, y + lineWidth / 2])];
  const angles = Array.from({ length: 97 }, (_, j) => j * Math.PI * 2 / 96);
  for (const y of [1.72, 1.82, 1.92, ...boundaries.flatMap(y => [y - .002, y + .002])]) {
    const normalized = (y - 2.2) / 1.43;
    const angle = Math.acos(Math.sign(normalized) * Math.pow(Math.abs(normalized), 1 / .55));
    angles.push(angle, 2 * Math.PI - angle);
  }
  angles.sort((a, b) => a - b);
  const nx = 380, nr = angles.length - 1;
  const palette = Object.fromEntries(Object.entries(GRAYS).map(([key, value]) => [key, new THREE.Color(value)])) as Record<string, THREE.Color>;
  const highlightColor = new THREE.Color('#93bdd0');
  for (let i = 0; i <= nx; i++) {
    const x = start + (end - start) * i / nx;
    for (let j = 0; j <= nr; j++) {
      const point = bodyPoint(x, angles[j], head);
      positions.push(...point);
      const sampled = sampleTrainSurface(config, ...point);
      const color = palette[sampled.paint].clone();
      if (sampled.region === highlight && !['glass', 'lamp', 'seam'].includes(sampled.paint)) color.lerp(highlightColor, .45);
      colors.push(color.r, color.g, color.b);
      if (i < nx && j < nr) {
        const a = i * (nr + 1) + j, b = a + nr + 1;
        indices.push(a, a + 1, b + 1, a, b + 1, b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .64, metalness: .08, side: THREE.DoubleSide }));
  mesh.name = head ? '头车' : '普通车厢'; mesh.userData.trainBody = true;
  return mesh;
}

export function buildTrain(config: Layout3DConfig, highlight?: Region): THREE.Group {
  if (config.model === 'reference-train-v2') return buildReferenceTrain(config, highlight);
  const group = new THREE.Group();
  group.add(createBody(-15, -.35, true, config, highlight), createBody(.35, 15, false, config, highlight));
  const dark = new THREE.MeshStandardMaterial({ color: '#353b43', roughness: .85 });
  for (const x of [-8.2, -7.15, -3.3, -2.25, 2.3, 3.35, 11.6, 12.65]) {
    for (const z of [-1.08, 1.08]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .23, 20), dark);
      wheel.rotation.x = Math.PI / 2; wheel.position.set(x, .48, z); group.add(wheel);
    }
  }
  for (const x of [-5, 7.3]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(10, .24, 2.35), dark);
    base.position.set(x, .67, 0); group.add(base);
  }
  const connection = new THREE.Mesh(new THREE.BoxGeometry(.64, 2.4, 2.2), dark);
  connection.position.set(0, 2, 0); group.add(connection);
  // Flat rear bulkheads close each carriage; the tiny front end closes the nose.
  for (const x of [-.35, .35, 15]) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(.025, 2.65, 2.72), new THREE.MeshStandardMaterial({ color: '#e1e3e4', roughness: .7 }));
    cap.position.set(x, 2.2, 0); group.add(cap);
  }
  return group;
}

export function disposeTrain(group: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  group.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    }
  });
  materials.forEach(material => material.dispose());
}

/** Call on an unhighlighted build. Cache selection masks for the mesh lifetime. */
export function updateTrainHighlight(group: THREE.Group, config: Layout3DConfig, region?: Region) {
  const tint = new THREE.Color('#90aec0');
  const selected = region ? REGIONS.findIndex(r=>r.id===region) : -1;
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh) || !object.userData.trainBody) return;
    const colors = object.geometry.getAttribute('color') as THREE.BufferAttribute;
    const positions = object.geometry.getAttribute('position');
    if (!object.userData.selectionCache) {
      const masks = new Int8Array(positions.count);
      for (let i=0;i<positions.count;i++) {
        const sample = sampleTrainSurface(config, positions.getX(i)/(config.model === 'reference-train-v2' ? REFERENCE_LENGTH_SCALE : 1),positions.getY(i),positions.getZ(i));
        masks[i] = ['glass','lamp','seam'].includes(sample.paint) ? -2 : REGIONS.findIndex(r=>r.id===sample.region);
      }
      object.userData.selectionCache = { base: new Float32Array(colors.array), masks };
    }
    const { base, masks } = object.userData.selectionCache as { base: Float32Array; masks: Int8Array };
    for (let i=0;i<colors.count;i++) {
      const strength = selected >= 0 && masks[i] === selected ? .25 : 0;
      colors.setXYZ(i,base[i*3]*(1-strength)+tint.r*strength,base[i*3+1]*(1-strength)+tint.g*strength,base[i*3+2]*(1-strength)+tint.b*strength);
    }
    colors.needsUpdate = true;
  });
}
