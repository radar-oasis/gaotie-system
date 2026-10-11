import { AppService } from './app.service';
import { Neo4jService } from './neo4j.service';
describe('native node expansion', () => {
  function setup() {
    const session = {
      run: jest.fn().mockResolvedValue({ records: [] }),
      close: jest.fn(),
    };
    return {
      session,
      service: new AppService({
        getSession: () => session,
      } as unknown as Neo4jService),
    };
  }
  it('uses a parameterized identity query and paginates without changing the graph', async () => {
    const { service, session } = setup();
    const result = await service.expandNativePatternNode({
      nodeId: 'n:db:42',
      offset: 50,
    });
    expect(session.run.mock.calls[0][1]).toEqual({
      elementId: 'db:42',
      offset: 50,
    });
    expect(result).toMatchObject({
      nodes: [],
      relationships: [],
      hasMore: false,
      nextOffset: 50,
    });
    expect(session.close).toHaveBeenCalled();
  });
  it('rejects invalid identities and offsets before querying', async () => {
    const { service, session } = setup();
    for (const input of [
      null,
      {},
      { nodeId: 'bad' },
      { nodeId: 'n:abc', offset: -1 },
      { nodeId: 'n:abc', offset: 0.5 },
    ])
      await expect(service.expandNativePatternNode(input)).rejects.toThrow();
    expect(session.run).not.toHaveBeenCalled();
  });
});
