import { BadRequestException, Injectable } from '@nestjs/common';
import { Layout3d, persistLayout3d } from './layout3d';
import { Neo4jService } from './neo4j.service';
import { buildPatternGraph, graphPatternIds } from './pattern-graph';
import { nativeScope, NATIVE_PAGE_SIZE, NATIVE_QUERY, serializeNativeGraph } from './native-pattern-graph';
import { groundIntent, intentFallback, intentPrompt } from './pattern-intent';
import { compilePatternQuery } from './pattern-query';
import {
  CatalogPattern,
  discoverPatterns,
  PATTERN_CATALOG_QUERY,
  PatternFilters,
  PatternGroupQuery,
  PatternGroupInput,
  PatternGroupResponse,
  stringList,
} from './pattern-discovery';
export type {
  PatternFilters,
  PatternGroupQuery,
  PatternGroupResponse,
} from './pattern-discovery';

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  type: 'text' | 'rich-card';
  content: string;
  tags?: Tag[];
}

export interface Tag {
  id: string;
  label: string;
  topic?: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  selectedTags: Tag[];
}

interface DeepSeekMessage {
  role: string;
  content: string;
}

export interface DeepSeekResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
  }>;
}

export interface LayoutComponent {
  id: string;
  category: string;
  name: string;
  imageUrl: string;
}

export interface LayoutScheme {
  layout3d?: Layout3d;
  id?: string;
  name: string;
  componentsMap: Record<string, string>;
  createdAt?: string;
  updatedAt?: string;
  projectId?: string | null;
}

export interface DbSchema {
  labels: string[];
  relationshipTypes: string[];
  sampleNodes: Array<{
    properties: Record<string, unknown>;
    labels: string[];
  }>;
}

@Injectable()
export class AppService {
  private patternCatalog?: { loadedAt: number; rows: CatalogPattern[] };
  private patternCatalogLoading?: Promise<CatalogPattern[]>;
  constructor(private readonly neo4jService: Neo4jService) {}

  getHello(): string {
    return 'Hello World!';
  }

