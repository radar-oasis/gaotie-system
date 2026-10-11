import { AppService } from './app.service';
import { Neo4jService } from './neo4j.service';

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
  const neo4jService = {
    getSession: jest.fn().mockReturnValue(session),
  } as unknown as Neo4jService;

  return {
    service: new AppService(neo4jService),
    session,
  };
}

describe('AppService image search', () => {
  it('returns image search rows with stable ids and relationship filter metadata', async () => {
    const { service, session } = createServiceWithSession([
      createRecord({
        name: '龙纹',
        imageUrl: 'dragon.png',
        dynasty: '清代',
        patternId: 'P-001',
      }),
    ]);

    await expect(
      service.searchPatterns({
        motifs: ['龙'],
        dynasties: [],
        materials: [],
        others: [],
      }),
    ).resolves.toEqual([
      {
        id: 'P-001',
        name: '龙纹',
        imageUrl: 'dragon.png',
        dynasty: '清代',
        description: 'P-001',
        motifs: [],
        materials: [],
        carriers: [],
        layouts: [],
        categories: [],
        matches: [
          {
            groupId: 'imagery:龙',
            kind: 'direct',
            reasons: ['名称匹配：龙纹'],
          },
        ],
      },
    ]);

    expect(session.run).toHaveBeenCalledWith(
      expect.stringContaining('motif_name'),
    );
    expect(session.run).toHaveBeenCalledWith(
      expect.stringContaining('Carrier'),
    );
    expect(session.close).toHaveBeenCalled();
  });

  it('never interpolates keywords or evaluates them as regex', async () => {
    const { service, session } = createServiceWithSession([]);

    await service.searchPatterns({
      motifs: ['龙(纹)'],
      dynasties: [],
      materials: [],
      others: [],
    });

    const [query] = session.run.mock.calls[0] as [string];
    expect(query).not.toContain('龙(纹)');
    expect(query).not.toContain('=~');
  });

  it('treats missing filter arrays as empty filters', async () => {
    const { service, session } = createServiceWithSession([]);

    await expect(
      service.searchPatterns({
        motifs: ['龙纹'],
      } as any),
    ).resolves.toEqual([]);

    expect(session.run).toHaveBeenCalledWith(expect.any(String));
    expect(session.close).toHaveBeenCalled();
  });
});
