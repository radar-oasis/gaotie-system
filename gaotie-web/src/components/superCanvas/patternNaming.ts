type Root = { id: string; name: string };
type NamedPattern = { name: string; roots: Root[] };
type CounterStorage = Pick<Storage, 'getItem' | 'setItem'>;
const fallback = new Map<string, number>();
export function patternNameRoot(roots: Root[]) {
  const sorted = [...new Map(roots.filter(p => p.id && p.name.trim()).map(p => [p.id, p])).values()].sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return { key: JSON.stringify(sorted.map(p => p.id)), base: sorted.length ? `${sorted[0].name.trim()}${sorted.length > 1 ? `等${sorted.length}种纹样` : ''}` : '转化纹样' };
}
function storageKey(project: string, roots: Root[]) { return `gaotie:pattern-name-counter:${project}:${patternNameRoot(roots).key}`; }
function read(key: string, storage?: CounterStorage) {
  try { const n = Number(storage?.getItem(key)); return Math.max(Number.isSafeInteger(n) && n >= 0 ? n : 0, fallback.get(key) ?? 0); } catch { return fallback.get(key) ?? 0; }
}
function write(key: string, value: number, storage?: CounterStorage) {
  fallback.set(key, value);
  try { storage?.setItem(key, String(value)); } catch { /* In-memory high water mark still prevents reuse in this session. */ }
}
export function observePatternNames(project: string, patterns: NamedPattern[], storage?: CounterStorage) {
  for (const pattern of patterns) {
    const root = patternNameRoot(pattern.roots), prefix = `${root.base}-`;
    if (!pattern.name.startsWith(prefix)) continue;
    const n = Number(pattern.name.slice(prefix.length));
    if (Number.isSafeInteger(n) && n > 0) { const key = storageKey(project, pattern.roots); write(key, Math.max(n, read(key, storage)), storage); }
  }
}
export function reservePatternName(project: string, roots: Root[], patterns: NamedPattern[], storage?: CounterStorage) {
  observePatternNames(project, patterns, storage);
  const key = storageKey(project, roots), next = read(key, storage) + 1;
  write(key, next, storage);
  return `${patternNameRoot(roots).base}-${next}`;
}
