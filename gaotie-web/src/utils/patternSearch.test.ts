import { describe, expect, it } from 'vitest';
import { filtersFromTags, fallbackSearchFilters, mergeSearchPage, normalizeIntentFilters } from './patternSearch';
import type { Pattern, PatternSearchGroup } from '../context/ImageSearchContext';

describe('grouped pattern search', () => {
  it('carries grounded keywords and original labels into retrieval', () => {
    const groups = [{ id: 'intent-1', label: '大象', keywords: ['象'] }];
    expect(normalizeIntentFilters({ motifs: ['象'], groups }, fallbackSearchFilters('大象')).groups).toEqual(groups);
    expect(normalizeIntentFilters({ groups: [null, { id: '', label: '大象', keywords: [] }] }, fallbackSearchFilters('大象'))).toEqual(fallbackSearchFilters('大象'));
  });
  it('uses distinct imagery labels and keeps each keyword separate', () => {
    expect(filtersFromTags([{ label: '龙' }, { label: '云' }, { label: '龙' }]).groups?.map(group => group.keywords)).toEqual([['龙'], ['云']]);
    expect(fallbackSearchFilters('龙、云，凤').motifs).toEqual(['龙', '云', '凤']);
  });
  it('preserves compound raw input for server-side recovery after parser failure', () => {
    expect(fallbackSearchFilters('唐代的龙纹样')).toHaveProperty('userInput','唐代的龙纹样');
  });
  it('normalizes facets without silently adding or dropping constraints', () => {
    const fallback = fallbackSearchFilters('明代铜器');
    expect(normalizeIntentFilters({ dynasties: ['明'], materials: ['铜'], carriers: ['器'], layouts: ['对称'] }, fallback))
      .toMatchObject({ motifs: [], dynasties: ['明'], materials: ['铜'], carriers: ['器'], layouts: ['对称'] });
    expect(normalizeIntentFilters({}, fallback)).toEqual(fallback);
  });
  it('merges pages by stable ID, retaining other groups and other lanes', () => {
    const p: Pattern = { id: '1', name: '龙云', imageUrl: '1.png', dynasty: '', description: '', matches: [{ groupId: '龙', kind: 'direct', reasons: ['母题：龙'] }] };
    const g: PatternSearchGroup = { id: '龙', label: '龙', keywords: ['龙'], directIds: ['1'], relatedIds: ['2'], directTotal: 2, relatedTotal: 1 };
    const other = { ...g, id: '云' };
    const result = mergeSearchPage({ patterns: [p], groups: [g, other] }, {
      patterns: [{ ...p, matches: [{ groupId: '云', kind: 'direct', reasons: ['母题：云'] }] }, { ...p, id: '3' }],
      groups: [{ ...g, directIds: ['1', '3'], relatedIds: [] }],
    }, { groupId: '龙', kind: 'direct', offset: 1 });
    expect(result.patterns).toHaveLength(2);
    expect(result.patterns[0].matches).toHaveLength(2);
    expect(result.groups[0].directIds).toEqual(['1', '3']);
    expect(result.groups[0].relatedIds).toEqual(['2']);
    expect(result.groups[1]).toEqual(other);
  });
});
