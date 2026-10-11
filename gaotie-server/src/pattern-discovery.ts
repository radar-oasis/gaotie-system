import { BadRequestException } from '@nestjs/common';
import { createMotifNameMatcher, normalizeEntity, resolveMotifTerm } from './pattern-entities';

export interface PatternFilters {
  motifs: string[];
  dynasties: string[];
  materials: string[];
  others: string[];
  carriers?: string[];
  layouts?: string[];
}

export interface PatternGroupInput {
  id: string;
  label: string;
  keywords: string[];
}
export interface PatternGroupQuery extends Partial<PatternFilters> {
  userInput?: string;
  groups?: PatternGroupInput[];
  page?: { groupId: string; kind: 'direct' | 'related'; offset: number };
  limit?: number;
}
export interface PatternMatch {
  groupId: string;
  kind: 'direct' | 'related';
  reasons: string[];
}
export interface DiscoveredPattern {
  id: string;
  name: string;
  imageUrl: string;
  dynasty: string;
  description: string;
  motifs: string[];
  materials: string[];
  carriers: string[];
  layouts: string[];
  categories: string[];
  matches: PatternMatch[];
}
export interface CatalogPattern extends Omit<DiscoveredPattern, 'matches'> {
  dynasties: string[];
  motifCategories: Array<{ motif: string; category: string }>;
}
export interface PatternGroupResult extends PatternGroupInput {
  directTotal: number;
  relatedTotal: number;
  directIds: string[];
  relatedIds: string[];
}
export interface PatternGroupResponse {
  filters?: PatternFilters & {groups?: PatternGroupInput[]};
  patterns: DiscoveredPattern[];
  groups: PatternGroupResult[];
}

// These are deliberately small product-curated inspiration directions, not cultural assertions.
const INSPIRATION_DIRECTIONS: Record<string, string[]> = {
  吉祥: ['单字祈福', '吉祥成语', '瑞兽神禽'],
  喜庆: ['单字祈福', '吉祥成语'],
  庄严: ['礼器与法器', '宗教与哲理符号'],
  神兽: ['瑞兽神禽'],
  瑞兽: ['瑞兽神禽'],
};
const ALIASES: Record<string, string> = {
  祥云: '云',
  凤凰: '凤',
  龙纹: '龙',
  凤纹: '凤',
  云纹: '云',
};
export const stringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      ]
    : [];
const normalize = (value: string) =>
  value.normalize('NFKC').toLowerCase().trim();
const includesAny = (values: string[], keywords: string[]) =>
  values.some((value) =>
    keywords.some((keyword) => normalize(value).includes(keyword)),
  );
const keywordTerms = (keywords: string[]) =>
  stringList(
    keywords.flatMap((keyword) => [
      normalize(keyword),
      ALIASES[normalize(keyword)],
    ]),
  );
const FACETS = ['dynasties', 'materials', 'carriers', 'layouts'] as const;
const FACET_NAMES = {
  dynasties: '朝代',
  materials: '材质',
  carriers: '载体',
  layouts: '组织形式',
};

function getGroups(input: PatternGroupQuery): PatternGroupInput[] {
  if (input.groups !== undefined && !Array.isArray(input.groups))
    throw new BadRequestException('groups 必须为数组');
  const groups = input.groups?.length
    ? input.groups.map((group) => {
        if (
          !group ||
          typeof group.id !== 'string' ||
          !group.id.trim() ||
          typeof group.label !== 'string'
        )
          throw new BadRequestException('意象组需要 id 和 label');
        const keywords = stringList(group.keywords);
        return {
          id: group.id.trim(),
          label: group.label.trim(),
          keywords: keywords.length ? keywords : stringList([group.label]),
        };
      })
    : stringList([
        ...stringList(input.motifs),
        ...stringList(input.others),
      ]).map((keyword) => ({
        id: `imagery:${keyword}`,
        label: keyword,
        keywords: [keyword],
      }));
  if (
    groups.length > 30 ||
    new Set(groups.map((group) => group.id)).size !== groups.length
  )
    throw new BadRequestException('意象组最多 30 个且 id 不可重复');
  if (
    groups.some(
      (group) =>
        !group.keywords.length ||
        group.keywords.length > 30 ||
        group.keywords.some((keyword) => keyword.length > 200),
    )
  )
    throw new BadRequestException(
      '每组需要 1–30 个有效关键词（每词最多 200 字）',
    );
  if (!groups.length && FACETS.some((facet) => stringList(input[facet]).length))
    return [{ id: 'facets', label: '筛选结果', keywords: [] }];
  return groups;
}

