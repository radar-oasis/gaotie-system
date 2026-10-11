import {
  CatalogPattern,
  PatternFilters,
  PatternGroupInput,
  stringList,
} from './pattern-discovery';
import {
  CATEGORY_ALIASES,
  normalizeEntity,
  resolveMotifTerm,
} from './pattern-entities';

export const FACET_KEYS = [
  'dynasties',
  'materials',
  'carriers',
  'layouts',
] as const;
export const normalizeDynasty = (name: string) =>
  normalizeEntity(name).replace(/^(秦|汉|唐|宋|元|明|清|隋|晋)(代|朝)$/, '$1');
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const noise =
  /(?:帮我|给我|我想|想要|想找|寻找|搜索|检索|找一下|找一些|找点|找|一些|一下|几个|有没有|有哪些|有关|关于|相关|带有|包含|含有|有|带|意象|元素|上面|上的|上|里面|里的|的|这种|那种|一个|具有|比较|感觉|风格|图案|纹样|纹饰|纹|为主|请|和|与|以及|、|，|,|；|;|\s|。|！|!|？|\?)/g;

/** Longest catalog terms win. A residual unknown word prevents silently dropping it. */
export function lexicalIntent(
  input: string,
  catalog: CatalogPattern[],
  selected?: PatternGroupInput[],
) {
  const motifs = stringList(catalog.flatMap((p) => p.motifs));
  const categories = stringList(catalog.flatMap((p) => p.categories));
  const vocab = Object.fromEntries(
    FACET_KEYS.map((key) => [key, stringList(catalog.flatMap((p) => p[key]))]),
  ) as Record<(typeof FACET_KEYS)[number], string[]>;
  const tokens = new Map<string, string>();
  for (const name of [...motifs, ...categories, ...Object.values(vocab).flat()])
    tokens.set(name, name);
  for (const alias of ['大象', '凤凰', '祥云']) {
    const canonical = resolveMotifTerm(alias, motifs);
    if (canonical) tokens.set(alias, canonical);
  }
  for (const [alias, canonical] of Object.entries(CATEGORY_ALIASES)) {
    if (categories.includes(canonical)) tokens.set(alias, canonical);
  }
  for (const name of vocab.dynasties) {
    const canonical = normalizeDynasty(name);
    tokens.set(name, name);
    if (/^(秦|汉|唐|宋|元|明|清|隋|晋)$/.test(canonical))
      for (const alias of [canonical, `${canonical}代`, `${canonical}朝`])
        tokens.set(alias, name);
  }
  const text = input.normalize('NFKC').trim();
  const filters: PatternFilters = {
    motifs: [],
    dynasties: [],
    materials: [],
    carriers: [],
    layouts: [],
    others: [],
  };
  const generic = new Set(['图案', '纹样', '纹饰', '其他', '未知', '不详']);
  const words = [...new Set([...tokens.keys(), ...generic])].sort(
    (a, b) => b.length - a.length,
  );
  const regex = new RegExp(
    words.length ? words.map(escape).join('|') : '(?!)',
    'g',
  );
  let remainder = '';
  let cursor = 0;
  for (const match of text.matchAll(regex)) {
    const start = match.index!;
    remainder += text.slice(cursor, start);
    cursor = start + match[0].length;
    if (generic.has(match[0])) {
      remainder += match[0];
      continue;
    }
    const term = tokens.get(match[0])!;
    const imagery = motifs.includes(term) || categories.includes(term);
    const before = text.slice(Math.max(0, start - 8), start);
    const after = text.slice(cursor, cursor + 10);
    const explicitCarrier =
      /^(?:上|里面|表面|作为载体|做载体)/.test(after) ||
      /(?:载体[：:]?|用于|用在|画在|绘在|印在)$/.test(before);
    const followedByImagery = words.some(
      (word) =>
        after.startsWith(word) && motifs.includes(tokens.get(word) ?? ''),
    );
    const dynastyBoundary =
      start === 0 ||
      /(?:找|要|有|属于|朝代|年代|时期|是|为|在|[、,，;；\s])$/.test(before);
    const dynastyRole =
      match[0].length > 1 ||
      (dynastyBoundary &&
        (!after ||
          followedByImagery ||
          /^(?:的|时期|时候|、|和|与|[\s,，;；。])/.test(after)));
    const appearanceOrComparison =
      /^(?:色|颜色|色调|般|一样|似的|质感)/.test(after) ||
      /(?:比|像|仿佛)$/.test(before);
    const usedAsFacet = FACET_KEYS.filter(
      (key) =>
        vocab[key].includes(term) &&
        !appearanceOrComparison &&
        (key !== 'dynasties' || dynastyRole) &&
        (!imagery || (key === 'carriers' && explicitCarrier)),
    );
    if (!usedAsFacet.length && !imagery) remainder += match[0];
    for (const key of usedAsFacet) filters[key]!.push(term);
    if (imagery && !usedAsFacet.length) filters.motifs.push(term);
  }
  remainder += text.slice(cursor);
  for (const key of ['motifs', ...FACET_KEYS] as const)
    filters[key] = stringList(filters[key]);
  const hasEvidence = [
    filters.motifs,
    ...FACET_KEYS.map((key) => filters[key]!),
  ].some((values) => values.length);
  const complete = hasEvidence && !remainder.replace(noise, '').trim();
  let groups: PatternGroupInput[] | undefined;
  if (selected?.length) {
    groups = selected.map((group) => {
      const local = lexicalIntent(group.label, catalog);
      return {
        ...group,
        keywords:
          local.complete && local.filters.motifs.length
            ? local.filters.motifs
            : group.keywords,
      };
    });
    // Selected groups are independent user choices and must never be merged.
    filters.motifs = stringList(groups.flatMap((group) => group.keywords));
  }
  return {
    filters: { ...filters, ...(groups ? { groups } : {}) },
    complete,
    hasEvidence,
  };
}
