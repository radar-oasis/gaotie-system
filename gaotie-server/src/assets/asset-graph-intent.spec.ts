import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AssetGraphIntentService,
  parseAssetIntent,
  selectIntentGraph,
} from './asset-graph-intent';
import { buildAssetProjection } from './asset-graph.service';
const make = (id: string, kind: string, project: string, payload = {}) => ({
  id,
  user_id: 'u',
  kind,
  name: id,
  project_id: project,
  project_name: project === 'default' ? '默认项目' : '其他项目',
  theme: '',
  imagery: '',
  payload,
});
const prov = {
  version: 1,
  outputImageUrl: '/dragon.png',
  sourcePatterns: [{ id: 'dragon', name: '龙纹' }],
  references: [],
};
const pkg = {
  packageSnapshot: {
    selectedReferenceImageUrls: ['/stable.png'],
    canvasAssets: [
      { imageUrl: '/stable.png', name: '转化龙纹', provenance: prov },
    ],
  },
};
const projected = buildAssetProjection('u', [
  make('采用龙纹', 'proposal', 'default', pkg),
  make('未用龙纹', 'proposal', 'default'),
  make('未采用收藏', 'pattern', 'default', {
    provenance: {
      ...prov,
      outputImageUrl: '/unused-favorite.png',
      sourcePatterns: [{ id: 'bird', name: '鸟纹' }],
    },
  }),
  make('其他项目方案', 'proposal', 'other', pkg),
  { ...make('foreign', 'proposal', 'default', pkg), user_id: 'foreign' },
]);
const graph = {
  nodes: projected.nodes.map((n) => ({ ...n, id: n.key })),
  edges: projected.edges.map((e) => ({ ...e, id: e.key })),
  matches: [],
  status: { truncated: false },
};
const intent = (extra: any = {}) =>
  parseAssetIntent({
    target: 'proposal',
    scope: 'filtered',
    projectNames: [],
    proposalNames: [],
    patternNames: [],
    unresolvedEntities: [],
    ...extra,
  });
