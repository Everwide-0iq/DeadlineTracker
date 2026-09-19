import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const main = readFileSync('supabase/migrations/0001_initial_schema.sql', 'utf8')
const section = main
  .slice(
    main.indexOf('-- Fireboard Telegram Reminders:'),
    main.indexOf('-- Fireboard Arcade:'),
  )
  .trim()
const patch = readFileSync('supabase/patches/telegram_reminders.sql', 'utf8')
assert.equal(
  patch
    .replace(/^begin;\s*/, '')
    .replace(/notify pgrst, 'reload schema';\s*commit;\s*$/, '')
    .trim(),
  section,
)
const db = new PGlite()
const id = (n) => `60000000-0000-0000-0000-${String(n).padStart(12, '0')}`
let count = 0
const q = (sql, args) => db.query(sql, args)
const rpc = async (sql, args) =>
  Object.values((await q('select ' + sql, args)).rows[0])[0]
const check = (a, b) => {
  assert.deepEqual(a, b)
  count++
}
const fails = async (sql, args, code = '42501') => {
  await assert.rejects(
    () => q(sql, args),
    (e) => e.code === code,
  )
  count++
}
const as = async (n, role = 'authenticated') => {
  await db.exec('reset role;set role ' + role)
  await q("select set_config('request.sub',$1,false)", [id(n)])
}
const future = () => new Date(Date.now() + 3600000).toISOString()
try {
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create schema auth;create schema private;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.sub',true),'')::uuid$$;
    grant usage on schema auth,private to authenticated;
    create table public.projects(id uuid primary key,team_id uuid,name text);
    create table public.team_members(team_id uuid,user_id uuid,role text);
    create table public.project_members(project_id uuid,user_id uuid);
    create table public.cards(id uuid primary key,title text,deadline_at timestamptz,status text,board_scope text,created_by uuid,project_id uuid);
  `)
  await db.exec(section)
  await db.exec(section)
  count++
  for (const n of [1, 2, 3])
    await q('insert into auth.users values($1)', [id(n)])
  await q("insert into projects values($1,$2,'Project')", [id(20), id(30)])
  await q("insert into team_members values($1,$2,'admin'),($1,$3,'viewer')", [
    id(30),
    id(1),
    id(2),
  ])
  await q('insert into project_members values($1,$2)', [id(20), id(2)])
  await q(
    "insert into cards values($1,'Shared',$2,'todo','shared',$3,$4),($5,'Private',$2,'todo','personal',$3,null)",
    [id(40), future(), id(1), id(20), id(41)],
  )
  await as(1, 'anon')
  await fails('select telegram_reminder_state()')
  await as(1)
  check((await rpc('telegram_reminder_state()')).configured, false)
  await fails('select telegram_create_link()', [], '55000')
  for (const table of [
    'telegram_accounts',
    'telegram_link_tokens',
    'card_reminders',
    'telegram_settings',
  ])
    await fails('select * from private.' + table)
  await fails("select telegram_configure('Test_Bot','https://example.invalid')")
  await fails('select telegram_claim_reminders()')
  await fails("select telegram_finish_link('bad',123)")
  await fails('select telegram_prepare_reminder($1,$2)', [id(99), id(98)])
  await fails("select telegram_complete_reminder($1,$2,'sent')", [
    id(99),
    id(98),
  ])
  await as(1, 'service_role')
  await rpc("telegram_configure('FireboardTestBot','https://example.invalid')")
  await rpc('telegram_claim_reminders()')
  await as(1)
  const link = await rpc('telegram_create_link()')
  const token = new URL(link.url).searchParams.get('start')
  check(token.length, 64)
  await fails('select telegram_create_link()', [], 'P0001')
  await as(1, 'service_role')
  check(await rpc('telegram_finish_link($1,12345)', [token]), true)
  check(await rpc('telegram_finish_link($1,54321)', [token]), false)
  check(await rpc('telegram_finish_link($1,-123)', [token]), false)
  await as(1)
  const state = await rpc('telegram_reminder_state()')
  check(state.connected, true)
  check(JSON.stringify(state).includes('12345'), false)
  await fails('select telegram_create_link()', [], '22023')
  await rpc('set_card_reminders($1,$2)', [id(40), [-30, 0, 30]])
  check((await rpc('telegram_reminder_state()')).reminders.length, 3)
  const personalNote = 'Private reminder\n<b>Bring the notes</b>'
  await rpc("set_card_reminders($1,$2,null,'UTC','en',$3)", [
    id(40),
    [-30, 0, 30],
    personalNote,
  ])
  check(
    (await rpc('telegram_reminder_state()')).reminders.every(
      (r) => r.note === personalNote,
    ),
    true,
  )
  await rpc('set_card_reminders($1,$2)', [id(40), [-30, 0, 30]])
  check(
    (await rpc('telegram_reminder_state()')).reminders[0].note,
    personalNote,
  )
  await fails(
    "select set_card_reminders($1,$2,null,'UTC','en',$3)",
    [id(40), [0], 'x'.repeat(1001)],
    '22023',
  )
  check((await rpc('telegram_reminder_state()')).reminders.length, 3)
  await fails('select set_card_reminders($1,$2)', [id(40), [-43201]], '22023')
  await fails('select set_card_reminders($1,$2)', [id(40), [null]], '22023')
  await fails('select set_card_reminders($1,$2,now())', [id(40), []], '22023')
  check((await rpc('telegram_reminder_state()')).reminders.length, 3) // Failed replacements roll back.
  await fails(
    "select set_card_reminders($1,$2,null,'Invalid/Zone')",
    [id(40), [0]],
    '22023',
  )
  await as(2)
  check((await rpc('telegram_reminder_state()')).reminders.length, 0)
  await fails('select set_card_reminders($1,$2)', [id(41), [0]])
  await fails('select set_card_reminders($1,$2)', [id(40), [0]], '22023') // Viewer must link their own Telegram.
  const secondLink = await rpc('telegram_create_link()')
  await as(2, 'service_role')
  check(
    await rpc('telegram_finish_link($1,23456)', [
      new URL(secondLink.url).searchParams.get('start'),
    ]),
    true,
  )
  await as(2)
  await rpc('set_card_reminders($1,$2)', [id(40), [0]])
  await as(3)
  await fails('select set_card_reminders($1,$2)', [id(40), [0]])
  await db.exec('reset role')
  await q("update cards set deadline_at=now()+interval '2 hours' where id=$1", [
    id(40),
  ])
  check(
    await rpc(
      "count(*)::int from private.card_reminders where status='pending' and due_at>now()+interval '1 hour'",
    ),
    4,
  )
  await q(
    "update private.card_reminders set due_at=now()-interval '1 minute',retry_at=now() where card_id=$1",
    [id(40)],
  )
  await as(1, 'service_role')
  const claimed = await rpc('telegram_claim_reminders()')
  check(claimed.length, 4)
  check((await rpc('telegram_claim_reminders()')).length, 0) // Overlapping cron invocations cannot reclaim a live lease.
  const first = claimed[0]
  check(await rpc('telegram_prepare_reminder($1,$2)', [first.id, id(99)]), null)
  const delivery = await rpc('telegram_prepare_reminder($1,$2)', [
    first.id,
    first.lease,
  ])
  check(delivery.title, 'Shared')
  check(delivery.note, delivery.chatId === '12345' ? personalNote : '')
  check(
    await rpc('telegram_prepare_reminder($1,$2)', [first.id, first.lease]),
    null,
  )
  await rpc("telegram_complete_reminder($1,$2,'sent')", [first.id, first.lease])
  await rpc("telegram_complete_reminder($1,$2,'retry')", [
    first.id,
    first.lease,
  ])
  await db.exec('reset role')
  check(
    await rpc('status from private.card_reminders where id=$1', [first.id]),
    'sent',
  )
  await q("update cards set status='done' where id=$1", [id(40)])
  check(await rpc('count(*)::int from private.card_reminders'), 0)
  await as(1, 'service_role')
  check(
    await rpc('telegram_prepare_reminder($1,$2)', [
      claimed[1].id,
      claimed[1].lease,
    ]),
    null,
  )
  await db.exec('reset role')
  await q("update cards set status='todo',deadline_at=null where id=$1", [
    id(40),
  ])
  await as(1)
  await fails('select set_card_reminders($1,$2)', [id(40), [0]], '22023')
  await rpc('set_card_reminders($1,$2,$3)', [id(40), [], future()])
  await db.exec('reset role')
  await q("update cards set deadline_at=now()+interval '1 day' where id=$1", [
    id(40),
  ])
  check(await rpc('slot from private.card_reminders'), 9999)
  await as(2)
  await rpc('set_card_reminders($1,$2)', [id(40), [0]])
  await db.exec('reset role')
  await q('delete from project_members where user_id=$1', [id(2)])
  await q(
    "update private.card_reminders set due_at=now()-interval '1 minute',retry_at=now() where user_id=$1",
    [id(2)],
  )
  await as(2)
  check((await rpc('telegram_reminder_state()')).reminders.length, 0)
  await as(1, 'service_role')
  const denied = (await rpc('telegram_claim_reminders()'))[0]
  check(
    await rpc('telegram_prepare_reminder($1,$2)', [denied.id, denied.lease]),
    null,
  )
  await db.exec('reset role')
  await q(
    "update private.card_reminders set due_at=now()-interval '1 minute',retry_at=now() where user_id=$1",
    [id(1)],
  )
  await as(1, 'service_role')
  const retry = (await rpc('telegram_claim_reminders()'))[0]
  await rpc('telegram_prepare_reminder($1,$2)', [retry.id, retry.lease])
  await rpc("telegram_complete_reminder($1,$2,'retry',120)", [
    retry.id,
    retry.lease,
  ])
  check((await rpc('telegram_claim_reminders()')).length, 0)
  await db.exec('reset role')
  await q(
    "update private.card_reminders set retry_at=now()-interval '1 second' where id=$1",
    [retry.id],
  )
  await as(1, 'service_role')
  const uncertain = (await rpc('telegram_claim_reminders()'))[0]
  await rpc('telegram_prepare_reminder($1,$2)', [uncertain.id, uncertain.lease])
  await db.exec('reset role')
  await q(
    "update private.card_reminders set lease_until=now()-interval '1 second' where id=$1",
    [uncertain.id],
  )
  await as(1, 'service_role')
  check((await rpc('telegram_claim_reminders()')).length, 0)
  await as(1)
  check((await rpc('telegram_reminder_state()')).reminders[0].status, 'unknown')
  await rpc('set_card_reminders($1,$2)', [id(40), [0]])
  await db.exec('reset role')
  await q('update cards set deadline_at=null where id=$1', [id(40)])
  check(
    await rpc('count(*)::int from private.card_reminders where user_id=$1', [
      id(1),
    ]),
    0,
  )
  await as(1)
  await rpc('set_card_reminders($1,$2)', [id(41), [0]])
  await db.exec('reset role')
  await q('delete from cards where id=$1', [id(41)])
  check(
    await rpc('count(*)::int from private.card_reminders where card_id=$1', [
      id(41),
    ]),
    0,
  )
  await db.exec(
    "update private.telegram_settings set last_worker_at=now()-interval '27 hours' where singleton=true",
  )
  await as(1)
  check((await rpc('telegram_reminder_state()')).schedulerReady, false)
  await fails(
    'select set_card_reminders($1,$2,$3)',
    [id(40), [], future()],
    '55000',
  )
  await rpc('telegram_disconnect()')
  check((await rpc('telegram_reminder_state()')).connected, false)
  check((await rpc('telegram_reminder_state()')).reminders.length, 0)
  await as(3)
  const expiredLink = await rpc('telegram_create_link()')
  await db.exec('reset role')
  await q(
    "update private.telegram_link_tokens set expires_at=now()-interval '1 second' where user_id=$1",
    [id(3)],
  )
  await as(3, 'service_role')
  check(
    await rpc('telegram_finish_link($1,77777)', [
      new URL(expiredLink.url).searchParams.get('start'),
    ]),
    false,
  )
  await db.exec('reset role')
  await db.exec(
    "update private.telegram_settings set last_worker_at=now();update cards set deadline_at=now()+interval '40 days' where id='" +
      id(40) +
      "'",
  )
  // User 2 is still connected but no longer has access to the project.
  await as(2)
  await fails('select set_card_reminders($1,$2)', [id(40), [-2880]])
  await rpc("telegram_send_test('en')")
  let testState = await rpc('telegram_reminder_state()')
  check(testState.testDelivery.status, 'pending')
  check(testState.reminders.length, 0)
  await fails("select telegram_send_test('en')", [], 'P0001')
  await as(3)
  check((await rpc('telegram_reminder_state()')).testDelivery, null)
  await fails('select telegram_send_test()', [], '22023')
  await as(2, 'anon')
  await fails('select telegram_send_test()')
  await as(2, 'service_role')
  const testJob = (await rpc('telegram_claim_reminders()'))[0]
  const testPayload = await rpc('telegram_prepare_reminder($1,$2)', [
    testJob.id,
    testJob.lease,
  ])
  check(testPayload.kind, 'test')
  check(testPayload.chatId, '23456')
  check('title' in testPayload, false)
  await rpc("telegram_complete_reminder($1,$2,'sent')", [
    testJob.id,
    testJob.lease,
  ])
  await as(2)
  check((await rpc('telegram_reminder_state()')).testDelivery.status, 'sent')
  await fails('select telegram_send_test()', [], 'P0001')
  await db.exec('reset role')
  await q(
    "update private.telegram_accounts set last_test_at=now()-interval '2 minutes' where user_id=$1",
    [id(2)],
  )
  await q('insert into project_members values($1,$2)', [id(20), id(2)])
  await as(2)
  await rpc('set_card_reminders($1,$2)', [
    id(40),
    [-43200, -2880, -1440, -90, -30, 0, 30, 4320],
  ])
  let beforeUpgrade = (await rpc('telegram_reminder_state()')).reminders
  check(beforeUpgrade.length, 8)
  await db.exec('reset role')
  await q(
    "update private.card_reminders set status='sent',sent_at=now() where user_id=$1 and slot=-90",
    [id(2)],
  )
  await as(2)
  beforeUpgrade = (await rpc('telegram_reminder_state()')).reminders
  await rpc('set_card_reminders($1,$2)', [
    id(40),
    [-43200, -2880, -1440, -90, -30, 0, 30, 4320],
  ])
  check((await rpc('telegram_reminder_state()')).reminders, beforeUpgrade)
  await rpc("set_card_reminders($1,$2,null,'UTC','ru',$3)", [
    id(40),
    [-43200, -2880, -1440, -90, -30, 0, 30, 4320],
    'Updated note',
  ])
  check(
    (await rpc('telegram_reminder_state()')).reminders.map((r) => ({
      ...r,
      note: '',
    })),
    beforeUpgrade.map((r) => ({ ...r, note: '' })),
  )
  check(
    (await rpc('telegram_reminder_state()')).reminders.every(
      (r) => r.note === 'Updated note',
    ),
    true,
  )
  await rpc("set_card_reminders($1,$2,null,'UTC','ru','')", [
    id(40),
    [-43200, -2880, -1440, -90, -30, 0, 30, 4320],
  ])
  check(
    (await rpc('telegram_reminder_state()')).reminders.every(
      (r) => r.note === '',
    ),
    true,
  )
  beforeUpgrade = (await rpc('telegram_reminder_state()')).reminders
  await fails('select set_card_reminders($1,$2)', [id(40), [4321]], '22023')
  await fails('select set_card_reminders($1,$2)', [id(40), [9999]], '22023')
  await fails(
    'select set_card_reminders($1,$2)',
    [id(40), [-9, -8, -7, -6, -5, -4, -3, -2, -1]],
    '22023',
  )
  await db.exec('reset role')
  await db.exec(section)
  await as(2)
  check((await rpc('telegram_reminder_state()')).reminders, beforeUpgrade)
  await db.exec('reset role')
  await q(
    "update cards set deadline_at=now()-interval '1 minute' where id=$1",
    [id(40)],
  )
  await as(2)
  const expired = (await rpc('telegram_reminder_state()')).reminders.find(
    (r) => r.slot === 0,
  )
  await rpc('set_card_reminders($1,$2)', [id(40), [0, 30]])
  check(
    (await rpc('telegram_reminder_state()')).reminders.find(
      (r) => r.slot === 0,
    ),
    expired,
  )
  await rpc('telegram_send_test()')
  await rpc('telegram_disconnect()')
  check((await rpc('telegram_reminder_state()')).testDelivery, null)
  await as(2, 'service_role')
  check((await rpc('telegram_claim_reminders()')).length, 0)
  console.log(
    `Telegram SQL: ${count} checks passed; isolated PostgreSQL, no live messages or production writes.`,
  )
} finally {
  await db.close()
}
