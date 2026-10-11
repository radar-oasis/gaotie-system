import { BadRequestException } from '@nestjs/common';
import type { CatalogPattern } from './pattern-discovery';

export function graphPatternIds(input: unknown): string[] {
  const ids = (input as { patternIds?: unknown } | null)?.patternIds;
  if (
    !Array.isArray(ids) ||
    ids.length > 24 ||
    ids.some((id) => typeof id !== 'string' || !id.trim() || id.length > 200)
  )
    throw new BadRequestException(
      'patternIds must contain at most 24 non-empty string IDs',
    );
  return [...new Set(ids.map((id) => id.trim()))];
}

export function buildPatternGraph(rows: CatalogPattern[]) {
  const nodes = new Map<
    string,
    { id: string; kind: string; label: string; patternId?: string }
  >();
  const edges = new Map<
    string,
    { id: string; source: string; target: string; label: string }
  >();
  let truncated = false;
  const node = (kind: string, label: string, patternId?: string) => {
    const id = JSON.stringify([kind, patternId ?? label]);
    if (!nodes.has(id)) {
      if (nodes.size >= 240) {
        truncated = true;
        return null;
      }
      nodes.set(id, { id, kind, label, ...(patternId ? { patternId } : {}) });
    }
    return id;
  };
  const edge = (
    source: string | null,
    target: string | null,
    label: string,
  ) => {
    if (!source || !target) return;
    const id = JSON.stringify([source, target, label]);
    edges.set(id, { id, source, target, label });
  };
  // Reserve all requested image nodes before expanding relationships.
  for (const p of rows) node('pattern', p.name, p.id);
  for (const p of rows) {
    const root = node('pattern', p.name, p.id);
    for (const motif of p.motifs) edge(root, node('motif', motif), '包含意象');
    for (const pair of p.motifCategories) {
      if (p.motifs.includes(pair.motif))
        edge(
          node('motif', pair.motif),
          node('category', pair.category),
          '所属类别',
        );
    }
    for (const [kind, label, values] of [
      ['dynasty', '所属朝代', p.dynasties],
      ['material', '材质', p.materials],
      ['carrier', '载体', p.carriers],
      ['layout', '构图', p.layouts],
    ] as const)
      for (const value of values) edge(root, node(kind, value), label);
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()], truncated };
}
