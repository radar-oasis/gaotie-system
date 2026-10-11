import { AppService } from './app.service';
import { Neo4jService } from './neo4j.service';
import { CatalogPattern, discoverPatterns } from './pattern-discovery';

const pattern = (
  id: string,
  motifs: string[],
  extra: Partial<CatalogPattern> = {},
): CatalogPattern => ({
  id,
  name: `${id}纹样`,
  imageUrl: `${id}.png`,
  dynasty: '唐',
  description: id,
  motifs,
  dynasties: ['唐'],
  materials: ['青铜'],
  carriers: ['铜镜'],
  layouts: ['连续'],
  categories: ['瑞兽神禽'],
  motifCategories: motifs.map((motif) => ({ motif, category: '瑞兽神禽' })),
  ...extra,
});
const catalog = [
  pattern('dragon', ['龙']),
  pattern('phoenix', ['凤']),
  pattern('generic-beast', ['神兽']),
  pattern('kite', ['风筝'], { carriers: ['纸制品'] }),
  pattern('kite-carrier', [], { name: '锣鼓燕风筝', carriers: ['风筝'] }),
  pattern('cloud', ['云'], {
    categories: ['水象与气象'],
    carriers: ['图案', '图'],
    dynasties: ['明', '清'],
  }),
  pattern('elephant', ['象']),
];

