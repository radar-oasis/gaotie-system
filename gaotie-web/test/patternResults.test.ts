import { describe, expect, it } from 'vitest';

import {
  PATTERN_PAGE_SIZE,
  clampPatternPage,
  getPatternPage,
} from '../src/utils/patternResults.ts';

describe('pattern result pagination', () => {
  it('returns the requested page and clamps out-of-range pages', () => {
    const manyPatterns = Array.from({ length: PATTERN_PAGE_SIZE + 3 }, (_, index) => ({
      id: `p-${index + 1}`,
      name: `纹样 ${index + 1}`,
      imageUrl: `${index + 1}.png`,
      dynasty: index < PATTERN_PAGE_SIZE ? '清代' : '唐代',
    }));

    expect(clampPatternPage(4, manyPatterns.length)).toBe(2);
    expect(getPatternPage(manyPatterns, 2).map((pattern) => pattern.id)).toEqual(
      Array.from({ length: 3 }, (_, index) => `p-${PATTERN_PAGE_SIZE + index + 1}`),
    );
  });
});
