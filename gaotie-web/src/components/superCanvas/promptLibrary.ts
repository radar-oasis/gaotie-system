import type {
  CanvasPatternReference,
  PromptRecommendation,
  PromptTag,
  PromptTagCategory,
  SavedPromptAsset,
} from './types';

type PromptKeywordRule = {
  category: PromptTagCategory;
  id: string;
  label: string;
  keywords: string[];
};

type BuildPromptAssetInput = {
  id: string;
  promptText: string;
  sourcePatterns: CanvasPatternReference[];
  generatedImageUrl?: string;
  createdAt: string;
};

const PROMPT_KEYWORD_RULES: PromptKeywordRule[] = [
  {
    category: 'lineStyle',
    id: 'line-style:simplified',
    label: '简约线条',
    keywords: ['简约', '简洁', '简化', '极简', '更简单'],
  },
  {
    category: 'lineStyle',
    id: 'line-style:clean-lines',
    label: '线条优化',
    keywords: ['线条', '线描', '轮廓', '流畅', '走势'],
  },
  {
    category: 'lineStyle',
    id: 'line-style:fine-lines',
    label: '精细线条',
    keywords: ['精细', '细线', '细腻', '工笔'],
  },
  {
    category: 'detail',
    id: 'detail:wings',
    label: '翅膀细节',
    keywords: ['翅膀', '羽翼', '羽毛', '尾羽'],
  },
  {
    category: 'detail',
    id: 'detail:head',
    label: '头部细节',
    keywords: ['头部', '凤头', '龙头', '头冠', '面部'],
  },
  {
    category: 'layout',
    id: 'layout:symmetric',
    label: '对称构图',
    keywords: ['对称', '均衡'],
  },
  {
    category: 'layout',
    id: 'layout:continuous',
    label: '连续纹样',
    keywords: ['连续', '重复', '循环', '延展', '边饰'],
  },
  {
    category: 'style',
    id: 'style:geometric',
    label: '几何化',
    keywords: ['几何', '几何化', '块面'],
  },
  {
    category: 'style',
    id: 'style:modern',
    label: '现代转译',
    keywords: ['现代', '当代', '现代化', '科技感'],
  },
  {
    category: 'style',
    id: 'style:traditional',
    label: '传统风格',
    keywords: ['传统', '古典', '古风', '古代'],
  },
  {
    category: 'generation',
    id: 'generation:transparent',
    label: '透明底',
    keywords: ['透明', '透明底', '无背景', '白底', '纯色背景'],
  },
  {
    category: 'scene',
    id: 'scene:train-side',
    label: '车身侧面',
    keywords: ['车身', '侧面', '腰线', '车窗带', '高铁'],
  },
  {
    category: 'color',
    id: 'color:red-gold',
    label: '红金配色',
    keywords: ['红金', '金色', '红色', '朱红'],
  },
];

const CATEGORY_LABELS: Record<PromptTagCategory, string> = {
  carrier: '载体',
  color: '色彩',
  detail: '细节',
  generation: '生成控制',
  layout: '布局',
  lineStyle: '线条',
  material: '材质',
  motif: '母题',
  scene: '场景',
  style: '风格',
};

const normalizeText = (value: string): string => value.trim().replace(/\s+/g, ' ');

const createTag = (
  category: PromptTagCategory,
  rawLabel: string,
  idPrefix = category,
): PromptTag | null => {
  const label = normalizeText(rawLabel);

  if (!label) {
    return null;
  }

  return {
    category,
    id: `${idPrefix}:${label}`,
    label,
  };
};

const addUniqueTag = (tags: PromptTag[], tag: PromptTag | null): void => {
  if (!tag || tags.some((item) => item.id === tag.id)) {
    return;
  }

  tags.push(tag);
};

const patternValues = (
  patterns: CanvasPatternReference[],
  key: 'carriers' | 'materials' | 'motifs' | 'layouts',
): string[] =>
  Array.from(
    new Set(
      patterns
        .flatMap((pattern) => pattern[key] ?? [])
        .map(normalizeText)
        .filter(Boolean),
    ),
  );

export function extractPromptTags(
  promptText: string,
  sourcePatterns: CanvasPatternReference[] = [],
): PromptTag[] {
  const normalizedPrompt = normalizeText(promptText);
  const tags: PromptTag[] = [];

  for (const rule of PROMPT_KEYWORD_RULES) {
    if (rule.keywords.some((keyword) => normalizedPrompt.includes(keyword))) {
      addUniqueTag(tags, {
        category: rule.category,
        id: rule.id,
        label: rule.label,
      });
    }
  }

  for (const motif of patternValues(sourcePatterns, 'motifs')) {
    addUniqueTag(tags, createTag('motif', motif));
  }

  for (const carrier of patternValues(sourcePatterns, 'carriers')) {
    addUniqueTag(tags, createTag('carrier', carrier));
  }

  for (const material of patternValues(sourcePatterns, 'materials')) {
    addUniqueTag(tags, createTag('material', material));
  }

  for (const layout of patternValues(sourcePatterns, 'layouts')) {
    addUniqueTag(tags, createTag('layout', layout));
  }

  return tags;
}

