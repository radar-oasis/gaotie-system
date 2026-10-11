// Read-only integration checks against a running local server and its graph.
// Run: node scripts/verify-pattern-search.cjs
const assert = require('node:assert/strict');
const base = process.env.PATTERN_TEST_BASE_URL || 'http://127.0.0.1:3001';
async function post(path, body) {
  const response = await fetch(`${base}/image-search/${path}`, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify(body), signal: AbortSignal.timeout(30000),
  });
  assert(response.ok, `${path}: HTTP ${response.status}`);
  return response.json();
}
(async () => {
  let kite;
  for (const query of ['风筝','我想找一些和风筝有关的纹样','唐代的龙纹样','帮我找一些唐朝的龙纹图案','想找唐代有神兽感觉的纹样','风筝上的纹样']) {
    const start = Date.now();
    const parsed = await post('parse-intent',{userInput:query});
    const result = await post('grouped-query',{...parsed.filters,limit:100});
    assert(result.groups.some(g=>g.directTotal+g.relatedTotal>0),query);
    if (query.includes('唐')) {
      assert.deepEqual(parsed.filters.dynasties,['唐']);
      assert(result.patterns.every(p=>p.dynasty.includes('唐')));
    }
    if (query.includes('风筝') && !query.includes('上')) {
      assert.deepEqual(parsed.filters.carriers,[]);
      assert(result.groups[0].directTotal>1);
    }
    if (query === '风筝') kite=result;
    if (query === '风筝上的纹样') {
      assert.deepEqual(parsed.filters.carriers,['风筝']);
      assert.deepEqual(parsed.filters.motifs,[]);
    }
    console.log(JSON.stringify({query,filters:parsed.filters,groups:result.groups.map(g=>({direct:g.directTotal,related:g.relatedTotal})),ms:Date.now()-start}));
  }
  const partial = await post('grouped-query',{motifs:['筝'],limit:100});
  const partialKites = partial.patterns.filter(p=>partial.groups[0].directIds.includes(p.id) && (p.motifs.includes('风筝') || p.name.includes('风筝')));
  assert(partialKites.every(p=>kite.groups[0].directIds.includes(p.id)), 'Full kite term must not lose kite results found by a substring');
  const raw = await post('grouped-query',{userInput:'唐代的龙纹样',limit:10});
  assert.deepEqual(raw.filters.dynasties,['唐']);
  const next = await post('grouped-query',{...raw.filters,limit:10,page:{groupId:raw.groups[0].id,kind:'direct',offset:10}});
  assert(next.groups[0].directIds.length>0);
  assert(!next.groups[0].directIds.some(id=>raw.groups[0].directIds.includes(id)));
  const graph = await post('native-graph',{query:{...raw.filters,groups:[{id:raw.groups[0].id,label:'龙',keywords:['龙']}]},kind:'direct',offset:0});
  assert(graph.nodes.length>0);
  console.log(JSON.stringify({partialDirect:partial.groups[0].directTotal,kiteRecallCovered:partialKites.length,rawRecovery:raw.filters,pagination:{first:raw.groups[0].directIds.length,next:next.groups[0].directIds.length},graphNodes:graph.nodes.length}));
})().catch(error=>{console.error(error);process.exitCode=1;});
