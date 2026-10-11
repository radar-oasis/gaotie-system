import { buildAssetProjection } from './asset-graph.service';
import { parseAssetIntent, selectIntentGraph } from './asset-graph-intent';
import { normalizeProvenance } from './asset-provenance';
import sharp from 'sharp';
import { AssetsService } from './assets.service';
const row = (id: string, payload: any, kind = 'proposal', project_id = 'p') => ({ id, user_id: 'u', kind, name:id, project_id, project_name:'项目', theme:'', imagery:'', payload });
const palette = {id:'oasis', name:'敦煌丝路·绿洲流光', colorRoles:[{hex:'#F3EFE5',role:'主色',proportion:72},{hex:'#287F79',role:'辅色',proportion:16},{hex:'#C5A46A',role:'点缀',proportion:4},{hex:'#30363A',role:'结构',proportion:8}]};
const projection = () => buildAssetProjection('u', [row('V1',{sourceProposalId:'g1', familyId:'g1',packageSnapshot:{colorScheme:palette}}), row('V2',{sourceProposalId:'g2',familyId:'g1',parentProposalId:'g1', userInstruction:'减少腰线',packageSnapshot:{colorScheme:palette}}),row('其他',{packageSnapshot:{}})]);
it('projects palette roles and exact proportions and adopts the palette for each saved proposal', () => {
 const g=projection(); const p=g.nodes.find(n=>n.kind==='palette'); expect(p?.label).toBe(palette.name);
 expect(g.edges.filter(e=>e.label==='采用配色').map(e=>e.source)).toEqual(['asset:V1','asset:V2']);
 expect(g.nodes.filter(n=>n.kind==='color-role').map(n=>n.label)).toEqual(['主色 #F3EFE5 · 72%','辅色 #287F79 · 16%','点缀 #C5A46A · 4%','结构 #30363A · 8%']);
});
it('supports proposal palette followup and reverse lookup without unrelated proposals', () => {
 const g=projection(); const graph={nodes:g.nodes.map(n=>({...n,id:n.key})),edges:g.edges.map(e=>({...e,id:e.key}))};
 const follow=selectIntentGraph(graph,parseAssetIntent({target:'palette',scope:'filtered',proposalNames:['V2']}));
 expect(follow.targets.map(n=>n.label)).toEqual([palette.name]);
 expect(follow.nodes.some(n=>n.kind==='color-role')).toBe(true);
 const reverse=selectIntentGraph(graph,parseAssetIntent({target:'proposal',scope:'filtered',paletteNames:[palette.name]}));
 expect(reverse.targets.map(n=>n.label)).toEqual(['V1','V2']);
 expect(selectIntentGraph(graph,parseAssetIntent({target:'proposal',scope:'filtered',paletteNames:['不存在']})).targets).toEqual([]);
});
it('links lineage by stable ids across save order while rejecting cross-project and unknown historical parents',()=>{
 const g=projection(); expect(g.edges).toContainEqual(expect.objectContaining({source:'asset:V1',target:'asset:V2',label:'派生版本'}));
 expect(g.nodes.some(n=>n.kind==='change-instruction'&&n.label==='减少腰线')).toBe(true);
 const bad=buildAssetProjection('u',[row('parent',{sourceProposalId:'g1'},'proposal','other'),row('child',{parentProposalId:'g1',sourceProposalId:'g2'}),row('legacy',{version:3})]);
 expect(bad.edges.some(e=>e.label==='派生版本')).toBe(false);
});
it('keeps original references original and changed favorites as distinct derived nodes',()=>{
 const g=buildAssetProjection('u',[row('fav',{provenance:{version:1,references:[],sourcePatterns:[],transformFingerprint:'before'}},'pattern'),row('use',{packageSnapshot:{selectedReferenceImageUrls:['/root.png','/crop.png'],canvasAssets:[{imageUrl:'/root.png',referenceKind:'original',sourcePatternId:'P00430',name:'原始',provenance:{version:1,sourcePatterns:[{id:'P00430',name:'原始'}],references:[]}},{imageUrl:'/crop.png',referenceKind:'derived',sourceAssetId:'fav',transformFingerprint:'after',provenance:{version:1,sourcePatterns:[],references:[]}}]}})]);
 expect(g.nodes.filter(n=>n.label==='原始').map(n=>n.kind)).toEqual(['original-pattern']);
 const used=g.edges.filter(e=>e.target==='asset:use'&&e.label==='用于方案').map(e=>e.source);
 expect(used).toContain('original:P00430'); expect(used).not.toContain('asset:fav');
 expect(g.edges.some(e=>e.source==='asset:fav'&&used.includes(e.target)&&e.label==='裁剪/变换自')).toBe(true);
});
it('retains explicit provenance reference types and exact transform identity',()=>{
 const p=normalizeProvenance({version:1,sourcePatterns:[],references:[{imageUrl:'/root',referenceKind:'original',sourcePatternId:'P00430',transformFingerprint:'abc'}],referenceKind:'capture',transformFingerprint:'capture-v1'});
 expect(p).toMatchObject({referenceKind:'capture',transformFingerprint:'capture-v1',references:[{referenceKind:'original',sourcePatternId:'P00430',transformFingerprint:'abc'}]});
});
it('rejects foreign or cross-project parent identity before storing an archive',async()=>{
 const db={query:jest.fn().mockImplementation(async(sql:string)=>({rows:sql.includes('FROM projects')?[{id:'22222222-2222-4222-8222-222222222222',name:'p'}]:[{id:'parent',user_id:'foreign',project_id:'other',kind:'proposal',payload:{sourceProposalId:'g1'}}]}))};
 const s=new AssetsService(db as any); jest.spyOn(s,'readImage').mockResolvedValue(Buffer.from('no image'));
 await expect(s.archive('u',{projectId:'22222222-2222-4222-8222-222222222222',sourceProposalId:'g2',parentProposalId:'g1',name:'child',version:2,imageUrl:'/image',promptUsed:'p',designRationale:'',packageSnapshot:{demandTags:[],selectedPatterns:[],selectedCases:[]}} as any)).rejects.toThrow('方案来源不属于当前项目');
 expect(s.readImage).not.toHaveBeenCalled();
});
it('selects same-url references by stable canvas id instead of the first image URL match',()=>{
 const g=buildAssetProjection('u',[row('proposal',{packageSnapshot:{selectedReferenceImageUrls:['/same.png'],selectedReferenceAssetIds:['second'],canvasAssets:[{id:'first',imageUrl:'/same.png',referenceKind:'original',sourcePatternId:'P1',name:'未采用'},{id:'second',imageUrl:'/same.png',referenceKind:'original',sourcePatternId:'P2',name:'实际采用'}]}})]);
 expect(g.nodes.filter(n=>n.kind==='original-pattern').map(n=>n.key)).toEqual(['original:P2']);
});
it('refuses a pending visual review before loading generated images',async()=>{
 const db={query:jest.fn().mockResolvedValue({rows:[{id:'22222222-2222-4222-8222-222222222222',name:'p'}]})};
 const s=new AssetsService(db as any);
 await expect(s.archive('u',{projectId:'22222222-2222-4222-8222-222222222222',name:'child',version:1,imageUrl:'/image',promptUsed:'p',designRationale:'',review:{status:'pending'},packageSnapshot:{demandTags:[],selectedPatterns:[],selectedCases:[]}} as any)).rejects.toThrow('请先完成效果审核');
});
it('persists stable identity for child-before-parent saves and returns later parent links; repeated saves use one key', async()=>{
 const image=await sharp({create:{width:1,height:1,channels:4,background:'#fff'}}).png().toBuffer();
 const projectId='22222222-2222-4222-8222-222222222222';
 const stored:any[]=[]; const keys:string[]=[];
 const db={query:jest.fn(async(sql:string,args:any[])=>{
  if(sql.includes('FROM projects')) return {rows:[{id:projectId,name:'p'}]};
  if(sql.includes('encode(sha256(')) return {rows:[]};
  if(sql.includes('INSERT INTO assets')){ keys.push(args[10]); let entry=stored.find(r=>r.key===args[10]); if(!entry){entry={id:args[0],user_id:args[1],kind:args[2],project_id:args[3],project_name:args[4],created_at:'2026-10-09',key:args[10]};stored.push(entry);} Object.assign(entry,{name:args[5],payload:JSON.parse(args[9])});return {rows:[entry]};}
  if(sql.includes('AND id = $2'))return {rows:stored.filter(r=>r.id===args[1])};
  if(sql.includes('project_id = $2'))return {rows:stored.filter(r=>r.payload.sourceProposalId===args[2]||r.payload.parentProposalId===args[3])};
  return {rows:stored};
 })};
 const s=new AssetsService(db as any); jest.spyOn(s,'readImage').mockResolvedValue(image);
 const input:any={projectId,name:'子',version:2,sourceProposalId:'g2',parentProposalId:'g1',familyId:'g1',imageUrl:'/image',promptUsed:'p',designRationale:'',packageSnapshot:{demandTags:[],selectedPatterns:[],selectedCases:[]},review:{status:'accepted',checks:{structure:true},previous:{huge:'omit'}}};
 const child=await s.archive('u',input);
 expect((await s.get('u',child.id) as any).lineage.parentStatus).toBe('not-saved');
 const parent=await s.archive('u',{...input,sourceProposalId:'g1',parentProposalId:undefined,name:'父',version:1});
 const savedAgain=await s.archive('u',{...input,name:'子改名'});
 expect(savedAgain.id).toBe(child.id);expect(keys[0]).toBe(keys[2]);expect(stored).toHaveLength(2);
 expect(stored[0].payload.review.previous).toBeUndefined();
 expect((await s.get('u',child.id) as any).lineage.parent).toEqual({id:parent.id,name:'父'});
 expect((await s.get('u',parent.id) as any).lineage.children).toEqual([{id:child.id,name:'子改名'}]);
});
it('renames a legacy archive by its own stable asset id without creating a duplicate',async()=>{
 const projectId='22222222-2222-4222-8222-222222222222', assetId='33333333-3333-4333-8333-333333333333';
 const record={id:assetId,user_id:'u',project_id:projectId,kind:'proposal',name:'旧名',created_at:'2026-10-09',payload:{version:1}};
 const image=await sharp({create:{width:1,height:1,channels:4,background:'#fff'}}).png().toBuffer();
 const db={query:jest.fn(async(sql:string,args:any[])=>{
  if(sql.includes('FROM projects'))return {rows:[{id:projectId,name:'p'}]};
  if(sql.includes('UPDATE assets'))return {rows:[{...record,name:args[5],payload:JSON.parse(args[9])}]};
  if(sql.includes('INSERT INTO assets'))return {rows:[{...record,id:'unexpected-new-id'}]};
  return {rows:[record]};
 })};
 const s=new AssetsService(db as any);jest.spyOn(s,'readImage').mockResolvedValue(image);
 const saved=await s.archive('u',{projectId,sourceProposalId:assetId,name:'新名',version:1,imageUrl:'/image',promptUsed:'p',designRationale:'',packageSnapshot:{demandTags:[],selectedPatterns:[],selectedCases:[]}});
 expect(saved.id).toBe(assetId);expect(saved.name).toBe('新名');
 expect(db.query.mock.calls.some(([sql])=>sql.includes('INSERT INTO assets'))).toBe(false);
});
it('resolves an explicit legacy parent asset id in graph and bidirectional asset details',async()=>{
 const parentId='33333333-3333-4333-8333-333333333333', childId='44444444-4444-4444-8444-444444444444';
 const parent={...row(parentId,{version:1}),created_at:'2026-10-09'};
 const child={...row(childId,{sourceProposalId:'new-generation',parentProposalId:parentId,version:2}),created_at:'2026-10-09'};
 const g=buildAssetProjection('u',[child,parent]);
 expect(g.edges).toContainEqual(expect.objectContaining({source:`asset:${parentId}`,target:`asset:${childId}`,label:'派生版本'}));
 const db={query:jest.fn(async(sql:string,args:any[])=>({rows:sql.includes('AND id = $2')?[parent,child].filter(r=>r.id===args[1]):[parent,child]}))};
 const s=new AssetsService(db as any);
 expect((await s.get('u',childId) as any).lineage.parent).toEqual({id:parentId,name:parentId});
 expect((await s.get('u',parentId) as any).lineage.children).toEqual([{id:childId,name:childId}]);
 expect(db.query.mock.calls.some(([sql,args])=>sql.includes('id::text = $3') && args[3]===parentId)).toBe(true);
 const cross=buildAssetProjection('u',[child,{...parent,project_id:'foreign-project'}]);
 expect(cross.edges.some(e=>e.label==='派生版本')).toBe(false);
});
it('aliases an unchanged capture favorite but separates its later crop without guessing by ancestor URL',()=>{
 const capture={version:1,referenceKind:'capture',sourcePatterns:[],references:[],transformFingerprint:''};
 const used=(id:string, fingerprint:string)=>row(id,{packageSnapshot:{selectedReferenceImageUrls:['/capture-pixels.png'],canvasAssets:[{id:'capture-layer',imageUrl:'/capture-pixels.png',referenceKind:fingerprint?'derived':'capture',sourceAssetId:'capture-favorite',transformFingerprint:fingerprint,provenance:capture}]}});
 const graph=buildAssetProjection('u',[row('capture-favorite',{provenance:capture},'pattern'),used('unchanged',''),used('cropped','cropped-fingerprint')]);
 const adopted=(id:string)=>graph.edges.find(e=>e.target===`asset:${id}`&&e.label==='用于方案')?.source;
 expect(adopted('unchanged')).toBe('asset:capture-favorite');
 expect(adopted('cropped')).not.toBe('asset:capture-favorite');
 expect(graph.edges).toContainEqual(expect.objectContaining({source:'asset:capture-favorite',target:adopted('cropped'),label:'裁剪/变换自'}));
});
it('recovers the old generated identity from its exact legacy source hash instead of duplicating a saved workspace proposal',async()=>{
 const projectId='22222222-2222-4222-8222-222222222222', assetId='33333333-3333-4333-8333-333333333333', sourceId='original-workspace-generation';
 const image=await sharp({create:{width:1,height:1,channels:4,background:'#fff'}}).png().toBuffer();
 const {createHash}=require('node:crypto');
 const record={id:assetId,user_id:'u',project_id:projectId,kind:'proposal',name:'V2',created_at:'2026-10-09',payload:{version:2},source_key:createHash('sha256').update(projectId).update(sourceId).update(image).digest('hex')};
 const db={query:jest.fn(async(sql:string,args:any[])=>{
  if(sql.includes('FROM projects'))return {rows:[{id:projectId,name:'p'}]};
  if(sql.includes('encode(sha256('))return {rows:args[0]==='u' && args[1]===projectId && createHash('sha256').update(args[1]).update(args[2]).update(image).digest('hex')===record.source_key?[record]:[]};
  if(sql.includes('UPDATE assets'))return {rows:[{...record,name:args[5],payload:JSON.parse(args[9])}]};
  if(sql.includes('INSERT INTO assets'))return {rows:[{...record,id:'unexpected-duplicate'}]};
  return {rows:[]};
 })};
 const s=new AssetsService(db as any);jest.spyOn(s,'readImage').mockResolvedValue(image);
 const saved=await s.archive('u',{projectId,sourceProposalId:sourceId,name:'V2重命名',version:2,imageUrl:'/image',promptUsed:'p',designRationale:'',packageSnapshot:{demandTags:[],selectedPatterns:[],selectedCases:[]}});
 expect(saved.id).toBe(assetId);expect(saved.name).toBe('V2重命名');expect(saved.sourceProposalId).toBe(sourceId);
 expect(db.query.mock.calls.some(([sql])=>sql.includes('INSERT INTO assets'))).toBe(false);
 expect(db.query.mock.calls.find(([sql])=>sql.includes('encode(sha256('))?.[0]).toContain("COALESCE(payload->>'sourceProposalId', '') = ''");
});
it('projects favorite-to-favorite crop ancestry through proposal use and exposes ancestors in its project scope',()=>{
 const original=row('A',{provenance:{version:1,sourcePatterns:[],references:[],referenceKind:'generated',transformFingerprint:'full'}},'pattern','original-project');
 const cropped=row('B',{provenance:{version:1,sourcePatterns:[],references:[],referenceKind:'derived',sourceAssetId:'A',transformFingerprint:'cropped'}},'pattern','crop-project');
 const proposal=row('proposal',{packageSnapshot:{selectedReferenceImageUrls:['/assets/B/image'],canvasAssets:[{id:'B-layer',imageUrl:'/assets/B/image',sourceAssetId:'B',transformFingerprint:'cropped'}]}},'proposal','proposal-project');
 const g=buildAssetProjection('u',[original,cropped,proposal]);
 expect(g.edges).toContainEqual(expect.objectContaining({source:'asset:A',target:'asset:B',label:'裁剪/变换自'}));
 expect(g.edges).toContainEqual(expect.objectContaining({source:'asset:B',target:'asset:proposal',label:'用于方案'}));
 expect(g.nodes.find(n=>n.key==='asset:A')?.projectIds).toContain('proposal-project');
 expect(g.nodes.find(n=>n.key==='asset:B')?.projectIds).toContain('proposal-project');
 const bad=buildAssetProjection('u',[{...original,user_id:'foreign'},cropped,row('missing',{provenance:{version:1,sourcePatterns:[],references:[],referenceKind:'derived',sourceAssetId:'nonexistent'}},'pattern'),row('self',{provenance:{version:1,sourcePatterns:[],references:[],sourceAssetId:'self'}},'pattern')]);
 expect(bad.edges.some(e=>e.label==='裁剪/变换自')).toBe(false);
 expect(bad.nodes.some(n=>['asset:A','asset:nonexistent'].includes(n.key))).toBe(false);
});
