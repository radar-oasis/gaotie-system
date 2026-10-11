import {
  CatalogPattern,
  PatternFilters,
  PatternGroupInput,
  stringList,
} from './pattern-discovery';
import { resolveCategoryTerm, resolveMotifTerm } from './pattern-entities';
import { FACET_KEYS, lexicalIntent } from './pattern-intent-rules';

export interface GroundedIntent {
  reasoning: string;
  filters: PatternFilters & { groups?: PatternGroupInput[] };
  search_strategy: 'match_exact' | 'fuzzy_semantic';
}
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const split = (input: string) => stringList(input.split(/[、,，;；\n\r]+/));
const facets = ['dynasties', 'materials', 'carriers', 'layouts'] as const;

export function intentFallback(
  input: string,
  groups?: PatternGroupInput[],
  catalog?: CatalogPattern[],
): GroundedIntent {
  const baseline: GroundedIntent = {
    reasoning: '未获得可靠的图谱映射，保留原词进行检索。',
    filters: {
      motifs: groups?.length
        ? stringList(groups.flatMap((g) => g.keywords))
        : split(input),
      dynasties: [],
      materials: [],
      carriers: [],
      layouts: [],
      others: [],
      ...(groups?.length
        ? { groups: groups.map((g) => ({ ...g, keywords: [...g.keywords] })) }
        : {}),
    },
    search_strategy: 'fuzzy_semantic',
  };
  return catalog
    ? applyLexicalIntent(baseline, input, catalog, groups)
    : baseline;
}

export function intentPrompt(catalog: CatalogPattern[]): string {
  return `将用户意图对应到下面实际图谱词表中的母题或分类。可以解释模糊需求，但不得发明词表外实体。
已选 groups 每组独立理解：原样保留 id 和 label，不合并、不丢组、不把另一组的意象放入本组。keywords 只能放母题/分类，不得放朝代、载体、材质；例如“唐代的龙纹样”应为 keywords:["龙"]、dynasties:["唐"]。keywords 使用规范母题/分类；无法映射则保留原词。
手动输入可拆成 groups，label 必须是用户输入中的原文片段。不要追问或总结设计方案。
同一个词可能有多个角色：单独说“风筝”默认查询风筝母题，不得同时添加风筝载体；“风筝上的纹样”才是载体筛选。朝代别名唐代/唐朝必须对应词表的唐。完整实体优先，不得把风筝拆成风和筝。
仅提取用户明确表达的朝代、材质、载体、组织形式；严禁从情感或意象推断材质，未明确表达则返回空数组。
输出纯 JSON：{"filters":{"motifs":[],"dynasties":[],"materials":[],"carriers":[],"layouts":[],"others":[]},"groups":[{"id":"g1","label":"用户原文","keywords":["规范词"]}]}
实际图谱词表与分类上下文：${JSON.stringify({
    motifs: stringList(catalog.flatMap((row) => row.motifs)),
    categories: stringList(catalog.flatMap((row) => row.categories)),
    motifCategories: [
      ...new Map(
        catalog
          .flatMap((row) => row.motifCategories)
          .map((pair) => [JSON.stringify(pair), pair]),
      ).values(),
    ],
    ...Object.fromEntries(
      facets.map((key) => [
        key,
        stringList(catalog.flatMap((row) => row[key])),
      ]),
    ),
  })}`;
}

