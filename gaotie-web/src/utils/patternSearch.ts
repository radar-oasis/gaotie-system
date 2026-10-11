import type { IntentFilter, MatchKind, Pattern, PatternSearchGroup } from '../context/ImageSearchContext';
import { apiUrl } from './backendUrls';

export interface PatternSearchResponse { patterns: Pattern[]; groups: PatternSearchGroup[]; filters?: IntentFilter }
export interface SearchPage { groupId: string; kind: MatchKind; offset: number }

export function filtersFromTags(tags: { label: string }[]): IntentFilter {
  const labels = [...new Set(tags.map(tag => tag.label.trim()).filter(Boolean))];
  return { motifs: labels, dynasties: [], materials: [], others: [],
    groups: labels.map(label => ({ id: label, label, keywords: [label] })) };
}

export function fallbackSearchFilters(input: string): IntentFilter {
  return { ...filtersFromTags(input.split(/[、,，;；\n]+/).map(label => ({ label }))), userInput: input };
}

export function normalizeIntentFilters(value: unknown, fallback: IntentFilter): IntentFilter {
  if (!value || typeof value !== 'object') return fallback;
  const source = value as Record<string, unknown>;
  const list = (key: string): string[] => Array.isArray(source[key])
    ? (source[key] as unknown[]).filter((item): item is string => typeof item === 'string' && !!item.trim()).map(item => item.trim()) : [];
  const groups: NonNullable<IntentFilter['groups']> = [];
  if (Array.isArray(source.groups)) for (const item of source.groups) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || typeof item.label !== 'string' || !Array.isArray(item.keywords)) continue;
    const keywords = item.keywords.filter((word: unknown): word is string => typeof word === 'string' && !!word.trim()).map((word: string) => word.trim());
    if (item.id.trim() && item.label.trim() && keywords.length && !groups.some(group => group.id === item.id)) groups.push({ id: item.id, label: item.label, keywords });
  }
  const result: IntentFilter = { motifs: list('motifs'), dynasties: list('dynasties'), materials: list('materials'),
    others: list('others'), carriers: list('carriers'), layouts: list('layouts') };
  if (groups.length) result.groups = groups;
  return Object.values(result).some(items => items?.length) ? result : fallback;
}

export async function queryPatternGroups(filters: IntentFilter, signal: AbortSignal, page?: SearchPage): Promise<PatternSearchResponse> {
  const response = await fetch(apiUrl('/image-search/grouped-query'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...filters, limit: 40, ...(page ? { page } : {}) }), signal,
  });
  if (!response.ok) throw new Error('查询失败');
  const result = await response.json();
  if (!Array.isArray(result.patterns) || !Array.isArray(result.groups)) throw new Error('检索结果格式异常');
  return result;
}

export function mergeSearchPage(current: PatternSearchResponse, incoming: PatternSearchResponse, page: SearchPage): PatternSearchResponse {
  const patterns = new Map(current.patterns.map(pattern => [pattern.id, pattern]));
  for (const pattern of incoming.patterns) {
    const matches = new Map((patterns.get(pattern.id)?.matches ?? []).map(match => [`${match.groupId}:${match.kind}`, match]));
    for (const match of pattern.matches ?? []) matches.set(`${match.groupId}:${match.kind}`, match);
    patterns.set(pattern.id, { ...pattern, matches: [...matches.values()] });
  }
  const key = page.kind === 'direct' ? 'directIds' : 'relatedIds';
  return { patterns: [...patterns.values()], groups: current.groups.map(group => {
    const next = incoming.groups.find(item => item.id === group.id);
    if (group.id !== page.groupId || !next) return group;
    return { ...group, directTotal: next.directTotal, relatedTotal: next.relatedTotal,
      [key]: [...new Set([...group[key], ...next[key]])] };
  }) };
}
