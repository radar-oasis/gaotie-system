import { PromptComposerService } from './prompt-composer.service';
import { FinalDesignPackage } from './final-proposals.types';

const designPackage: FinalDesignPackage = {
  demandTags: [
    { label: '冰雪蓝渐变', topic: '色彩' },
    { label: '速度感', topic: '气质' },
  ],
  selectedPatterns: [
    {
      id: 'pattern-1',
      name: '雪花纹样',
      imageUrl: 'https://assets.example.com/snow.png',
      description: '六角雪花纹，适合表达寒地文化',
    },
  ],
  selectedCases: [
    {
      id: 'case-1',
      title: 'CR400BF-Z',
      image: 'https://assets.example.com/train.png',
      userDescription: '参考案例中的车窗带连续布局和车头速度线',
    },
  ],
  layoutScheme: {
    id: 'layout-1',
    name: '流线基础方案',
    componentsMap: {
      车窗带: '连续深色窗带',
      车门: '弱化车门边界',
    },
  },
  colorScheme: {
    id: 'color-1',
    name: '冰雪蓝方案',
    regions: [
      {
        id: 'region-1',
        name: '车身主色',
        color: '#E0F2FE',
        colorName: '浅冰蓝',
        description: '作为大面积底色，保持清爽轻盈',
      },
      {
        id: 'region-2',
        name: '车窗带',
        color: '#1D4ED8',
        colorName: '深海蓝',
        description: '强化横向速度感',
        category: '车窗带',
        componentId: '连续深色窗带',
      },
    ],
    palette: ['#E0F2FE', '#1D4ED8'],
  },
  canvasAssets: [
    {
      id: 'capture-1',
      name: '车身雪花布局草图',
      imageUrl: 'data:image/png;base64,Y2FwdHVyZQ==',
      source: 'capture',
    },
  ],
};

describe('PromptComposerService', () => {
  const originalDisableAutoPrompt =
    process.env.FINAL_PROPOSAL_DISABLE_AUTO_PROMPT;

  afterEach(() => {
    if (originalDisableAutoPrompt === undefined) {
      delete process.env.FINAL_PROPOSAL_DISABLE_AUTO_PROMPT;
    } else {
      process.env.FINAL_PROPOSAL_DISABLE_AUTO_PROMPT =
        originalDisableAutoPrompt;
    }
  });

  it('composes a final train livery generation prompt from the full design package', () => {
    const service = new PromptComposerService();

    const prompt = service.composeGeneratePrompt({
      designPackage,
      userPrompt: '整体更偏科技感',
    });

    expect(prompt).toContain('高速动车/高铁列车侧视涂装效果图');
    expect(prompt).toContain('保持列车比例、车窗、车门、车头结构清晰');
    expect(prompt).toContain('色彩-冰雪蓝渐变');
    expect(prompt).toContain('气质-速度感');
    expect(prompt).toContain('雪花纹样');
    expect(prompt).toContain('案例参考信息将作为生图需求');
    expect(prompt).toContain('参考案例中的车窗带连续布局和车头速度线');
    expect(prompt).toContain('内部配置编号仅用于匹配参考图');
    expect(prompt).toContain('不要把 A2、C1、D1 等编号或色值文字绘制在车身上');
    expect(prompt).toContain('请按布局参考图理解区域位置');
    expect(prompt).toContain('色彩必须按区域执行');
    expect(prompt).toContain('案例图片仅参考标识、线条、图案所在位置与比例');
    expect(prompt).toContain('若用户描述中提到 CR 标识位置');
    expect(prompt).toContain('按色彩方案着色后的布局参考图');
    expect(prompt).toContain('车身主色：#E0F2FE 浅冰蓝');
    expect(prompt).toContain('车窗带：#1D4ED8 深海蓝');
    expect(prompt).toContain('车身雪花布局草图');
    expect(prompt).toContain('整体更偏科技感');
  });

  it('temporarily disables automatic final proposal prompt composition', () => {
    process.env.FINAL_PROPOSAL_DISABLE_AUTO_PROMPT = 'true';
    const service = new PromptComposerService();

    const prompt = service.composeGeneratePrompt({
      designPackage,
      userPrompt: '只按参考图自由生成',
    });

    expect(prompt).toBe('只按参考图自由生成');
    expect(prompt).not.toContain('高速动车/高铁列车侧视涂装效果图');
    expect(prompt).not.toContain('设计目标');
    expect(prompt).not.toContain('冰雪蓝渐变');
  });

  it('uses a minimal fallback when automatic final proposal prompts are disabled and no user prompt is provided', () => {
    process.env.FINAL_PROPOSAL_DISABLE_AUTO_PROMPT = 'true';
    const service = new PromptComposerService();

    const prompt = service.composeGeneratePrompt({
      designPackage,
    });

    expect(prompt).toBe('根据参考图生成效果图。');
  });

  it('composes an iteration prompt that rechecks the package constraints', () => {
    const service = new PromptComposerService();

    const prompt = service.composeIterationPrompt({
      designPackage,
      instruction: '车头雪花图案缩小一点，车窗带加深蓝色',
    });

    expect(prompt).toContain('基于上一版效果图进行局部调整');
    expect(prompt).toContain('尽量保持整体方案一致');
    expect(prompt).toContain('重新核对并执行设计输入');
    expect(prompt).toContain(
      '用户微调指令不能覆盖基础布局、色彩和案例标识位置约束',
    );
    expect(prompt).toContain('车头雪花图案缩小一点，车窗带加深蓝色');
    expect(prompt).toContain('冰雪蓝方案');
  });
});