export function buildPromptAsset(input: BuildPromptAssetInput): SavedPromptAsset {
  const promptText = normalizeText(input.promptText);
  const tags = extractPromptTags(promptText, input.sourcePatterns);
  const firstPatternName = input.sourcePatterns[0]?.name?.trim();
  const firstDesignTag =
    tags.find((tag) => tag.category === 'lineStyle' || tag.category === 'detail') ??
    tags[0];
  const title = firstPatternName
    ? `${firstPatternName} · ${firstDesignTag?.label ?? '提示词'}`
    : `${promptText.slice(0, 16)}${promptText.length > 16 ? '...' : ''}`;

  return {
    id: input.id,
    title,
    promptText,
    tags,
    sourcePatterns: input.sourcePatterns,
    generatedImageUrl: input.generatedImageUrl,
    quality: 'recommended',
    usageCount: 0,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

export function getPromptRecommendations(input: {
  assets: SavedPromptAsset[];
  currentPatterns: CanvasPatternReference[];
  draftPrompt?: string;
  limit?: number;
}): PromptRecommendation[] {
  const draftTags = extractPromptTags(input.draftPrompt ?? '');

  return input.assets
    .map((asset) => scorePromptAsset(asset, input.currentPatterns, draftTags))
    .filter((recommendation) => recommendation.score > 0)
    .sort((first, second) => second.score - first.score)
    .slice(0, input.limit ?? 4);
}

export function applyPromptAsset(
  asset: SavedPromptAsset,
  mode: 'append' | 'replace',
  currentPrompt: string,
): string {
  const promptText = normalizeText(asset.promptText);
  const existing = normalizeText(currentPrompt);

  if (mode === 'replace' || !existing) {
    return promptText;
  }

  if (existing.includes(promptText)) {
    return existing;
  }

  return `${existing}，${promptText}`;
}

export function recordPromptAssetUse(
  asset: SavedPromptAsset,
  usedAt = new Date().toISOString(),
): SavedPromptAsset {
  return {
    ...asset,
    usageCount: asset.usageCount + 1,
    lastUsedAt: usedAt,
    updatedAt: usedAt,
  };
}

export function getPromptPolishSuggestions(promptText: string): string[] {
  const tags = extractPromptTags(promptText);
  const suggestions = new Set<string>();

  if (tags.some((tag) => tag.id === 'line-style:simplified')) {
    suggestions.add('将纹样转化为简洁流畅的线描图案，保留主体轮廓，减少内部装饰噪点，适合车身侧面延展。');
  }

  if (tags.some((tag) => tag.id === 'detail:wings')) {
    suggestions.add('强化翅膀羽片的层次和展开方向，保持轮廓清晰，避免生成复杂背景。');
  }

  if (tags.some((tag) => tag.id === 'layout:continuous')) {
    suggestions.add('整理为可连续拼接的横向装饰纹样，节奏均匀，边缘自然衔接。');
  }

  return Array.from(suggestions).slice(0, 2);
}

function scorePromptAsset(
  asset: SavedPromptAsset,
  currentPatterns: CanvasPatternReference[],
  draftTags: PromptTag[],
): PromptRecommendation {
  const reasons: string[] = [];
  const matchedTags: PromptTag[] = [];
  let score = asset.quality === 'recommended' ? 8 : 0;

  for (const currentPattern of currentPatterns) {
    if (asset.sourcePatterns.some((pattern) => pattern.id === currentPattern.id)) {
      score += 60;
      addReason(reasons, `同一纹样：${currentPattern.name}`);
    } else if (
      currentPattern.name &&
      asset.sourcePatterns.some(
        (pattern) =>
          currentPattern.name.includes(pattern.name) ||
          pattern.name.includes(currentPattern.name),
      )
    ) {
      score += 35;
      addReason(reasons, `名称相近：${currentPattern.name}`);
    }
  }

  score += scoreSharedValues({
    asset,
    category: 'motif',
    currentValues: patternValues(currentPatterns, 'motifs'),
    reasons,
    scorePerMatch: 28,
    reasonPrefix: '同属',
  });
  score += scoreSharedValues({
    asset,
    category: 'carrier',
    currentValues: patternValues(currentPatterns, 'carriers'),
    reasons,
    scorePerMatch: 18,
    reasonPrefix: '载体同为',
  });
  score += scoreSharedValues({
    asset,
    category: 'material',
    currentValues: patternValues(currentPatterns, 'materials'),
    reasons,
    scorePerMatch: 12,
    reasonPrefix: '材质相关',
  });
  score += scoreSharedValues({
    asset,
    category: 'layout',
    currentValues: patternValues(currentPatterns, 'layouts'),
    reasons,
    scorePerMatch: 14,
    reasonPrefix: '布局相关',
  });

  for (const draftTag of draftTags) {
    const matchedTag = asset.tags.find((tag) => tag.id === draftTag.id);

    if (!matchedTag) {
      continue;
    }

    score += 16;
    matchedTags.push(matchedTag);
    addPriorityReason(reasons, `匹配当前意图：${matchedTag.label}`);
  }

  score += Math.min(asset.usageCount * 3, 12);

  if (currentPatterns.length === 0 && draftTags.length === 0) {
    score += asset.usageCount > 0 ? 6 : 2;
    addReason(reasons, '最近保存的提示词');
  }

  return {
    asset,
    score,
    reasons,
    matchedTags,
  };
}

function scoreSharedValues(input: {
  asset: SavedPromptAsset;
  category: PromptTagCategory;
  currentValues: string[];
  reasons: string[];
  scorePerMatch: number;
  reasonPrefix: string;
}): number {
  let score = 0;

  for (const value of input.currentValues) {
    if (
      input.asset.tags.some(
        (tag) => tag.category === input.category && tag.label === value,
      )
    ) {
      score += input.scorePerMatch;
      addReason(input.reasons, `${input.reasonPrefix}${value}`);
    }
  }

  return score;
}

function addReason(reasons: string[], reason: string): void {
  if (!reasons.includes(reason)) {
    reasons.push(reason);
  }
}

function addPriorityReason(reasons: string[], reason: string): void {
  if (reasons.includes(reason)) {
    return;
  }

  reasons.unshift(reason);
}

export function getCategoryLabel(category: PromptTagCategory): string {
  return CATEGORY_LABELS[category];
}
