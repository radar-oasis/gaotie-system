import {
  BadRequestException,
  Injectable,
  HttpException,
  Optional,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { Neo4jService } from '../neo4j.service';
import { layoutRegions } from './asset-layout';
import {
  AssetGraphIntentService,
  parseAssetChatInput,
  selectIntentGraph,
} from './asset-graph-intent';
import type { AssetGraphChatInput, IntentNode } from './asset-graph-intent';

export interface AssetGraphRow {
  id: string;
  user_id?: string;
  kind: string;
  name: string;
  project_id: string | null;
  project_name: string;
  theme: string;
  imagery: string;
  payload: Record<string, any>;
  deleted_at?: string | Date | null;
}
export interface AssetGraphNode {
  key: string;
  ownerId: string;
  label: string;
  kind: string;
  imageUrl?: string;
  assetId?: string;
  assetKind?: string;
  searchText: string;
  projectIds: string[];
}
export interface AssetGraphEdge {
  key: string;
  ownerId: string;
  source: string;
  target: string;
  label: string;
}
export interface AssetGraphOptions {
  query?: string;
  projectId?: string;
  hops?: number;
}
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex').slice(0, 32);
const string = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';
const list = (value: unknown): any[] => (Array.isArray(value) ? value : []);
const object = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {};

/** Pure projection: only persisted provenance and explicitly selected references establish lineage. */
export function buildAssetProjection(ownerId: string, rows: AssetGraphRow[]) {
  const nodes = new Map<string, AssetGraphNode>();
  const edges = new Map<string, AssetGraphEdge>();
  const aliases = new Map<string, string>();
  const live = rows.filter(
    (row) => (!row.user_id || row.user_id === ownerId) && !row.deleted_at,
  );
  const add = (
    key: string,
    kind: string,
    label: string,
    projectId: string,
    props: Partial<AssetGraphNode> = {},
  ) => {
    const prior = nodes.get(key);
    const node: AssetGraphNode = prior ?? {
      key,
      ownerId,
      kind,
      label,
      searchText: `${label} ${key}`.toLowerCase(),
      projectIds: [],
    };
    if (projectId && !node.projectIds.includes(projectId))
      node.projectIds.push(projectId);
    if (props.imageUrl && !node.imageUrl) node.imageUrl = props.imageUrl;
    if (props.assetId) {
      node.assetId = props.assetId;
      node.assetKind = props.assetKind;
      node.label = label;
    }
    node.searchText = `${node.searchText} ${label}`.toLowerCase();
    nodes.set(key, node);
    return key;
  };
  const edge = (source: string, target: string, label: string) => {
    if (source === target) return;
    const key = hash(`${source}\0${target}\0${label}`);
    edges.set(key, { key, ownerId, source, target, label });
  };
  // Ancestor URLs describe provenance, not pixel identity: a single remaining crop is
  // still different from the full image. Only a direct owned image URL or sourceAssetId
  // identifies a favorite; never infer this from outputImageUrl/sourceImageUrl.
  for (const row of live.filter((row) => row.kind === 'pattern')) {
    const key = `asset:${row.id}`;
    aliases.set(key, key);
    aliases.set(`/assets/${row.id}/image`, key);
  }
  const transformed = (
    imageUrl: string,
    name: string,
    p: Record<string, any>,
    projectId: string,
    sourceAssetId?: string,
  ) => {
    const asset = string(sourceAssetId) || string(p.sourceAssetId);
    // Persisted reference URLs are deduplicated by actual image content. An ancestor
    // output URL can be shared by different crops and must never identify this image.
    const saved = live.find(r => r.id === asset && r.kind === 'pattern');
    const fingerprint = string(p.transformFingerprint);
    const savedFingerprint = string(object(saved?.payload?.provenance).transformFingerprint);
    const changed = !!asset && !!fingerprint && fingerprint !== savedFingerprint;
    const key =
      (!changed && asset && aliases.get(`asset:${asset}`)) ||
      (!changed && aliases.get(imageUrl)) ||
      `transformed:${hash(imageUrl + '\0' + fingerprint)}`;
    add(key, p.referenceKind === 'capture' ? 'capture-pattern' : 'transformed-pattern', name || '转化纹样', projectId, { imageUrl });
    if (changed && saved) edge(`asset:${saved.id}`, key, '裁剪/变换自');
    return key;
  };
  const reference = (url: string, name: string, metadata: Record<string, any>, projectId: string, assetId?: string) => {
    const sourcePatternId = string(metadata.sourcePatternId);
    if (metadata.referenceKind === 'original' && sourcePatternId) {
      const original = list(metadata.sourcePatterns).find(p => string(p.id) === sourcePatternId);
      return add(`original:${sourcePatternId}`, 'original-pattern', string(original?.name) || name || sourcePatternId, projectId, { imageUrl: url });
    }
    return transformed(url, name, metadata, projectId, assetId);
  };
  const originals = (patterns: unknown, target: string, projectId: string) => {
    for (const pattern of list(patterns)) {
      const id = string(pattern?.id);
      if (!id) continue;
      const key = add(
        `original:${id}`,
        'original-pattern',
        string(pattern.name) || id,
        projectId,
        { imageUrl: string(pattern.imageUrl) || undefined },
      );
      edge(key, target, '转化自');
    }
  };
  const lineage = (
    p: Record<string, any>,
    target: string,
    projectId: string,
  ) => {
    if (p.version !== 1) return;
    originals(p.sourcePatterns, target, projectId);
    for (const refValue of list(p.references)) {
      const ref = object(refValue);
      const url = string(ref.imageUrl) || string(ref.originalImageUrl);
      if (!url) continue;
      const refKey = reference(
        url,
        string(ref.name) || '参考纹样',
        {
          ...ref, outputImageUrl: string(ref.originalImageUrl),
          ...object(ref.provenance),
        },
        projectId,
        string(ref.sourceAssetId),
      );
      originals(ref.sourcePatterns, refKey, projectId);
      edge(refKey, target, '参考转化');
    }
  };
  for (const row of live) {
    const projectId = string(row.project_id);
    const payload = object(row.payload);
    const p = object(payload.provenance);
    const key =
      row.kind === 'pattern'
        ? aliases.get(`asset:${row.id}`)!
        : `asset:${row.id}`;
    add(
      key,
      row.kind === 'pattern' ? (p.referenceKind === 'capture' ? 'capture-pattern' : 'transformed-pattern') : 'proposal',
      row.name,
      projectId,
      {
        assetId: row.id,
        assetKind: row.kind,
        imageUrl: `/assets/${row.id}/image`,
      },
    );
    if (projectId)
      edge(
        add(
          `project:${projectId}`,
          'project',
          row.project_name || '项目',
          projectId,
        ),
        key,
        '包含',
      );
    if (string(row.theme))
      edge(
        add(`theme:${hash(row.theme)}`, 'theme', row.theme, projectId),
        key,
        '主题',
      );
    if (string(row.imagery))
      edge(
        add(`imagery:${hash(row.imagery)}`, 'imagery', row.imagery, projectId),
        key,
        '意象',
      );
    if (row.kind === 'pattern') {
      const parentAssetKey = aliases.get(`asset:${string(p.sourceAssetId)}`);
      if (parentAssetKey) edge(parentAssetKey, key, '裁剪/变换自');
      lineage(p, key, projectId);
      continue;
    }
    // Only explicit generation or saved asset IDs establish parentage; save order and names have no role.
    const parentId = string(payload.parentProposalId);
    const parent = parentId && live.find(r => r.kind === 'proposal' && r.project_id === row.project_id && (string(r.payload.sourceProposalId) === parentId || r.id === parentId));
    if (parent && parent.id !== row.id) edge(`asset:${parent.id}`, key, '派生版本');
    if (parentId && string(payload.userInstruction)) {
      const instruction = add(`change:${row.id}`, 'change-instruction', string(payload.userInstruction), projectId);
      edge(key, instruction, '修改指令');
    }
    const pkg = object(payload.packageSnapshot);
    const palette = object(pkg.colorScheme);
    if (string(palette.id) || string(palette.name)) {
      const paletteKey = add(`palette:${hash(JSON.stringify(palette))}`, 'palette', string(palette.name) || '配色方案', projectId);
      edge(key, paletteKey, '采用配色');
      const roles = list(palette.colorRoles);
      for (const [index, role] of roles.entries()) {
        const hex = string(role.hex).toUpperCase();
        if (!hex) continue;
        const percent = typeof role.proportion === 'number' ? ` · ${role.proportion}%` : '';
        const roleKey = add(`${paletteKey}:color:${index}`, 'color-role', `${string(role.role) || '颜色'} ${hex}${percent}`, projectId);
        edge(paletteKey, roleKey, '颜色角色');
      }
      if (!roles.length) for (const [index, hex] of list(palette.palette).entries()) {
        const roleKey = add(`${paletteKey}:color:${index}`, 'color-role', string(hex), projectId);
        edge(paletteKey, roleKey, '颜色角色');
      }
    }
    const layout = object(pkg.layoutScheme);
    if (string(layout.id) || string(layout.name)) {
      const layoutKey = add(
        `layout:${hash(JSON.stringify(layout))}`,
        'layout',
        string(layout.name) || '空间布局',
        projectId,
      );
      edge(key, layoutKey, '采用布局');
      for (const region of layoutRegions(layout)) {
        const regionKey = add(
          `${layoutKey}:region:${region.id}`,
          'layout-region',
          region.label,
          projectId,
        );
        edge(layoutKey, regionKey, '采用区域');
      }
    }
    const image = add(
      `final-image:${row.id}`,
      'final-image',
      `${row.name} · 最终图片`,
      projectId,
      { imageUrl: `/assets/${row.id}/image` },
    );
    edge(key, image, '生成图片');
    const selected = new Set(
      list(pkg.selectedReferenceImageUrls).map(string).filter(Boolean),
    );
    const canvas = list(pkg.canvasAssets);
    const selectedIds = Array.isArray(pkg.selectedReferenceAssetIds) ? new Set(pkg.selectedReferenceAssetIds) : undefined;
    const adopted = selectedIds ? canvas.filter(item => selectedIds.has(item?.id) && selected.has(string(item?.imageUrl))) : [...selected].map(url => canvas.find(item => string(item?.imageUrl) === url) ?? {imageUrl:url});
    for (const itemValue of adopted) {
      const item = object(itemValue);
      const url = string(item.imageUrl);
      const itemProvenance = object(item.provenance);
      const ref = reference(
        url,
        string(item.name) || '采用的纹样',
        { ...itemProvenance, ...item },
        projectId,
        string(item.sourceAssetId),
      );
      lineage(itemProvenance, ref, projectId);
      edge(ref, key, '用于方案');
    }
  }
  // A reused descendant carries its recorded ancestors into the same query scope.
  // This changes visibility only; project containment remains the persisted owner's project.
  const ancestryLabels = new Set(['转化自', '参考转化', '裁剪/变换自', '用于方案']);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const link of edges.values()) {
      if (!ancestryLabels.has(link.label)) continue;
      const source = nodes.get(link.source), target = nodes.get(link.target);
      if (!source || !target) continue;
      for (const projectId of target.projectIds) if (!source.projectIds.includes(projectId)) {
        source.projectIds.push(projectId);
        expanded = true;
      }
    }
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

const MAX_NODES = 500;
const MAX_EDGES = 2000;
@Injectable()
export class AssetGraphService implements OnModuleInit {
  private readonly logger = new Logger(AssetGraphService.name);
  private readonly queues = new Map<string, Promise<unknown>>();
  constructor(
    private readonly db: DatabaseService,
    private readonly neo4j: Neo4jService,
    @Optional()
    private readonly intentService: AssetGraphIntentService = new AssetGraphIntentService(),
  ) {}

  onModuleInit(): void {
    void this.restoreProjections().catch(() =>
      this.logger.warn('资产图谱启动同步失败；下次查询将重新同步'),
    );
  }

  private async restoreProjections(): Promise<void> {
    // Include owners with only deleted assets to remove snapshots left by an interrupted deletion.
    const result = await this.db.query<{ user_id: string }>(
      'SELECT DISTINCT user_id FROM assets ORDER BY user_id',
    );
    for (const { user_id } of result.rows) {
      try {
        await this.syncUser(user_id);
      } catch {
        this.logger.warn('资产图谱启动同步未完成；下次查询将重新同步');
      }
    }
  }

  /** Fire and forget after committed asset mutations; projection failure never rolls back assets. */
  markDirty(userId: string): void {
    void this.syncUser(userId).catch(() =>
      this.logger.warn('资产图谱后台同步失败；下次查询将重新同步'),
    );
  }

  /** Each queued job reads Postgres only after the previous snapshot has committed. */
  syncUser(
    userId: string,
  ): Promise<{ syncedAt: string; projectionNodeCount: number }> {
    const previous = this.queues.get(userId) ?? Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(async () => {
        const result = await this.db.query<AssetGraphRow>(
          'SELECT id, user_id, kind, name, project_id, project_name, theme, imagery, payload FROM assets WHERE user_id = $1 AND deleted_at IS NULL ORDER BY id',
          [userId],
        );
        const projection = buildAssetProjection(userId, result.rows);
        const session = this.neo4j.getSession();
        try {
          await session.executeWrite(
            async (tx) => {
              await tx.run(
                'MATCH (n:DesignAssetNode {ownerId: $ownerId}) DETACH DELETE n',
                { ownerId: userId },
              );
              if (projection.nodes.length)
                await tx.run(
                  `UNWIND $nodes AS node CREATE (n:DesignAssetNode) SET n = node
                  FOREACH (_ IN CASE WHEN n.kind = 'project' THEN [1] ELSE [] END | SET n:DesignProject)
                  FOREACH (_ IN CASE WHEN n.kind = 'original-pattern' THEN [1] ELSE [] END | SET n:DesignOriginalPattern)
                  FOREACH (_ IN CASE WHEN n.kind = 'transformed-pattern' THEN [1] ELSE [] END | SET n:DesignTransformedPattern)
                  FOREACH (_ IN CASE WHEN n.kind = 'proposal' THEN [1] ELSE [] END | SET n:DesignProposal)
                  FOREACH (_ IN CASE WHEN n.kind = 'layout' THEN [1] ELSE [] END | SET n:DesignLayout)
                  FOREACH (_ IN CASE WHEN n.kind = 'layout-region' THEN [1] ELSE [] END | SET n:DesignLayoutRegion)
                  FOREACH (_ IN CASE WHEN n.kind = 'theme' THEN [1] ELSE [] END | SET n:DesignTheme)
                  FOREACH (_ IN CASE WHEN n.kind = 'imagery' THEN [1] ELSE [] END | SET n:DesignImagery)
                  FOREACH (_ IN CASE WHEN n.kind = 'final-image' THEN [1] ELSE [] END | SET n:DesignResultImage)`,
                  { nodes: projection.nodes },
                );
              if (projection.edges.length)
                await tx.run(
                  `UNWIND $edges AS edge
            MATCH (a:DesignAssetNode {ownerId: $ownerId, key: edge.source})
            MATCH (b:DesignAssetNode {ownerId: $ownerId, key: edge.target})
            CREATE (a)-[r:DESIGN_ASSET_LINK]->(b) SET r = edge`,
                  { ownerId: userId, edges: projection.edges },
                );
            },
            { timeout: 15000 },
          );
          return {
            syncedAt: new Date().toISOString(),
            projectionNodeCount: projection.nodes.length,
          };
        } finally {
          await session.close();
        }
      });
    this.queues.set(userId, current);
    void current
      .finally(() => {
        if (this.queues.get(userId) === current) this.queues.delete(userId);
      })
      .catch(() => undefined);
    return current;
  }

  async chat(userId: string, value: AssetGraphChatInput, signal?: AbortSignal) {
    const input = parseAssetChatInput(value);
    const cancelled = () => {
      if (signal?.aborted) throw new HttpException('图谱对话已取消', 499);
    };
    cancelled();
    // The model sees only a bounded owner-scoped name directory; it never produces executable queries.
    let catalog: IntentNode[] = [];
    let catalogTruncated = false;
    try {
      await this.syncUser(userId);
      const session = this.neo4j.getSession();
      try {
        const result = await session.run(
          `/* asset-chat-catalog */
          MATCH (n:DesignAssetNode {ownerId: $ownerId})
          WHERE n.kind IN ['project','proposal','original-pattern','transformed-pattern','capture-pattern','palette']
            AND ($projectId = '' OR $projectId IN n.projectIds)
          RETURN n ORDER BY CASE n.kind WHEN 'project' THEN 0 WHEN 'original-pattern' THEN 1 WHEN 'proposal' THEN 2 ELSE 3 END, n.key LIMIT 501`,
          { ownerId: userId, projectId: input.projectId || '' },
          { timeout: 10000 },
        );
        catalogTruncated = result.records.length > MAX_NODES;
        catalog = result.records.slice(0, MAX_NODES).flatMap((record) => {
          const n = record.get('n').properties as AssetGraphNode;
          return n.ownerId === userId
            ? [
                {
                  id: n.key,
                  label: n.label,
                  kind: n.kind,
                  ...(n.assetId ? { assetId: n.assetId } : {}),
                },
              ]
            : [];
        });
      } finally {
        await session.close();
      }
    } catch {
      throw new ServiceUnavailableException(
        '个人资产图谱目录暂不可用，请稍后重试',
      );
    }
    cancelled();
    const intent = await this.intentService.understand(input, catalog, signal);
    cancelled();
    const namedProjects = catalog.filter(
      (n) =>
        n.kind === 'project' &&
        intent.projectNames.some((name) =>
          [n.id, n.label].some(
            (value) => value.trim().toLowerCase() === name.trim().toLowerCase(),
          ),
        ),
    );
    const projectId =
      input.projectId ||
      (namedProjects.length === 1
        ? namedProjects[0].id.replace(/^project:/, '')
        : undefined);
    // Query Neo4j only with validated, catalog-backed project scope, then apply conjunctive graph predicates.
    const graph = await this.graph(userId, { projectId, hops: 6 });
    cancelled();
    const selected = selectIntentGraph(graph, intent, input.projectId, catalog);
    const truncated = graph.status.truncated || catalogTruncated;
    const noun =
      intent.target === 'proposal'
        ? '方案'
        : intent.target === 'palette' ? '配色方案' : intent.target === 'pattern'
          ? '纹样'
          : '资产';
    const constraints = [
      intent.projectNames.length
        ? `项目「${intent.projectNames.join('、')}」`
        : '',
      intent.proposalNames.length
        ? `方案「${intent.proposalNames.join('、')}」`
        : '',
      intent.patternNames.length
        ? `采用纹样「${intent.patternNames.join('、')}」`
        : '',
    ]
      .filter(Boolean)
      .join('，');
    let reply: string;
    if (selected.missingEntities.length)
      reply = `当前可见资产目录中未找到「${selected.missingEntities.join('、')}」，没有扩大查询范围。`;
    else if (!selected.targets.length)
      reply = constraints
        ? `没有找到同时满足${constraints}的${noun}。`
        : `没有找到匹配的${noun}，请明确项目、方案或纹样名称。`;
    else
      reply = `${constraints ? `${constraints}：` : ''}找到 ${selected.targets.length} 个${noun}：${selected.targets
        .slice(0, 20)
        .map((n) => `「${n.label}」`)
        .join(
          '、',
        )}${selected.targets.length > 20 ? '等' : ''}。已展示相关来源、配色、布局与图片关系。`;
    if (intent.target === 'palette' && selected.targets.length) {
      const byId = new Map(selected.nodes.map(node => [node.id, node]));
      const descriptions = selected.targets.slice(0, 20).map(palette => {
        const roles = selected.edges
          .filter(link => link.source === palette.id && link.label === '颜色角色')
          .map(link => byId.get(link.target))
          .filter(node => node?.kind === 'color-role')
          .map(node => node!.label);
        return `「${palette.label}」：${roles.length ? roles.join('；') : '未记录色值、角色和比例'}。`;
      });
      reply += `\n${descriptions.join('\n')}`;
    }
    if (truncated)
      reply = `当前图谱或目录达到显示上限，以下仅是已检索部分，不能视为全部结果。${reply}`;
    if (reply.length > 3500)
      reply = `${reply.slice(0, 3470)}…更多结果与完整关系请查看图谱。`;
    return {
      nodes: selected.nodes,
      edges: selected.edges,
      matches: selected.matches,
      reply,
      intent,
      status: {
        ...graph.status,
        truncated,
        catalogTruncated,
        nodeCount: selected.nodes.length,
        edgeCount: selected.edges.length,
        matchedCount: selected.targets.length,
        target: intent.target,
      },
    };
  }

  async graph(userId: string, options: AssetGraphOptions = {}) {
    const hops = options.hops ?? 6;
    if (!Number.isInteger(hops) || hops < 1 || hops > 6)
      throw new BadRequestException('图谱跳数须为 1–6 的整数');
    if (
      options.query !== undefined &&
      (typeof options.query !== 'string' || options.query.length > 200)
    )
      throw new BadRequestException('图谱关键词不能超过 200 字');
    if (
      options.projectId !== undefined &&
      (typeof options.projectId !== 'string' || options.projectId.length > 160)
    )
      throw new BadRequestException('项目参数无效');
    const query = string(options.query).toLowerCase();
    const projectId = string(options.projectId);
    try {
      const sync = await this.syncUser(userId);
      const session = this.neo4j.getSession();
      try {
        const parameters = { ownerId: userId, projectId, query };
        const result = await session.run(
          `MATCH (n:DesignAssetNode {ownerId: $ownerId})
          WHERE ($projectId = '' OR $projectId IN n.projectIds)
            AND ($query = '' OR n.searchText CONTAINS $query)
          RETURN n ORDER BY n.key LIMIT 501`,
          parameters,
          { timeout: 10000 },
        );
        let truncated =
          result.records.length > MAX_NODES ||
          (!!query && result.records.length === MAX_NODES);
        const nodes = new Map<string, AssetGraphNode>();
        for (const record of result.records.slice(0, MAX_NODES)) {
          const node = record.get('n').properties as AssetGraphNode;
          if (node.ownerId === userId) nodes.set(node.key, node);
        }
        const seeds = [...nodes.keys()];
        const edges = new Map<string, AssetGraphEdge>();
        let frontier = seeds;
        // Breadth-first Cypher queries bound expansion at every hop, avoiding exponential path enumeration.
        for (
          let depth = 0;
          query && depth < hops && frontier.length && nodes.size < MAX_NODES;
          depth++
        ) {
          const remaining = MAX_NODES - nodes.size;
          const next = await session.run(
            `MATCH (a:DesignAssetNode {ownerId: $ownerId})-[r:DESIGN_ASSET_LINK]-(n:DesignAssetNode {ownerId: $ownerId})
            WHERE a.key IN $frontier AND r.ownerId = $ownerId
              AND NOT n.key IN $visited AND ($projectId = '' OR $projectId IN n.projectIds)
            RETURN DISTINCT n ORDER BY n.key LIMIT ${remaining + 1}`,
            { ...parameters, frontier, visited: [...nodes.keys()] },
            { timeout: 10000 },
          );
          truncated ||= next.records.length > remaining;
          frontier = [];
          for (const record of next.records.slice(0, remaining)) {
            const node = record.get('n').properties as AssetGraphNode;
            if (node.ownerId === userId && !nodes.has(node.key)) {
              nodes.set(node.key, node);
              frontier.push(node.key);
            }
          }
        }
        // At the budget boundary we cannot inspect another frontier; report a conservatively truncated view.
        truncated ||= !!query && nodes.size === MAX_NODES;
        if (nodes.size) {
          const links = await session.run(
            `MATCH (a:DesignAssetNode {ownerId: $ownerId})-[r:DESIGN_ASSET_LINK]->(b:DesignAssetNode {ownerId: $ownerId})
            WHERE a.key IN $keys AND b.key IN $keys AND r.ownerId = $ownerId
            RETURN r ORDER BY r.key LIMIT 2001`,
            { ...parameters, keys: [...nodes.keys()] },
            { timeout: 10000 },
          );
          truncated ||= links.records.length > MAX_EDGES;
          for (const record of links.records.slice(0, MAX_EDGES)) {
            const edge = record.get('r').properties as AssetGraphEdge;
            if (
              edge.ownerId === userId &&
              nodes.has(edge.source) &&
              nodes.has(edge.target)
            )
              edges.set(edge.key, edge);
          }
        }
        const originalSeeds = seeds.filter(
          (key) => nodes.get(key)?.kind === 'original-pattern',
        );
        const lineageOnly = originalSeeds.length > 0;
        const paths = this.paths(
          nodes,
          [...edges.values()],
          query ? (lineageOnly ? originalSeeds : seeds) : [],
          hops,
          lineageOnly,
        );
        const matches = [...nodes.values()]
          .filter((n) => n.assetId)
          .map((n) => ({
            assetId: n.assetId!,
            name: n.label,
            kind: n.assetKind || 'pattern',
            paths: query ? (paths.get(n.key) ?? []) : [[n.label]],
          }))
          .filter((match) => !query || match.paths.length);
        return {
          nodes: [...nodes.values()].map((n) => ({
            id: n.key,
            label: n.label,
            kind: n.kind,
            ...(n.imageUrl ? { imageUrl: n.imageUrl } : {}),
            ...(n.assetId ? { assetId: n.assetId } : {}),
          })),
          edges: [...edges.values()].map((e) => ({
            id: e.key,
            source: e.source,
            target: e.target,
            label: e.label,
          })),
          matches,
          status: {
            available: true,
            source: 'neo4j',
            ...sync,
            query,
            hops,
            nodeCount: nodes.size,
            edgeCount: edges.size,
            maxNodes: MAX_NODES,
            maxEdges: MAX_EDGES,
            truncated,
          },
        };
      } finally {
        await session.close();
      }
    } catch {
      throw new ServiceUnavailableException(
        '个人资产图谱暂不可用，资产已安全保存在数据库中，请稍后重试',
      );
    }
  }

  private paths(
    nodes: Map<string, AssetGraphNode>,
    edges: AssetGraphEdge[],
    seeds: string[],
    hops: number,
    lineageOnly: boolean,
  ) {
    const adjacency = new Map<string, Set<string>>();
    for (const edge of edges) {
      if (
        lineageOnly &&
        !['转化自', '参考转化', '用于方案'].includes(edge.label)
      )
        continue;
      if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
      if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set());
      adjacency.get(edge.source)!.add(edge.target);
      if (!lineageOnly) adjacency.get(edge.target)!.add(edge.source);
    }
    const paths = new Map<string, string[][]>();
    // One shortest explanation per keyword hit, at most five explanations per match.
    for (const seed of seeds) {
      const visited = new Set([seed]);
      const queue = [[seed]];
      for (let index = 0; index < queue.length; index++) {
        const path = queue[index];
        const key = path[path.length - 1];
        if (!paths.has(key)) paths.set(key, []);
        if (paths.get(key)!.length < 5)
          paths.get(key)!.push(path.map((id) => nodes.get(id)!.label));
        if (path.length > hops) continue;
        for (const next of adjacency.get(key) ?? [])
          if (!visited.has(next)) {
            visited.add(next);
            queue.push([...path, next]);
          }
      }
    }
    return paths;
  }
}
