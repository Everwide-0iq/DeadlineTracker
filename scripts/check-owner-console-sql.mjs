import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const file = readFileSync('supabase/migrations/0001_initial_schema.sql', 'utf8')
const start = file.indexOf('-- Fireboard Owner Console:')
assert.ok(start > 0)
const section = file.slice(start).replace(/commit;\s*$/, '')
const hotfix = readFileSync('supabase/patches/owner_console_safeupdate.sql', 'utf8')
const db = new PGlite({ extensions: { pgcrypto } })
const id = n => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`
let passed = 0
const check = (value, expected) => { assert.deepEqual(value, expected); passed++ }
const query = (sql, args) => db.query(sql, args)
const rpc = async (sql, args) => Object.values((await query(`select ${sql}`, args)).rows[0])[0]
const fails = async (sql, args, code = '42501') => { await assert.rejects(() => query(sql, args), e => e.code === code); passed++ }
const as = async (user, role = 'authenticated', session = id(10 + user)) => {
  await db.exec(`reset role; set role ${role}`)
  await query("select set_config('request.sub',$1,false),set_config('request.sid',$2,false)", [id(user), session])
}
try {
  await db.exec(`
    create extension pgcrypto;
    create role anon; create role authenticated;
    create schema auth; create schema private; create schema storage;
    create table auth.users(id uuid primary key);
    create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',current_setting('request.sid',true))$$;
    grant usage on schema auth,private,storage to authenticated;
    create table storage.objects(id uuid,bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant select on storage.objects to authenticated;
    create table profiles(id uuid primary key,nickname text,avatar_path text,active_color text,created_at timestamptz default now());
    create table teams(id uuid primary key,name text);
    create table projects(id uuid primary key,name text,color text,team_id uuid,sort_order integer default 0);
    create table team_members(team_id uuid,user_id uuid,role text);
    create table project_members(project_id uuid,user_id uuid);
    create table team_invites(id uuid primary key,team_id uuid,invitee_email text,role text,token_hash text,created_at timestamptz default now(),expires_at timestamptz,accepted_at timestamptz,revoked_at timestamptz);
    create table cards(id uuid primary key,title text,description text,status text default 'todo',is_active boolean default false,created_by uuid,active_by uuid,completed_by uuid,completed_at timestamptz,deadline_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now(),image_path text,image_width integer,image_height integer,image_size bigint,board_scope text,project_id uuid,x double precision,y double precision,w double precision,h double precision);
    alter table cards enable row level security;
    grant select,update on cards to authenticated;
    create policy own_cards on cards for select to authenticated using(created_by=auth.uid());
    create table todo_blocks(id uuid primary key,title text,deadline_at timestamptz,created_at timestamptz default now(),board_scope text,created_by uuid,project_id uuid);
    create table todo_items(id uuid primary key,block_id uuid,title text,description text,is_done boolean,is_active boolean,completed_at timestamptz,image_path text,image_width integer,image_height integer,image_size bigint,sort_order integer);
    create table board_texts(id uuid primary key,content text,color text,font_family text,font_size integer,created_at timestamptz default now(),created_by uuid,project_id uuid,board_scope text);
    create table card_links(id uuid primary key,from_card_id uuid,to_card_id uuid,from_todo_block_id uuid,to_todo_block_id uuid,created_at timestamptz default now(),created_by uuid,project_id uuid,board_scope text);
    create table card_image_cleanup_queue(image_path text);
    create table todo_image_cleanup_queue(image_path text);
  `)
  await db.exec(section)
  await db.exec(section)
  passed++ // Idempotent application of the actual SQL section.
  // PGlite does not ship safeupdate: guard the exact statements that failed in Supabase.
  const pinUpdates = section.match(/update private\.owner_console_config set[\s\S]*?;/g) ?? []
  check(pinUpdates.length, 2)
  for (const statement of pinUpdates) {
    assert.match(statement, /where singleton = true and user_id = auth\.uid\(\)/)
    passed++
  }
  assert.match(section, /delete from private\.owner_console_sessions where user_id is not null;/)
  passed++
  const definitions = async () => (await query("select pg_get_functiondef(oid) as definition from pg_proc where oid in ('private.configure_owner_console(uuid,text)'::regprocedure,'public.owner_console_unlock(text)'::regprocedure) order by oid")).rows
  const originalDefinitions = await definitions()
  await db.exec(hotfix)
  await db.exec(hotfix)
  check(await definitions(), originalDefinitions)
  for (const n of [1, 2, 3]) {
    await query('insert into auth.users values($1);', [id(n)])
    await query('insert into auth.sessions(id,user_id) values($1,$2)', [id(10 + n), id(n)])
    await query('insert into profiles(id,nickname) values($1,$2)', [id(n), `Member ${n}`])
  }
  await query('insert into teams values($1,$2)', [id(20), 'Team'])
  await query("insert into team_members values($1,$2,'admin')", [id(20), id(2)])
  await query("insert into projects(id,name,team_id) values($1,'Project',$2)", [id(21), id(20)])
  await query("select private.configure_owner_console($1,'1337')", [id(1)])
  const configured = (await query('select * from private.owner_console_config')).rows
  await db.exec(hotfix)
  check((await query('select * from private.owner_console_config')).rows, configured)
  await as(2)
  check((await rpc('owner_console_status()')).isOwner, false)
  await fails("select owner_console_unlock('1337')")
  await fails("select owner_console_read('members')")
  await fails("select owner_console_action('purge_old_audit')")
  await fails("select private.configure_owner_console($1,'1337')", [id(2)])
  await fails('select * from private.owner_console_config')
  await fails("update private.owner_console_config set failed_attempts=0")
  await as(1, 'anon')
  await fails('select owner_console_status()')
  await as(1)
  check((await rpc('owner_console_status()')).isOwner, true)
  await fails("select owner_console_read('overview')")
  for (let n = 0; n < 5; n++) check((await rpc("owner_console_unlock('0000')")).ok, false)
  check((await rpc("owner_console_unlock('1337')")).ok, false)
  await db.exec('reset role')
  check(await rpc('failed_attempts from private.owner_console_config'), 5)
  await db.exec("update private.owner_console_config set blocked_until=now()-interval '1 second'")
  await as(1)
  const unlocked = await rpc("owner_console_unlock('1337')")
  check(unlocked.ok, true)
  assert.ok(unlocked.unlockedUntil); passed++
  await db.exec('reset role')
  await query("insert into cards(id,title,description,created_by,board_scope) values($1,'Private','Never log this description',$2,'personal')", [id(30), id(2)])
  await query("insert into cards(id,title,created_by,board_scope) values($1,'Different user',$2,'personal')", [id(31), id(3)])
  const count = await rpc('count(*)::int from private.owner_audit')
  await query('update cards set x=10,y=20,w=500,h=600,updated_at=now() where id=$1', [id(30)])
  check(await rpc('count(*)::int from private.owner_audit'), count)
  await query("update cards set description='New confidential description' where id=$1", [id(30)])
  check(await rpc('changed_fields from private.owner_audit order by id desc limit 1'), ['description'])
  check(JSON.stringify((await query('select * from private.owner_audit')).rows).includes('confidential description'), false)
  await query("insert into storage.objects values($1,'card-images','private-image')", [id(50)])
  await as(1)
  check((await query('select * from cards')).rows.length, 0) // No broadening of normal board RLS.
  check((await query('update cards set title=\'Hacked\' returning id')).rows.length, 0)
  check((await query('select * from storage.objects')).rows.length, 1)
  const personal = await rpc("owner_console_read('board',$1)", [{ userId: id(2) }])
  check(personal.map(c => c.id), [id(30)])
  await fails("select owner_console_read('board',$1)", [{ userId: id(2), projectId: id(21) }], '22023')
  await fails("select owner_console_read('overview','[]')", [], '22023')
  await fails("select owner_console_read('unknown')", [], '22023')
  await fails("select owner_console_read('members',$1)", [{ search: 'x'.repeat(2100) }], '22023')
  for (const view of ['overview', 'audit', 'members', 'projects', 'invites']) {
    assert.ok(await rpc('owner_console_read($1)', [view])); passed++
  }
  for (const kind of ['todos', 'items', 'texts', 'links']) {
    check(await rpc("owner_console_read('board',$1)", [{ userId: id(2), kind, blockId: id(40) }]), [])
  }
  check(await rpc("owner_console_read('members',$1)", [{ search: "';drop table cards;--" }]), [])
  await rpc('record_app_session_audit()'); await rpc('record_app_session_audit()')
  await db.exec('reset role')
  check(await rpc("count(*)::int from private.owner_audit where action='sign_in'"), 1)
  await query("insert into team_invites(id,team_id,invitee_email,role,token_hash,expires_at) values($1,$2,'test@example.invalid','editor','SECRET-HASH',now()+interval '1 day')", [id(60), id(20)])
  await as(1)
  check(JSON.stringify(await rpc("owner_console_read('invites')")).includes('SECRET-HASH'), false)
  await rpc("owner_console_action('revoke_invite',$1)", [id(60)])
  check(await rpc("owner_console_read('invites')"), [])
  await fails("select owner_console_action('delete_board',$1)", [id(30)], '22023')
  await rpc('owner_console_lock()')
  await fails("select owner_console_read('board',$1)", [{ userId: id(2) }])
  check((await query('select * from storage.objects')).rows.length, 0)
  await rpc("owner_console_unlock('1337')")
  await db.exec("reset role; update private.owner_console_sessions set expires_at=now()-interval '1 second'")
  await as(1)
  await fails("select owner_console_read('audit')")
  await rpc("owner_console_unlock('1337')")
  await db.exec("reset role; update auth.sessions set not_after=now()-interval '1 second'")
  await as(1)
  await fails("select owner_console_read('audit')")
  await fails("select owner_console_unlock('1337')")
  await db.exec('reset role; update auth.sessions set not_after=null')
  await as(1)
  await rpc("owner_console_unlock('1337')")
  await db.exec('reset role')
  await query("select private.configure_owner_console($1,'854721')", [id(1)])
  await as(1)
  await fails("select owner_console_read('audit')")
  check((await rpc("owner_console_unlock('1337')")).ok, false)
  check((await rpc("owner_console_unlock('854721')")).ok, true)
  await db.exec('reset role')
  await query("select private.configure_owner_console($1,'854721')", [id(2)])
  await as(1)
  check((await rpc('owner_console_status()')).isOwner, false)
  await fails("select owner_console_unlock('854721')")
  await fails("select owner_console_read('audit')")
  await db.exec('reset role')
  await query("select private.configure_owner_console($1,'1337')", [id(1)])
  await as(1)
  await rpc("owner_console_unlock('1337')")
  await db.exec('reset role; delete from auth.sessions')
  await as(1)
  await fails("select owner_console_read('audit')")
  await fails("select owner_console_unlock('1337')")
  console.log(`Owner console SQL: ${passed} checks passed; actual functions, isolated PostgreSQL, no production connection.`)
} finally { await db.close() }
