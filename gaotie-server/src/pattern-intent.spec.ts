import { AppService } from './app.service';
import { Neo4jService } from './neo4j.service';
import { CatalogPattern } from './pattern-discovery';

describe('catalog grounded intent parsing', () => {
  let service: AppService;
  let fetchMock: jest.SpyInstance;
  const groups = [
    { id: 'elephant', label: '大象', keywords: ['大象'] },
    { id: 'phoenix', label: '凤凰', keywords: ['凤凰'] },
  ];
  const parse = (input: string, selected?: typeof groups) =>
    service.parseIntent(input, selected);
  const reply = (value: unknown) =>
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(value) } }],
      }),
    });
  beforeEach(() => {
    service = new AppService({} as Neo4jService);
    jest
      .spyOn(
        service as unknown as {
          getPatternCatalog(): Promise<CatalogPattern[]>;
        },
        'getPatternCatalog',
      )
      .mockResolvedValue([
        {
          motifs: ['象', '凤', '云'],
          categories: ['瑞兽神禽'],
          id: 'p1',
          name: '纹样',
          imageUrl: '/p.png',
          dynasty: '唐',
          description: '',
          motifCategories: [{ motif: '凤', category: '瑞兽神禽' }],
          dynasties: ['唐'],
          materials: ['青铜'],
          carriers: ['建筑'],
          layouts: ['连续'],
        },
      ]);
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => fetchMock.mockRestore());

  it('supplies real vocabulary and preserves structured group identity', async () => {
    reply({
      filters: { materials: ['青铜'] },
      groups: [
        { id: 'phoenix', label: '改名', keywords: ['凤'] },
        { id: 'elephant', label: '改名', keywords: ['象'] },
      ],
    });
    const result = await parse('大象、凤凰', groups);
    expect(result.filters.groups).toEqual([
      { ...groups[0], keywords: ['象'] },
      { ...groups[1], keywords: ['凤'] },
    ]);
    expect(result.filters.materials).toEqual([]);
    expect(result.reasoning).toContain('大象 → 象');
    expect(
      JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content,
    ).toContain('瑞兽神禽');
    expect(fetchMock.mock.calls[0][1].signal).toBeDefined();
  });
  it('retains every group and original terms when a model drops or fabricates mappings', async () => {
    reply({
      groups: [{ id: 'elephant', keywords: ['独角飞象'] }],
      filters: {},
    });
    const result = await parse('大象、凤凰', groups);
    expect(result.filters.groups).toEqual(groups);
    expect(result.reasoning).toContain('保留原词');
  });
  it('rejects cross-group mappings for exact known imagery', async () => {
    reply({
      groups: [
        { id: 'elephant', keywords: ['凤'] },
        { id: 'phoenix', keywords: ['象'] },
      ],
    });
    expect((await parse('大象、凤凰', groups)).filters.groups).toEqual(groups);
  });
  it('allows model interpretation of manual broad wording using real categories', async () => {
    reply({
      groups: [{ id: 'g', label: '有神兽的感觉', keywords: ['瑞兽神禽'] }],
      filters: {},
    });
    const result = await parse('有神兽的感觉');
    expect(result.filters.groups?.[0].keywords).toEqual(['瑞兽神禽']);
    expect(result.reasoning).toContain('有神兽的感觉 → 瑞兽神禽');
  });
  it('does not turn invented legacy imagery into facet-only results', async () => {
    reply({ filters: { motifs: ['独角飞象'], materials: ['青铜'] } });
    const result = await parse('青铜的大象');
    expect(result.filters.motifs).toEqual(['象']);
    expect(result.filters.materials).toEqual(['青铜']);
  });
  it.each([null, [], 'bad', {}])(
    'falls back safely for malformed model payload %p',
    async (value) => {
      reply(value);
      expect((await parse('龙、云；凤')).filters.motifs).toEqual([
        '龙',
        '云',
        '凤',
      ]);
    },
  );
  it('preserves groups on network failure without retry', async () => {
    fetchMock.mockRejectedValue(new Error('network'));
    expect((await parse('大象、凤凰', groups)).filters.groups).toEqual(groups);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('keeps legacy filters compatible after validating canonical entities', async () => {
    reply({
      filters: {
        motifs: ['凤凰'],
        carriers: ['建筑'],
        layouts: ['连续'],
        materials: ['青铜'],
      },
    });
    const result = await parse('建筑上连续的凤凰');
    expect(result.filters.motifs).toEqual(['凤']);
    expect(result.filters.carriers).toEqual(['建筑']);
    expect(result.filters.layouts).toEqual(['连续']);
    expect(result.filters.materials).toEqual([]);
  });
  it('keeps a request entirely covered by explicit catalog facets free of imagery', async () => {
    reply({
      filters: {
        motifs: [],
        others: [],
        dynasties: ['唐'],
        materials: ['青铜'],
      },
    });
    const result = await parse('唐、青铜');
    expect(result.filters.motifs).toEqual([]);
    expect(result.filters.dynasties).toEqual(['唐']);
    expect(result.filters.materials).toEqual(['青铜']);
  });
  it('does not treat a fabricated facet as a valid facet-only request', async () => {
    reply({ filters: { motifs: [], materials: ['月光石'] } });
    expect((await parse('月光石')).filters.motifs).toEqual(['月光石']);
  });
  it('retains user imagery when only some legacy model words are real', async () => {
    reply({ filters: { motifs: ['凤', '独角飞象'] } });
    expect((await parse('凤凰、大象')).filters.motifs).toEqual([
      '凤',
      '象',
    ]);
  });
  it.each(['invalid JSON', 'empty choices', 'HTTP failure', 'null response'])(
    'falls back on %s',
    async (scenario) => {
      fetchMock.mockResolvedValue({
        ok: scenario !== 'HTTP failure',
        json: async () =>
          scenario === 'null response'
            ? null
            : {
                choices:
                  scenario === 'empty choices'
                    ? []
                    : [{ message: { content: 'invalid JSON' } }],
              },
      });
      expect((await parse('凤凰、大象', groups)).filters.groups).toEqual(
        groups,
      );
    },
  );
  it('retains original groups if loading the catalog fails', async () => {
    jest
      .spyOn(
        service as unknown as {
          getPatternCatalog(): Promise<CatalogPattern[]>;
        },
        'getPatternCatalog',
      )
      .mockRejectedValue(new Error('unavailable'));
    expect((await parse('凤凰、大象', groups)).filters.groups).toEqual(groups);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('accepts a JSON markdown fence without losing a valid mapping', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '```json\n{"filters":{"motifs":["凤"]}}\n```',
            },
          },
        ],
      }),
    });
    expect((await parse('凤凰')).filters.motifs).toEqual(['凤']);
  });
});
