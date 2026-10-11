// Local integration verification. Uses disposable accounts; never reads existing users' work.
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { randomUUID } = require('node:crypto');
const base = 'http://127.0.0.1:3000';
const createdUsers = [];
async function waitForProjection(owner, predicate) {
  const { Neo4jService } = require('../dist/neo4j.service');
  const neo4j = new Neo4jService();
  const session = neo4j.getSession();
  try {
    for (let attempt = 0; attempt < 50; attempt++) {
      const result = await session.run('MATCH (n:DesignAssetNode {ownerId: $owner}) RETURN n', { owner });
      if (predicate(result.records.map(r => r.get('n').properties))) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.fail('Saved/deleted asset did not automatically update Neo4j');
  } finally { await session.close(); await neo4j.close(); }
}
async function request(path, cookie, body, method) {
  const response = await fetch(base + path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = response.headers.get('content-type') || '';
  return {
    status: response.status,
    body: type.includes('json')
      ? await response.json()
      : Buffer.from(await response.arrayBuffer()),
    cookie: response.headers.get('set-cookie')?.split(';')[0],
  };
}
(async () => {
  const suffix = randomUUID().slice(0, 8);
  const accounts = [];
  for (const n of ['a', 'b']) {
    const r = await request('/auth/register', null, {
      username: `asset_check_${suffix}_${n}`,
      password: randomUUID(),
    });
    assert.equal(r.status, 201);
    accounts.push({ id: r.body.user.id, cookie: r.cookie });
    createdUsers.push(r.body.user.id);
  }
  const [a, b] = accounts;
  const project = await request('/projects', a.cookie, {
    name: '资产验收项目',
  });
  assert.equal(project.status, 201);
  const pid = project.body.project?.id || project.body.id;
  assert.ok(pid);
  const png = await sharp({
    create: {
      width: 48,
      height: 48,
      channels: 4,
      background: { r: 190, g: 35, b: 65, alpha: 0.6 },
    },
  })
    .png()
    .toBuffer();
  const data = 'data:image/png;base64,' + png.toString('base64');
  const input = {
    projectId: pid,
    name: '透明纹样验收',
    imageDataUrl: data,
    prompt: '测试保存透明图片',
    provenance: { version: 1, originalPrompt: '从龙纹提取', outputImageUrl: '/generated/test-provenance.png', sourcePatterns: [{ id: 'P_TEST', name: '测试原始龙纹' }], references: [{ imageUrl: data, name: '原图', sourcePatterns: [{ id: 'P_TEST', name: '测试原始龙纹' }] }] },
  };
  const favorite = await request('/assets/favorites', a.cookie, input);
  assert.equal(favorite.status, 201);
  const sourceCopy = favorite.body.payload.provenance.references[0].imageUrl;
  assert.match(sourceCopy, /^\/assets\/references\//);
  assert.equal((await request(sourceCopy, a.cookie)).status, 200);
  assert.equal((await request(sourceCopy, b.cookie)).status, 404);
  const duplicate = await request('/assets/favorites', a.cookie, input);
  assert.equal(duplicate.body.id, favorite.body.id);
  assert.equal((await request('/assets')).status, 401);
  assert.equal((await request('/assets', b.cookie)).body.length, 0);
  assert.equal(
    (await request('/assets/' + favorite.body.id, b.cookie)).status,
    404,
  );
  assert.equal(
    (await request('/assets/' + favorite.body.id + '/image', b.cookie)).status,
    404,
  );
  assert.equal(
    (
      await request(
        '/assets/' + favorite.body.id,
        b.cookie,
        undefined,
        'DELETE',
      )
    ).status,
    404,
  );
  assert.equal(
    (await request('/assets/favorites', b.cookie, input)).status,
    404,
  );
  const stored = await request(
    '/assets/' + favorite.body.id + '/image',
    a.cookie,
  );
  assert.equal(stored.status, 200);
  assert.equal((await sharp(stored.body).metadata()).hasAlpha, true);
  const pkg = {
    demandTags: [{ label: '祥云', topic: '自然意象' }],
    selectedPatterns: [],
    selectedCases: [],
    canvasAssets: [
      { id: 'capture', name: '采用的祥云', source: 'capture', imageUrl: favorite.body.imageUrl, provenance: input.provenance },
    ],
    selectedReferenceImageUrls: [favorite.body.imageUrl],
    layoutScheme: {
      id: 'layout',
      name: '车窗长带',
      componentsMap: { 车窗带: '长带' },
      layout3d: { config: { version: 1, windowBand: { mode: 'long', crossDoors: false }, waist: { mode: 'single', width: 'thin', crossDoors: false }, nose: 'upper', doors: 'inherit', roofSide: 'none', lowerSide: 'none', skirt: false } },
    },
  };
  const proposalInput = {
    projectId: pid,
    projectName: '生成时项目名称',
    sourceProposalId: 'generated-1',
    name: '山海涂装',
    theme: '山海相逢',
    imagery: '祥云',
    version: 1,
    imageUrl: data,
    promptUsed: '山海意象涂装',
    designRationale: '保留曲线',
    packageSnapshot: pkg,
  };
  const saved = await request(
    '/final-proposals/archive',
    a.cookie,
    proposalInput,
  );
  assert.equal(saved.status, 201);
  assert.ok(saved.body.id);
  assert.equal(saved.body.imageUrl, `/assets/${saved.body.id}/image`);
  assert.equal((await request(saved.body.imageUrl, a.cookie)).status, 200);
  const resaved = await request('/final-proposals/archive', a.cookie, {
    ...proposalInput,
    imageUrl: saved.body.imageUrl,
  });
  assert.equal(resaved.status, 201);
  assert.equal(resaved.body.id, saved.body.id);
  const savedAgain = await request(
    '/final-proposals/archive',
    a.cookie,
    proposalInput,
  );
  assert.equal(savedAgain.body.id, saved.body.id);
  const detail = await request('/assets/' + saved.body.id, a.cookie);
  assert.equal(detail.body.projectName, '生成时项目名称');
  assert.equal(detail.body.payload.packageSnapshot.canvasAssets[0].sourceAssetId, favorite.body.id);
  assert.match(detail.body.payload.packageSnapshot.selectedReferenceImageUrls[0], /^\/assets\/references\//);
  assert.equal((await request(detail.body.payload.packageSnapshot.selectedReferenceImageUrls[0], b.cookie)).status, 404);
  // Read Neo4j directly before any graph GET: proves save-triggered projection.
  await waitForProjection(a.id, nodes => nodes.some(n => n.assetId === saved.body.id) && nodes.filter(n => n.kind === 'layout-region').length === 3);
  const graph = await request('/assets/graph?query=P_TEST&hops=2', a.cookie);
  assert.equal(graph.status, 200);
  assert.ok(graph.body.nodes.some(n => n.label === '测试原始龙纹'));
  assert.ok(graph.body.matches.some(m => m.assetId === saved.body.id));
  const fullGraph = await request('/assets/graph', a.cookie);
  assert.equal(fullGraph.status, 200);
  const regions = fullGraph.body.nodes.filter(n => n.kind === 'layout-region');
  assert.equal(regions.length, 3);
  assert.ok(regions.some(n => n.label === '车窗带：连贯型（避让车门）'));
  const layout = fullGraph.body.nodes.find(n => n.kind === 'layout');
  const scheme = fullGraph.body.nodes.find(n => n.assetId === saved.body.id);
  assert.ok(fullGraph.body.edges.some(e => e.source === scheme.id && e.target === layout.id));
  assert.equal(fullGraph.body.edges.filter(e => e.source === layout.id && regions.some(n => n.id === e.target)).length, 3);
  const otherGraph = await request('/assets/graph?query=P_TEST', b.cookie);
  assert.equal(otherGraph.body.nodes.length, 0);
  assert.equal((await request('/final-proposals', b.cookie)).body.length, 0);
  assert.equal(
    (await request('/final-proposals/' + saved.body.id, b.cookie)).status,
    404,
  );
  assert.equal((await request('/assets', a.cookie)).body.length, 2);
  const list = await request('/assets', a.cookie);
  assert.equal(list.body[0].payload, undefined);
  assert.equal(
    (
      await request(
        '/assets/' + favorite.body.id,
        a.cookie,
        undefined,
        'DELETE',
      )
    ).status,
    200,
  );
  assert.equal(
    (await request('/assets/' + favorite.body.id, a.cookie)).status,
    404,
  );
  assert.equal((await request(sourceCopy, a.cookie)).status, 200);
  assert.equal((await request(detail.body.payload.packageSnapshot.selectedReferenceImageUrls[0], a.cookie)).status, 200);
  await waitForProjection(a.id, nodes => !nodes.some(n => n.assetId === favorite.body.id) && nodes.some(n => n.assetId === saved.body.id));
  const afterDelete = await request('/assets/graph?query=P_TEST&hops=2', a.cookie);
  assert.ok(afterDelete.body.matches.some(m => m.assetId === saved.body.id));
  assert.ok(!afterDelete.body.matches.some(m => m.assetId === favorite.body.id));
  assert.equal(
    (await request('/assets/favorites', a.cookie, input)).body.id,
    favorite.body.id,
  );
  await request('/assets/graph', a.cookie);
  await request('/auth/logout', a.cookie, {}, 'POST');
  await request('/auth/logout', b.cookie, {}, 'POST');
  console.log(
    'PASS: favorites, duplicate-save idempotency, alpha, proposal snapshots, cross-account isolation, unauthorized access, delete/recollect, automatic Neo4j save/delete sync, three-region layout.',
  );
})()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (!createdUsers.length) return;
    await require('../dist/env').loadDefaultEnvFiles();
    const pool = new (require('pg').Pool)({
      connectionString: process.env.DATABASE_URL,
    });
    try {
      const { Neo4jService } = require('../dist/neo4j.service');
      const neo4j = new Neo4jService();
      const session = neo4j.getSession();
      try { await session.run('MATCH (n:DesignAssetNode) WHERE n.ownerId IN $owners DETACH DELETE n', { owners: createdUsers }); }
      finally { await session.close(); await neo4j.close(); }
      await pool.query(
        'DELETE FROM users WHERE id = ANY($1::uuid[]) AND username LIKE $2',
        [createdUsers, 'asset_check_%'],
      );
    } finally {
      await pool.end();
    }
  });
