import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const schema = readFileSync('supabase/migrations/0001_initial_schema.sql', 'utf8')
const functionStart = schema.indexOf('create or replace function private.can_view_project(')
assert.notEqual(functionStart, -1)
const functionEnd = schema.indexOf('$$;', functionStart) + 3
const policy = schema.match(/create policy "projects_select_team_access"[\s\S]*?;/)?.[0]
assert.ok(policy)
const db = new PGlite()
let passed = 0
try {
  await db.exec(`
    create role authenticated;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table public.projects(id uuid primary key, team_id uuid not null);
    create table public.team_members(team_id uuid, user_id uuid, role text);
    create table public.project_members(project_id uuid, user_id uuid);
    alter table public.projects enable row level security;
    grant usage on schema private, auth to authenticated;
    grant select on public.projects to authenticated;
  `)
  await db.exec(schema.slice(functionStart, functionEnd))
  await db.exec(policy)
  const team = '10000000-0000-0000-0000-000000000001'
  const otherTeam = '10000000-0000-0000-0000-000000000002'
  const user = '20000000-0000-0000-0000-000000000001'
  const projects = [1, 2, 3].map(n => `30000000-0000-0000-0000-00000000000${n}`)
  for (const [index, id] of projects.entries()) {
    await db.query('insert into projects values ($1, $2)', [id, index === 2 ? otherTeam : team])
  }
  const expectVisible = async expected => {
    await db.exec('set role authenticated')
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user])
    const result = await db.query('select id from public.projects order by id')
    assert.deepEqual(result.rows.map(row => row.id), expected)
    passed++
    await db.exec('reset role')
  }
  // A pending invitation is not membership, even if a stale project grant exists.
  await db.query('insert into project_members values ($1, $2)', [projects[0], user])
  await expectVisible([])
  await db.query('insert into team_members values ($1, $2, $3)', [team, user, 'admin'])
  await expectVisible(projects.slice(0, 2))
  await db.query("update team_members set role = 'owner' where user_id = $1", [user])
  await expectVisible(projects.slice(0, 2))
  await db.query("update team_members set role = 'member' where user_id = $1", [user])
  await expectVisible([projects[0]])
  await db.query("update team_members set role = 'viewer' where user_id = $1", [user])
  await expectVisible([projects[0]])
  await db.query('insert into project_members values ($1, $2)', [projects[2], user])
  await expectVisible([projects[0]])
  await db.query('delete from team_members where user_id = $1', [user])
  await expectVisible([])
  // Exercise real SECURITY DEFINER mutation functions, not only read policies.
  await db.exec(`
    alter table project_members add column access_level text;
    alter table project_members add column granted_by uuid;
    alter table project_members add column updated_at timestamptz;
    alter table project_members add unique(project_id, user_id);
  `)
  for (const name of ['private.team_role', 'private.default_project_access', 'private.replace_project_access', 'public.update_team_member_access', 'public.remove_team_member']) {
    const start = schema.indexOf(`create or replace function ${name}(`)
    assert.notEqual(start, -1)
    await db.exec(schema.slice(start, schema.indexOf('$$;', start) + 3))
  }
  const owner = '20000000-0000-0000-0000-000000000010'
  const admin = '20000000-0000-0000-0000-000000000011'
  const target = '20000000-0000-0000-0000-000000000012'
  const center = '00000000-0000-0000-0000-000000000001'
  await db.query('insert into projects values ($1, $2)', [center, team])
  for (const [id, role] of [[owner, 'owner'], [admin, 'admin'], [target, 'admin']]) {
    await db.query('insert into team_members values ($1, $2, $3)', [team, id, role])
  }
  const actAs = async (actor, sql, args) => {
    await db.exec('set role authenticated')
    try {
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [actor ?? ''])
      return await db.query(sql, args)
    } finally { await db.exec('reset role') }
  }
  const update = 'select public.update_team_member_access($1, $2, $3, $4::uuid[])'
  const remove = 'select public.remove_team_member($1, $2)'
  const patch = readFileSync('supabase/patches/team_member_role_fix.sql', 'utf8').replace(/\r\n/g, '\n')
  for (const name of ['update_team_member_access', 'remove_team_member']) {
    const start = schema.indexOf(`create or replace function public.${name}(`)
    assert.ok(patch.includes(schema.slice(start, schema.indexOf('$$;', start) + 3).replace(/\r\n/g, '\n')))
  }
  await actAs(owner, update, [team, target, 'editor', [projects[0]]])
  assert.equal((await db.query('select role from team_members where user_id=$1', [target])).rows[0].role, 'editor')
  assert.deepEqual((await db.query('select project_id from project_members where user_id=$1 order by project_id', [target])).rows.map(r => r.project_id), [center, projects[0]])
  passed += 2
  await actAs(owner, update, [team, target, 'admin', []])
  assert.equal((await db.query('select count(*)::int as n from project_members where user_id=$1', [target])).rows[0].n, 0)
  passed++
  for (const actor of [admin, user, null]) {
    await assert.rejects(actAs(actor, update, [team, target, 'viewer', []]))
    await assert.rejects(actAs(actor, remove, [team, target]))
    passed += 2
  }
  for (const role of ['editor', 'member', 'viewer']) {
    await db.query('insert into team_members values ($1, $2, $3)', [team, user, role])
    await assert.rejects(actAs(user, update, [team, target, 'viewer', []]))
    await assert.rejects(actAs(user, remove, [team, target]))
    await db.query('delete from team_members where user_id=$1', [user])
    passed += 2
  }
  await assert.rejects(actAs(owner, update, [team, owner, 'editor', []]))
  await assert.rejects(actAs(owner, remove, [team, owner]))
  await assert.rejects(actAs(owner, update, [otherTeam, target, 'editor', []]))
  await assert.rejects(actAs(owner, update, [team, target, 'owner', []]))
  await assert.rejects(actAs(owner, update, [team, target, 'editor', [projects[2]]]))
  assert.equal((await db.query('select role from team_members where user_id=$1', [target])).rows[0].role, 'admin')
  passed += 6
  await actAs(owner, update, [team, target, 'editor', []])
  await actAs(admin, update, [team, target, 'viewer', []])
  assert.equal((await db.query('select role from team_members where user_id=$1', [target])).rows[0].role, 'viewer')
  await actAs(owner, update, [team, target, 'admin', []])
  await actAs(owner, remove, [team, target])
  assert.equal((await db.query('select count(*)::int as n from team_members where user_id=$1', [target])).rows[0].n, 0)
  passed += 2
  await db.exec(patch)
  await db.exec(patch)
  await actAs(owner, update, [team, admin, 'editor', []])
  assert.equal((await db.query('select role from team_members where user_id=$1', [admin])).rows[0].role, 'editor')
  passed++
  console.log(`Team access SQL: ${passed} checks passed against read policy and mutation functions; repeatable patch verified; no production connection.`)
} finally {
  await db.close()
}
