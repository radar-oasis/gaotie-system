import {
  CatalogPattern,
  discoverPatterns,
  PATTERN_CATALOG_QUERY,
  PatternGroupQuery,
  stringList,
} from './pattern-discovery';
import {
  createMotifNameMatcher,
  normalizeEntity,
  resolveMotifTerm,
} from './pattern-entities';
import { normalizeDynasty } from './pattern-intent-rules';

const FACET_GRAPH = {
  dynasties: ['BELONGS_TO_DYNASTY', 'Dynasty', 'dynasty_name'],
  materials: ['MADE_OF_MATERIAL', 'Material', 'material_name'],
  carriers: ['APPLIED_ON_CARRIER', 'Carrier', 'carrier_name'],
  layouts: ['HAS_LAYOUT', 'Layout', 'layout_name'],
} as const;
const DIRECTIONS: Record<string, string[]> = {
  吉祥: ['单字祈福', '吉祥成语', '瑞兽神禽'],
  喜庆: ['单字祈福', '吉祥成语'],
  庄严: ['礼器与法器', '宗教与哲理符号'],
  神兽: ['瑞兽神禽'],
  瑞兽: ['瑞兽神禽'],
};

/** Only application-owned labels, paths and property names appear in the query text. */
export function compilePatternQuery(
  input: PatternGroupQuery,
  catalog: CatalogPattern[],
) {
  const groups = discoverPatterns([], input).groups;
  const motifs = stringList(catalog.flatMap((p) => p.motifs));
  const categories = stringList(catalog.flatMap((p) => p.categories));
  const params: Record<string, unknown> = {};
  const predicates: string[] = [];
  for (const [key, [relation, label, property]] of Object.entries(
    FACET_GRAPH,
  )) {
    const terms = stringList(input[key as keyof typeof FACET_GRAPH]);
    if (!terms.length) continue;
    // Exact graph labels, including deliberately selected compound date labels.
    // A simple dynasty also admits compound labels that explicitly include it.
    params[key] =
      key === 'dynasties'
        ? stringList(
            catalog
              .flatMap((p) => p.dynasties)
              .filter((name) =>
                terms.some((term) => dynastyMatches(name, term)),
              ),
          )
        : terms;
    predicates.push(
      `EXISTS { MATCH (p)-[:${relation}]->(facet:${label}) WHERE facet.${property} IN $${key} }`,
    );
  }
  params.groups = groups.map((group) => {
    const resolved = stringList(
      group.keywords.map((term) => resolveMotifTerm(term, motifs)),
    );
    const categoryTerms = group.keywords.filter((term) =>
      categories.includes(term),
    );
    const unknown = group.keywords
      .filter(
        (term) => !resolveMotifTerm(term, motifs) && !categories.includes(term),
      )
      .map(normalizeEntity);
    const matchers = resolved.map((motif) =>
      createMotifNameMatcher(motif, [...motifs, ...categories]),
    );
    const nameIds = catalog
      .filter((p) => matchers.some((matches) => matches(p.name)))
      .map((p) => p.id);
    const inspiration = group.keywords.flatMap((term) =>
      Object.hasOwn(DIRECTIONS, term) ? DIRECTIONS[term] : [],
    );
    return {
      motifs: resolved,
      categories: categoryTerms,
      unknown,
      nameIds,
      inspiration,
      facetOnly: group.keywords.length === 0,
    };
  });
  predicates.push(`any(g IN $groups WHERE g.facetOnly
    OR p.Pattern_ID IN g.nameIds
    OR EXISTS { MATCH (p)-[:CONTAINS_MOTIF]->(m:Motif) WHERE m.motif_name IN g.motifs }
    OR EXISTS { MATCH (p)-[:CONTAINS_MOTIF]->(:Motif)<-[:HAS_SUBCLASS*1..2]-(c) WHERE (c:Level1 OR c:Level2) AND c.name IN g.categories }
    OR EXISTS { MATCH (p)-[:CONTAINS_MOTIF]->(:Motif)<-[:HAS_SUBCLASS]-(c:Level2)-[:HAS_SUBCLASS]->(seed:Motif)
      WHERE seed.motif_name IN g.motifs OR any(term IN g.unknown WHERE toLower(seed.motif_name) CONTAINS term) }
    OR EXISTS { MATCH (p)-[:CONTAINS_MOTIF]->(:Motif)<-[:HAS_SUBCLASS*1..2]-(c) WHERE (c:Level1 OR c:Level2) AND c.name IN g.inspiration }
    OR any(term IN g.unknown WHERE toLower(coalesce(p.名称,'')) CONTAINS term OR toLower(p.Pattern_ID) CONTAINS term)
    OR EXISTS { MATCH (p)-[:CONTAINS_MOTIF]->(m:Motif) WHERE any(term IN g.unknown WHERE toLower(m.motif_name) CONTAINS term) }
    OR EXISTS { MATCH (p)-[:CONTAINS_MOTIF]->(:Motif)<-[:HAS_SUBCLASS*1..2]-(c) WHERE (c:Level1 OR c:Level2) AND any(term IN g.unknown WHERE toLower(c.name) CONTAINS term) }

  )`);
  const cypher = PATTERN_CATALOG_QUERY.replace(
    '\nRETURN ',
    `\nAND ${predicates.join('\nAND ')}\nRETURN `,
  );
  return { cypher, params };
}

export function dynastyMatches(name: string, term: string): boolean {
  const wanted = normalizeDynasty(term);
  return (
    normalizeDynasty(name) === wanted ||
    name
      .replace(/["']/g, '')
      .split(/[、,，至]/)
      .some((part) => normalizeDynasty(part) === wanted)
  );
}
