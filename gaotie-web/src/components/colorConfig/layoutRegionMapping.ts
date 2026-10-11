import type { ColorRegion, LayoutScheme } from '../../context/ColorConfigContext';
import { apiUrl } from '../../utils/backendUrls';

const DEFAULT_REGION_COLORS: Record<string, string> = {
  车身主色: '#FFFFFF',
  车窗带: '#1D4ED8',
  腰线: '#93C5FD',
  车门: '#64748B',
  裙板: '#374151',
  车顶侧: '#9CA3AF',
  车底侧: '#374151',
  下车底区: '#374151',
  车头侧: '#6B7280',
};

const CATEGORY_TO_REGION_NAME: Record<string, string> = {
  车窗带: '车窗带',
  腰线: '腰线',
  车门: '车门',
  车顶侧: '车顶侧',
  车底侧: '车底侧',
  下车底区: '下车底区',
  车头侧: '车头侧',
};

function getLayoutElementUrl(category: string, componentId: string): string {
  return apiUrl(`/layout-elements/${encodeURIComponent(category)}/${componentId}.png`);
}

function createRegionId(category: string, componentId: string): string {
  return `region_${category}_${componentId}`.replace(/\s+/g, '_');
}

export function createColorRegionsFromLayoutScheme(scheme: LayoutScheme): ColorRegion[] {
  const regions: ColorRegion[] = [
    {
      id: 'region_body',
      name: '车身主色',
      color: DEFAULT_REGION_COLORS.车身主色,
      source: 'manual',
      category: '车身主色',
    },
  ];

  for (const [category, componentId] of Object.entries(scheme.componentsMap || {})) {
    if (!componentId) continue;

    const name = CATEGORY_TO_REGION_NAME[category] || category;
    regions.push({
      id: createRegionId(category, componentId),
      name,
      color: DEFAULT_REGION_COLORS[name] || '#FFFFFF',
      source: 'manual',
      category,
      componentId,
      layoutElementImageUrl: getLayoutElementUrl(category, componentId),
      description: `${name}采用${componentId}布局，可在此补充色彩效果描述。`,
    });
  }

  return regions;
}

export function countColorableRegions(scheme: LayoutScheme): number {
  return createColorRegionsFromLayoutScheme(scheme).length;
}