describe('controlled graph intent selection', () => {
  it('ANDs project and source pattern constraints without including unused or foreign proposals', () => {
    const result = selectIntentGraph(
      graph,
      intent({ projectNames: ['默认项目'], patternNames: ['龙纹'] }),
    );
    expect(result.targets.map((n) => n.label)).toEqual(['采用龙纹']);
    expect(
      result.nodes.some((n) => n.label === '未用龙纹' || n.label === 'foreign'),
    ).toBe(false);
    expect(result.nodes.some((n) => n.label === '龙纹')).toBe(true);
  });
  it('lists all proposals in an exact project and can answer the follow-up about their actual patterns', () => {
    const initial = selectIntentGraph(
      graph,
      intent({ projectNames: ['默认项目'] }),
    );
    expect(initial.targets.map((n) => n.label).sort()).toEqual([
      '未用龙纹',
      '采用龙纹',
    ]);
    const followup = selectIntentGraph(
      graph,
      intent({
        target: 'pattern',
        proposalNames: ['采用龙纹', '未用龙纹'],
        projectNames: ['默认项目'],
      }),
    );
    expect(followup.targets.map((n) => n.label).sort()).toEqual([
      '转化龙纹',
      '龙纹',
    ]);
  });
  it('treats broad pattern alternatives as any but explicit combined adoption as all', () => {
    const any = selectIntentGraph(
      graph,
      intent({ patternNames: ['龙纹', '鸟纹'], patternMatch: 'any' }),
    );
    expect(any.targets.map((n) => n.label).sort()).toEqual([
      '其他项目方案',
      '采用龙纹',
    ]);
    const all = selectIntentGraph(
      graph,
      intent({ patternNames: ['龙纹', '鸟纹'], patternMatch: 'all' }),
    );
    expect(all.targets).toHaveLength(0);
    expect(
      selectIntentGraph(
        graph,
        intent({ patternNames: ['龙纹', '不存在'], patternMatch: 'any' }),
      ).targets,
    ).toHaveLength(0);
  });
  it('distinguishes used pattern follow-ups from explicitly browsing all pattern assets', () => {
    const used = selectIntentGraph(
      graph,
      intent({ target: 'pattern', projectNames: ['默认项目'] }),
    );
    expect(used.targets.map((n) => n.label)).not.toContain('未采用收藏');
    const any = selectIntentGraph(
      graph,
      intent({ target: 'pattern', projectNames: ['默认项目'], usage: 'any' }),
    );
    expect(any.targets.map((n) => n.label)).toContain('未采用收藏');
  });
  it('does not accept model-guessed entities outside the provided owner catalog', () => {
    const result = selectIntentGraph(
      graph,
      intent({ proposalNames: ['采用龙纹'] }),
      undefined,
      graph.nodes.filter((n) => n.label !== '采用龙纹'),
    );
    expect(result.targets).toHaveLength(0);
    expect(result.missingEntities).toEqual(['采用龙纹']);
  });
  it('never converts unknown names or empty filtered intent into the full graph', () => {
    const unknown = selectIntentGraph(
      graph,
      intent({ projectNames: ['不存在'] }),
    );
    expect(unknown.targets).toHaveLength(0);
    expect(unknown.missingEntities).toEqual(['不存在']);
    expect(selectIntentGraph(graph, intent()).nodes).toHaveLength(0);
    expect(() =>
      parseAssetIntent({
        target: 'proposal',
        scope: 'all',
        cypher: 'MATCH (n) RETURN n',
      }),
    ).toThrow(BadGatewayException);
  });
});
describe('model-only Chinese graph intent', () => {
  const oldEnv = process.env.DEEPSEEK_API_KEY;
  const oldFetch = global.fetch;
  afterEach(() => {
    if (oldEnv === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = oldEnv;
    global.fetch = oldFetch;
  });
  it('sends only bounded catalog and supplied conversation, validates JSON, and keeps follow-up filters', async () => {
    process.env.DEEPSEEK_API_KEY = 'test-only';
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  target: 'pattern',
                  scope: 'filtered',
                  projectName: '默认项目',
                }),
              },
            },
          ],
        }),
      ),
    );
    const result = await new AssetGraphIntentService().understand(
      {
        message: '那它们用了什么纹样？',
        history: [
          { role: 'user', content: '默认项目有哪些方案？' },
          { role: 'assistant', content: '找到方案：采用龙纹、未用龙纹。' },
        ],
      },
      graph.nodes,
    );
    expect(result.target).toBe('pattern');
    expect(result.projectNames).toEqual(['默认项目']);
    const request = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body,
    );
    expect(JSON.stringify(request.messages)).toContain('那它们用了什么纹样');
    expect(JSON.stringify(request.messages)).toContain('默认项目有哪些方案');
    expect(JSON.stringify(request.messages)).not.toContain('/dragon.png');
  });
  it('reports missing model configuration instead of keyword fallback', async () => {
    delete process.env.DEEPSEEK_API_KEY;
    await expect(
      new AssetGraphIntentService().understand({ message: '龙纹方案' }, []),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('rejects malformed model output instead of pretending to understand', async () => {
    process.env.DEEPSEEK_API_KEY = 'test-only';
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'not json' } }] }),
        ),
      );
    await expect(
      new AssetGraphIntentService().understand({ message: '龙纹方案' }, []),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
  it('bounds concurrent model requests and releases both slots on cancellation', async () => {
    process.env.DEEPSEEK_API_KEY = 'test-only';
    global.fetch = jest.fn().mockImplementation(() => new Promise(() => {}));
    const model = new AssetGraphIntentService();
    const a = new AbortController(),
      b = new AbortController();
    const first = model.understand({ message: '方案' }, [], a.signal);
    const second = model.understand({ message: '方案' }, [], b.signal);
    await expect(
      model.understand({ message: '方案' }, []),
    ).rejects.toMatchObject({ status: 429 });
    a.abort();
    b.abort();
    await expect(first).rejects.toMatchObject({ status: 499 });
    await expect(second).rejects.toMatchObject({ status: 499 });
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({ target: 'proposal', scope: 'all' }),
                },
              },
            ],
          }),
        ),
      );
    await expect(
      model.understand({ message: '全部方案' }, []),
    ).resolves.toMatchObject({ target: 'proposal', scope: 'all' });
  });
});
