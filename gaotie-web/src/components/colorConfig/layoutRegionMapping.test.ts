import { describe, expect, it } from 'vitest';
import { createColorRegionsFromLayoutScheme } from './layoutRegionMapping';
import type { LayoutScheme } from '../../context/ColorConfigContext';

describe('createColorRegionsFromLayoutScheme', () => {
  it('creates color regions from the selected layout components', () => {
    const scheme: LayoutScheme = {
      id: 'layout-1',
      name: '方案1',
      componentsMap: {
        车窗带: 'A3',
        腰线: 'B2',
      },
    };

    const regions = createColorRegionsFromLayoutScheme(scheme);

    expect(regions.map((region) => region.name)).toEqual(['车身主色', '车窗带', '腰线']);
    expect(regions[1]).toEqual(
      expect.objectContaining({
        category: '车窗带',
        componentId: 'A3',
        layoutElementImageUrl: 'http://localhost:3000/layout-elements/%E8%BD%A6%E7%AA%97%E5%B8%A6/A3.png',
      }),
    );
  });
});
