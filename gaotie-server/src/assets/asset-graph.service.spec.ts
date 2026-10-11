import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AssetGraphService, buildAssetProjection } from './asset-graph.service';
const owner = 'user-a';
const row = (
  id: string,
  kind = 'pattern',
  payload: any = {},
  extra: any = {},
) => ({
  id,
  user_id: owner,
  kind,
  name: id,
  project_id: 'project-a',
  project_name: '项目甲',
  theme: '',
  imagery: '',
  payload,
  ...extra,
});
const provenance = {
  version: 1,
  originalPrompt: '生成',
  outputImageUrl: '/canvas/a.png',
  sourcePatterns: [
    { id: 'dragon', name: '龙纹' },
    { id: 'cloud', name: '云纹' },
  ],
  references: [],
};
describe('personal asset graph projection', () => {
  it('projects only owned live rows and merges originals across actually used references', () => {
    const graph = buildAssetProjection(owner, [
      row('favorite', 'pattern', { provenance }),
      row('proposal-1', 'proposal', {
        packageSnapshot: {
          selectedReferenceImageUrls: ['/stable/a.png'],
          selectedPatterns: [{ id: 'unused-original', name: '未采用' }],
          canvasAssets: [
            {
              id: 'a',
              name: '转化纹样',
              imageUrl: '/stable/a.png',
              provenance,
            },
            {
              id: 'unused',
              name: '未采用画布',
              imageUrl: '/unused.png',
              provenance: {
                ...provenance,
                outputImageUrl: '/unused.png',
                sourcePatterns: [{ id: 'unused-canvas', name: '未采用' }],
              },
            },
          ],
        },
      }),
      row('proposal-2', 'proposal', {
        packageSnapshot: {
          selectedReferenceImageUrls: ['/stable/a.png'],
          canvasAssets: [
            { name: '再次使用', imageUrl: '/stable/a.png', provenance },
          ],
        },
      }),
      row('foreign', 'pattern', {}, { user_id: 'user-b' }),
      row('deleted', 'pattern', {}, { deleted_at: '2026-01-01' }),
    ]);
    expect(
      graph.nodes
        .filter((n) => n.kind === 'original-pattern')
        .map((n) => n.label)
        .sort(),
    ).toEqual(['云纹', '龙纹']);
    expect(
      graph.nodes.filter((n) => n.kind === 'transformed-pattern'),
    ).toHaveLength(2);
    expect(graph.nodes.filter((n) => n.kind === 'project')).toHaveLength(1);
    expect(graph.nodes.every((n) => n.ownerId === owner)).toBe(true);
    expect(graph.nodes.some((n) => /unused|foreign|deleted/.test(n.key))).toBe(
      false,
    );
    const transformed = graph.nodes.find(
      (n) => n.kind === 'transformed-pattern' && !n.assetId,
    )!;
    expect(
      graph.edges.filter(
        (e) => e.source === transformed.key && e.label === '用于方案',
      ),
    ).toHaveLength(2);
    expect(
      graph.edges.filter(
        (e) => e.target === transformed.key && e.label === '转化自',
      ),
    ).toHaveLength(2);
  });
  it('keeps favorites with the same output distinct and honors explicit sourceAssetId without contaminating ambiguous references', () => {
    const proposal = (id: string, imageUrl: string, sourceAssetId?: string) =>
      row(id, 'proposal', {
        packageSnapshot: {
          selectedReferenceImageUrls: [imageUrl],
          canvasAssets: [
            {
              imageUrl,
              name: id,
              provenance: { ...provenance, sourceAssetId },
            },
          ],
        },
      });
    const graph = buildAssetProjection(owner, [
      row('crop-a', 'pattern', {
        provenance,
        sourceImageUrl: provenance.outputImageUrl,
      }),
      row('crop-b', 'pattern', {
        provenance,
        sourceImageUrl: provenance.outputImageUrl,
      }),
      proposal('explicit-a', '/stable-a.png', 'crop-a'),
      proposal('ambiguous', '/ambiguous.png'),
      proposal('explicit-b', '/stable-b.png', 'crop-b'),
      proposal('ambiguous-original-url', provenance.outputImageUrl),
    ]);
    expect(
      graph.nodes
        .filter((n) => n.assetKind === 'pattern')
        .map((n) => ({ key: n.key, assetId: n.assetId })),
    ).toEqual([
      { key: 'asset:crop-a', assetId: 'crop-a' },
      { key: 'asset:crop-b', assetId: 'crop-b' },
    ]);
    expect(
      graph.edges.find(
        (e) => e.target === 'asset:explicit-a' && e.label === '用于方案',
      )?.source,
    ).toBe('asset:crop-a');
    expect(
      graph.edges.find(
        (e) => e.target === 'asset:explicit-b' && e.label === '用于方案',
      )?.source,
    ).toBe('asset:crop-b');
    const ambiguousKey = graph.edges.find(
      (e) => e.target === 'asset:ambiguous' && e.label === '用于方案',
    )?.source;
    expect(ambiguousKey).toMatch(/^transformed:/);
    expect(
      graph.edges.find(
        (e) =>
          e.target === 'asset:ambiguous-original-url' && e.label === '用于方案',
      )?.source,
    ).not.toBe(ambiguousKey);
    expect(
      graph.edges.filter(
        (e) =>
          e.source === 'original:dragon' &&
          ['asset:crop-a', 'asset:crop-b'].includes(e.target),
      ),
    ).toHaveLength(2);
  });
  it('keeps different adopted crop images separate despite identical ancestor output URLs', () => {
    const proposal = (id: string, imageUrl: string) =>
      row(id, 'proposal', {
        packageSnapshot: {
          selectedReferenceImageUrls: [imageUrl],
          canvasAssets: [{ name: id, imageUrl, provenance }],
        },
      });
    const graph = buildAssetProjection(owner, [
      proposal('first-crop', '/assets/references/hash-a/image'),
      proposal('second-crop', '/assets/references/hash-b/image'),
      proposal('same-content-again', '/assets/references/hash-a/image'),
    ]);
    const source = (id: string) =>
      graph.edges.find(
        (e) => e.target === `asset:${id}` && e.label === '用于方案',
      )!.source;
    expect(source('first-crop')).not.toBe(source('second-crop'));
    expect(source('same-content-again')).toBe(source('first-crop'));
    expect(
      graph.nodes.filter((n) => n.kind === 'transformed-pattern'),
    ).toHaveLength(2);
    expect(
      graph.nodes.filter((n) => n.kind === 'original-pattern'),
    ).toHaveLength(2);
  });
  it('does not treat a single crop sharing its ancestor URL as the full-image reference', () => {
    const graph = buildAssetProjection(owner, [
      row('crop', 'pattern', {
        provenance,
        sourceImageUrl: provenance.outputImageUrl,
      }),
      row('full-image-proposal', 'proposal', {
        packageSnapshot: {
          selectedReferenceImageUrls: ['/full-stable.png'],
          canvasAssets: [{ imageUrl: '/full-stable.png', provenance }],
        },
      }),
    ]);
    const adopted = graph.edges.find(
      (e) => e.target === 'asset:full-image-proposal' && e.label === '用于方案',
    )!;
    expect(adopted.source).toMatch(/^transformed:/);
    expect(adopted.source).not.toBe('asset:crop');
    expect(
      graph.nodes.filter((n) => n.kind === 'transformed-pattern'),
    ).toHaveLength(2);
  });
  it('keeps full-image reference identity stable after another crop is deleted and after explicit crop use', () => {
    const cropped = [
      row('crop-a', 'pattern', { provenance }),
      row('crop-b', 'pattern', { provenance }),
    ];
    const proposals = [
      row('explicit-crop', 'proposal', {
        packageSnapshot: {
          selectedReferenceImageUrls: ['/crop-stable.png'],
          canvasAssets: [
            {
              imageUrl: '/crop-stable.png',
              provenance: { ...provenance, sourceAssetId: 'crop-a' },
            },
          ],
        },
      }),
      row('full', 'proposal', {
        packageSnapshot: {
          selectedReferenceImageUrls: [provenance.outputImageUrl],
          canvasAssets: [{ imageUrl: provenance.outputImageUrl, provenance }],
        },
      }),
    ];
    const before = buildAssetProjection(owner, [...cropped, ...proposals]);
    const after = buildAssetProjection(owner, [
      cropped[0],
      { ...cropped[1], deleted_at: '2026-10-06' },
      ...proposals,
    ]);
    const fullSource = (graph: typeof before) =>
      graph.edges.find(
        (e) => e.target === 'asset:full' && e.label === '用于方案',
      )!.source;
    expect(fullSource(before)).toMatch(/^transformed:/);
    expect(fullSource(after)).toBe(fullSource(before));
    expect(
      after.edges.find(
        (e) => e.target === 'asset:explicit-crop' && e.label === '用于方案',
      )?.source,
    ).toBe('asset:crop-a');
  });
  it('accepts a direct owned asset image URL as exact identity, without requiring ancestor aliases', () => {
    const graph = buildAssetProjection(owner, [
      row('favorite', 'pattern', { provenance }),
      row('p', 'proposal', {
        packageSnapshot: {
          selectedReferenceImageUrls: ['/assets/favorite/image'],
          canvasAssets: [{ imageUrl: '/assets/favorite/image', provenance }],
        },
      }),
    ]);
    expect(
      graph.edges.find((e) => e.target === 'asset:p' && e.label === '用于方案')
        ?.source,
    ).toBe('asset:favorite');
  });
  it('uses the durable reference image while merging by its original URL', () => {
    const graph = buildAssetProjection(owner, [
      row('fav', 'pattern', {
        provenance: {
          ...provenance,
          references: [
            {
              imageUrl: '/assets/references/abc/image',
              originalImageUrl: '/temporary.png',
              name: '参考图',
              sourcePatterns: [],
            },
          ],
        },
      }),
    ]);
    expect(graph.nodes.find((n) => n.label === '参考图')?.imageUrl).toBe(
      '/assets/references/abc/image',
    );
  });
  it('does not invent source links from old snapshots or unused selected patterns', () => {
    const graph = buildAssetProjection(owner, [
      row('old', 'proposal', {
        packageSnapshot: {
          selectedPatterns: [{ id: 'x', name: '龙' }],
          canvasAssets: [{ imageUrl: '/x.png' }],
        },
      }),
    ]);
    expect(
      graph.nodes.some(
        (n) =>
          n.kind === 'original-pattern' || n.kind === 'transformed-pattern',
      ),
    ).toBe(false);
  });
  it('links a durable reference to a favorite by sourceAssetId and retains all reference origins', () => {
    const graph = buildAssetProjection(owner, [
      row('favorite', 'pattern', { provenance }),
      row('p', 'proposal', {
        packageSnapshot: {
          selectedReferenceImageUrls: ['/stable.png'],
          canvasAssets: [
            {
              imageUrl: '/stable.png',
              provenance: {
                version: 1,
                sourceAssetId: 'favorite',
                sourcePatterns: [],
                references: [
                  {
                    imageUrl: '/ref.png',
                    sourcePatterns: [{ id: 'bird', name: '鸟纹' }],
                  },
                ],
              },
            },
          ],
        },
      }),
    ]);
    const favorite = graph.nodes.find((n) => n.assetId === 'favorite')!;
    expect(
      graph.edges.some(
        (e) => e.source === favorite.key && e.target === 'asset:p',
      ),
    ).toBe(true);
    expect(graph.nodes.some((n) => n.label === '鸟纹')).toBe(true);
  });
});

