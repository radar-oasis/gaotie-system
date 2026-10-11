import { withDependencyDeadline, closeSessionWithoutBlocking } from './dependency-deadline';
import { Injectable } from '@nestjs/common';
import { Neo4jCaseService } from './neo4j-case.service';

export interface CaseReference {
  id: string;
  title: string;
  image: string;
  description?: string;
}

export interface ChatResponse {
  status: 'success' | 'error';
  reply: string;
  cases: CaseReference[];
}

interface DeepSeekCaseIntent {
  keywords?: string[];
  countries?: string[];
  operators?: string[];
  manufacturers?: string[];
  features?: string[];
  colors?: string[];
  trainModels?: string[];
}

interface DeepSeekResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

const DESIGN_CODE_TERMS: Record<string, string[]> = {
  A1: ['水平贯穿式'],
  A2: ['车门间隔式'],
  A3: ['独立色块式'],
  A4: ['无车窗带'],
  B1: ['流线动态型'],
  B2: ['平直几何型'],
  B3: ['复合多线型'],
  B4: ['大面积涂抹'],
  B5: ['无色带'],
  C1: ['车门施色'],
  C2: ['车门不施色'],
  D1: ['裙板施色'],
  D2: ['裙板不施色'],
  E1: ['低于车门'],
  E2: ['覆盖车门'],
  E3: ['绕开车门'],
  E4: ['无下车体色块'],
  F1: ['全包裹式'],
  F2: ['线条勾勒式'],
  F3: ['半包裹（中）'],
  F4: ['全包裹（顶）'],
  F5: ['完全留白'],
  G1: ['触及车门'],
  G2: ['不触及车门'],
  G3: ['无车顶侧色块'],
  H1: ['流线楔形'],
  H2: ['钝体形'],
  H3: ['长鼻形'],
  I1: ['水滴形'],
  I2: ['四边形'],
  I3: ['三角/楔形'],
  J1: ['银灰'],
  J2: ['白色'],
  J3: ['蓝色'],
  J4: ['紫色'],
  J5: ['红色'],
  J6: ['绿色'],
  J7: ['黑色'],
  J8: ['橙色'],
  K1: ['红'],
  K2: ['橙'],
  K3: ['黄'],
  K4: ['绿'],
  K5: ['蓝'],
  K6: ['紫'],
  K7: ['黑'],
  K8: ['白'],
  K9: ['灰'],
};

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeNeo4jNumber(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object' && 'toNumber' in value) {
    return String((value as { toNumber: () => number }).toNumber());
  }
  return normalizeText(value);
}

