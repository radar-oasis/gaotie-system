import { AppService } from './app.service';
import { Neo4jService } from './neo4j.service';
import { serializeNativeGraph } from './native-pattern-graph';
import type { Record as NeoRecord } from 'neo4j-driver';

describe('native pattern graph', () => {
  it('keeps different database nodes with the same name and reports bounded output', () => {
    const nodes = [
      { elementId: 'one', labels: ['Motif'], properties: { motif_name: '龙' } },
      { elementId: 'two', labels: ['Motif'], properties: { motif_name: '龙' } },
    ];
    const records = nodes.map((p) => ({
      get: (key: string) => (key === 'p' ? p : null),
    })) as unknown as NeoRecord[];
    expect(serializeNativeGraph(records).nodes).toHaveLength(2);
    expect(serializeNativeGraph(Array(2001).fill(records[0])).truncated).toBe(
      true,
    );
    expect(serializeNativeGraph(records).relationships).toEqual([]);
  });
  const p = {
    elementId: 'pattern:1',
    labels: ['Pattern'],
    properties: { Pattern_ID: 'P1', 名称: '龙纹' },
  };
  const m = {
    elementId: 'motif:2',
    labels: ['Motif'],
    properties: { motif_name: '龙' },
  };
  const r = {
    elementId: 'rel:3',
    startNodeElementId: p.elementId,
    endNodeElementId: m.elementId,
    type: 'CONTAINS_MOTIF',
    properties: {},
  };
  const record = { get: (key: string) => ({ p, neighbor: m, r })[key] };
  function setup() {
    const session = {
      run: jest.fn().mockResolvedValue({ records: [record, record] }),
      close: jest.fn(),
    };
    const service = new AppService({
      getSession: () => session,
    } as unknown as Neo4jService);
    return { service, session };
  }
  it('preserves database identities, direction and properties without merging names', async () => {
    const { service, session } = setup();
    const result = await service.getNativePatternGraph({ patternIds: ['P1'] });
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0]).toMatchObject({
      id: 'n:pattern:1',
      label: '龙纹',
      properties: { Pattern_ID: 'P1' },
    });
    expect(result.relationships).toEqual([
      {
        id: 'r:rel:3',
        from: 'n:pattern:1',
        to: 'n:motif:2',
        type: 'CONTAINS_MOTIF',
      },
    ]);
    expect(session.run.mock.calls[0][1]).toEqual({ ids: ['P1'] });
    expect(session.close).toHaveBeenCalled();
  });
  it('queries the search group beyond currently loaded images and keeps its filters', async () => {
    const { service } = setup();
    const search = jest
      .spyOn(service, 'searchPatternGroups')
      .mockResolvedValue({
        patterns: [],
        groups: [
          {
            id: '龙',
            label: '龙',
            keywords: ['龙'],
            directTotal: 91,
            relatedTotal: 0,
            directIds: ['P1'],
            relatedIds: [],
          },
        ],
      });
    const result = await service.getNativePatternGraph({
      query: {
        groups: [{ id: '龙', label: '龙', keywords: ['龙'] }],
        dynasties: ['唐'],
      },
      offset: 40,
      kind: 'direct',
    });
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        dynasties: ['唐'],
        limit: 24,
        page: { groupId: '龙', kind: 'direct', offset: 40 },
      }),
    );
    expect(result).toMatchObject({ total: 91, offset: 40, pageSize: 24 });
  });
  it('rejects invalid scope before touching the database and closes on errors', async () => {
    const { service, session } = setup();
    for (const input of [
      null,
      {},
      { patternIds: [42] },
      { patternIds: ['P1'], offset: -1 },
      { patternIds: ['P1'], kind: 'oops' },
    ]) {
      await expect(service.getNativePatternGraph(input)).rejects.toThrow();
    }
    expect(session.run).not.toHaveBeenCalled();
    session.run.mockRejectedValue(new Error('offline'));
    await expect(
      service.getNativePatternGraph({ patternIds: ['P1'] }),
    ).rejects.toThrow('offline');
    expect(session.close).toHaveBeenCalled();
  });
});
