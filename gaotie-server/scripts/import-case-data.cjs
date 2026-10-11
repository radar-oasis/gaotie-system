// Additive, idempotent import of the checked-in case dataset. Never deletes existing data.
const {execFileSync} = require('node:child_process');
const {resolve} = require('node:path');
const {loadDefaultEnvFiles} = require('../dist/env');
const {Neo4jCaseService} = require('../dist/neo4j-case.service');
const readCsv = name => JSON.parse(execFileSync('python3', ['-c', 'import csv,json,sys; print(json.dumps(list(csv.DictReader(open(sys.argv[1],encoding="utf-8-sig"))),ensure_ascii=False))', resolve(__dirname,'../../案例知识图谱信息',name)], {encoding:'utf8'}));
(async () => {
 await loadDefaultEnvFiles();
 const nodes=readCsv('Nodes.csv'), edges=readCsv('Edges.csv');
 const validName = value => /^[A-Za-z][A-Za-z0-9_]*$/.test(value);
 if (nodes.some(n=>!validName(n.label)) || edges.some(e=>!validName(e.relationship_type))) throw new Error('Invalid dataset labels');
 const ids=new Set(nodes.map(n=>n.id));
 const validEdges=edges.filter(e=>ids.has(e.source_id)&&ids.has(e.target_id));
 const skippedEdges=edges.filter(e=>!ids.has(e.source_id)||!ids.has(e.target_id));
 const service = new Neo4jCaseService(), session=service.getSession();
 try {
  await session.executeWrite(async tx=>{
   for (const label of new Set(nodes.map(n=>n.label))) {
    const rows=nodes.filter(n=>n.label===label).map(({label,...props})=>props);
    await tx.run(`UNWIND $rows AS row MERGE (n:${label} {id:row.id}) SET n += row`,{rows});
   }
   for (const type of new Set(validEdges.map(e=>e.relationship_type))) {
    await tx.run(`UNWIND $rows AS row MATCH (a {id:row.source_id}), (b {id:row.target_id}) WHERE a.id STARTS WITH 'Train_' MERGE (a)-[:${type}]->(b)`,{rows:validEdges.filter(e=>e.relationship_type===type)});
   }
  });
  console.log(JSON.stringify({importedNodes:nodes.length,importedEdges:validEdges.length,skippedEdges,health:await service.health()},null,2));
 } finally {await session.close();await service.close();}
})().catch(()=>{console.error('案例导入失败；请检查配置、数据库权限及数据文件。');process.exitCode=1;});