function buildSearchTerms(query: string): string[] {
  const normalizedQuery = query
    .replace(
      /(地区的|的案例|案例|相关|地区|高铁|列车|动车|请|帮我|查找|搜索|有关|关于)/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();

  const terms = [query, normalizedQuery]
    .join(' ')
    .split(/[\s,，、;；]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);

  const expanded = new Set(terms);
  const lowerQuery = query.toLowerCase();
  const designCodes = query.toUpperCase().match(/[A-K][1-9]/g) ?? [];

  for (const code of designCodes) {
    expanded.add(code);
    for (const term of DESIGN_CODE_TERMS[code] ?? []) {
      expanded.add(term);
    }
  }

  if (query.includes('中车') || lowerQuery.includes('crrc')) {
    expanded.add('中车');
    expanded.add('CRRC');
    expanded.add('CRRC Qingdao Sifang');
  }
  if (query.includes('复兴') || lowerQuery.includes('fuxing')) {
    expanded.add('Fuxing');
    expanded.add('CR400');
  }
  if (query.includes('中国')) {
    expanded.add('中国');
    expanded.add('China Railway');
  }

  const colorTerms = [
    '白色',
    '银灰',
    '蓝色',
    '红色',
    '黑色',
    '绿色',
    '橙色',
    '紫色',
    '白',
    '灰',
    '蓝',
    '红',
    '黑',
    '绿',
    '橙',
    '紫',
    '黄',
  ];
  for (const color of colorTerms) {
    if (query.includes(color)) {
      expanded.add(color);
    }
  }

  if (query.includes('主色') || query.includes('车身主色')) {
    expanded.add('MainColorFeature');
  }
  if (
    query.includes('辅色') ||
    query.includes('辅助色') ||
    query.includes('点缀色')
  ) {
    expanded.add('AccentColorFeature');
  }
  if (query.includes('车窗带') && query.includes('贯穿')) {
    expanded.add('水平贯穿式');
  }
  if (query.includes('车窗带') && query.includes('间隔')) {
    expanded.add('车门间隔式');
  }
  if (
    query.includes('车窗带') &&
    (query.includes('独立') || query.includes('色块'))
  ) {
    expanded.add('独立色块式');
  }
  if (
    query.includes('无车窗带') ||
    (query.includes('车窗带') && query.includes('无'))
  ) {
    expanded.add('无车窗带');
  }

  return Array.from(expanded);
}

function joinDescription(parts: string[]): string | undefined {
  const description = parts.filter(Boolean).join('；');
  return description || undefined;
}

function uniqueTerms(terms: string[]): string[] {
  return Array.from(
    new Set(
      terms
        .map((term) => normalizeText(term))
        .filter((term) => term.length >= 2),
    ),
  );
}

function parseJsonObject(content: string): unknown {
  const cleanedContent = content
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
  return JSON.parse(cleanedContent);
}

@Injectable()
export class CaseSearchService {
  constructor(private readonly neo4jCaseService: Neo4jCaseService) {}

  private async extractCaseSearchTerms(query: string): Promise<string[]> {
    const localTerms = buildSearchTerms(query);
    const apiKey = process.env.DEEPSEEK_API_KEY;

    if (!apiKey) {
      return localTerms;
    }

    try {
      const response = await fetch(
        'https://api.deepseek.com/chat/completions',
        {
          method: 'POST',
          signal: AbortSignal.timeout(3500),
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
              {
                role: 'system',
                content: `你是高铁列车案例知识图谱的检索意图解析器。请把用户自然语言转成可用于 Neo4j 检索的关键词。

知识图谱字段：
- Train 节点属性：name, 国家, 运营商, 制造商, 设定速度, 投入年份, 图片本地路径
- 关系特征：车窗带、色带、车门、裙板、下车体、车头侧、车顶侧、车头形态、车窗形态、主色、辅助色
- 常见特征值：水平贯穿式、车门间隔式、独立色块式、无车窗带、白色、银灰、蓝色、红色、黑色、绿色、橙色、紫色、流线楔形、长鼻形、钝体形、三角/楔形、四边形、水滴形

只输出 JSON，不要 markdown。格式：
{
  "keywords": ["用于检索的词"],
  "countries": [],
  "operators": [],
  "manufacturers": [],
  "features": [],
  "colors": [],
  "trainModels": []
}

规则：
- “车身主色为白色”提取为 colors:["白色"]。
- “车窗带贯穿”提取为 features:["水平贯穿式"]。
- “车窗带采用A3布局”提取为 keywords:["A3"], features:["独立色块式"]。
- 编码映射：A1=水平贯穿式, A2=车门间隔式, A3=独立色块式, A4=无车窗带, B1=流线动态型, B2=平直几何型, B3=复合多线型, B4=大面积涂抹, B5=无色带, C1=车门施色, C2=车门不施色, D1=裙板施色, D2=裙板不施色, E1=低于车门, E2=覆盖车门, E3=绕开车门, E4=无下车体色块, F1=全包裹式, F2=线条勾勒式, F3=半包裹（中）, F4=全包裹（顶）, F5=完全留白, G1=触及车门, G2=不触及车门, G3=无车顶侧色块, H1=流线楔形, H2=钝体形, H3=长鼻形, I1=水滴形, I2=四边形, I3=三角/楔形。
- “中车”提取为 manufacturers:["CRRC","CRRC Qingdao Sifang"]。
- 不要编造图谱没有的复杂字段。`,
              },
              { role: 'user', content: query },
            ],
            temperature: 0.1,
            max_tokens: 600,
          }),
        },
      );

      if (!response.ok) {
        return localTerms;
      }

      const result = (await response.json()) as DeepSeekResponse;
      const content = result.choices?.[0]?.message?.content;
      if (!content) {
        return localTerms;
      }

      const intent = parseJsonObject(content) as DeepSeekCaseIntent;
      const modelTerms = [
        ...(intent.keywords ?? []),
        ...(intent.countries ?? []),
        ...(intent.operators ?? []),
        ...(intent.manufacturers ?? []),
        ...(intent.features ?? []),
        ...(intent.colors ?? []),
        ...(intent.trainModels ?? []),
      ];

      return uniqueTerms([...localTerms, ...modelTerms]);
    } catch {
      return localTerms;
    }
  }

  async health() { return this.neo4jCaseService.health(); }

  async searchCases(query: string): Promise<ChatResponse> {
    const health = await this.health();
    if (!health.available) return { status: 'error', reply: health.message, cases: [] };
    const session = this.neo4jCaseService.getSession();
    try {
      const terms = await withDependencyDeadline(() => this.extractCaseSearchTerms(query), 3600).catch(() => buildSearchTerms(query));
      const cypher = `
        MATCH (t:Train)
        OPTIONAL MATCH (t)-[:HAS_FEATURE]->(feature)
        WITH t, collect(DISTINCT feature.name) AS featureNames, $terms AS terms
        OPTIONAL MATCH (t)-[:BELONGS_TO|OPERATED_BY|MANUFACTURED_BY]->(meta)
        WITH t, featureNames, collect(DISTINCT meta.name) AS relationNames, terms
        WITH t, featureNames, terms, featureNames + relationNames AS metadataNames
        WITH t, featureNames, metadataNames,
          reduce(score = 0, term IN terms |
            score
            + CASE WHEN toLower(coalesce(t.name, '')) CONTAINS toLower(term) THEN 100 ELSE 0 END
            + CASE WHEN toLower(coalesce(t.国家, '')) CONTAINS toLower(term) THEN 45 ELSE 0 END
            + CASE WHEN toLower(coalesce(t.运营商, '')) CONTAINS toLower(term) THEN 40 ELSE 0 END
            + CASE WHEN toLower(coalesce(t.制造商, '')) CONTAINS toLower(term) THEN 40 ELSE 0 END
            + CASE WHEN toString(coalesce(t.设定速度, '')) CONTAINS term THEN 35 ELSE 0 END
            + CASE WHEN toString(coalesce(t.投入年份, '')) CONTAINS term THEN 25 ELSE 0 END
            + CASE WHEN any(name IN metadataNames WHERE toLower(coalesce(name, '')) CONTAINS toLower(term)) THEN 30 ELSE 0 END
          ) AS score
        WHERE score > 0
        RETURN t.id AS id,
          t.name AS title,
          t.\`图片本地路径\` AS image,
          t.国家 AS country,
          t.设定速度 AS speed,
          t.投入年份 AS year,
          t.运营商 AS operator,
          t.制造商 AS manufacturer,
          featureNames AS features,
          score
        ORDER BY score DESC, title ASC
        LIMIT 20
      `;
      const result = await withDependencyDeadline(() => session.run(cypher, { terms }, { timeout: 4000 }), 4200);
      const cases: CaseReference[] = result.records.map((record) => ({
        id: normalizeText(record.get('id')),
        title: normalizeText(record.get('title')),
        image: normalizeText(record.get('image')),
        description: joinDescription(
          [
            normalizeText(record.get('country')) &&
              `国家：${normalizeText(record.get('country'))}`,
            normalizeNeo4jNumber(record.get('speed')) &&
              `设定速度：${normalizeNeo4jNumber(record.get('speed'))} km/h`,
            normalizeNeo4jNumber(record.get('year')) &&
              `投入年份：${normalizeNeo4jNumber(record.get('year'))}`,
            normalizeText(record.get('operator')) &&
              `运营商：${normalizeText(record.get('operator'))}`,
            normalizeText(record.get('manufacturer')) &&
              `制造商：${normalizeText(record.get('manufacturer'))}`,
            Array.isArray(record.get('features')) &&
              (record.get('features') as unknown[])
                .map(normalizeText)
                .filter(Boolean).length > 0 &&
              `设计特征：${(record.get('features') as unknown[])
                .map(normalizeText)
                .filter(Boolean)
                .join('、')}`,
          ].filter((part): part is string => typeof part === 'string'),
        ),
      }));

      const reply =
        cases.length > 0
          ? `为您找到以下与"${query}"相关的列车设计案例，供您参考：`
          : `未找到与"${query}"相关的案例，请尝试车型、国家、制造商、颜色或设计特征等关键词。`;

      return {
        status: 'success',
        reply,
        cases,
      };
    } catch (error) {
      console.error('Case search failed:', error instanceof Error ? error.name : 'UnknownError');
      return {
        status: 'error',
        reply: '案例查询失败，请检查案例服务后重试；也可跳过案例继续设计。',
        cases: [],
      };
    } finally {
      closeSessionWithoutBlocking(session);
    }
  }

  async getAllCases(): Promise<ChatResponse> {
    const health = await this.health();
    if (!health.available) return { status: 'error', reply: health.message, cases: [] };
    const session = this.neo4jCaseService.getSession();
    try {
      const cypher = `
        MATCH (t:Train)
        OPTIONAL MATCH (t)-[:HAS_FEATURE]->(feature)
        RETURN t.id AS id,
          t.name AS title,
          t.\`图片本地路径\` AS image,
          t.国家 AS country,
          t.设定速度 AS speed,
          t.投入年份 AS year,
          t.运营商 AS operator,
          t.制造商 AS manufacturer,
          collect(DISTINCT feature.name) AS features
        ORDER BY title ASC
        LIMIT 50
      `;
      const result = await withDependencyDeadline(() => session.run(cypher, {}, { timeout: 4000 }), 4200);
      const cases: CaseReference[] = result.records.map((record) => ({
        id: normalizeText(record.get('id')),
        title: normalizeText(record.get('title')),
        image: normalizeText(record.get('image')),
        description: joinDescription(
          [
            normalizeText(record.get('country')) &&
              `国家：${normalizeText(record.get('country'))}`,
            normalizeNeo4jNumber(record.get('speed')) &&
              `设定速度：${normalizeNeo4jNumber(record.get('speed'))} km/h`,
            normalizeNeo4jNumber(record.get('year')) &&
              `投入年份：${normalizeNeo4jNumber(record.get('year'))}`,
            normalizeText(record.get('operator')) &&
              `运营商：${normalizeText(record.get('operator'))}`,
            normalizeText(record.get('manufacturer')) &&
              `制造商：${normalizeText(record.get('manufacturer'))}`,
            Array.isArray(record.get('features')) &&
              (record.get('features') as unknown[])
                .map(normalizeText)
                .filter(Boolean).length > 0 &&
              `设计特征：${(record.get('features') as unknown[])
                .map(normalizeText)
                .filter(Boolean)
                .join('、')}`,
          ].filter((part): part is string => typeof part === 'string'),
        ),
      }));

      return {
        status: 'success',
        reply: '为您展示所有列车设计案例：',
        cases,
      };
    } catch (error) {
      console.error('Case search failed:', error instanceof Error ? error.name : 'UnknownError');
      return {
        status: 'error',
        reply: '案例查询失败，请检查案例服务后重试；也可跳过案例继续设计。',
        cases: [],
      };
    } finally {
      closeSessionWithoutBlocking(session);
    }
  }

  async saveSelectedCases(
    selectedCases: Array<{ id: string; description?: string }>,
  ): Promise<boolean> {
    const session = this.neo4jCaseService.getSession();
    try {
      for (const selectedCase of selectedCases) {
        const cypher = `
          MATCH (t:Train {id: $id})
          SET t.userDescription = $description,
              t.selectedAt = datetime()
          RETURN t.id
        `;
        await session.run(cypher, {
          id: selectedCase.id,
          description: selectedCase.description || '',
        });
      }
      return true;
    } catch (error) {
      console.error('Save selected cases error:', error);
      return false;
    } finally {
      closeSessionWithoutBlocking(session);
    }
  }
}
