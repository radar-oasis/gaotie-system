/** Graph semantics only; the saved layout configuration remains unchanged. */
export function layoutRegions(
  layout: Record<string, any>,
): { id: string; label: string }[] {
  const config = layout.layout3d?.config;
  if (!config || config.version !== 1) {
    return Object.entries(layout.componentsMap ?? {}).flatMap(([id, value]) =>
      typeof value === 'string' &&
      value.trim() &&
      !['none', 'inherit', '不涂装'].includes(value)
        ? [{ id, label: `${id}：${value}` }]
        : [],
    );
  }
  const regions: { id: string; label: string }[] = [];
  const add = (
    id: string,
    region: string,
    value: unknown,
    labels: Record<string, string>,
    suffix = '',
  ) => {
    if (typeof value === 'string' && labels[value])
      regions.push({ id, label: `${region}：${labels[value]}${suffix}` });
  };
  const crossing = (value: unknown) =>
    value === true ? '跨越车门' : '避让车门';
  add(
    'windowBand',
    '车窗带',
    config.windowBand?.mode,
    { long: '连贯型', short: '分段型' },
    `（${crossing(config.windowBand?.crossDoors)}）`,
  );
  add('doors', '车门', config.doors, {
    full: '整体独立涂装',
    upper: '上部独立涂装',
    white: '独立留白',
  });
  const width =
    ({ thin: '细', medium: '中', wide: '宽' } as Record<string, string>)[
      config.waist?.width
    ] ?? '未记录宽度';
  add(
    'waist',
    '腰线',
    config.waist?.mode,
    { single: '单线', double: '双线' },
    `（${width}；${crossing(config.waist?.crossDoors)}）`,
  );
  add('nose', '流线型头部', config.nose, {
    full: '整体涂装',
    upper: '上部涂装',
    lower: '下部涂装',
    front: '仅正面涂装',
  });
  add('roofSide', '车顶过渡区', config.roofSide, {
    narrow: '窄幅',
    wide: '宽幅',
  });
  add('lowerSide', '窗下侧墙', config.lowerSide, {
    narrow: '窄幅',
    wide: '宽幅',
  });
  if (config.skirt === true)
    regions.push({ id: 'skirt', label: '裙板：覆盖涂装' });
  return regions;
}
