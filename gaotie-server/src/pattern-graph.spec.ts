import { AppService } from './app.service';
import { Neo4jService } from './neo4j.service';

describe('pattern graph', () => {
  const values = {
    patternId: 'a',
    name: '龙纹',
    imageUrl: 'a.jpg',
    dynasty: '公元1700',
    dynasties: ['清'],
    motifs: ['龙', '龙'],
    materials: ['绢'],
    carriers: [],
    layouts: [],
    categories: ['动物'],
    motifCategories: [{ motif: '龙', category: '瑞兽' }],
  };
  function setup() {
    const session = {
      run: jest
        .fn()
        .mockResolvedValue({
          records: [{ get: (key: string) => values[key] }],
        }),
      close: jest.fn(),
    };
    return {
      service: new AppService({
        getSession: () => session,
      } as unknown as Neo4jService),
      session,
    };
  }
  it('returns actual typed edges, deduplicates nodes, and does not invent category or date edges', async () => {
    const { service } = setup();
    const graph = await (service as any).getPatternGraph({
      patternIds: ['a', 'a', 'missing'],
    });
    expect(graph.nodes.filter((n) => n.kind === 'pattern')).toHaveLength(1);
    expect(graph.nodes.filter((n) => n.label === '龙')).toHaveLength(1);
    expect(graph.edges.map((e) => e.label)).toEqual(
      expect.arrayContaining(['包含意象', '所属朝代', '所属类别']),
    );
    expect(
      graph.nodes.some((n) => n.label === '动物' || n.label === '公元1700'),
    ).toBe(false);
    expect(new Set(graph.edges.map((e) => e.id)).size).toBe(graph.edges.length);
  });
  it('rejects invalid or excessive requests before reading Neo4j', async () => {
    const { service, session } = setup();
    for (const input of [
      null,
      {},
      { patternIds: [42] },
      { patternIds: Array(25).fill('a') },
    ]) {
      await expect((service as any).getPatternGraph(input)).rejects.toThrow();
    }
    expect(session.run).not.toHaveBeenCalled();
    expect(
      await (service as any).getPatternGraph({ patternIds: [] }),
    ).toMatchObject({ nodes: [], edges: [] });
  });
});
