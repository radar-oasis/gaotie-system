const {loadDefaultEnvFiles} = require('../dist/env');
const {Neo4jService} = require('../dist/neo4j.service');
const {Neo4jCaseService} = require('../dist/neo4j-case.service');
(async () => {
 await loadDefaultEnvFiles();
 const patterns = new Neo4jService(), cases = new Neo4jCaseService();
 try {
  const [patternGraph, caseGraph] = await Promise.all([patterns.health(),cases.health()]);
  console.log(JSON.stringify({patternGraph,caseGraph},null,2));
  if (!patternGraph.available || !caseGraph.available) process.exitCode=1;
 } finally { await Promise.all([patterns.close(),cases.close()]); }
})().catch(()=>{console.error('依赖检查失败；请先构建并核对环境配置。');process.exitCode=1;});
