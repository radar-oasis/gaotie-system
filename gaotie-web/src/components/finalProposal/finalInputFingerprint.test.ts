import { describe, expect, it } from "vitest";
import { buildFinalInputFingerprint } from "./finalInputFingerprint";
import type { FinalDesignPackage } from "./finalProposalTypes";
import { defaultLayout3D } from '../layout3d/layout3d';

const basePackage: FinalDesignPackage = {
  demandTags: [{ label: "速度感", topic: "气质" }],
  selectedPatterns: [
    {
      id: "pattern-1",
      name: "龙纹",
      imageUrl: "images/dragon.png",
      dynasty: "唐代",
      description: "龙纹意象",
    },
  ],
  selectedCases: [
    {
      id: "case-1",
      title: "CR400BF",
      image: "样本图片/L12.png",
      userDescription: "参考CR标识位置",
    },
  ],
  layoutScheme: {
    id: "layout-1",
    name: "方案1",
    componentsMap: { 车窗带: "A2" },
  },
  colorScheme: {
    id: "color-1",
    name: "色彩方案1",
    layoutSchemeId: "layout-1",
    regions: [
      {
        id: "region-window",
        name: "车窗带",
        color: "#d5492a",
        componentId: "A2",
      },
    ],
    palette: ["#d5492a"],
    createdAt: "2026-05-27T00:00:00.000Z",
  },
  canvasAssets: [
    {
      id: "capture-1",
      name: "截取 1",
      imageUrl: "data:image/png;base64,AAA",
      source: "capture",
    },
  ],
};

describe("buildFinalInputFingerprint", () => {
  it('changes for each 3D mask change and keeps the saved object immutable', () => {
    const config = defaultLayout3D();
    const pkg: FinalDesignPackage = { ...basePackage, layoutScheme: { id: 'three', name: '3d', componentsMap: {}, layout3d: { config, views: [{ view: 'side', imageUrl: '/saved.png' }] } } };
    const before = buildFinalInputFingerprint(pkg);
    const variants = [
      { ...config, skirt: true }, { ...config, roofSide: 'wide' as const }, { ...config, lowerSide: 'narrow' as const },
      { ...config, nose: 'front' as const }, { ...config, doors: 'full' as const },
      { ...config, windowBand: { mode: 'short' as const, crossDoors: true } },
      { ...config, waist: { ...config.waist, mode: 'double' as const } },
    ];
    variants.forEach(next => expect(buildFinalInputFingerprint({ ...pkg, layoutScheme: { ...pkg.layoutScheme!, layout3d: { ...pkg.layoutScheme!.layout3d!, config: next } } })).not.toBe(before));
    expect(config).toEqual(defaultLayout3D());
  });
  it("is stable for the same semantic final inputs", () => {
    const renamedPackage: FinalDesignPackage = {
      ...basePackage,
      layoutScheme: {
        id: "layout-renamed",
        name: "重命名方案",
        componentsMap: { 车窗带: "A2" },
      },
      colorScheme: basePackage.colorScheme
        ? {
            ...basePackage.colorScheme,
            id: "color-renamed",
            name: "重命名色彩",
            createdAt: "2026-05-27T10:00:00.000Z",
          }
        : undefined,
    };

    expect(buildFinalInputFingerprint(basePackage, ["ref-a.png"])).toBe(
      buildFinalInputFingerprint(renamedPackage, ["ref-a.png"]),
    );
  });

  it("changes when selected reference images change", () => {
    expect(buildFinalInputFingerprint(basePackage, ["ref-a.png"])).not.toBe(
      buildFinalInputFingerprint(basePackage, ["ref-b.png"]),
    );
  });

  it("changes when layout or color constraints change", () => {
    expect(buildFinalInputFingerprint(basePackage, [])).not.toBe(
      buildFinalInputFingerprint(
        {
          ...basePackage,
          layoutScheme: {
            id: "layout-1",
            name: "方案1",
            componentsMap: { 车窗带: "A3" },
          },
        },
        [],
      ),
    );

    expect(buildFinalInputFingerprint(basePackage, [])).not.toBe(
      buildFinalInputFingerprint(
        {
          ...basePackage,
          colorScheme: basePackage.colorScheme
            ? {
                ...basePackage.colorScheme,
                regions: [
                  {
                    id: "region-window",
                    name: "车窗带",
                    color: "#1d4ed8",
                    componentId: "A2",
                  },
                ],
              }
            : undefined,
        },
        [],
      ),
    );
  });
});
it('ignores newly added unselected material but distinguishes selected identities sharing a URL',()=>{
 const selected={...basePackage,selectedReferenceAssetIds:['capture-1']};
 const more={...selected,canvasAssets:[...basePackage.canvasAssets!,{...basePackage.canvasAssets![0],id:'second'}]};
 const urls=['data:image/png;base64,AAA'];
 expect(buildFinalInputFingerprint(selected,urls)).toBe(buildFinalInputFingerprint(more,urls));
 expect(buildFinalInputFingerprint(more,urls)).not.toBe(buildFinalInputFingerprint({...more,selectedReferenceAssetIds:['second']},urls));
});
