import { describe, expect, it } from 'vitest';
import { buildTrain, disposeTrain, updateTrainHighlight } from './trainGeometry';
import { defaultLayout3D, GRAYS } from './layout3d';
import { Box3, Color, Mesh } from 'three';
describe('generic train geometry', () => {
  it('updates selection colors without rebuilding the model geometry', () => {
    expect(typeof updateTrainHighlight).toBe('function');
    const config = defaultLayout3D(), train = buildTrain(config);
    const mesh = train.children.find(child=>child.userData.trainBody) as Mesh;
    const geometry = mesh.geometry, original = Array.from(geometry.getAttribute('color').array);
    updateTrainHighlight(train,config,'windowBand');
    expect(mesh.geometry).toBe(geometry);
    expect(Array.from(geometry.getAttribute('color').array)).not.toEqual(original);
    updateTrainHighlight(train,config,undefined);
    expect(Array.from(geometry.getAttribute('color').array)).toEqual(original);
    disposeTrain(train);
  });
  it('builds an elongated reference model with separately modeled details', () => {
    const c = { ...defaultLayout3D(), model: 'reference-train-v2' as const };
    const train = buildTrain(c);
    const box = new Box3().setFromObject(train);
    expect((box.max.x - box.min.x) / (box.max.z - box.min.z)).toBeGreaterThan(15);
    for (const name of ['驾驶室风挡', '客窗', '灯组', '转向架', '鼻端盖板', '门框']) expect(train.getObjectByName(name), name).toBeTruthy();
    train.traverse(object => {
      if (object instanceof Mesh) expect(Array.from(object.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
    });
    disposeTrain(train);
  });
  it('keeps legacy geometry dimensions unchanged', () => {
    const train = buildTrain({ ...defaultLayout3D(), model: 'generic-train-v1' });
    const box = new Box3().setFromObject(train);
    expect(box.max.x - box.min.x).toBeCloseTo(30.0125, 2);
    disposeTrain(train);
  });
  it('samples thin waist paint and preserves the background gap between double lines', () => {
    for (const width of ['thin', 'medium', 'wide'] as const) {
      const config = defaultLayout3D(); config.waist = { mode: 'double', width, crossDoors: false };
      const train = buildTrain(config);
      const mesh = train.children.find(child => child.name === '普通车厢') as Mesh;
      const positions = mesh.geometry.getAttribute('position'), colors = mesh.geometry.getAttribute('color');
      const samples = Array.from({ length: positions.count }, (_, i) => i).filter(i => positions.getX(i) > 5 && positions.getX(i) < 5.05 && positions.getZ(i) > 1);
      const waist = new Color(GRAYS.waist), white = new Color(GRAYS.body);
      const matches = (i: number, color: Color) => Math.abs(colors.getX(i) - color.r) < .0001;
      expect(samples.some(i => Math.abs(positions.getY(i) - 1.92) < .027 && matches(i, waist))).toBe(true);
      expect(samples.some(i => Math.abs(positions.getY(i) - 1.72) < .027 && matches(i, waist))).toBe(true);
      expect(samples.some(i => Math.abs(positions.getY(i) - 1.82) < .02 && matches(i, white))).toBe(true);
      disposeTrain(train);
    }
  });
  it('contains one head car and one regular carriage with physical depth', () => {
    const train = buildTrain(defaultLayout3D());
    const bodies = train.children.filter(child => child.userData.trainBody);
    expect(bodies.map(body => body.name)).toEqual(['头车', '普通车厢']);
    const box = new Box3().setFromObject(train);
    expect(box.max.x - box.min.x).toBeGreaterThan(29);
    expect(box.max.z - box.min.z).toBeGreaterThan(2.5);
    expect((bodies[0] as Mesh).geometry.getAttribute('color').count).toBeGreaterThan(1000);
    disposeTrain(train);
  });
});
