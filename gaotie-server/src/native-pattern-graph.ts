import { BadRequestException } from '@nestjs/common';
import type { Node, Record as NeoRecord, Relationship } from 'neo4j-driver';
import { discoverPatterns, type PatternGroupQuery } from './pattern-discovery';

export const NATIVE_PAGE_SIZE = 24;
export const NATIVE_QUERY = `MATCH (p:Pattern)
WHERE p.Pattern_ID IN $ids
OPTIONAL MATCH (p)-[r]-(neighbor)
RETURN p, r, neighbor
ORDER BY p.Pattern_ID, elementId(r)
LIMIT 2001`;

export function nativeScope(input: unknown) {
  if (!input || typeof input !== 'object')
    throw new BadRequestException('需要图谱查询范围');
  const body = input as {
    query?: PatternGroupQuery;
    patternIds?: unknown;
    offset?: number;
    kind?: 'direct' | 'related';
  };
  const offset = body.offset ?? 0;
  const kind = body.kind ?? 'direct';
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !['direct', 'related'].includes(kind)
  )
    throw new BadRequestException('图谱分页参数无效');
  if (body.query) {
    if (
      !Array.isArray(body.query.groups) ||
      body.query.groups.length !== 1 ||
      !body.query.groups[0]
    )
      throw new BadRequestException('请选择一个检索组');
    const query = {
      ...body.query,
      limit: NATIVE_PAGE_SIZE,
      page: { groupId: body.query.groups[0].id, kind, offset },
    };
    discoverPatterns([], query);
    return { query, ids: [] as string[], offset, kind };
  }
  const ids = body.patternIds;
  if (
    !Array.isArray(ids) ||
    ids.length > 5000 ||
    ids.some((id) => typeof id !== 'string' || !id.trim() || id.length > 200)
  )
    throw new BadRequestException('纹样编号无效');
  return { query: undefined, ids: [...new Set(ids as string[])], offset, kind };
}

export function serializeNativeGraph(records: NeoRecord[]) {
  const nodes = new Map<
    string,
    {
      id: string;
      labels: string[];
      label: string;
      properties: Record<string, unknown>;
    }
  >();
  const relationships = new Map<
    string,
    { id: string; from: string; to: string; type: string }
  >();
  const addNode = (node: Node | null) => {
    if (!node) return;
    const p = node.properties as Record<string, unknown>;
    const label =
      p['名称'] ??
      p.motif_name ??
      p.dynasty_name ??
      p.material_name ??
      p.carrier_name ??
      p.layout_name ??
      p.name ??
      p.category ??
      node.labels[0];
    nodes.set(`n:${node.elementId}`, {
      id: `n:${node.elementId}`,
      labels: node.labels,
      label: String(label ?? '节点'),
      properties: p,
    });
  };
  for (const record of records.slice(0, 2000)) {
    addNode(record.get('p') as Node);
    addNode(record.get('neighbor') as Node | null);
    const rel = record.get('r') as Relationship | null;
    if (rel)
      relationships.set(`r:${rel.elementId}`, {
        id: `r:${rel.elementId}`,
        from: `n:${rel.startNodeElementId}`,
        to: `n:${rel.endNodeElementId}`,
        type: rel.type,
      });
  }
  return {
    nodes: [...nodes.values()],
    relationships: [...relationships.values()],
    truncated: records.length > 2000,
  };
}
