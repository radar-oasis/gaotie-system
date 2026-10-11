// Dry run by default. Apply only with --apply; creates a private JSON backup first.
const { Client } = require('pg');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const PROJECT = '74fd22f5-f3f1-4789-822b-38d23900c4fd';
const USERNAME = 'designer_test_8d1e1b';
const TARGETS = [
  { assetId:'497a9706-4420-4127-8871-154aa72e06a0', layerId:'ai-1791281872560-9eg5k4', sequence:1 },
  { assetId:'a864d90d-a590-4cc3-a1b6-7d4a58092b9f', layerId:'ai-1791282151207-j3we38', sequence:2 },
];
function connection() {
  if (process.env.DATABASE_URL) return {connectionString:process.env.DATABASE_URL};
  const container=JSON.parse(execFileSync('docker',['inspect','gaotie-postgres'],{encoding:'utf8'}))[0];
  const env=Object.fromEntries(container.Config.Env.map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)];}));
  return {host:'127.0.0.1',port:Number(container.NetworkSettings.Ports['5432/tcp'][0].HostPort),user:env.POSTGRES_USER,password:env.POSTGRES_PASSWORD,database:env.POSTGRES_DB};
}
(async()=>{
 const apply=process.argv.includes('--apply'),client=new Client(connection());await client.connect();
 try {
  await client.query('BEGIN');
  const user=(await client.query('SELECT id FROM users WHERE username=$1',[USERNAME])).rows[0];
  if(!user)throw Error('Expected demonstration user is missing');
  const snapshot=(await client.query('SELECT * FROM project_snapshots WHERE project_id=$1 AND user_id=$2 FOR UPDATE',[PROJECT,user.id])).rows[0];
  if(!snapshot)throw Error('Expected demonstration snapshot is missing');
  const assets=(await client.query('SELECT id,user_id,project_id,kind,name,payload,source_key,deleted_at FROM assets WHERE user_id=$1 AND project_id=$2 FOR UPDATE',[user.id,PROJECT])).rows;
  const counters=(await client.query('SELECT * FROM asset_name_counters WHERE user_id=$1 AND root_key=$2 FOR UPDATE',[user.id,'["P00528"]'])).rows;
  const mappings=TARGETS.map(t=>{
    const asset=assets.find(a=>a.id===t.assetId&&a.kind==='pattern');
    const layer=snapshot.snapshot.canvas?.layers?.find(l=>l.id===t.layerId);
    const source=layer?.provenance?.sourcePatterns?.find(p=>p.id==='P00528')??(layer?.sourcePattern?.id==='P00528'?layer.sourcePattern:null);
    if(!asset||!layer||!source?.name)throw Error(`Cannot prove source for ${t.assetId}`);
    const oldAllocation=counters[0]?.allocations?.[asset.source_key];
    if(oldAllocation!==undefined&&Number(oldAllocation)!==t.sequence)throw Error('Existing sequence allocation conflicts; no changes made');
    return {...t,asset,layer,source,name:`${source.name}-${t.sequence}`};
  });
  // Exact stored PNG bytes prove whether a durable reference is this favorite.
  // Ancestor output URLs alone cannot prove this for cropped images.
  const images=(await client.query('SELECT id,image_data FROM assets WHERE user_id=$1 AND id=ANY($2::uuid[])',[user.id,TARGETS.map(t=>t.assetId)])).rows;
  const references=(await client.query('SELECT id,content_hash FROM asset_reference_images WHERE user_id=$1',[user.id])).rows;
  const exactReferences=new Map();
  for(const image of images){const hash=createHash('sha256').update(image.image_data).digest('hex');for(const ref of references)if(ref.content_hash===hash)exactReferences.set(`/assets/references/${ref.id}/image`,image.id);}
  function rename(value) {
    if(Array.isArray(value))return value.map(rename);
    if(!value||typeof value!=='object')return value;
    const out=Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rename(v)]));
    const match=mappings.find(m=>[m.assetId,m.layerId].includes(value.id)||value.sourceAssetId===m.assetId||[m.layer.src,`/assets/${m.assetId}/image`].includes(value.imageUrl)||[m.layer.src,`/assets/${m.assetId}/image`].includes(value.originalImageUrl));
    if(match&&typeof value.name==='string')out.name=match.name;
    const exactAssetId=exactReferences.get(value.imageUrl);
    if(exactAssetId&&typeof value.name==='string')out.sourceAssetId=exactAssetId;
    return out;
  }
  const updatedAssets=assets.map(asset=>{
    const target=mappings.find(m=>m.assetId===asset.id);const payload=rename(asset.payload);
    if(target&&!payload.provenance)payload.provenance={version:1,originalPrompt:payload.prompt??'',outputImageUrl:target.layer.src,sourcePatterns:[target.source],references:[],recovered:true,notes:'从旧项目快照中该图层的 sourcePattern 补录知识纹样来源；历史调用的具体输入图和完整提示词未保存。'};
    return {...asset,name:target?.name??asset.name,payload};
  });
  const updatedSnapshot=rename(snapshot.snapshot);
  const changed=updatedAssets.filter((a,i)=>a.name!==assets[i].name||JSON.stringify(a.payload)!==JSON.stringify(assets[i].payload));
  const snapshotChanged=JSON.stringify(updatedSnapshot)!==JSON.stringify(snapshot.snapshot);
  console.log(JSON.stringify({mode:apply?'apply':'dry-run',projectId:PROJECT,names:mappings.map(m=>({assetId:m.assetId,oldName:m.asset.name,newName:m.name})),assetPayloadsToUpdate:changed.map(a=>a.id),snapshotChanged},null,2));
  if(!apply){await client.query('ROLLBACK');return;}
  const backupDir=path.resolve(__dirname,'../../tmp/pattern-name-backups');fs.mkdirSync(backupDir,{recursive:true});
  const backup=path.join(backupDir,`${new Date().toISOString().replaceAll(':','-')}.json`);
  fs.writeFileSync(backup,JSON.stringify({username:USERNAME,projectId:PROJECT,snapshot,assets,counters},null,2),{mode:0o600,flag:'wx'});
  for(const a of changed)await client.query('UPDATE assets SET name=$1,payload=$2::jsonb WHERE id=$3 AND user_id=$4',[a.name,JSON.stringify(a.payload),a.id,user.id]);
  if(snapshotChanged){updatedSnapshot.savedAt=new Date().toISOString();await client.query('UPDATE project_snapshots SET snapshot=$1::jsonb,version=version+1,updated_at=now() WHERE project_id=$2 AND user_id=$3',[JSON.stringify(updatedSnapshot),PROJECT,user.id]);}
  const allocation=Object.fromEntries(mappings.map(m=>[m.asset.source_key,m.sequence]));
  await client.query(`INSERT INTO asset_name_counters (user_id,root_key,last_value,allocations) VALUES ($1,$2,2,$3::jsonb)
    ON CONFLICT (user_id,root_key) DO UPDATE SET last_value=GREATEST(asset_name_counters.last_value,2),allocations=asset_name_counters.allocations||EXCLUDED.allocations`,[user.id,'["P00528"]',JSON.stringify(allocation)]);
  await client.query('COMMIT');console.log('Applied; backup: '+backup);
 } catch(e){await client.query('ROLLBACK');throw e;} finally {await client.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
