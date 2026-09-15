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
  console.log(`Team access SQL: ${passed} checks passed against the real read policy; no production connection.`)
} finally {
  await db.close()
}
