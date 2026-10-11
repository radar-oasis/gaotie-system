/** Query aliases are curated fallbacks, not substitutions inside arbitrary sentences. */
const MOTIF_ALIASES: Readonly<Record<string, string>> = {
  大象: '象',
  凤凰: '凤',
  祥云: '云',
};

export const normalizeEntity = (value: string): string =>
  value.normalize('NFKC').trim().toLowerCase();

export function resolveMotifTerm(
  term: string,
  motifs: string[],
): string | undefined {
  const value = normalizeEntity(term);
  const names = new Map(motifs.map((name) => [normalizeEntity(name), name]));
  if (names.has(value)) return names.get(value);
  const alias = Object.prototype.hasOwnProperty.call(MOTIF_ALIASES, value)
    ? MOTIF_ALIASES[value]
    : undefined;
  if (alias && names.has(alias)) return names.get(alias);
  // Only remove a decorative suffix when the remainder is a known entity/alias.
  if (value.endsWith('纹样') || value.endsWith('纹')) {
    const stem = value.replace(/纹样$|纹$/, '');
    return (
      names.get(stem) ??
      (Object.prototype.hasOwnProperty.call(MOTIF_ALIASES, stem)
        ? names.get(MOTIF_ALIASES[stem])
        : undefined)
    );
  }
  return undefined;
}

export function motifNameMatches(
  name: string,
  motif: string,
  vocabulary: string[],
): boolean {
  return createMotifNameMatcher(motif, vocabulary)(name);
}

export function createMotifNameMatcher(
  motif: string,
  vocabulary: string[],
): (name: string) => boolean {
  const term = normalizeEntity(motif);
  // Mask longer, different known concepts first: 云肩≠云、物象≠象、天象≠象.
  const exclusions = [
    ...vocabulary,
    '天象',
    '气象',
    '景象',
    '物象',
    '事象',
    '象征',
    '象牙',
  ];
  const masks = exclusions
    .map(normalizeEntity)
    .filter(
      (other) =>
        other.length > term.length &&
        other.includes(term) &&
        resolveMotifTerm(other, [motif]) !== motif,
    )
    .sort((a, b) => b.length - a.length);
  return (name: string) => {
    let text = normalizeEntity(name);
    if (text === term || text === `${term}纹` || text === `${term}纹样`)
      return true;
    for (const other of masks) text = text.split(other).join(' ');
    return text.includes(term);
  };
}

/** Product vocabulary bridges are accepted only when the target exists in this graph. */
export const CATEGORY_ALIASES: Readonly<Record<string, string>> = {
  神兽: '瑞兽神禽',
  瑞兽: '瑞兽神禽',
};
export function resolveCategoryTerm(
  term: string,
  categories: string[],
): string | undefined {
  const value = normalizeEntity(term);
  return (
    categories.find((name) => normalizeEntity(name) === value) ??
    (Object.hasOwn(CATEGORY_ALIASES, value)
      ? categories.find((name) => name === CATEGORY_ALIASES[value])
      : undefined)
  );
}
