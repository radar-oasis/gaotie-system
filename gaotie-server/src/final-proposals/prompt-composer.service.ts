import { Injectable } from '@nestjs/common';
import { describeLayout3d } from '../layout3d';
import {
  FinalDesignPackage,
  GenerateFinalProposalInput,
  IterateFinalProposalInput,
} from './final-proposals.types';

@Injectable()
export class PromptComposerService {
  composeGeneratePrompt(input: GenerateFinalProposalInput): string {
    const extra = input.userPrompt?.trim();

    if (isAutoGeneratePromptDisabled() && !input.designPackage.layoutScheme?.layout3d) {
      return extra || '根据参考图生成效果图。';
    }

    const sections = this.composeBaseSections(input.designPackage);

    return [
      '请生成一张高速动车/高铁列车侧视涂装效果图。',
      '保持列车比例、车窗、车门、车头结构清晰，不改变基础车型结构。',
      '重要：内部配置编号仅用于匹配参考图，不是涂装文字；不要把 A2、C1、D1 等编号或色值文字绘制在车身上。',
      ...sections,
      extra ? `用户额外要求：${extra}` : undefined,
      '输出要求：专业工业设计效果图，干净浅色背景，高清侧视图，可用于方案汇报，不要出现多余文字、水印和复杂环境。',
    ]
      .filter((section): section is string => Boolean(section))
      .join('\n');
  }

  composeIterationPrompt(input: IterateFinalProposalInput): string {
    const sections = this.composeBaseSections(input.designPackage);

    return [
      '基于上一版效果图进行局部调整，尽量保持整体方案一致。',
      input.designPackage.colorScheme?.mode === 'reference'
        ? '必须重新核对设计输入；布局和案例标识约束保持，色板是整体配色参考，用户本次明确的颜色要求优先。'
        : '必须重新核对并执行设计输入；用户微调指令不能覆盖基础布局、色彩和案例标识位置约束。',
      `用户微调指令：${input.instruction.trim()}`,
      '重要：内部配置编号仅用于匹配参考图，不是涂装文字；不要把 A2、C1、D1 等编号或色值文字绘制在车身上。',
      ...sections,
      '输出要求：保留高铁侧视构图和车型比例，生成一张可用于方案对比的新版本效果图。',
    ].join('\n');
  }

  private composeBaseSections(designPackage: FinalDesignPackage): string[] {
    const demandTags = designPackage.demandTags
      .map((tag) => (tag.topic ? `${tag.topic}-${tag.label}` : tag.label))
      .join('、');
    const layoutItems = designPackage.layoutScheme
      ? Object.entries(designPackage.layoutScheme.componentsMap)
          .map(([category, value]) => `${category}：${value}`)
          .join('；')
      : '';
    const colorItems = designPackage.colorScheme?.regions
      .map((region) => {
        const colorName = region.colorName ? ` ${region.colorName}` : '';
        const description = region.description ? `，${region.description}` : '';

        return `${region.name}：${region.color}${colorName}${description}`;
      })
      .join('；');
    const patternItems = designPackage.selectedPatterns
      .map((pattern) =>
        [pattern.name, pattern.description].filter(Boolean).join('：'),
      )
      .join('；');
    const caseItems = designPackage.selectedCases
      .map((caseRef) =>
        [caseRef.title, caseRef.userDescription || caseRef.description]
          .filter(Boolean)
          .join('：'),
      )
      .join('；');
    const canvasItems = designPackage.canvasAssets
      ?.map((asset) => `${asset.name}（${asset.source}）`)
      .join('；');

    return [
      demandTags ? `设计目标：${demandTags}` : undefined,
      designPackage.layoutScheme?.layout3d
        ? describeLayout3d(designPackage.layoutScheme.layout3d, Boolean(designPackage.colorScheme))
        : designPackage.layoutScheme
        ? `基础布局：${designPackage.layoutScheme.name}。${layoutItems}。请按布局参考图理解区域位置；若提供按色彩方案着色后的布局参考图，以着色布局图为主要约束，不要把布局编号画到车身上。`
        : undefined,
      designPackage.colorScheme
        ? designPackage.colorScheme.mode === 'reference'
          ? `整体配色参考：${designPackage.colorScheme.name}。${(designPackage.colorScheme.colorRoles ?? []).map(c=>`${c.role} ${c.hex} 建议占比${c.proportion}%`).join('；')}。色板：${(designPackage.colorScheme.palette ?? []).join('、')}。${designPackage.colorScheme.rationale || ''}。比例是设计建议，不是区域指令或图片测量值；自由适配布局，不强制指定部位颜色。用户本次明确的颜色要求优先；如与参考色板冲突，以用户要求调整，不混用冲突色系。参考色卡仅用于配色，不在车体上绘制色块卡片或色值文字。`
          : `色彩方案：${designPackage.colorScheme.name}。色彩必须按区域执行：${colorItems}。参考色卡图只用于理解主色和辅色关系，不要绘制色值文字。`
        : undefined,
      patternItems
        ? `意象纹样：${patternItems}。纹样用于车身表面装饰，不改变车体结构。`
        : undefined,
      caseItems
        ? `案例参考：${caseItems}。案例参考信息将作为生图需求，案例图片仅参考标识、线条、图案所在位置与比例；若用户描述中提到 CR 标识位置，请在相同相对位置绘制小型 CR 标识；不要复刻车号、车型和无关背景文字。`
        : undefined,
      canvasItems ? `画布素材：${canvasItems}` : undefined,
    ].filter((section): section is string => Boolean(section));
  }
}

function isAutoGeneratePromptDisabled(): boolean {
  const value = process.env.FINAL_PROPOSAL_DISABLE_AUTO_PROMPT;

  return value === 'true' || value === '1' || value === 'yes';
}
