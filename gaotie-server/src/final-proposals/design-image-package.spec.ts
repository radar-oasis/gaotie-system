import { buildDesignImagePackage } from './design-image-package';
import { FinalDesignPackage } from './final-proposals.types';

const pkg: FinalDesignPackage = {
  demandTags: [{ label: '速度感' }],
  selectedPatterns: [],
  canvasAssets: [
    { id: 'c', name: '白模合成', source: 'capture', imageUrl: '/capture.png' },
  ],
  layoutScheme: {
    id: 'l',
    name: 'A2方案',
    componentsMap: { 车窗带: 'A2', 车门: 'C1' },
  },
  selectedCases: [
    {
      id: 'case',
      title: '某车型',
      image: '/case.png',
      description: '无关背景',
      userDescription: '只参考金色细线，不参考车头',
    },
  ],
  colorScheme: {
    id: 'color',
    name: '配色',
    regions: [{ id: 'r', name: '车窗带', color: '#123456' }],
  },
};

describe('numbered design image package', () => {
  it('keeps canvas, every layout, case instruction and palette in matching attachment order', () => {
    const result = buildDesignImagePackage({ designPackage: pkg });
    expect(result.references.map((r) => r.role)).toEqual([
      'canvas',
      'layout',
      'layout',
      'case',
      'palette',
    ]);
    expect(result.references.map((r) => r.index)).toEqual([1, 2, 3, 4, 5]);
    expect(result.prompt).toContain('参考图 4');
    expect(result.prompt).toContain('只参考金色细线，不参考车头');
    expect(result.prompt).toContain('贯穿');
    expect(result.prompt).toContain('#123456');
    expect(result.prompt).not.toMatch(/A2|C1|A2方案/);
    expect(result.references[1].imageUrl).toContain('A2.png');
  });
  it('never silently drops references after six', () => {
    const result = buildDesignImagePackage({
      designPackage: {
        ...pkg,
        canvasAssets: Array.from({ length: 7 }, (_, i) => ({
          id: String(i),
          name: '截图',
          source: 'capture',
          imageUrl: `/${i}.png`,
        })),
      },
    });
    expect(result.references).toHaveLength(11);
    expect(result.references[9].role).toBe('case');
  });
  it('rejects excess and missing attachments before generation', () => {
    expect(() =>
      buildDesignImagePackage({
        designPackage: pkg,
        selectedReferenceImageUrls: Array.from(
          { length: 13 },
          (_, i) => `/${i}.png`,
        ),
      }),
    ).toThrow('12');
    expect(() =>
      buildDesignImagePackage({
        designPackage: {
          ...pkg,
          selectedCases: [{ ...pkg.selectedCases[0], image: '' }],
        },
      }),
    ).toThrow('案例');
  });
  it('iteration numbers the previous result first and respects explicit canvas selection', () => {
    const result = buildDesignImagePackage({
      designPackage: pkg,
      baseImageUrl: '/previous.png',
      selectedReferenceImageUrls: [],
      userPrompt: '线条再细一点',
    });
    expect(result.references[0].role).toBe('base');
    expect(result.references.some((r) => r.role === 'canvas')).toBe(false);
    expect(result.prompt).toContain('线条再细一点');
  });
});
