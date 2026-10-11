import { motifNameMatches, resolveMotifTerm } from './pattern-entities';

describe('canonical motif matching', () => {
  it('does not confuse a sky name with elephant even without a sky vocabulary entry', () => {
    expect(motifNameMatches('天象纹', '象', ['象', '自然景象'])).toBe(false);
    expect(motifNameMatches('人物骑象纹', '象', ['象', '自然景象'])).toBe(true);
  });
  it('only resolves known aliases and decorative suffixes to existing motifs', () => {
    for (const word of ['大象', '象', '象纹', '大象纹样']) expect(resolveMotifTerm(word, ['象'])).toBe('象');
    for (const word of ['想象', '大雁', '__proto__']) expect(resolveMotifTerm(word, ['象'])).toBeUndefined();
    expect(resolveMotifTerm('大象', ['云'])).toBeUndefined();
  });
});