describe('AssetGraphService synchronization', () => {
  let db: any, neo: any, session: any, service: AssetGraphService;
  beforeEach(() => {
    db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    session = {
      executeWrite: jest.fn(async (fn) => fn({ run: session.run })),
      run: jest.fn().mockResolvedValue({ records: [] }),
      close: jest.fn().mockResolvedValue(undefined),
    };
    neo = { getSession: jest.fn(() => session) };
    service = new AssetGraphService(db, neo);
  });
  it('replaces only one owner projection atomically, deleting stale nodes and relations even with zero assets', async () => {
    await service.syncUser(owner);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringMatching(/user_id = \$1.*deleted_at IS NULL/s),
      [owner],
    );
    expect(session.executeWrite).toHaveBeenCalledTimes(1);
    expect(session.run).toHaveBeenCalledWith(
      expect.stringMatching(/DesignAssetNode.*ownerId.*DETACH DELETE/s),
      expect.objectContaining({ ownerId: owner }),
    );
    expect(session.close).toHaveBeenCalled();
  });
  it('serializes same-owner snapshots and retries after a failed projection', async () => {
    let release!: () => void;
    db.query.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ rows: [] });
        }),
    );
    const first = service.syncUser(owner);
    const second = service.syncUser(owner);
    await new Promise((resolve) => setImmediate(resolve));
    expect(db.query).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
    expect(db.query).toHaveBeenCalledTimes(2);
    session.executeWrite.mockRejectedValueOnce(new Error('offline'));
    await expect(service.graph(owner, {})).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(service.graph(owner, {})).resolves.toMatchObject({
      nodes: [],
      status: { available: true },
    });
  });
  it('validates traversal bounds before touching either database', async () => {
    for (const opts of [
      { hops: 7 },
      { hops: 0 },
      { hops: 1.2 },
      { query: 'a'.repeat(201) },
    ]) {
      await expect(service.graph(owner, opts)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    expect(db.query).not.toHaveBeenCalled();
  });
  it('returns an explicit failure if reading Neo4j fails after a successful sync', async () => {
    session.run.mockImplementation(async (query) => {
      if (query.includes('RETURN n')) throw new Error('offline');
      return { records: [] };
    });
    await expect(service.graph(owner, { query: '龙' })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
  it('retrieves multi-hop explanations with owner/project filters on every traversal', async () => {
    const node = (
      key: string,
      label: string,
      kind: string,
      assetId?: string,
    ) => ({
      key,
      label,
      kind,
      ownerId: owner,
      projectIds: ['project-a'],
      assetId,
      assetKind: 'proposal',
    });
    const original = node('original:dragon', '龙纹', 'original-pattern');
    const transform = node('transform', '转化', 'transformed-pattern');
    const proposal = node('asset:p', '方案甲', 'proposal', 'p');
    const record = (name: string, properties: any) => ({
      get: (key: string) => (key === name ? { properties } : undefined),
    });
    const links = [
      {
        key: 'e1',
        ownerId: owner,
        source: original.key,
        target: transform.key,
        label: '转化自',
      },
      {
        key: 'e2',
        ownerId: owner,
        source: transform.key,
        target: proposal.key,
        label: '用于方案',
      },
    ];
    session.run.mockImplementation(async (query, params) => {
      if (query.includes('RETURN n'))
        return { records: [record('n', original)] };
      if (query.includes('RETURN DISTINCT n'))
        return {
          records: (params.frontier.includes(original.key)
            ? [transform]
            : params.frontier.includes(transform.key)
              ? [proposal]
              : []
          ).map((n) => record('n', n)),
        };
      if (query.includes('RETURN r'))
        return { records: links.map((e) => record('r', e)) };
      return { records: [] };
    });
    const result = await service.graph(owner, {
      query: 'dragon',
      hops: 2,
      projectId: 'project-a',
    });
    expect(result.matches).toEqual([
      {
        assetId: 'p',
        name: '方案甲',
        kind: 'proposal',
        paths: [['龙纹', '转化', '方案甲']],
      },
    ]);
    expect(result.edges).toHaveLength(2);
    for (const [query, params] of session.run.mock.calls.filter(([query]) =>
      query.includes('RETURN'),
    )) {
      expect(query).toContain('ownerId: $ownerId');
      expect(params.ownerId).toBe(owner);
      expect(params.projectId).toBe('project-a');
    }
  });
  it('caps large graph responses at 500 nodes and reports truncation', async () => {
    session.run.mockImplementation(async (query) => ({
      records: query.includes('RETURN n')
        ? Array.from({ length: 501 }, (_, i) => ({
            get: () => ({
              properties: {
                key: `node:${i}`,
                ownerId: owner,
                label: `${i}`,
                kind: 'theme',
              },
            }),
          }))
        : [],
    }));
    const result = await service.graph(owner, {});
    expect(result.nodes).toHaveLength(500);
    expect(result.status.truncated).toBe(true);
  });
  it('returns adoption matches only along forward lineage, never same-project or shared-source bridges', async () => {
    const graph = buildAssetProjection(owner, [
      row('favorite', 'pattern', { provenance }),
      row('used', 'proposal', {
        packageSnapshot: {
          selectedReferenceImageUrls: ['/used.png'],
          canvasAssets: [{ name: '已采用', imageUrl: '/used.png', provenance }],
        },
      }),
      row('same-project-unused', 'proposal', {
        packageSnapshot: { selectedReferenceImageUrls: [] },
      }),
      row('cloud-only', 'proposal', {
        packageSnapshot: {
          selectedReferenceImageUrls: ['/cloud.png'],
          canvasAssets: [
            {
              name: '仅云纹',
              imageUrl: '/cloud.png',
              provenance: {
                ...provenance,
                outputImageUrl: '/cloud.png',
                sourcePatterns: [{ id: 'cloud', name: '云纹' }],
              },
            },
          ],
        },
      }),
    ]);
    const record = (properties: any) => ({ get: () => ({ properties }) });
    session.run.mockImplementation(async (query, params) => {
      if (query.includes('RETURN n'))
        return {
          records: graph.nodes
            .filter((n) => n.key === 'original:dragon')
            .map(record),
        };
      if (query.includes('RETURN DISTINCT n')) {
        const neighbors = new Set(
          graph.edges.flatMap((e) =>
            params.frontier.includes(e.source)
              ? [e.target]
              : params.frontier.includes(e.target)
                ? [e.source]
                : [],
          ),
        );
        return {
          records: graph.nodes
            .filter(
              (n) => neighbors.has(n.key) && !params.visited.includes(n.key),
            )
            .map(record),
        };
      }
      if (query.includes('RETURN r'))
        return { records: graph.edges.map(record) };
      return { records: [] };
    });
    const result = await service.graph(owner, { query: 'dragon', hops: 6 });
    expect(result.nodes.some((n) => n.assetId === 'same-project-unused')).toBe(
      true,
    );
    expect(result.matches.map((m) => m.assetId).sort()).toEqual([
      'favorite',
      'used',
    ]);
    expect(result.matches.find((m) => m.assetId === 'used')?.paths).toEqual([
      ['龙纹', '已采用', 'used'],
    ]);
  });
  it('starts restart compensation without awaiting database or Neo4j readiness', async () => {
    let release!: () => void;
    db.query.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({ rows: [{ user_id: owner }, { user_id: 'user-b' }] });
        }),
    );
    const sync = jest
      .spyOn(service, 'syncUser')
      .mockResolvedValue({ syncedAt: 'now', projectionNodeCount: 0 });
    expect(service.onModuleInit()).toBeUndefined();
    expect(sync).not.toHaveBeenCalled();
    release();
    await new Promise((resolve) => setImmediate(resolve));
    expect(sync.mock.calls).toEqual([[owner], ['user-b']]);
    expect(db.query.mock.calls[0][0]).toContain(
      'SELECT DISTINCT user_id FROM assets',
    );
  });

  it('reports truncation when a hop fills the node budget before deeper expansion', async () => {
    const record = (key: string) => ({
      get: () => ({
        properties: { key, ownerId: owner, label: key, kind: 'theme' },
      }),
    });
    session.run.mockImplementation(async (query) => ({
      records: query.includes('RETURN n')
        ? [record('seed')]
        : query.includes('RETURN DISTINCT n')
          ? Array.from({ length: 499 }, (_, index) => record(`node:${index}`))
          : [],
    }));
    const result = await service.graph(owner, { query: 'theme', hops: 3 });
    expect(result.nodes).toHaveLength(500);
    expect(result.status.truncated).toBe(true);
  });
  it('understands the dialog before querying results and preserves exact project intent in the reply', async () => {
    const catalog = [
      { key: 'project:p', ownerId: owner, label: '默认项目', kind: 'project' },
      { key: 'asset:a', ownerId: owner, label: '方案甲', kind: 'proposal' },
      {
        key: 'asset:foreign',
        ownerId: 'another-user',
        label: '外国资产',
        kind: 'proposal',
      },
    ];
    session.run.mockImplementation(async (query) => ({
      records: query.includes('asset-chat-catalog')
        ? catalog.map((properties) => ({ get: () => ({ properties }) }))
        : [],
    }));
    const understood = {
      target: 'proposal',
      scope: 'filtered',
      projectNames: ['默认项目'],
      proposalNames: [],
      patternNames: [],
      unresolvedEntities: [],
    };
    const model = { understand: jest.fn().mockResolvedValue(understood) };
    service = new AssetGraphService(db, neo, model as any);
    const graph = jest.spyOn(service, 'graph').mockImplementation(async () => {
      expect(model.understand).toHaveBeenCalledTimes(1);
      return {
        nodes: [
          { id: 'project:p', label: '默认项目', kind: 'project' },
          { id: 'asset:a', label: '方案甲', kind: 'proposal', assetId: 'a' },
        ],
        edges: [
          { id: 'e', source: 'project:p', target: 'asset:a', label: '包含' },
        ],
        matches: [],
        status: {
          available: true,
          source: 'neo4j',
          syncedAt: 'now',
          projectionNodeCount: 2,
          query: '',
          hops: 6,
          nodeCount: 2,
          edgeCount: 1,
          maxNodes: 500,
          maxEdges: 2000,
          truncated: false,
        },
      };
    });
    const result = await service.chat(owner, {
      message: '我想看看之前在默认项目当中所产生的方案都有哪些？',
    });
    expect(result.reply).toContain('方案甲');
    expect(result.matches.map((m) => m.assetId)).toEqual(['a']);
    expect(graph).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({ projectId: 'p' }),
    );
    expect(
      model.understand.mock.calls[0][1].some((n) => n.label === '外国资产'),
    ).toBe(false);
  });
  it('keeps generated replies within the next-turn history limit', async () => {
    const model = {
      understand: jest.fn().mockResolvedValue({
        target: 'proposal',
        scope: 'filtered',
        projectNames: [],
        proposalNames: [],
        patternNames: [],
        patternMatch: 'all',
        usage: 'used',
        unresolvedEntities: Array.from(
          { length: 20 },
          (_, i) => `${i}${'未找到'.repeat(65)}`,
        ),
      }),
    };
    service = new AssetGraphService(db, neo, model as any);
    jest.spyOn(service, 'graph').mockResolvedValue({
      nodes: [],
      edges: [],
      matches: [],
      status: { truncated: false },
    } as any);
    const result = await service.chat(owner, { message: '查询这些方案' });
    expect(result.reply.length).toBeLessThanOrEqual(3500);
    expect(result.reply).toContain('更多');
    expect(result.reply).toContain('图谱');
  });
  it('answers palette role, hex and percentage from only the selected palette relationships', async () => {
    const roles=[{hex:'#F3EFE5',role:'主色',proportion:72},{hex:'#287F79',role:'辅色',proportion:16},{hex:'#C5A46A',role:'点缀',proportion:4},{hex:'#30363A',role:'结构',proportion:8}];
    const projected=buildAssetProjection(owner,[row('V3','proposal',{packageSnapshot:{colorScheme:{id:'oasis',name:'敦煌丝路·绿洲流光',colorRoles:roles}}}),row('unrelated','proposal',{packageSnapshot:{colorScheme:{id:'other',name:'其他配色',colorRoles:[{hex:'#FF0000',role:'无关色',proportion:100}]}}})]);
    session.run.mockImplementation(async query=>({records:query.includes('asset-chat-catalog')?projected.nodes.map(properties=>({get:()=>({properties})})):[]}));
    const model={understand:jest.fn().mockResolvedValue({target:'palette',scope:'filtered',projectNames:[],proposalNames:['V3'],patternNames:[],paletteNames:[],unresolvedEntities:[],usage:'used',patternMatch:'all'})};
    service=new AssetGraphService(db,neo,model as any);
    jest.spyOn(service,'graph').mockResolvedValue({nodes:projected.nodes.map(n=>({...n,id:n.key})),edges:projected.edges.map(e=>({...e,id:e.key})),matches:[],status:{truncated:false}} as any);
    const result=await service.chat(owner,{message:'V3采用哪套配色，列出色值角色比例'});
    expect(result.reply).toContain('敦煌丝路·绿洲流光');
    for(const role of roles)expect(result.reply).toContain(`${role.role} ${role.hex} · ${role.proportion}%`);
    expect(result.reply).not.toContain('无关色');expect(result.reply).not.toContain('#FF0000');
    expect(result.reply.length).toBeLessThanOrEqual(3500);
  });

});
