// Run with DATABASE_URL against a disposable database, or local gaotie-postgres.
require('ts-node/register');
const { STORE_NAMED_PATTERN_SQL } = require('../src/assets/pattern-naming.ts');
const { Pool } = require('pg');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
(async () => {
  let config = process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : undefined;
  if (!config) {
    const container = JSON.parse(execFileSync('docker', ['inspect','gaotie-postgres'], {encoding:'utf8'}))[0];
    const env = Object.fromEntries(container.Config.Env.map(s => {const i=s.indexOf('='); return [s.slice(0,i),s.slice(i+1)];}));
    config = {host:'127.0.0.1',port:Number(container.NetworkSettings.Ports['5432/tcp'][0].HostPort),user:env.POSTGRES_USER,password:env.POSTGRES_PASSWORD,database:env.POSTGRES_DB};
  }
  const pool = new Pool({...config,max:8}); const schema = `pattern_naming_test_${randomUUID().replaceAll('-','')}`;
  try {
    await pool.query(`CREATE SCHEMA ${schema}`);
    await pool.query(`CREATE TABLE ${schema}.assets (id uuid PRIMARY KEY,user_id uuid,kind text,project_id uuid,project_name text,name text,theme text,imagery text,image_data bytea,payload jsonb,source_key text,created_at timestamptz DEFAULT now(),deleted_at timestamptz,UNIQUE(user_id,kind,source_key))`);
    await pool.query(`CREATE TABLE ${schema}.asset_name_counters (user_id uuid,root_key text,last_value bigint,allocations jsonb,PRIMARY KEY(user_id,root_key))`);
    const user=randomUUID(), project=randomUUID();
    const sql=STORE_NAMED_PATTERN_SQL.replaceAll('asset_name_counters',`${schema}.asset_name_counters`).replaceAll(/\bassets\b/g,`${schema}.assets`);
    // Qualified target references in ON CONFLICT use the table name without schema.
    const fixed=sql.replaceAll(`${schema}.asset_name_counters.`, 'asset_name_counters.').replaceAll(`${schema}.assets.`, 'assets.');
    const store=async(key,n=1) => (await pool.query(fixed,[randomUUID(),user,'pattern',project,'项目','AI 转化纹样','','',Buffer.from('x'),'{}',key,'["P00528"]','完整原纹样名',n])).rows[0];
    const concurrent=await Promise.all(Array.from({length:8},()=>store('same')));
    assert.equal(new Set(concurrent.map(x=>x.id)).size,1); assert.ok(concurrent.every(x=>x.name==='完整原纹样名-1'));
    const next=await Promise.all([store('second'),store('third')]);assert.deepEqual(next.map(x=>x.name).sort(),['完整原纹样名-2','完整原纹样名-3']);
    await pool.query(`UPDATE ${schema}.assets SET deleted_at=now() WHERE source_key='same'`);
    assert.equal((await store('same',20)).name,'完整原纹样名-1');
    assert.equal((await store('fourth')).name,'完整原纹样名-4');
    assert.equal((await store('higher',10)).name,'完整原纹样名-10');
    assert.equal((await store('after-higher')).name,'完整原纹样名-11');
    console.log('PASS: concurrent duplicates, independent allocations, soft-delete restoration, and canvas sequence floor.');
  } finally {await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
