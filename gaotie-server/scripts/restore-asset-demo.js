// One-time, user-requested local repair using the separately inspected evidence.
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
(async () => {
  await require('../dist/env').loadDefaultEnvFiles();
  const db = new (require('pg').Pool)({ connectionString: process.env.DATABASE_URL });
  const evidence = JSON.parse(await fs.readFile(path.resolve('../tmp/recovery-evidence.json'), 'utf8'));
  const { userId, projectId } = evidence;
  const ids = [evidence.transparentPattern.assetId, evidence.existingProposal.assetId];
  const client = await db.connect();
  let neo;
  try {
    await client.query('BEGIN');
    const identity = await client.query('SELECT id FROM users WHERE id=$1 AND username=$2', [userId, evidence.username]);
    if (!identity.rowCount) throw new Error('Evidence user no longer matches');
    const rows = (await client.query('SELECT * FROM assets WHERE user_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL FOR UPDATE', [userId, ids])).rows;
    if (rows.length !== 2 || rows.some(r => r.project_id !== projectId)) throw new Error('Evidence assets no longer match');
    const snapshotRow = (await client.query('SELECT * FROM project_snapshots WHERE project_id=$1 AND user_id=$2 FOR UPDATE', [projectId, userId])).rows[0];
    const backupPath = path.resolve(`../tmp/asset-demo-backup-${Date.now()}.json`);
    await fs.writeFile(backupPath, JSON.stringify({ snapshotRow, rows }, null, 2), { mode: 0o600 });
    const favorite = rows.find(r => r.id === ids[0]);
    const proposal = rows.find(r => r.id === ids[1]);
    const provenance = { ...evidence.safeCandidateUpdates.transparentPatternAsset.payloadMerge.provenance, notes: '来源取自项目中保存的唐代龙纹记录。提示词取自当时画布输入；历史参考图和优化提示词未记录。' };
    const hash = createHash('sha256').update(favorite.image_data).digest('hex');
    const referenceId = (await client.query(`INSERT INTO asset_reference_images(id,user_id,content_hash,image_data) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,content_hash) DO UPDATE SET content_hash=EXCLUDED.content_hash RETURNING id`, [randomUUID(),userId,hash,favorite.image_data])).rows[0].id;
    const stableUrl = `/assets/references/${referenceId}/image`;
    const pkg = structuredClone(proposal.payload.packageSnapshot);
    const reference = { id: evidence.transparentPattern.layerId, name: '透明龙纹', source: 'layer', imageUrl: stableUrl, provenance: { ...provenance, notes: `${provenance.notes} 本方案与透明龙纹的关联按此次说明补录，历史生成时的勾选记录缺失。` } };
    pkg.canvasAssets = [reference];
    pkg.selectedReferenceImageUrls = [stableUrl];
    const demoNote = '示范补录：按用户本轮说明关联透明龙纹。原方案勾选记录缺失，此关联不作为原调用证据。';
    const favoritePayload = { ...favorite.payload, ...evidence.safeCandidateUpdates.transparentPatternAsset.payloadMerge, provenance };
    const proposalPayload = { ...proposal.payload, packageSnapshot: pkg, recoveryNote: demoNote };
    await client.query('UPDATE assets SET name=$3,payload=$4::jsonb WHERE user_id=$1 AND id=$2', [userId, favorite.id, '透明龙纹', JSON.stringify(favoritePayload)]);
    await client.query('UPDATE assets SET name=$3,payload=$4::jsonb WHERE user_id=$1 AND id=$2', [userId, proposal.id, '龙纹高铁涂装 · 示范方案', JSON.stringify(proposalPayload)]);
    if (snapshotRow) {
      const snapshot = snapshotRow.snapshot;
      snapshot.canvas.layers = snapshot.canvas.layers.map(layer => layer.id === evidence.transparentPattern.layerId ? { ...layer, name: '透明龙纹', provenance } : layer);
      const updateProposal = p => p && (p.id === proposal.id || p.id === evidence.existingProposal.currentProposalId || p.imageUrl === evidence.existingProposal.imageUrl) ? { ...p, name: '龙纹高铁涂装 · 示范方案', packageSnapshot: pkg } : p;
      snapshot.finalProposal.currentProposal = updateProposal(snapshot.finalProposal.currentProposal);
      snapshot.finalProposal.archivedProposals = snapshot.finalProposal.archivedProposals.map(updateProposal);
      await client.query('UPDATE project_snapshots SET snapshot=$3::jsonb,version=version+1,updated_at=now() WHERE project_id=$1 AND user_id=$2', [projectId,userId,JSON.stringify(snapshot)]);
    }
    await client.query('COMMIT');
    neo = new(require('../dist/neo4j.service').Neo4jService)();
    const graph = new(require('../dist/assets/asset-graph.service').AssetGraphService)(db,neo);
    const result = await graph.graph(userId, { query: 'P00528', hops: 2 });
    if (!result.matches.some(m => m.assetId === proposal.id)) throw new Error('Demo graph relation verification failed');
    console.log(JSON.stringify({ updatedAssets: ids, demoMatched: true, backupPath, matchedPaths: result.matches.map(m => m.paths) }));
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { if (neo) await neo.close(); client.release(); await db.end(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