// Cycle among sibling motifs so a populous motif cannot monopolize the first page.
function diverseRelated(
  patterns: CatalogPattern[],
  categories: Set<string>,
): CatalogPattern[] {
  const buckets = new Map<string, CatalogPattern[]>();
  for (const pattern of patterns) {
    const key =
      pattern.motifCategories
        .filter((pair) => categories.has(pair.category))
        .map((pair) => pair.motif)
        .sort()[0] ||
      pattern.motifs[0] ||
      '';
    const bucket = buckets.get(key) || [];
    bucket.push(pattern);
    buckets.set(key, bucket);
  }
  const ordered = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, rows]) => rows);
  const result: CatalogPattern[] = [];
  for (let index = 0; result.length < patterns.length; index++)
    for (const bucket of ordered) if (bucket[index]) result.push(bucket[index]);
  return result;
}

export function discoverPatterns(
  catalog: CatalogPattern[],
  input: PatternGroupQuery,
  vocabularyCatalog: CatalogPattern[] = catalog,
): PatternGroupResponse {
  if (!input || typeof input !== 'object')
    throw new BadRequestException('需要查询参数');
  const groups = getGroups(input);
  const limit = input.limit ?? 40;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new BadRequestException('limit 必须为 1–100 的整数');
  const page = input.page;
  if (
    page &&
    (!groups.some((group) => group.id === page.groupId) ||
      !['direct', 'related'].includes(page.kind) ||
      !Number.isSafeInteger(page.offset) ||
      page.offset < 0)
  )
    throw new BadRequestException('分页参数无效');
  const facets = FACETS.map((facet) => ({
    facet,
    terms: stringList(input[facet]).map((value) =>
      facet === 'dynasties'
        ? normalize(value).replace(
            /^(秦|汉|唐|宋|元|明|清|隋|晋)(代|朝)$/,
            '$1',
          )
        : normalize(value),
    ),
  }));
  const eligible = catalog.filter((pattern) =>
    facets.every(
      ({ facet, terms }) => !terms.length || includesAny(pattern[facet], terms),
    ),
  );
  const payload = new Map<string, DiscoveredPattern>();
  const motifVocabulary = stringList(vocabularyCatalog.flatMap(pattern => pattern.motifs));
  const categoryVocabulary = stringList(vocabularyCatalog.flatMap(pattern => pattern.categories));
  const vocabulary = [...motifVocabulary, ...categoryVocabulary];
  const results = groups.map((group) => {
    const resolvedMotifs = stringList(group.keywords.map(term => resolveMotifTerm(term, motifVocabulary)));
    const unresolvedTerms = keywordTerms(group.keywords.filter(term => !resolveMotifTerm(term, motifVocabulary)));
    const terms = [...resolvedMotifs.map(normalizeEntity), ...unresolvedTerms];
    const nameMatchers = resolvedMotifs.map(motif => createMotifNameMatcher(motif, vocabulary));
    const directReasons = (pattern: CatalogPattern) => {
      const reasons: string[] = [];
      if (resolvedMotifs.length) {
        const matched = pattern.motifs.filter(motif => resolvedMotifs.some(term => normalizeEntity(term) === normalizeEntity(motif)));
        if (matched.length) reasons.push(`母题匹配：${matched.join('、')}`);
        if (nameMatchers.some(matches => matches(pattern.name))) reasons.push(`名称匹配：${pattern.name}`);
        if (!unresolvedTerms.length) return reasons;
      }
      // Only unresolved terms may use broad metadata matching; grounded entities
      // never become substring matches against unrelated categories/materials.
      const terms = unresolvedTerms;
      if (includesAny([pattern.name], terms))
        reasons.push(`名称匹配：${pattern.name}`);
      if (includesAny(pattern.motifs, terms))
        reasons.push(
          `母题匹配：${pattern.motifs.filter((motif) => includesAny([motif], terms)).join('、')}`,
        );
      if (includesAny(pattern.categories, terms))
        reasons.push(
          `分类匹配：${pattern.categories.filter((category) => includesAny([category], terms)).join('、')}`,
        );
      if (includesAny([pattern.description], terms))
        reasons.push(`编号匹配：${pattern.id}`);
      if (!terms.length) reasons.push('符合筛选条件');
      return reasons;
    };
    const score = (pattern: CatalogPattern) => {
      const exact = (values: string[]) =>
        values.some((value) => terms.includes(normalize(value)));
      if (exact(pattern.motifs)) return 100;
      if (exact([pattern.name])) return 90;
      if (includesAny(pattern.motifs, terms)) return 80;
      if (includesAny([pattern.name], terms)) return 70;
      if (exact(pattern.categories)) return 60;
      if (includesAny(pattern.categories, terms)) return 50;
      if (FACETS.some((facet) => includesAny(pattern[facet], terms))) return 40;
      return terms.length ? 30 : 0;
    };
    const direct = eligible
      .filter((pattern) => directReasons(pattern).length)
      .map((pattern) => ({ pattern, score: score(pattern) }))
      .sort(
        (a, b) => b.score - a.score || a.pattern.id.localeCompare(b.pattern.id),
      )
      .map(({ pattern }) => pattern);
    const directIds = new Set(direct.map((pattern) => pattern.id));
    // Resolve categories from matching motifs across the catalog, retaining the active facets on results.
    const matchingMotifs = vocabularyCatalog.flatMap((pattern) =>
      pattern.motifCategories.filter((pair) =>
        includesAny([pair.motif], terms),
      ),
    );
    const exactMotifs = matchingMotifs.filter((pair) =>
      terms.includes(normalize(pair.motif)),
    );
    // "云" must not inherit the categories of "云肩" when the actual cloud motif exists.
    const categories = new Set(
      (exactMotifs.length ? exactMotifs : matchingMotifs).map(
        (pair) => pair.category,
      ),
    );
    if (!categories.size)
      for (const pattern of vocabularyCatalog)
        for (const pair of pattern.motifCategories)
          if (includesAny([pair.category], terms))
            categories.add(pair.category);
    const concepts = group.keywords.filter((keyword) =>
      Object.prototype.hasOwnProperty.call(
        INSPIRATION_DIRECTIONS,
        normalize(keyword),
      ),
    );
    for (const concept of concepts)
      for (const category of INSPIRATION_DIRECTIONS[normalize(concept)])
        categories.add(category);
    const related = diverseRelated(
      eligible.filter(
        (pattern) =>
          !directIds.has(pattern.id) &&
          pattern.categories.some((category) => categories.has(category)),
      ),
      categories,
    );
    const facetReasons = (pattern: CatalogPattern) =>
      facets
        .filter(({ terms }) => terms.length)
        .map(
          ({ facet, terms }) =>
            `${FACET_NAMES[facet]}：${pattern[facet].filter((value) => includesAny([value], terms)).join('、')}`,
        );
    const append = (rows: CatalogPattern[], kind: 'direct' | 'related') => {
      if (page && (page.groupId !== group.id || page.kind !== kind)) return [];
      return rows
        .slice(page?.offset ?? 0, (page?.offset ?? 0) + limit)
        .map((pattern) => {
          const reasons =
            kind === 'direct'
              ? directReasons(pattern)
              : [
                  `${concepts.length ? `灵感方向（${concepts.join('、')}）` : '同类母题扩展'}：${pattern.categories.filter((category) => categories.has(category)).join('、')}`,
                ];
          const existing = payload.get(pattern.id);
          const match: PatternMatch = {
            groupId: group.id,
            kind,
            reasons: [...reasons, ...facetReasons(pattern)],
          };
          if (existing) existing.matches.push(match);
          else {
            const {
              dynasties: _dynasties,
              motifCategories: _motifCategories,
              ...publicPattern
            } = pattern;
            payload.set(pattern.id, { ...publicPattern, matches: [match] });
          }
          return pattern.id;
        });
    };
    return {
      ...group,
      directTotal: direct.length,
      relatedTotal: related.length,
      directIds: append(direct, 'direct'),
      relatedIds: append(related, 'related'),
    };
  });
  return { patterns: [...payload.values()], groups: results };
}

