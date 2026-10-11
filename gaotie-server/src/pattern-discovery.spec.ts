import { AppService } from './app.service';
import { Neo4jService } from './neo4j.service';

function row(
  id: string,
  motifs: string[],
  extra: Record<string, unknown> = {},
) {
  const values: Record<string, unknown> = {
    patternId: id,
    name: `${id}纹样`,
    imageUrl: `${id}.png`,
    dynasty: '公元1700',
    dynasties: ['清代'],
    materials: ['丝绸'],
    carriers: ['服饰'],
    layouts: ['连续式'],
    motifs,
    categories: ['动物与神兽', '瑞兽神禽'],
    motifCategories: motifs.map((motif) => ({ motif, category: '瑞兽神禽' })),
    ...extra,
  };
  return { get: jest.fn((key: string) => values[key]) };
}

function setup(
  records = [
    row('dragon', ['龙']),
    row('phoenix', ['凤']),
    row('both', ['龙', '凤']),
  ],
) {
  const session = {
    run: jest.fn().mockResolvedValue({ records }),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const service = new AppService({
    getSession: () => session,
  } as unknown as Neo4jService);
  const search = (input: Record<string, unknown>) =>
    (service as any).searchPatternGroups(input);
  return { service, session, search };
}

describe('grouped pattern discovery', () => {
  it('resolves elephant expressions to the same entity without matching sky categories or object imagery', async () => {
    const { search } = setup([
      row('elephant', ['象'], { categories: ['野生兽类'], motifCategories: [{ motif: '象', category: '野生兽类' }] }),
      row('rider', [], { name: '人物骑象纹', categories: [], motifCategories: [] }),
      row('sky', ['云'], { categories: ['天象', '自然景象'], motifCategories: [{ motif: '云', category: '天象' }] }),
      row('object', ['物象'], { categories: ['其他'], motifCategories: [{ motif: '物象', category: '其他' }] }),
      row('sky-title', [], { name: '天象纹', categories: ['天象'], motifCategories: [] }),
    ]);
    for (const term of ['大象', '象', '象纹']) {
      expect((await search({ motifs: [term] })).groups[0].directIds).toEqual(['elephant', 'rider']);
    }
    expect((await search({ motifs: ['天象'] })).groups[0].directIds).toContain('sky');
    expect((await search({ motifs: ['大雁'] })).patterns).toEqual([]);
  });
  it('keeps imagery separate, deduplicates payload, and preserves matches in both groups', async () => {
    const { search } = setup();
    const result = await search({
      groups: [
        { id: 'dragon', label: '龙', keywords: ['龙'] },
        { id: 'phoenix', label: '凤', keywords: ['凤'] },
      ],
    });
    expect(result.groups[0]).toMatchObject({
      directTotal: 2,
      relatedTotal: 1,
      directIds: ['both', 'dragon'],
      relatedIds: ['phoenix'],
    });
    expect(result.groups[1]).toMatchObject({
      directTotal: 2,
      relatedTotal: 1,
      directIds: ['both', 'phoenix'],
      relatedIds: ['dragon'],
    });
    expect(result.patterns).toHaveLength(3);
    expect(
      result.patterns.find((p: any) => p.id === 'both').matches,
    ).toHaveLength(2);
    expect(result.patterns[0]).toMatchObject({
      materials: ['丝绸'],
      carriers: ['服饰'],
      layouts: ['连续式'],
      categories: ['动物与神兽', '瑞兽神禽'],
    });
  });

  it('applies OR within facets and AND between facets, including to related results', async () => {
    const { search } = setup([
      row('valid', ['龙']),
      row('wrong-material', ['龙'], { materials: ['青铜'] }),
      row('wrong-carrier', ['凤'], { carriers: ['建筑'] }),
      row('related', ['凤']),
      row('wrong-dynasty', ['龙'], { dynasties: ['宋代'] }),
    ]);
    const result = await search({
      motifs: ['龙'],
      dynasties: ['明代', '清代'],
      materials: ['丝绸'],
      carriers: ['服饰'],
      layouts: ['连续式'],
    });
    expect(result.groups[0]).toMatchObject({
      directIds: ['valid'],
      relatedIds: ['related'],
    });
    expect(result.patterns.find((p: any) => p.id === 'valid').dynasty).toBe(
      '清代',
    );
  });

  it('uses motif categories before categories of incidental name matches', async () => {
    const { search } = setup([
      row('dragon', ['龙']),
      row('dragon-name', ['云'], {
        name: '龙形云纹',
        categories: ['水象与气象'],
        motifCategories: [{ motif: '云', category: '水象与气象' }],
      }),
      row('cloud', ['云'], {
        categories: ['水象与气象'],
        motifCategories: [{ motif: '云', category: '水象与气象' }],
      }),
      row('phoenix', ['凤']),
    ]);
    const result = await search({ motifs: ['龙'] });
    expect(result.groups[0].relatedIds).toEqual(['phoenix']);
  });

  it('returns concept mappings as inspiration only and does not invent unknown matches', async () => {
    const { search } = setup();
    const concept = await search({ others: ['吉祥'] });
    expect(concept.groups[0]).toMatchObject({
      directTotal: 0,
      relatedTotal: 3,
    });
    expect(concept.patterns[0].matches[0].reasons.join('')).toContain(
      '灵感方向',
    );
    expect((await search({ motifs: ['绝不存在的词'] })).patterns).toEqual([]);
    expect((await search({})).patterns).toEqual([]);
  });

  it('supports category queries and common aliases without regex evaluation', async () => {
    const { search } = setup([
      row('cloud', ['云'], {
        categories: ['水象与气象'],
        motifCategories: [{ motif: '云', category: '水象与气象' }],
      }),
      row('literal', ['龙(纹)']),
    ]);
    expect((await search({ motifs: ['祥云'] })).groups[0].directIds).toEqual([
      'cloud',
    ]);
    expect(
      (await search({ motifs: ['水象与气象'] })).groups[0].directIds,
    ).toEqual(['cloud']);
    expect((await search({ motifs: ['龙(纹)'] })).groups[0].directIds).toEqual([
      'literal',
    ]);
  });

  it('paginates one group/kind with accurate totals and varied related motifs', async () => {
    const { search } = setup([
      row('dragon', ['龙']),
      ...Array.from({ length: 44 }, (_, n) =>
        row(`a${String(n).padStart(2, '0')}`, ['凤']),
      ),
      row('z-tiger', ['虎']),
    ]);
    const first = await search({ motifs: ['龙'] });
    expect(first.groups[0]).toMatchObject({ directTotal: 1, relatedTotal: 45 });
    expect(first.groups[0].relatedIds).toHaveLength(40);
    expect(first.groups[0].relatedIds.slice(0, 2)).toContain('z-tiger');
    const next = await search({
      motifs: ['龙'],
      page: { groupId: first.groups[0].id, kind: 'related', offset: 40 },
    });
    expect(next.groups[0]).toMatchObject({
      directIds: [],
      directTotal: 1,
      relatedTotal: 45,
    });
    expect(next.groups[0].relatedIds).toHaveLength(5);
    expect(
      next.groups[0].relatedIds.some((id: string) =>
        first.groups[0].relatedIds.includes(id),
      ),
    ).toBe(false);
  });

  it('deduplicates catalog ids, excludes missing images and supports pure facets', async () => {
    const { search } = setup([
      row('good', ['龙']),
      row('good', ['龙']),
      row('bad', ['凤'], { imageUrl: '  ' }),
    ]);
    const result = await search({ materials: ['丝绸'] });
    expect(result.groups[0]).toMatchObject({
      directTotal: 1,
      relatedTotal: 0,
      directIds: ['good'],
    });
  });

  it('shares concurrent catalog loads, caches for 60 seconds, and retries after failures', async () => {
    const { search, session } = setup();
    const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
    try {
      await Promise.all([
        search({ motifs: ['龙'] }),
        search({ motifs: ['凤'] }),
      ]);
      expect(session.run.mock.calls.filter(call => call.length === 1)).toHaveLength(1);
      expect(session.run).toHaveBeenCalledTimes(3);
      now.mockReturnValue(62000);
      session.run.mockRejectedValueOnce(new Error('temporarily unavailable'));
      await expect(search({ motifs: ['龙'] })).rejects.toThrow(
        'temporarily unavailable',
      );
      await search({ motifs: ['龙'] });
      expect(session.run).toHaveBeenCalledTimes(6);
      expect(session.close).toHaveBeenCalledTimes(6);
    } finally {
      now.mockRestore();
    }
  });

  it('keeps legacy query an array using relationship metadata', async () => {
    const { service, session } = setup();
    const result = await service.searchPatterns({
      motifs: ['龙'],
      dynasties: [],
      materials: [],
      others: [],
    });
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'dragon', motifs: ['龙'] }),
      ]),
    );
    expect(session.run.mock.calls[0][0]).toContain('motif_name');
    expect(session.run.mock.calls[0][0]).toContain('APPLIED_ON_CARRIER');
    expect(session.close).toHaveBeenCalled();
  });

  it('normalizes common dynasty suffixes against graph names and explains selected facets', async () => {
    const { search } = setup([row('dragon', ['龙'], { dynasties: ['清'] })]);
    const result = await search({ motifs: ['龙'], dynasties: ['清代'] });
    expect(result.groups[0].directTotal).toBe(1);
    expect(result.patterns[0].matches[0].reasons).toContain('朝代：清');
  });

  it('rejects invalid pagination and duplicate groups before loading the catalog', async () => {
    const { search, session } = setup();
    await expect(
      search({
        motifs: ['龙'],
        page: { groupId: 'missing', kind: 'direct', offset: 0 },
      }),
    ).rejects.toThrow('分页参数无效');
    await expect(search({ motifs: ['龙'], limit: 0 })).rejects.toThrow('limit');
    await expect(
      search({
        groups: [
          { id: 'same', label: '龙', keywords: ['龙'] },
          { id: 'same', label: '凤', keywords: ['凤'] },
        ],
      }),
    ).rejects.toThrow('id 不可重复');
    expect(session.run).not.toHaveBeenCalled();
  });

  it('treats JavaScript property names as unknown literal search terms', async () => {
    const { search } = setup();
    for (const word of ['constructor', '__proto__', 'toString']) {
      expect((await search({ motifs: [word] })).patterns).toEqual([]);
    }
  });

  it('does not borrow incidental motifs when only an unknown word in the title matched', async () => {
    const { search } = setup([
      row('title', ['龙'], { name: '速度感纹样' }),
      row('sibling', ['凤']),
    ]);
    expect((await search({ motifs: ['速度感'] })).groups[0]).toMatchObject({
      directIds: ['title'],
      relatedTotal: 0,
    });
  });

  it('prefers exact normalized motifs so cloud does not expand through cloud-collar garments', async () => {
    const { search } = setup([
      row('cloud', ['云'], {
        categories: ['水象与气象'],
        motifCategories: [{ motif: '云', category: '水象与气象' }],
      }),
      row('water', ['水'], {
        categories: ['水象与气象'],
        motifCategories: [{ motif: '水', category: '水象与气象' }],
      }),
      row('cloud-collar', ['云肩'], {
        categories: ['杂项服饰'],
        motifCategories: [{ motif: '云肩', category: '杂项服饰' }],
      }),
      row('garment', ['上衣'], {
        categories: ['杂项服饰'],
        motifCategories: [{ motif: '上衣', category: '杂项服饰' }],
      }),
    ]);
    const result = await search({ motifs: ['祥云'] });
    expect(result.groups[0].directIds).toEqual(['cloud']);
    expect(result.groups[0].relatedIds).toEqual(['water']);
  });

  it('ranks entity and name matches without unrelated category or material substrings', async () => {
    const { search } = setup([
      row('a-metadata', [], { materials: ['龙泉窑'] }),
      row('b-category', [], { categories: ['龙类'] }),
      row('c-partial', [], { name: '团龙纹' }),
      row('d-exact-name', [], { name: '龙' }),
      row('f-exact-motif', ['龙']),
      row('e-exact-motif', ['龙']),
    ]);
    expect((await search({ motifs: ['龙'] })).groups[0].directIds).toEqual([
      'e-exact-motif',
      'f-exact-motif',
      'd-exact-name',
      'c-partial',
    ]);
  });

  it('manual intent parsing asks only for explicit facets and exposes carriers and layouts', async () => {
    const { service } = setup();
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                reasoning: '方向',
                filters: {
                  motifs: [],
                  dynasties: [],
                  materials: [],
                  carriers: [],
                  layouts: [],
                  others: ['庄严'],
                },
                search_strategy: 'fuzzy_semantic',
              }),
            },
          },
        ],
      }),
    } as Response);
    try {
      expect((await service.parseIntent('庄严')).filters.materials).toEqual([]);
      const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
      expect(body.messages[0].content).toContain('严禁从情感或意象推断材质');
      expect(body.messages[0].content).toContain('"carriers"');
      expect(body.messages[0].content).toContain('"layouts"');
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('splits explicit imagery when manual intent parsing returns invalid JSON', async () => {
    const { service } = setup();
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'invalid json' } }],
      }),
    } as Response);
    try {
      const result = await service.parseIntent('龙、云, 凤；雷; 雨\n龙');
      expect(result.filters.motifs).toEqual(['龙', '云', '凤', '雷', '雨']);
      expect(result.filters.materials).toEqual([]);
    } finally {
      fetchMock.mockRestore();
    }
  });
});