  async callDeepSeek(
    messages: ChatMessage[],
    selectedTags: Tag[] = [],
  ): Promise<DeepSeekResponse> {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    const url = 'https://api.deepseek.com/chat/completions';

    const systemPrompt = `# Role
你是一个资深的涂装设计策略专家（AI Co-pilot）。你的任务是协助用户通过对话，从"原始设计需求"发散到"设计主题"，并进一步下钻提炼出具体的"设计意象（原材料）"。

# Task Flow
1. **分析需求：** 读取用户的原始设计需求。
2. **主题发散：** 基于需求，横向发散设计主题（例如：需求包含"京张铁路"，可发散主题至"边塞文化"；包含"冬奥"，可发散至"冰雪运动"）。
3. **意象提炼（核心）：** 针对确定的主题，提供具体的设计意象。

# ⚠️ Constraint (绝对约束：意象的边界)
- **只要基础名词，不要设计手法：** 你提供的"意象"必须是具体的基础事物、图腾或符号。
- 🟢 正确示范：龙、凤、长城、雪花、滑冰、燕山山脉。
- ❌ 错误示范（严禁输出）：雪花几何拼接、长城剪影纹样、冰雪蓝渐变、速度感线条。（这是下游视觉设计师的工作，你不能越界提供视觉样式）。

# Domain Boundary (领域边界)
- **专业专注：** 你只处理与"涂装设计"、"工业设计意象"、"品牌视觉发散"相关的内容。
- **拒绝无关请求：** 当用户提出医疗、法律、理财、编程、情感建议或任何非设计领域的问题时，你必须拒绝回答。
- **拒绝话术：** "作为您的涂装设计助手，我专注于协助您探索设计灵感和意象。关于[用户的问题类别]，我建议您咨询相关的专业人士。我们是否回到当前设计主题的发散中继续讨论？"

# Output Format (标签输出规范)
为了让前端界面能识别并生成可交互的按钮，每当你向用户推荐具体的"意象"时，**必须**在回复的末尾，使用以下特定的 Markdown 格式输出标签：
- 格式要求：[TAG: 主题-意象] 或 [TAG: 意象]
- 示例 1（由主题引申出的意象）：[TAG: 中国文化-龙], [TAG: 冰雪运动-雪花]
- 示例 2（用户直接提出的无前缀意象）：[TAG: 燕山山脉]
请确保所有的 [TAG: xxx] 都独占一行或集中放置在回复的最后。

# Workflow Example
User: 我想做一款融合中国文化、京张精神和奥运元素的高铁涂装。
AI: 很好的需求。针对"中国文化"，我们可以联想到京张铁路沿线的"边塞文化"；针对"奥运元素"，我们可以聚焦"冰雪运动"。
关于具体的意象，针对中国文化，你倾向于使用传统的瑞兽还是自然地理？比如龙、长城；针对冰雪运动，雪花或者滑冰的姿态是不错的选择。你觉得哪个方向更合适？

[TAG: 中国文化-龙]
[TAG: 中国文化-长城]
[TAG: 冰雪运动-雪花]
[TAG: 冰雪运动-滑冰]

已选意象参考（用户当前已选择）：
${selectedTags.length > 0 ? selectedTags.map((t) => `- ${t.topic ? t.topic + '-' : ''}${t.label}`).join('\n') : '（暂无）'}`;

    const formattedMessages: DeepSeekMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m: ChatMessage) => ({
        role: m.role === 'ai' ? 'assistant' : m.role,
        content: m.content,
      })),
    ];

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: formattedMessages,
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepSeek API error: ${response.status} - ${errorText}`);
    }

    const jsonResult: DeepSeekResponse =
      await (response.json() as Promise<DeepSeekResponse>);
    return jsonResult;
  }

  async parseIntent(
    userInput: string,
    groups?: PatternGroupInput[],
  ): Promise<IntentParseResult> {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    const url = 'https://api.deepseek.com/chat/completions';
    const input = typeof userInput === 'string' ? userInput : '';
    const selected = Array.isArray(groups)
      ? groups.filter(group => group && typeof group.id === 'string'
          && typeof group.label === 'string' && Array.isArray(group.keywords))
        .map(group => ({ id: group.id, label: group.label, keywords: stringList(group.keywords) }))
      : undefined;
    let catalog: CatalogPattern[] | undefined;
    try {
      catalog = await this.getPatternCatalog();
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: intentPrompt(catalog) },
            { role: 'user', content: JSON.stringify({ userInput: input, groups: selected }) },
          ],
          temperature: 0.1,
          max_tokens: 2000,
        }),
      });
      if (!response.ok) return intentFallback(input, selected, catalog);
      const result = await response.json() as DeepSeekResponse;
      const content = result?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') return intentFallback(input, selected, catalog);
      const cleaned = content.trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '').trim();
      return groundIntent(JSON.parse(cleaned), input, catalog, selected);
    } catch {
      return intentFallback(input, selected, catalog);
    }
  }

  async searchPatterns(filters: PatternFilters): Promise<PatternResult[]> {
    return (await this.searchPatternGroups(filters)).patterns.slice(0, 100);
  }

  async getPatternGraph(input: unknown) {
    const ids = graphPatternIds(input);
    if (!ids.length) return buildPatternGraph([]);
    const catalog = await this.getPatternCatalog();
    const byId = new Map(catalog.map(pattern => [pattern.id, pattern]));
    return buildPatternGraph(ids.flatMap(id => byId.has(id) ? [byId.get(id)!] : []));
  }

  async getNativePatternGraph(input: unknown) {
    const scope = nativeScope(input);
    let ids = scope.ids.slice(scope.offset, scope.offset + NATIVE_PAGE_SIZE);
    let total = scope.ids.length;
    let patterns: PatternGroupResponse['patterns'] = [];
    if (scope.query) {
      const result = await this.searchPatternGroups(scope.query);
      const group = result.groups[0];
      ids = group ? scope.kind === 'direct' ? group.directIds : group.relatedIds : [];
      total = group ? scope.kind === 'direct' ? group.directTotal : group.relatedTotal : 0;
      patterns = result.patterns.filter(p => ids.includes(p.id));
    }
    const metadata = { total, offset:scope.offset, pageSize:NATIVE_PAGE_SIZE, patternCount:ids.length, patterns };
    if (!ids.length) return { ...serializeNativeGraph([]), ...metadata };
    const session = this.neo4jService.getSession();
    try {
      const result = await session.run(NATIVE_QUERY, { ids });
      return { ...serializeNativeGraph(result.records), ...metadata };
    } finally { await session.close(); }
  }

  async expandNativePatternNode(input: unknown) {
    const body = input as {nodeId?:unknown;offset?:unknown} | null;
    const nodeId = body?.nodeId;
    const offset = body?.offset ?? 0;
    if (typeof nodeId !== 'string' || !nodeId.startsWith('n:') || nodeId.length < 3 || nodeId.length > 250 || !Number.isSafeInteger(offset) || Number(offset) < 0)
      throw new BadRequestException('节点或分页参数无效');
    const session = this.neo4jService.getSession();
    try {
      const result = await session.run(`MATCH (p) WHERE elementId(p) = $elementId
        AND any(label IN labels(p) WHERE label IN ['Pattern','Motif','Dynasty','Material','Carrier','Layout','Level1','Level2'])
        OPTIONAL MATCH (p)-[r]-(neighbor)
        WHERE any(label IN labels(neighbor) WHERE label IN ['Pattern','Motif','Dynasty','Material','Carrier','Layout','Level1','Level2'])
        RETURN p, r, neighbor ORDER BY elementId(r) SKIP toInteger($offset) LIMIT 51`,
        {elementId:nodeId.slice(2),offset:Number(offset)});
      const graph = serializeNativeGraph(result.records.slice(0,50));
      const patterns = graph.nodes.filter(n=>n.labels.includes('Pattern') && n.properties.Pattern_ID).map(n=>({
        id:String(n.properties.Pattern_ID),name:n.label,imageUrl:String(n.properties['图片链接'] ?? ''),dynasty:String(n.properties['公元纪年'] ?? ''),description:String(n.properties.Pattern_ID),
      }));
      return {...graph,patterns,hasMore:result.records.length>50,nextOffset:Number(offset)+Math.min(50,result.records.length)};
    } finally {await session.close();}
  }

  async searchPatternGroups(
    query: PatternGroupQuery,
  ): Promise<PatternGroupResponse> {
    // Validate before an expensive catalog load, including for empty queries.
    const empty = discoverPatterns([], query?.userInput ? {...query, page:undefined} : query);
    if (query.userInput !== undefined && (typeof query.userInput !== 'string' || query.userInput.length > 2000))
      throw new BadRequestException('检索输入最多 2000 字');
    if (!empty.groups.length && !query.userInput?.trim()) return empty;
    const catalog = await this.getPatternCatalog();
    if (query.userInput?.trim()) {
      const parsed = intentFallback(query.userInput, undefined, catalog);
      query = {...query, ...parsed.filters, groups:parsed.filters.groups};
    }
    const plan = compilePatternQuery(query, catalog);
    const candidates = await this.loadPatternCatalog(plan.cypher, plan.params);
    return {...discoverPatterns(candidates, query, catalog), filters: {
      motifs: stringList(query.motifs), dynasties:stringList(query.dynasties), materials:stringList(query.materials),
      carriers:stringList(query.carriers), layouts:stringList(query.layouts), others:stringList(query.others),
      ...(query.groups ? {groups:query.groups} : {}),
    }};
  }

  private async getPatternCatalog(): Promise<CatalogPattern[]> {
    if (
      this.patternCatalog &&
      Date.now() - this.patternCatalog.loadedAt < 60_000
    )
      return this.patternCatalog.rows;
    if (!this.patternCatalogLoading) {
      this.patternCatalogLoading = this.loadPatternCatalog()
        .then((rows) => {
          this.patternCatalog = { loadedAt: Date.now(), rows };
          return rows;
        })
        .finally(() => {
          this.patternCatalogLoading = undefined;
        });
    }
    return this.patternCatalogLoading;
  }

  private async loadPatternCatalog(cypher = PATTERN_CATALOG_QUERY, params?: Record<string, unknown>): Promise<CatalogPattern[]> {
    const session = this.neo4jService.getSession();
    try {
      const result = params ? await session.run(cypher, params) : await session.run(cypher);
      const rows = new Map<string, CatalogPattern>();
      for (const record of result.records) {
        const id = String(record.get('patternId') ?? '').trim();
        const imageUrl = String(record.get('imageUrl') ?? '').trim();
        if (!id || !imageUrl || rows.has(id)) continue;
        const dynasties = stringList(record.get('dynasties'));
        const pairs: unknown = record.get('motifCategories');
        rows.set(id, {
          id,
          name: String(record.get('name') ?? ''),
          imageUrl,
          dynasty: dynasties.join('、') || String(record.get('dynasty') ?? ''),
          description: id,
          dynasties,
          motifs: stringList(record.get('motifs')),
          materials: stringList(record.get('materials')),
          carriers: stringList(record.get('carriers')),
          layouts: stringList(record.get('layouts')),
          categories: stringList(record.get('categories')),
          motifCategories: Array.isArray(pairs)
            ? pairs.filter(
                (pair): pair is { motif: string; category: string } =>
                  !!pair &&
                  typeof pair.motif === 'string' &&
                  typeof pair.category === 'string',
              )
            : [],
        });
      }
      return [...rows.values()].sort((a, b) => a.id.localeCompare(b.id));
    } finally {
      await session.close();
    }
  }

  async getSamplePatterns(): Promise<PatternResult[]> {
    const session = this.neo4jService.getSession();

    try {
      const query = `
        MATCH (p:Pattern)
        RETURN p.名称 AS name, p.图片链接 AS imageUrl, p.公元纪年 AS dynasty, p.Pattern_ID AS patternId
        LIMIT 20
      `;

      const result = await session.run(query);

      return result.records.map((record) => ({
        name: record.get('name') || '',
        imageUrl: record.get('imageUrl') || '',
        dynasty: record.get('dynasty') || '',
        description: record.get('patternId') || '',
      }));
    } finally {
      await session.close();
    }
  }

  async getDbSchema(): Promise<DbSchema> {
    const session = this.neo4jService.getSession();

    try {
      const nodeQuery = `CALL db.labels()`;
      const labelResult = await session.run(nodeQuery);
      const labels = labelResult.records.map((r) => r.get(0));

      const relQuery = `CALL db.relationshipTypes()`;
      const relResult = await session.run(relQuery);
      const relTypes = relResult.records.map((r) => r.get(0));

      const sampleQuery = `
        MATCH (p)
        WHERE keys(p) <> []
        RETURN p, labels(p) as nodeLabels
        LIMIT 5
      `;
      const sampleResult = await session.run(sampleQuery);
      const samples = sampleResult.records.map((r) => ({
        properties: r.get('p')?.properties || {},
        labels: r.get('nodeLabels'),
      }));

      return {
        labels,
        relationshipTypes: relTypes,
        sampleNodes: samples,
      };
    } finally {
      await session.close();
    }
  }

  async saveLayoutScheme(scheme: LayoutScheme): Promise<LayoutScheme> {
    if (scheme.layout3d !== undefined && (typeof scheme.projectId !== 'string' || !scheme.projectId.trim())) {
      throw new BadRequestException('保存 3D 布局需要 projectId，请先进入项目。');
    }
    if (scheme.layout3d !== undefined && (!scheme.componentsMap || typeof scheme.componentsMap !== 'object' || Array.isArray(scheme.componentsMap) || Object.keys(scheme.componentsMap).length !== 0)) {
      throw new BadRequestException('3D 布局 componentsMap 必须为空对象。');
    }
    const persisted = scheme.layout3d !== undefined ? await persistLayout3d(scheme.layout3d) : undefined;
    let session: ReturnType<Neo4jService['getSession']> | undefined;
    const timestamp = new Date().toISOString();

    try {
      session = this.neo4jService.getSession();
      const query = `
        CREATE (s:LayoutScheme {
          id: randomUUID(),
          name: $name,
          componentsMap: $componentsMap,
          layout3d: $layout3d,
          createdAt: $createdAt,
          projectId: $projectId
        })
        RETURN s.id AS id, s.name AS name, s.componentsMap AS componentsMap, s.layout3d AS layout3d, s.createdAt AS createdAt, s.updatedAt AS updatedAt, s.projectId AS projectId
      `;

      const result = await session.run(query, {
        name: scheme.name,
        componentsMap: JSON.stringify(scheme.componentsMap),
        layout3d: persisted ? JSON.stringify(persisted.layout3d) : null,
        createdAt: timestamp,
        projectId: scheme.projectId?.trim() || null,
      });

      if (result.records.length > 0) {
        const record = result.records[0];
        return {
          id: record.get('id'),
          name: record.get('name'),
          componentsMap: JSON.parse(record.get('componentsMap') || '{}'),
          ...(record.get('layout3d') ? { layout3d: JSON.parse(record.get('layout3d')) as Layout3d } : {}),
          createdAt: record.get('createdAt'),
          updatedAt: record.get('updatedAt') ?? undefined,
          projectId: record.get('projectId') ?? null,
        };
      }

      throw new Error('Failed to save layout scheme');
    } catch (error) {
      await persisted?.cleanup();
      throw error;
    } finally {
      await session?.close();
    }
  }

  async getLayoutSchemes(projectId?: string): Promise<LayoutScheme[]> {
    const session = this.neo4jService.getSession();

    try {
      const trimmedProjectId = projectId?.trim();
      const query = trimmedProjectId
        ? `
          MATCH (s:LayoutScheme {projectId: $projectId})
          RETURN s.id AS id, s.name AS name, s.componentsMap AS componentsMap, s.layout3d AS layout3d, s.createdAt AS createdAt, s.updatedAt AS updatedAt, s.projectId AS projectId
          ORDER BY s.createdAt DESC
        `
        : `
          MATCH (s:LayoutScheme)
          RETURN s.id AS id, s.name AS name, s.componentsMap AS componentsMap, s.layout3d AS layout3d, s.createdAt AS createdAt, s.updatedAt AS updatedAt, s.projectId AS projectId
          ORDER BY s.createdAt DESC
        `;

      const result = await session.run(
        query,
        trimmedProjectId ? { projectId: trimmedProjectId } : {},
      );

      return result.records.map((record) => ({
        id: record.get('id'),
        name: record.get('name'),
        componentsMap: JSON.parse(record.get('componentsMap') || '{}'),
        ...(record.get('layout3d') ? { layout3d: JSON.parse(record.get('layout3d')) as Layout3d } : {}),
        createdAt: record.get('createdAt'),
        updatedAt: record.get('updatedAt') ?? undefined,
        projectId: record.get('projectId') ?? null,
      }));
    } finally {
      await session.close();
    }
  }

  async getLayoutSchemeById(id: string): Promise<LayoutScheme | null> {
    const session = this.neo4jService.getSession();

    try {
      const query = `
        MATCH (s:LayoutScheme {id: $id})
        RETURN s.id AS id, s.name AS name, s.componentsMap AS componentsMap, s.layout3d AS layout3d, s.createdAt AS createdAt, s.updatedAt AS updatedAt, s.projectId AS projectId
      `;

      const result = await session.run(query, { id });

      if (result.records.length > 0) {
        const record = result.records[0];
        return {
          id: record.get('id'),
          name: record.get('name'),
          componentsMap: JSON.parse(record.get('componentsMap') || '{}'),
          ...(record.get('layout3d') ? { layout3d: JSON.parse(record.get('layout3d')) as Layout3d } : {}),
          createdAt: record.get('createdAt'),
          updatedAt: record.get('updatedAt') ?? undefined,
          projectId: record.get('projectId') ?? null,
        };
      }

      return null;
    } finally {
      await session.close();
    }
  }

  async deleteLayoutScheme(id: string): Promise<boolean> {
    const session = this.neo4jService.getSession();

    try {
      const query = `
        MATCH (s:LayoutScheme {id: $id})
        WITH collect(s) AS schemes
        FOREACH (s IN schemes | DETACH DELETE s)
        RETURN size(schemes) AS deletedCount
      `;

      const result = await session.run(query, { id });
      const deletedCount = result.records[0]?.get('deletedCount');

      if (typeof deletedCount === 'number') {
        return deletedCount > 0;
      }

      if (
        deletedCount &&
        typeof (deletedCount as { toNumber?: unknown }).toNumber === 'function'
      ) {
        return (deletedCount as { toNumber: () => number }).toNumber() > 0;
      }

      return Number(deletedCount ?? 0) > 0;
    } finally {
      await session.close();
    }
  }

  async renameLayoutScheme(id: string, name: string): Promise<LayoutScheme> {
    const normalizedName = name.trim();

    if (!normalizedName) {
      throw new Error('Layout scheme name cannot be empty');
    }

    const session = this.neo4jService.getSession();
    const updatedAt = new Date().toISOString();

    try {
      const query = `
        MATCH (s:LayoutScheme {id: $id})
        SET s.name = $name,
            s.updatedAt = $updatedAt
        RETURN s.id AS id, s.name AS name, s.componentsMap AS componentsMap, s.layout3d AS layout3d, s.createdAt AS createdAt, s.updatedAt AS updatedAt, s.projectId AS projectId
      `;

      const result = await session.run(query, {
        id,
        name: normalizedName,
        updatedAt,
      });

      if (result.records.length === 0) {
        throw new Error('Layout scheme not found');
      }

      const record = result.records[0];

      return {
        id: record.get('id'),
        name: record.get('name'),
        componentsMap: JSON.parse(record.get('componentsMap') || '{}'),
        ...(record.get('layout3d') ? { layout3d: JSON.parse(record.get('layout3d')) as Layout3d } : {}),
        createdAt: record.get('createdAt'),
        updatedAt: record.get('updatedAt') ?? undefined,
        projectId: record.get('projectId') ?? null,
      };
    } finally {
      await session.close();
    }
  }
}

export interface IntentParseResult {
  reasoning: string;
  filters: PatternFilters & { groups?: PatternGroupInput[] };
  search_strategy: 'match_exact' | 'fuzzy_semantic';
}

export interface PatternResult {
  name: string;
  imageUrl: string;
  dynasty: string;
  description: string;
}
