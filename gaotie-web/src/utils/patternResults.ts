export const PATTERN_PAGE_SIZE = 8;

export interface PatternResultItem {
  id: string;
  name: string;
  imageUrl: string;
  dynasty?: string;
  description?: string;
}

export function getPatternPageCount(totalCount: number, pageSize = PATTERN_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(totalCount / pageSize));
}

export function clampPatternPage(
  page: number,
  totalCount: number,
  pageSize = PATTERN_PAGE_SIZE,
): number {
  return Math.min(Math.max(page, 1), getPatternPageCount(totalCount, pageSize));
}

export function getPatternPage<T extends PatternResultItem>(
  patterns: T[],
  page: number,
  pageSize = PATTERN_PAGE_SIZE,
): T[] {
  const safePage = clampPatternPage(page, patterns.length, pageSize);
  const start = (safePage - 1) * pageSize;
  return patterns.slice(start, start + pageSize);
}
