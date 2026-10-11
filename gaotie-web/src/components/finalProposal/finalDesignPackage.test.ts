import { describe, expect, it } from 'vitest';
import { buildDefaultReferenceSelection, summarizePackageCompleteness } from './finalDesignPackage';
import { defaultLayout3D } from '../layout3d/layout3d';

describe('finalDesignPackage helpers', () => {
  it('leaves transformed layers unselected by default for 3D', () => {
    expect(buildDefaultReferenceSelection({ demandTags: [], selectedCases: [], selectedPatterns: [],
      layoutScheme: { id: '3d', name: '3d', componentsMap: {}, layout3d: { config: defaultLayout3D(), views: [] } },
      canvasAssets: [{ id: 'ai-1', name: '转化纹样', source: 'layer', imageUrl: '/generated.png' }],
    })).toEqual([]);
  });
  it('leaves all screenshots unselected by default', () => {
    expect(buildDefaultReferenceSelection({demandTags:[],selectedCases:[],selectedPatterns:[],canvasAssets:Array.from({length:7},(_,i)=>({id:String(i),name:'截图',source:'capture' as const,imageUrl:`/${i}.png`}))})).toHaveLength(0);
  });
  it('leaves canvas captures unselected by default', () => {
    const urls = buildDefaultReferenceSelection({
      demandTags: [{ label: '冰雪蓝' }],
      selectedPatterns: [
        {
          id: 'pattern-1',
          name: '雪花',
          imageUrl: 'https://assets.example.com/pattern.png',
          dynasty: '',
          description: '',
        },
      ],
      selectedCases: [
        {
          id: 'case-1',
          title: 'CR400BF',
          image: 'https://assets.example.com/case.png',
        },
      ],
      canvasAssets: [
        {
          id: 'capture-1',
          name: '画布截取',
          imageUrl: 'data:image/png;base64,YQ==',
          source: 'capture',
        },
        {
          id: 'layer-1',
          name: '画布图层',
          imageUrl: 'data:image/png;base64,layer',
          source: 'layer',
        },
      ],
      selectedReferenceImageUrls: [],
    });

    expect(urls).toEqual([]);
  });

  it('summarizes package completeness for the left pipeline checklist', () => {
    const completeness = summarizePackageCompleteness({
      demandTags: [{ label: '冰雪蓝' }],
      selectedPatterns: [],
      selectedCases: [],
      colorScheme: {
        id: 'color-1',
        name: '冰雪蓝',
        layoutSchemeId: 'layout-1',
        regions: [],
        createdAt: '2026-05-14T00:00:00.000Z',
      },
      selectedReferenceImageUrls: [],
    });

    expect(completeness.readyCount).toBe(1);
    expect(completeness.totalCount).toBe(5);
    expect(completeness.missingLabels).not.toContain('需求目标');
    expect(completeness.missingLabels).toContain('车身布局');
    expect(completeness.missingLabels).toContain('提示图');
  });
});