describe('semantic pattern retrieval regressions', () => {
  let service: AppService;
  let fetchMock: jest.SpyInstance;
  let session: { run: jest.Mock; close: jest.Mock };
  beforeEach(() => {
    session = {
      run: jest.fn().mockResolvedValue({ records: [] }),
      close: jest.fn().mockResolvedValue(undefined),
    };
    service = new AppService({
      getSession: () => session,
    } as unknown as Neo4jService);
    jest.spyOn(service as any, 'getPatternCatalog').mockResolvedValue(catalog);
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => jest.restoreAllMocks());
  const reply = (payload: unknown) => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(payload) } }],
    }),
  });
  it('does not reinterpret bare kite imagery as an obligatory carrier', async () => {
    fetchMock.mockResolvedValue(
      reply({ filters: { motifs: ['风筝'], carriers: ['风筝'] } }),
    );
    const result = await service.parseIntent('风筝');
    expect(result.filters.motifs).toEqual(['风筝']);
    expect(result.filters.carriers).toEqual([]);
  });
  it('treats explicit on-kite wording as a carrier instead of requiring a kite motif', async () => {
    fetchMock.mockResolvedValue(
      reply({ filters: { motifs: ['风筝'], carriers: ['风筝'] } }),
    );
    const result = await service.parseIntent('风筝上的纹样');
    expect(result.filters.carriers).toEqual(['风筝']);
    expect(result.filters.motifs).toEqual([]);
  });
  it.each(['唐代的龙纹样', '帮我找一些唐朝的龙纹图案'])(
    'retains compound intent offline: %s',
    async (input) => {
      fetchMock.mockRejectedValue(new Error('offline'));
      const result = await service.parseIntent(input);
      expect(result.filters.motifs).toEqual(['龙']);
      expect(result.filters.dynasties).toEqual(['唐']);
      expect(result.filters.carriers).toEqual([]);
      expect(result.reasoning).toContain('唐');
    },
  );
  it('does not drop a dynasty when the model uses another dynasty suffix', async () => {
    fetchMock.mockResolvedValue(
      reply({ filters: { motifs: ['龙'], dynasties: ['唐朝'] } }),
    );
    expect(
      (await service.parseIntent('唐代的龙纹样')).filters.dynasties,
    ).toEqual(['唐']);
  });
  it('keeps a known explicit entity when the model replaces it with another concept', async () => {
    fetchMock.mockResolvedValue(reply({ filters: { motifs: ['凤'] } }));
    expect((await service.parseIntent('风筝')).filters.motifs).toEqual([
      '风筝',
    ]);
  });
  it.each(['想要明亮一点的龙纹样', '找清新一些的风筝图案', '色彩鲜明的龙纹样'])(
    'does not treat an adjective as a dynasty: %s',
    async (input) => {
      fetchMock.mockResolvedValue(
        reply({ filters: { motifs: [input.includes('龙') ? '龙' : '风筝'] } }),
      );
      expect((await service.parseIntent(input)).filters.dynasties).toEqual([]);
    },
  );
  it('does not interpret the end of an adjective as a dynasty', async () => {
    fetchMock.mockResolvedValue(reply({ filters: { motifs: ['龙'] } }));
    expect(
      (await service.parseIntent('色彩鲜明的龙纹样')).filters.dynasties,
    ).toEqual([]);
  });
  it('keeps shorthand dynasty + imagery together', async () => {
    fetchMock.mockResolvedValue(
      reply({ filters: { motifs: ['龙'], dynasties: ['唐'] } }),
    );
    expect((await service.parseIntent('唐龙纹')).filters.dynasties).toEqual([
      '唐',
    ]);
  });
  it.each(['想要青铜色的龙纹样', '比铜镜更大的龙纹样'])(
    'does not convert appearance or comparison into a hard facet: %s',
    async (input) => {
      fetchMock.mockResolvedValue(reply({ filters: { motifs: ['龙'] } }));
      const parsed = await service.parseIntent(input);
      expect(parsed.filters.materials).toEqual([]);
      expect(parsed.filters.carriers).toEqual([]);
    },
  );
  it('separates a model-mixed dynasty from a fuzzy imagery group', async () => {
    fetchMock.mockResolvedValue(
      reply({
        filters: { dynasties: ['唐'] },
        groups: [
          {
            id: 'g1',
            label: '想找唐代有神兽感觉的纹样',
            keywords: ['神兽', '唐'],
          },
        ],
      }),
    );
    const parsed = await service.parseIntent('想找唐代有神兽感觉的纹样');
    expect(parsed.filters.motifs).toEqual(['瑞兽神禽']);
    expect(parsed.filters.dynasties).toEqual(['唐']);
  });
  it('keeps grounded suggestions from a fuzzy group when another suggestion is unknown', async () => {
    fetchMock.mockResolvedValue(
      reply({
        filters: {},
        groups: [
          { id: 'g1', label: '威武的感觉', keywords: ['龙', '不存在的母题'] },
        ],
      }),
    );
    expect((await service.parseIntent('威武的感觉')).filters.motifs).toEqual([
      '龙',
    ]);
  });
  it('accepts a grounded fuzzy category without inventing a carrier', async () => {
    fetchMock.mockResolvedValue(
      reply({ filters: { motifs: ['瑞兽神禽'], carriers: ['铜镜'] } }),
    );
    const result = await service.parseIntent('想找有神兽感觉的纹样');
    expect(result.filters.motifs).toEqual(['瑞兽神禽']);
    expect(result.filters.carriers).toEqual([]);
  });
  it('does not promote a partial imagery hit on a carrier or material into a direct result', () => {
    const rows = [
      pattern('kite', ['风筝']),
      pattern('music', ['古筝']),
      pattern('carrier-only', [], { materials: ['风筝'], carriers: ['风筝'] }),
    ];
    expect(
      discoverPatterns(rows, { motifs: ['筝'] }).groups[0].directIds.sort(),
    ).toEqual(['kite', 'music']);
  });
  it('recovers a raw compound query when the frontend parser request failed', async () => {
    await service.searchPatternGroups({
      userInput: '唐代的龙纹样',
      motifs: ['唐代的龙纹样'],
    } as any);
    expect(session.run).toHaveBeenCalled();
    expect(session.run.mock.calls[0][1]).toMatchObject({
      dynasties: ['唐'],
      groups: [expect.objectContaining({ motifs: ['龙'] })],
    });
  });
  it('executes a parameterized relationship query and respects an empty graph result', async () => {
    const result = await service.searchPatternGroups({
      motifs: ['龙'],
      dynasties: ['唐'],
    });
    expect(session.run).toHaveBeenCalledWith(
      expect.stringContaining('CONTAINS_MOTIF'),
      expect.any(Object),
    );
    const [cypher, params] = session.run.mock.calls[0];
    expect(cypher).toContain('BELONGS_TO_DYNASTY');
    expect(cypher).toContain('HAS_SUBCLASS');
    expect(cypher).not.toContain('唐');
    expect(JSON.stringify(params)).toContain('唐');
    expect(result.patterns).toEqual([]);
    expect(session.close).toHaveBeenCalled();
  });
});
