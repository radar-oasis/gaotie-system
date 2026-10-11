import { describe, expect, it } from 'vitest';
import {
  applyPromptAsset,
  buildPromptAsset,
  extractPromptTags,
  getPromptRecommendations,
  recordPromptAssetUse,
} from './promptLibrary';
import type { CanvasPatternReference, SavedPromptAsset } from './types';

const phoenixPattern: CanvasPatternReference = {
  id: 'pattern-phoenix-1',
  name: '飞凤纹',
  imageUrl: '/images/phoenix.png',
  dynasty: '唐代',
  description: '飞凤纹样',
  carriers: ['金银器'],
  materials: ['金'],
  motifs: ['凤纹'],
  layouts: ['连续纹样'],
};

const anotherPhoenixPattern: CanvasPatternReference = {
  id: 'pattern-phoenix-2',
  name: '飞凤纹样',
  imageUrl: '/images/phoenix-2.png',
  dynasty: '宋代',
  description: '另一件飞凤纹样',
  carriers: ['金银器'],
  materials: ['银'],
  motifs: ['凤纹'],
  layouts: ['连续纹样'],
};

describe('promptLibrary', () => {
  it('extracts reusable design tags from casual prompt text and pattern metadata', () => {
    const tags = extractPromptTags('我想让线条更简约，强调翅膀和头部细节', [
      phoenixPattern,
    ]);

    expect(tags).toEqual(
      expect.arrayContaining([
        { id: 'line-style:simplified', category: 'lineStyle', label: '简约线条' },
        { id: 'line-style:clean-lines', category: 'lineStyle', label: '线条优化' },
        { id: 'detail:wings', category: 'detail', label: '翅膀细节' },
        { id: 'detail:head', category: 'detail', label: '头部细节' },
        { id: 'motif:凤纹', category: 'motif', label: '凤纹' },
        { id: 'carrier:金银器', category: 'carrier', label: '金银器' },
      ]),
    );
  });

  it('builds a saved prompt asset with automatic title, tags, and source pattern', () => {
    const asset = buildPromptAsset({
      id: 'asset-1',
      promptText: '转化为简约流畅的凤纹线描，强化翅膀走势',
      sourcePatterns: [phoenixPattern],
      generatedImageUrl: '/generated/super-canvas/ai.png',
      createdAt: '2026-07-02T00:00:00.000Z',
    });

    expect(asset).toMatchObject({
      id: 'asset-1',
      title: '飞凤纹 · 简约线条',
      promptText: '转化为简约流畅的凤纹线描，强化翅膀走势',
      generatedImageUrl: '/generated/super-canvas/ai.png',
      sourcePatterns: [phoenixPattern],
      usageCount: 0,
      quality: 'recommended',
    });
    expect(asset.tags.map((tag) => tag.id)).toContain('detail:wings');
  });

  it('recommends saved prompts by similar motif, carrier, layout, and draft intent', () => {
    const saved: SavedPromptAsset = buildPromptAsset({
      id: 'asset-1',
      promptText: '转化为简约流畅的凤纹线描，强化翅膀走势，适合车身侧面连续延展',
      sourcePatterns: [phoenixPattern],
      createdAt: '2026-07-02T00:00:00.000Z',
    });

    const recommendations = getPromptRecommendations({
      assets: [saved],
      currentPatterns: [anotherPhoenixPattern],
      draftPrompt: '我想让线条更简约',
      limit: 3,
    });

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].asset.id).toBe('asset-1');
    expect(recommendations[0].reasons).toEqual(
      expect.arrayContaining([
        '同属凤纹',
        '载体同为金银器',
        '匹配当前意图：简约线条',
      ]),
    );
  });

  it('applies and records prompt asset reuse without forcing extra user input', () => {
    const saved = buildPromptAsset({
      id: 'asset-1',
      promptText: '转化为简约流畅的凤纹线描',
      sourcePatterns: [phoenixPattern],
      createdAt: '2026-07-02T00:00:00.000Z',
    });

    expect(applyPromptAsset(saved, 'replace', '我想优化线条')).toBe(
      '转化为简约流畅的凤纹线描',
    );
    expect(applyPromptAsset(saved, 'append', '保留凤头')).toBe(
      '保留凤头，转化为简约流畅的凤纹线描',
    );

    const used = recordPromptAssetUse(saved, '2026-07-02T01:00:00.000Z');
    expect(used.usageCount).toBe(1);
    expect(used.lastUsedAt).toBe('2026-07-02T01:00:00.000Z');
  });
});