// Pattern comprehensions aggregate each relationship separately, avoiding a cross product.
export const PATTERN_CATALOG_QUERY = `
MATCH (p:Pattern)
WHERE p.Pattern_ID IS NOT NULL AND trim(coalesce(p.图片链接, '')) <> ''
RETURN p.Pattern_ID AS patternId, p.名称 AS name, p.图片链接 AS imageUrl, p.公元纪年 AS dynasty,
  [(p)-[:CONTAINS_MOTIF]->(m:Motif) | m.motif_name] AS motifs,
  [(p)-[:BELONGS_TO_DYNASTY]->(d:Dynasty) | d.dynasty_name] AS dynasties,
  [(p)-[:MADE_OF_MATERIAL]->(m:Material) | m.material_name] AS materials,
  [(p)-[:APPLIED_ON_CARRIER]->(c:Carrier) | c.carrier_name] AS carriers,
  [(p)-[:HAS_LAYOUT]->(l:Layout) | l.layout_name] AS layouts,
  [(p)-[:CONTAINS_MOTIF]->(:Motif)<-[:HAS_SUBCLASS]-(l2:Level2) | l2.name] +
  [(p)-[:CONTAINS_MOTIF]->(:Motif)<-[:HAS_SUBCLASS]-(:Level2)<-[:HAS_SUBCLASS]-(l1:Level1) | l1.name] AS categories,
  [(p)-[:CONTAINS_MOTIF]->(m:Motif)<-[:HAS_SUBCLASS]-(l2:Level2) | {motif: m.motif_name, category: l2.name}] AS motifCategories
ORDER BY patternId`;