function groundModelIntent(
  value: unknown,
  input: string,
  catalog: CatalogPattern[],
  selected?: PatternGroupInput[],
): GroundedIntent {
  const payload = object(value);
  const raw = object(payload.filters);
  const candidates = Array.isArray(payload.groups)
    ? payload.groups
    : raw.groups;
  if (!Object.keys(raw).length && !Array.isArray(candidates))
    return intentFallback(input, selected);
  const motifs = stringList(catalog.flatMap((row) => row.motifs));
  const categories = stringList(catalog.flatMap((row) => row.categories));
  const canonical = (term: string) =>
    resolveCategoryTerm(term, categories) ?? resolveMotifTerm(term, motifs);
  const notes: string[] = [];
  const result = intentFallback(input, selected);
  for (const key of facets) {
    const available = stringList(catalog.flatMap((row) => row[key]));
    result.filters[key] = stringList(raw[key]).filter(
      (term) => input.includes(term) && available.includes(term),
    );
  }
  const proposed = Array.isArray(candidates) ? candidates.map(object) : [];
  const mapGroup = (
    group: PatternGroupInput,
    recommendation: Record<string, unknown>,
  ): PatternGroupInput => {
    const terms = stringList(recommendation.keywords);
    const mapped = terms.map(canonical);
    // Concrete known inputs cannot be silently swapped for another group's entity.
    const known = stringList(group.keywords.map(canonical));
    const valid =
      terms.length > 0 &&
      (known.length
        ? mapped.every((term) => !!term && known.includes(term))
        : mapped.some(Boolean));
    const keywords = valid ? stringList(mapped) : group.keywords;
    notes.push(
      valid
        ? `${group.label} → ${keywords.join('、')}（已核对图谱实体）`
        : `${group.label}：未获得有效对应，保留原词 ${keywords.join('、')}`,
    );
    return { ...group, keywords };
  };
  if (selected?.length) {
    result.filters.groups = selected.map((group) => {
      const matches = proposed.filter((item) => item.id === group.id);
      return mapGroup(group, matches.length === 1 ? matches[0] : {});
    });
  } else if (proposed.length) {
    const validGroups = proposed.filter(
      (item) =>
        typeof item.label === 'string' &&
        !!item.label.trim() &&
        input.includes(item.label),
    );
    if (validGroups.length !== proposed.length) return intentFallback(input);
    result.filters.groups = validGroups.map((item, index) =>
      mapGroup(
        {
          id: `intent-${index + 1}`,
          label: item.label as string,
          keywords: [item.label as string],
        },
        item,
      ),
    );
  } else {
    const terms = [...stringList(raw.motifs), ...stringList(raw.others)];
    const mapped = terms.map(canonical);
    const valid = terms.length > 0 && mapped.some(Boolean);
    const explicitFacets = facets.flatMap((key) => result.filters[key] ?? []);
    const inputTerms = split(input);
    const facetOnly =
      terms.length === 0 &&
      inputTerms.length > 0 &&
      inputTerms.every((term) => explicitFacets.includes(term));
    result.filters.motifs = valid
      ? stringList(mapped)
      : facetOnly
        ? []
        : inputTerms;
    notes.push(
      valid
        ? `${input} → ${result.filters.motifs.join('、')}（已核对图谱实体）`
        : facetOnly
          ? `${input} → 明确筛选条件 ${explicitFacets.join('、')}（已核对图谱）`
          : `${input}：未获得有效对应，保留原词`,
    );
  }
  if (result.filters.groups)
    result.filters.motifs = stringList(
      result.filters.groups.flatMap((group) => group.keywords),
    );
  result.reasoning = notes.join('；');
  return result;
}

function applyLexicalIntent(
  result: GroundedIntent,
  input: string,
  catalog: CatalogPattern[],
  selected?: PatternGroupInput[],
): GroundedIntent {
  const lexical = lexicalIntent(input, catalog, selected);
  // Hard facets come from explicit language, never from model associations.
  for (const key of FACET_KEYS) result.filters[key] = lexical.filters[key];
  if (lexical.complete && !selected?.length) {
    const groups = result.filters.groups;
    const terms = stringList(groups?.flatMap((group) => group.keywords));
    const keepGroups =
      groups?.length &&
      terms.length === lexical.filters.motifs.length &&
      terms.every((term) => lexical.filters.motifs.includes(term));
    result.filters = { ...lexical.filters, ...(keepGroups ? { groups } : {}) };
    result.reasoning = `${input} → ${result.filters.motifs.join('、') || '不限意象'}（已核对图谱实体）`;
  }
  const labels = {
    dynasties: '朝代',
    materials: '材质',
    carriers: '载体',
    layouts: '组织形式',
  };
  const conditions = FACET_KEYS.filter(
    (key) => result.filters[key]?.length,
  ).map((key) => `${labels[key]}：${result.filters[key]!.join('、')}`);
  result.reasoning += conditions.length
    ? ` ${conditions.join('；')}（同时满足）`
    : '';
  return result;
}

export function groundIntent(
  value: unknown,
  input: string,
  catalog: CatalogPattern[],
  selected?: PatternGroupInput[],
): GroundedIntent {
  return applyLexicalIntent(
    groundModelIntent(value, input, catalog, selected),
    input,
    catalog,
    selected,
  );
}
