import { BadRequestException } from '@nestjs/common';
import { FinalDesignPackage } from './final-proposals.types';
import { describeLayout3d, validateLayout3d } from '../layout3d';

export interface DesignImageReference {
  index: number;
  role: 'base' | 'canvas' | 'layout' | 'case' | 'palette' | 'pattern';
  label: string;
  instruction: string;
  imageUrl?: string;
}

/** The same ordered manifest drives both prompt numbering and actual attachments. */
export function buildDesignImagePackage(input: {
  designPackage: FinalDesignPackage;
  selectedReferenceImageUrls?: string[];
  baseImageUrl?: string;
  userPrompt?: string;
}): { references: DesignImageReference[]; prompt: string } {
  const pkg = input.designPackage;
  const layout3d = pkg.layoutScheme?.layout3d;
  if (layout3d) validateLayout3d(layout3d);
  const references: DesignImageReference[] = [];
  const add = (
    role: DesignImageReference['role'],
    label: string,
    instruction: string,
    imageUrl?: string,
  ) => {
    if (role !== 'palette' && !imageUrl?.trim())
      throw new BadRequestException(
        `${label}缺少图片，请回到相应阶段补充后再生成`,
      );
    references.push({
      index: references.length + 1,
      role,
      label,
      instruction,
      imageUrl,
    });
  };
  if (input.baseImageUrl)
    add(
      'base',
      '上一版效果',
      '以此图为微调基底，仅调整本次要求，保持其他已确定设计。',
      input.baseImageUrl,
    );
  const canvasCaptures = (pkg.canvasAssets ?? []).filter(a => a.source === 'capture');
  const captures = input.selectedReferenceImageUrls ??
    (canvasCaptures.length || !layout3d ? canvasCaptures : pkg.canvasAssets ?? []).map(a => a.imageUrl);
  if (layout3d && !captures.length && pkg.selectedPatterns?.length) {
    throw new BadRequestException('3D 方案已选择纹样，但缺少已转化纹样图片。请先生成纹样并加入画布，或选择包含已转化纹样的截图；不会用原始纹样替代。');
  }
  for (const imageUrl of [...new Set(captures)]) {
    add(
      'canvas',
      '画布构图',
      layout3d ? '这是用户选中的已转化纹样图片或画布构图截图。保留纹样身份、朝向、相对比例和相对构图；大色块与保存三维布局冲突时按三维布局适配位置。消除选框和拼贴痕迹，不退回原始纹样。' : '这是用户将已转化纹样放在车辆白模上的合成截图。保留车辆外形、视角、纹样身份、位置、朝向和相对比例；消除画布选框、控制点及拼贴痕迹，将纹样融入真实车身涂装。',
      imageUrl,
    );
  }
  for (const [category, componentId] of Object.entries(
    layout3d ? {} : pkg.layoutScheme?.componentsMap ?? {},
  )) {
    if (
      !category.trim() ||
      typeof componentId !== 'string' ||
      !componentId.trim()
    )
      throw new BadRequestException('布局选项不完整，请重新选择');
    add(
      'layout',
      `${category}布局`,
      `只提取${category}的结构形态与位置，不照搬整幅素材。${category.includes('车窗带') ? '必须在车窗区域形成沿车身纵向连续贯穿的车窗带，不能只画孤立窗口；带形轮廓以此参考图为准。' : '将选定部件结构应用到车辆对应区域。'} 图中任何编号、文字、图例和标注均不是涂装内容，不得出现在结果中。`,
      `/layout-elements/${encodeURIComponent(category)}/${encodeURIComponent(componentId)}.png`,
    );
  }
  for (const view of layout3d?.views ?? []) {
    add('layout', `三维布局 ${view.view}`, pkg.colorScheme
      ? '已保存布局的灰度区域遮罩，约束大色块边界与留白；灰度不是最终颜色，保持门窗结构。'
      : '已保存布局的灰度区域遮罩，约束大色块边界与留白；未选择配色时默认保持黑白灰布局，本次明确文字颜色要求优先，保持门窗结构。', view.imageUrl);
  }
  for (const ref of pkg.selectedCases ?? []) {
    add(
      'case',
      '涂装案例',
      `此图仅为风格借鉴，不得替换白模车型或覆盖已确定布局。用户具体参考意图：${ref.userDescription?.trim() || ref.description?.trim() || '仅借鉴线条组织、留白和整体涂装质感，不复制标识。'}`,
      ref.image,
    );
  }
  if (!layout3d && !captures.length) {
    for (const ref of pkg.selectedPatterns ?? [])
      add(
        'pattern',
        '纹样素材',
        `用于车身装饰的${ref.name}纹样，保留其可识别特征，不改变车辆结构。`,
        ref.imageUrl,
      );
  }
  const colors = [
    ...(pkg.colorScheme?.regions ?? []).map((r) => r.color),
    ...(pkg.colorScheme?.palette ?? []),
  ];
  if (colors.some((c) => /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)))
    add(
      'palette',
      '配色色卡',
      pkg.colorScheme?.mode === 'reference'
        ? '这是整体配色参考，不是布局或区域上色指令。不要绘制色块、色卡边框或图例；主辅色关系参照文字，用户本次明确的颜色要求优先。'
        : '仅提取此图颜色，不要绘制色块、色卡边框或图例。具体区域配色以文字说明为准。',
    );
  if (references.length > 12)
    throw new BadRequestException(
      `设计包共 ${references.length} 张参考图，超过 12 张上限；请减少截图或案例，系统不会自动丢弃布局图片。`,
    );
  if (!references.length)
    throw new BadRequestException(
      '设计包没有可用参考图片，请先添加画布截图或布局、案例图片',
    );
  const lines = [
    '请调用内置图像生成工具，依据以下完整设计包生成一张高质量列车整车涂装效果图。所有附件是参考图片，不是独立待生成任务。',
    `本次实际附件共 ${references.length} 张，以下编号严格对应上传顺序。`,
    ...references.map(
      (r) => `参考图 ${r.index}【${r.label}】：${r.instruction}`,
    ),
    `文化与设计需求：${(pkg.demandTags ?? []).map((t) => t.label).join('、') || '以设计包为准'}。`,
    layout3d ? describeLayout3d(layout3d, Boolean(pkg.colorScheme)) : '',
    `纹样语义：${(pkg.selectedPatterns ?? []).map((p) => [p.name, p.description].filter(Boolean).join('：')).join('；') || '以画布截图为准'}。`,
    layout3d && !pkg.colorScheme
      ? '未选择配色：默认保持黑白灰布局，本次明确文字颜色要求优先；不从案例或纹样图片中自行引入颜色。'
      : pkg.colorScheme?.mode === 'reference'
      ? `整体配色参考：${pkg.colorScheme.name}。${(pkg.colorScheme.colorRoles ?? []).map(c=>`${c.role} ${c.hex} 建议${c.proportion}%`).join('；')}。候选色板 ${(pkg.colorScheme.palette ?? []).join('、')}。${pkg.colorScheme.rationale || ''}。比例为设计建议，非面积测量，不指定部位上色。`
      : `区域配色：${(pkg.colorScheme?.regions ?? []).map((r) => `${r.category || r.name}使用${r.color}${r.description ? `（${r.description}）` : ''}`).join('；') || '以参考图为准'}。`,
    layout3d ? `已保存三维布局优先约束大色块。纹样身份和相对构图来自选中的已转化参考；${pkg.colorScheme ? '配色仍按用户颜色要求与所选配色方案执行' : '未选择配色时默认保持黑白灰布局，本次明确文字颜色要求优先；不从案例或纹样图片中自行引入颜色'}。案例不能覆盖这些约束。` : pkg.colorScheme?.mode === 'reference' || !pkg.colorScheme
      ? '冲突处理：车辆外形与纹样位置以画布截图为准，选定布局图约束结构；用户本次明确的颜色要求优先，冲突时调整参考色板，不混用冲突色系。案例颜色不能覆盖用户选择。微调时以当前版本为基底。'
      : '冲突处理：车辆外形与纹样位置以画布截图为准，选定布局图约束相应结构，区域色彩以配色文字为准，案例仅影响明确要求借鉴的细节。微调时以当前版本为基底。',
    `本次用户补充：${input.userPrompt?.trim() || '无额外修改要求'}。`,
    '仅输出完整清晰的车辆效果图，保持车身比例和车窗车门轮组结构，纹样与曲面光照自然融合。不输出拼图、说明文字、水印、布局编号、字母数字标签、选择框、操作界面或参考图清单。除用户明确要求的真实车身标识外，不绘制文字。',
  ];
  // Internal component IDs identify files, never positive visual requirements.
  let prompt = lines.join('\n\n');
  for (const id of Object.values(pkg.layoutScheme?.componentsMap ?? {})) {
    if (id) prompt = prompt.split(id).join('所选布局');
  }
  if (prompt.length > 24000)
    throw new BadRequestException(
      '设计说明过长，请精简案例说明和补充要求后重试',
    );
  return { references, prompt };
}
