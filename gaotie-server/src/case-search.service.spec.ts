import { CaseSearchService } from './case-search.service';
import { Neo4jCaseService } from './neo4j-case.service';

function createRecord(values: Record<string, unknown>) {
  return {
    get: jest.fn((key: string) => values[key]),
  };
}

function createServiceWithSession(records: Array<{ get: jest.Mock }>) {
  const session = {
    run: jest.fn().mockResolvedValue({ records }),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const neo4jCaseService = {
    health: jest.fn().mockResolvedValue({ available: true, reason: 'ready', trainCount: 86 }),
    getSession: jest.fn().mockReturnValue(session),
  } as unknown as Neo4jCaseService;

  return {
    service: new CaseSearchService(neo4jCaseService),
    session,
  };
}

describe('CaseSearchService', () => {
  const originalFetch = global.fetch;
  const originalDeepSeekApiKey = process.env.DEEPSEEK_API_KEY;

  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('DeepSeek unavailable'));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalDeepSeekApiKey === undefined) {
      delete process.env.DEEPSEEK_API_KEY;
    } else {
      process.env.DEEPSEEK_API_KEY = originalDeepSeekApiKey;
    }
    jest.restoreAllMocks();
  });

  it('searches train nodes and related graph metadata with expanded terms', async () => {
    const { service, session } = createServiceWithSession([
      createRecord({
        id: 'Train_68',
        title: 'KCIC400AF',
        image: '样本图片/L68.png',
        country: '印度尼西亚',
        speed: 400,
        year: 2023,
        operator: 'KCIC',
        manufacturer: 'CRRC Qingdao Sifang',
        features: ['水平贯穿式', '白色', '流线楔形'],
      }),
    ]);

    await expect(service.searchCases('中车 白色')).resolves.toEqual({
      status: 'success',
      reply: '为您找到以下与"中车 白色"相关的列车设计案例，供您参考：',
      cases: [
        {
          id: 'Train_68',
          title: 'KCIC400AF',
          image: '样本图片/L68.png',
          description:
            '国家：印度尼西亚；设定速度：400 km/h；投入年份：2023；运营商：KCIC；制造商：CRRC Qingdao Sifang；设计特征：水平贯穿式、白色、流线楔形',
        },
      ],
    });

    const [cypher, params] = session.run.mock.calls[0] as [
      string,
      { terms: string[] },
    ];
    expect(cypher).toContain('MATCH (t:Train)');
    expect(cypher).toContain('HAS_FEATURE');
    expect(cypher).toContain('t.`图片本地路径` AS image');
    expect(params.terms).toEqual(
      expect.arrayContaining(['中车', 'CRRC', 'CRRC Qingdao Sifang', '白色']),
    );
    expect(session.close).toHaveBeenCalled();
  });

  it('returns a helpful empty response when no train matches', async () => {
    const { service } = createServiceWithSession([]);

    await expect(service.searchCases('不存在的车型')).resolves.toEqual({
      status: 'success',
      reply:
        '未找到与"不存在的车型"相关的案例，请尝试车型、国家、制造商、颜色或设计特征等关键词。',
      cases: [],
    });
  });

  it('extracts useful keywords from natural language case search phrases', async () => {
    const { service, session } = createServiceWithSession([]);

    await service.searchCases('中国地区的高铁');
    await service.searchCases('法国案例');
    await service.searchCases('中车的案例');

    expect(session.run.mock.calls[0][1]).toEqual({
      terms: expect.arrayContaining(['中国', 'China Railway']),
    });
    expect(session.run.mock.calls[1][1]).toEqual({
      terms: expect.arrayContaining(['法国']),
    });
    expect(session.run.mock.calls[2][1]).toEqual({
      terms: expect.arrayContaining(['中车', 'CRRC', 'CRRC Qingdao Sifang']),
    });
  });

  it('expands design attribute phrases into graph feature terms', async () => {
    const { service, session } = createServiceWithSession([]);

    await service.searchCases('车身主色为白色的案例');
    await service.searchCases('车窗带贯穿的案例');

    expect(session.run.mock.calls[0][1]).toEqual({
      terms: expect.arrayContaining(['白色']),
    });
    expect(session.run.mock.calls[1][1]).toEqual({
      terms: expect.arrayContaining(['水平贯穿式']),
    });
  });

  it('translates design element codes into graph feature terms', async () => {
    const { service, session } = createServiceWithSession([]);

    await service.searchCases('车窗带采用A3布局的列车');

    expect(session.run.mock.calls[0][1]).toEqual({
      terms: expect.arrayContaining(['A3', '独立色块式']),
    });
  });

  it('uses DeepSeek intent keywords when building graph search terms', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                reasoning: '用户想找白色主色且车窗带贯穿的中国高铁案例',
                keywords: ['白色', '水平贯穿式', '中国'],
              }),
            },
          },
        ],
      }),
    } as Response);
    const { service, session } = createServiceWithSession([]);

    await service.searchCases('找一些车身主色为白色、车窗带贯穿的中国案例');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.deepseek.com/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-deepseek-key',
        }),
      }),
    );
    expect(session.run.mock.calls[0][1]).toEqual({
      terms: expect.arrayContaining(['白色', '水平贯穿式', '中国']),
    });
  });
});

 it('fails before model extraction when the case dependency is unavailable', async () => {
   const dependency = { health: jest.fn().mockResolvedValue({available: false, message: '案例数据库未就绪'}), getSession: jest.fn() };
   const service = new CaseSearchService(dependency as unknown as Neo4jCaseService);
   const fetchSpy = jest.spyOn(global, 'fetch');
   expect(await service.searchCases('复兴号')).toEqual({status: 'error', reply: '案例数据库未就绪', cases: []});
   expect(fetchSpy).not.toHaveBeenCalled();
   expect(dependency.getSession).not.toHaveBeenCalled();
   fetchSpy.mockRestore();
 });
