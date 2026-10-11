import { AppService } from './app.service';
import { Neo4jService } from './neo4j.service';

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

describe('AppService layout schemes', () => {
  it('renames the layout scheme node for the given id', async () => {
    const { service, session } = createServiceWithSession([
      {
        get: jest.fn((key: string) => {
          const values: Record<string, unknown> = {
            id: 'scheme-1',
            name: '商务车厢布局',
            componentsMap: '{"车窗带":"A2"}',
            createdAt: '2026-05-23T00:00:00.000Z',
            updatedAt: '2026-05-23T01:00:00.000Z',
            projectId: 'project-1',
          };

          return values[key];
        }),
      },
    ]);

    await expect(
      service.renameLayoutScheme('scheme-1', ' 商务车厢布局 '),
    ).resolves.toMatchObject({
      id: 'scheme-1',
      name: '商务车厢布局',
      projectId: 'project-1',
    });

    expect(session.run).toHaveBeenCalledWith(
      expect.stringContaining('SET s.name = $name'),
      expect.objectContaining({
        id: 'scheme-1',
        name: '商务车厢布局',
      }),
    );
  });

  describe('deleteLayoutScheme', () => {
    it('deletes the layout scheme node for the given id', async () => {
      const deletedCount = { toNumber: () => 1 };
      const { service, session } = createServiceWithSession([
        { get: jest.fn().mockReturnValue(deletedCount) },
      ]);

      await expect(service.deleteLayoutScheme('scheme-1')).resolves.toBe(true);

      expect(session.run).toHaveBeenCalledWith(
        expect.stringContaining('DETACH DELETE'),
        { id: 'scheme-1' },
      );
      expect(session.close).toHaveBeenCalled();
    });

    it('returns false when no layout scheme matches the id', async () => {
      const deletedCount = { toNumber: () => 0 };
      const { service } = createServiceWithSession([
        { get: jest.fn().mockReturnValue(deletedCount) },
      ]);

      await expect(service.deleteLayoutScheme('missing-scheme')).resolves.toBe(
        false,
      );
    });
  });
});
