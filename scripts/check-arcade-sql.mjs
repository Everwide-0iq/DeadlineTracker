import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const db = new PGlite()
await db.exec(`
create role anon; create role authenticated;
create schema auth; create schema private;
create table auth.users(id uuid primary key);
create table public.teams(id uuid primary key);
create table public.team_members(team_id uuid, user_id uuid, primary key(team_id,user_id));
create table public.profiles(id uuid primary key, nickname text, avatar_path text, active_color text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function private.is_team_member(t uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.team_members where team_id=t and user_id=auth.uid()) $$;
`)
const file = readFileSync('supabase/migrations/0001_initial_schema.sql','utf8')
const section = file.slice(file.indexOf('-- Fireboard Arcade:')).replace(/commit;\s*$/, '')
await db.exec(section)
await db.exec(section)
const team = '00000000-0000-0000-0000-000000000001'
const other = '00000000-0000-0000-0000-000000000002'
const a = '10000000-0000-0000-0000-000000000001'
const b = '10000000-0000-0000-0000-000000000002'
const c = '10000000-0000-0000-0000-000000000003'
await db.exec(`insert into auth.users values ('${a}'),('${b}'),('${c}'); insert into teams values ('${team}'),('${other}'); insert into team_members values ('${team}','${a}'),('${team}','${b}'),('${other}','${c}');`)
const as = async (id, role = 'authenticated') => { await db.exec(`reset role; set role ${role};`); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]) }
let passed = 0
const fails = async (action, code) => { await assert.rejects(action, error => error.code === code); passed++ }
const query = (sql,args) => db.query(sql,args)
const begin = () => query('select public.begin_arcade_run($1,$2) as token',[team,'snake'])
await as(c)
await fails(()=>query('select * from public.get_arcade_leaderboard($1,$2)',[team,'snake']),'42501')
await as(a,'anon')
await fails(begin,'42501')
await as(a)
await fails(()=>query('select * from public.arcade_scores'),'42501')
await fails(()=>query("select public.begin_arcade_run($1,'bad')",[team]),'22023')
const token = (await begin()).rows[0].token
await fails(begin,'P0001')
await fails(()=>query('select public.submit_arcade_score($1,$2,$3,$4,$5)',[team,'snake',token,500000,1]),'22023')
await as(b)
await fails(()=>query('select public.submit_arcade_score($1,$2,$3,$4,$5)',[team,'snake',token,100,1000]),'22023')
await as(a)
assert.equal((await query('select public.submit_arcade_score($1,$2,$3,$4,$5) as score',[team,'snake',token,100,1000])).rows[0].score,100); passed++
assert.equal((await query('select public.submit_arcade_score($1,$2,$3,$4,$5) as score',[team,'snake',token,100,1000])).rows[0].score,100); passed++
await fails(()=>query('select public.submit_arcade_score($1,$2,$3,$4,$5)',[team,'snake',token,125,1000]),'22023')
await as(b)
const tokenB = (await begin()).rows[0].token
await query('select public.submit_arcade_score($1,$2,$3,$4,$5)',[team,'snake',tokenB,100,1000])
const ranks = (await query('select * from public.get_arcade_leaderboard($1,$2)',[team,'snake'])).rows
assert.deepEqual(ranks.map(r=>[r.user_id, Number(r.rank)]),[[a,1],[b,2]]); passed++
await db.exec(`reset role; delete from team_members where user_id='${b}';`)
await as(b)
await fails(()=>query('select * from public.get_arcade_leaderboard($1,$2)',[team,'snake']),'42501')
await as(a)
assert.equal((await query('select * from public.get_arcade_leaderboard($1,$2)',[team,'snake'])).rows.length,1); passed++
await db.exec(`reset role; update private.arcade_runs set started_at=clock_timestamp()-interval '2 seconds';`)
await as(a)
const secondToken = (await begin()).rows[0].token
await fails(()=>query('select public.submit_arcade_score($1,$2,$3,$4,$5)',[team,'snake',token,100,1000]),'22023')
await fails(()=>query('select public.submit_arcade_score($1,$2,$3,$4,$5)',[team,'snake',secondToken,50,500000]),'22023')
assert.equal((await query('select public.submit_arcade_score($1,$2,$3,$4,$5) as score',[team,'snake',secondToken,50,500])).rows[0].score,100); passed++
await db.exec(`reset role; update private.arcade_runs set started_at=clock_timestamp()-interval '3 hours';`)
await as(a)
await fails(()=>query('select public.submit_arcade_score($1,$2,$3,$4,$5)',[team,'snake',secondToken,50,500]),'22023')
console.log(`Arcade SQL: ${passed} checks passed; schema applied twice; no production connection.`)
await db.close()
