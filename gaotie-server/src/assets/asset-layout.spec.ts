import { layoutRegions } from './asset-layout';
import { buildAssetProjection } from './asset-graph.service';
const config = {
  version: 1,
  model: 'reference-train-v2',
  windowBand: { mode: 'long', crossDoors: false },
  doors: 'inherit',
  waist: { mode: 'double', width: 'thin', crossDoors: true },
  nose: 'upper',
  roofSide: 'none',
  lowerSide: 'none',
  skirt: false,
};
describe('adopted layout regions', () => {
  it('emits exactly the three adopted regions with actual form and door crossing semantics', () => {
    const regions = layoutRegions({
      layout3d: { config },
      componentsMap: { 车门: 'C1' },
    });
    expect(regions).toHaveLength(3);
    expect(regions.map((r) => r.label)).toEqual([
      '车窗带：连贯型（避让车门）',
      '腰线：双线（细；跨越车门）',
      '流线型头部：上部涂装',
    ]);
  });
  it('reflects changed configuration, includes explicit white doors but omits inherited doors', () => {
    const regions = layoutRegions({
      layout3d: {
        config: {
          ...config,
          windowBand: { mode: 'short', crossDoors: true },
          waist: { ...config.waist, mode: 'none' },
          doors: 'white',
          roofSide: 'wide',
          lowerSide: 'narrow',
          skirt: true,
        },
      },
    });
    expect(regions.map((r) => r.label)).toEqual(
      expect.arrayContaining([
        '车窗带：分段型（跨越车门）',
        '车门：独立留白',
        '车顶过渡区：宽幅',
        '窗下侧墙：窄幅',
        '裙板：覆盖涂装',
      ]),
    );
    expect(regions.some((r) => r.id === 'waist')).toBe(false);
  });
  it('preserves legacy component IDs without guessing their style and filters no-paint regions', () => {
    expect(
      layoutRegions({
        componentsMap: { 车窗带: 'A2', 车门: '不涂装', 腰线: '' },
      }),
    ).toEqual([{ id: '车窗带', label: '车窗带：A2' }]);
  });
  it('projects proposal → layout → adopted regions, with stable new keys after config changes', () => {
    const project = (c: any) =>
      buildAssetProjection('u', [
        {
          id: 'p',
          user_id: 'u',
          kind: 'proposal',
          name: '方案',
          project_id: 'proj',
          project_name: '项目',
          theme: '',
          imagery: '',
          payload: {
            packageSnapshot: {
              layoutScheme: { id: 'l', name: '布局', layout3d: { config: c } },
            },
          },
        },
      ]);
    const old = project(config),
      next = project({ ...config, nose: 'none' });
    const layout = old.nodes.find((n) => n.kind === 'layout')!;
    expect(
      old.edges.some((e) => e.source === 'asset:p' && e.target === layout.key),
    ).toBe(true);
    expect(old.nodes.filter((n) => n.kind === 'layout-region')).toHaveLength(3);
    expect(next.nodes.filter((n) => n.kind === 'layout-region')).toHaveLength(
      2,
    );
    expect(next.nodes.find((n) => n.kind === 'layout')!.key).not.toBe(
      layout.key,
    );
  });
});
