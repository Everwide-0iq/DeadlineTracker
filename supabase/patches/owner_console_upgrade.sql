begin;

-- Fireboard Owner Console: explicitly provisioned, PIN-gated, read-only data access.
create table if not exists private.owner_console_config (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null references auth.users(id) on delete cascade,
  pin_hash text not null,
  failed_attempts integer not null default 0,
  blocked_until timestamptz
);
create table if not exists private.owner_console_sessions (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null
);
create table if not exists private.owner_console_delegates (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pin_hash text not null,
  failed_attempts integer not null default 0,
  blocked_until timestamptz,
  granted_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table private.owner_console_delegates enable row level security;
revoke all on private.owner_console_delegates from public, anon, authenticated;
create table if not exists private.owner_audit (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default clock_timestamp(),
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  project_id uuid,
  board_scope text,
  title text,
  changed_fields text[] not null default '{}'
);
create index if not exists owner_audit_actor_idx on private.owner_audit(actor_id, id desc);
create index if not exists owner_audit_entity_idx on private.owner_audit(entity_type, id desc);
create index if not exists owner_audit_time_idx on private.owner_audit(occurred_at);
create table if not exists private.owner_audited_sessions (
  session_id uuid primary key,
  recorded_at timestamptz not null default now()
);
alter table private.owner_console_config enable row level security;
alter table private.owner_console_sessions enable row level security;
alter table private.owner_audit enable row level security;
alter table private.owner_audited_sessions enable row level security;
revoke all on private.owner_console_config, private.owner_console_sessions, private.owner_audit, private.owner_audited_sessions from public, anon, authenticated;
revoke all on sequence private.owner_audit_id_seq from public, anon, authenticated;

create or replace function private.owner_pin_crypt(pin_value text, salt_value text)
returns text language plpgsql set search_path = '' as $$
declare crypto_schema text; result text;
begin
  select n.nspname into crypto_schema from pg_catalog.pg_extension e
  join pg_catalog.pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgcrypto';
  if crypto_schema is null then raise exception 'pgcrypto is required'; end if;
  execute format('select %I.crypt($1, $2)', crypto_schema) into result using pin_value, salt_value;
  return result;
end;
$$;

-- SQL Editor only. No account is promoted by applying the migration or changing a team role.
create or replace function private.configure_owner_console(owner_user_id uuid, new_pin text)
returns void language plpgsql security definer set search_path = '' as $$
declare crypto_schema text; salt_value text; previous_owner uuid;
begin
  if new_pin is null or new_pin !~ '^[0-9]{4,12}$' then raise exception 'PIN must contain 4-12 digits'; end if;
  if not exists(select 1 from auth.users where id = owner_user_id) then raise exception 'Unknown account'; end if;
  select n.nspname into crypto_schema from pg_catalog.pg_extension e
  join pg_catalog.pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgcrypto';
  execute format('select %I.gen_salt(''bf'', 10)', crypto_schema) into salt_value;
  select user_id into previous_owner from private.owner_console_config where singleton = true for update;
  if previous_owner is distinct from owner_user_id then
    delete from private.owner_console_delegates where granted_by = previous_owner or user_id = owner_user_id;
  end if;
  insert into private.owner_console_config(singleton, user_id, pin_hash)
  values(true, owner_user_id, private.owner_pin_crypt(new_pin, salt_value))
  on conflict(singleton) do update set user_id = excluded.user_id, pin_hash = excluded.pin_hash, failed_attempts = 0, blocked_until = null;
  -- Explicitly revoke every configured console lease; compatible with safeupdate.
  delete from private.owner_console_sessions where user_id is not null;
  insert into private.owner_audit(action, entity_type, entity_id) values('owner_configured', 'security', owner_user_id);
end;
$$;

create or replace function private.owner_console_authorized()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.owner_console_config where user_id=auth.uid())
    or exists(select 1 from private.owner_console_delegates d
      join private.owner_console_config c on c.singleton=true and c.user_id=d.granted_by
      join public.team_members a on a.user_id=c.user_id
      join public.team_members b on b.team_id=a.team_id and b.user_id=d.user_id
      where d.user_id=auth.uid());
$$;
revoke all on function private.owner_console_authorized() from public,anon,authenticated;

create or replace function private.owner_console_unlocked()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.owner_console_sessions s
    join auth.sessions a on a.id = s.session_id and a.user_id = s.user_id
    where s.user_id = (select auth.uid()) and s.session_id::text = (select auth.jwt()->>'session_id')
      and private.owner_console_authorized()
      and s.expires_at > now() and (a.not_after is null or a.not_after > now())
  );
$$;

create or replace function public.owner_console_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'isOwner', private.owner_console_authorized(),
    'canManageAccess', exists(select 1 from private.owner_console_config where user_id = (select auth.uid())),
    'unlockedUntil', (select s.expires_at from private.owner_console_sessions s
      where s.user_id = (select auth.uid()) and s.session_id::text = (select auth.jwt()->>'session_id')
        and private.owner_console_unlocked()),
    'blockedUntil', coalesce((select blocked_until from private.owner_console_config where user_id = (select auth.uid())),
      (select blocked_until from private.owner_console_delegates where user_id = (select auth.uid())))
  );
$$;

create or replace function public.owner_console_unlock(pin_value text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare config record; sid uuid; attempt integer; is_primary boolean;
begin
  if not private.owner_console_authorized() then raise exception 'Owner access required' using errcode='42501'; end if;
  is_primary := exists(select 1 from private.owner_console_config where user_id = auth.uid());
  if is_primary then
    select pin_hash,failed_attempts,blocked_until into config from private.owner_console_config where user_id = auth.uid() for update;
  else
    select pin_hash,failed_attempts,blocked_until into config from private.owner_console_delegates where user_id = auth.uid() for update;
  end if;
  if not found then raise exception 'Owner access required' using errcode = '42501'; end if;
  select id into sid from auth.sessions where id::text = (auth.jwt()->>'session_id') and user_id = auth.uid()
    and (not_after is null or not_after > now());
  if sid is null then raise exception 'A live sign-in session is required' using errcode = '42501'; end if;
  if config.blocked_until > clock_timestamp() then
    return public.owner_console_status() || jsonb_build_object('ok', false);
  end if;
  if pin_value is null or char_length(pin_value) > 12
    or private.owner_pin_crypt(pin_value, config.pin_hash) is distinct from config.pin_hash then
    attempt := case when config.blocked_until is not null then 1 else config.failed_attempts + 1 end;
    if is_primary then
      update private.owner_console_config set failed_attempts = attempt,
        blocked_until = case when attempt >= 5 then clock_timestamp() + interval '15 minutes' else null end
        where singleton = true and user_id = auth.uid();
    else
      update private.owner_console_delegates set failed_attempts = attempt,
        blocked_until = case when attempt >= 5 then clock_timestamp() + interval '15 minutes' else null end
        where user_id = auth.uid();
    end if;
    insert into private.owner_audit(actor_id, action, entity_type) values(auth.uid(), 'pin_failed', 'security');
    -- Return instead of raising: a rollback would erase the rate-limit counter.
    return public.owner_console_status() || jsonb_build_object('ok', false);
  end if;
  if is_primary then
    update private.owner_console_config set failed_attempts = 0, blocked_until = null
      where singleton = true and user_id = auth.uid();
  else
    update private.owner_console_delegates set failed_attempts = 0, blocked_until = null where user_id = auth.uid();
  end if;
  delete from private.owner_console_sessions where expires_at <= now();
  insert into private.owner_console_sessions(session_id, user_id, expires_at)
    values(sid, auth.uid(), clock_timestamp() + interval '10 minutes')
    on conflict(session_id) do update set expires_at = excluded.expires_at;
  insert into private.owner_audit(actor_id, action, entity_type) values(auth.uid(), 'console_unlocked', 'security');
  return public.owner_console_status() || jsonb_build_object('ok', true);
end;
$$;

create or replace function public.owner_console_lock()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from private.owner_console_sessions
    where user_id = auth.uid() and session_id::text = (auth.jwt()->>'session_id');
  if found then
    insert into private.owner_audit(actor_id, action, entity_type) values(auth.uid(), 'console_locked', 'security');
  end if;
end;
$$;

create or replace function private.capture_owner_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare before_row jsonb; after_row jsonb; item jsonb; fields text[]; project uuid; scope text;
begin
  if tg_op <> 'INSERT' then before_row := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then after_row := to_jsonb(new); end if;
  -- Never retain content snapshots, credentials, invitation hashes, or geometry-only edits.
  before_row := before_row - array['updated_at','x','y','w','h','sort_order','token_hash','description','content'];
  after_row := after_row - array['updated_at','x','y','w','h','sort_order','token_hash','description','content'];
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(key order by key), '{}') into fields from jsonb_object_keys(after_row) key
      where before_row->key is distinct from after_row->key;
    if to_jsonb(old)->'description' is distinct from to_jsonb(new)->'description' then fields := fields || 'description'::text; end if;
    if to_jsonb(old)->'content' is distinct from to_jsonb(new)->'content' then fields := fields || 'content'::text; end if;
    if cardinality(fields) = 0 then return new; end if;
  end if;
  item := coalesce(after_row, before_row);
  project := nullif(item->>'project_id', '')::uuid;
  scope := item->>'board_scope';
  if tg_table_name = 'todo_items' then
    select b.project_id, b.board_scope into project, scope from public.todo_blocks b where b.id = (item->>'block_id')::uuid;
  end if;
  insert into private.owner_audit(actor_id, action, entity_type, entity_id, project_id, board_scope, title, changed_fields)
    values(auth.uid(), lower(tg_op), tg_table_name, coalesce(item->>'id',item->>'user_id')::uuid, project, scope,
      left(coalesce(item->>'title',item->>'name',item->>'nickname'),160), coalesce(fields,'{}'));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare target text;
begin
  foreach target in array array['cards','todo_blocks','todo_items','board_texts','card_links','projects','profiles','team_members','project_members','team_invites'] loop
    execute format('drop trigger if exists owner_audit_changes on public.%I', target);
    execute format('create trigger owner_audit_changes after insert or update or delete on public.%I for each row execute function private.capture_owner_audit()', target);
  end loop;
end;
$$;

create or replace function public.record_app_session_audit()
returns void language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  select id into sid from auth.sessions where id::text = (auth.jwt()->>'session_id') and user_id = auth.uid()
    and (not_after is null or not_after > now());
  if sid is null then return; end if;
  insert into private.owner_audited_sessions(session_id) values(sid) on conflict do nothing;
  if found then insert into private.owner_audit(actor_id, action, entity_type) values(auth.uid(), 'sign_in', 'security'); end if;
end;
$$;

create or replace function public.owner_console_read(view_name text, filters jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb; subject uuid; project uuid; cursor_id bigint; oldest boolean; term text; kind text;
  rows_limit integer := 50; page_number integer;
begin
  if not private.owner_console_unlocked() then raise exception 'Owner console is locked' using errcode = '42501'; end if;
  if filters is null or jsonb_typeof(filters) <> 'object' or octet_length(filters::text) > 2048 then
    raise exception 'Invalid filters' using errcode = '22023';
  end if;
  term := left(coalesce(filters->>'search',''),100);
  page_number := greatest(0, least(coalesce((filters->>'page')::integer,0),1000));
  if view_name = 'overview' then
    select jsonb_build_object(
      'users',(select count(*) from public.profiles), 'projects',(select count(*) from public.projects),
      'cards',(select count(*) from public.cards), 'done',(select count(*) from public.cards where status='done'),
      'personalCards',(select count(*) from public.cards where board_scope='personal'),
      'todoItems',(select count(*) from public.todo_items),
      'pendingInvites',(select count(*) from public.team_invites where accepted_at is null and revoked_at is null and expires_at>now()),
      'imageBytes',(select coalesce(sum(image_size),0) from public.cards)+(select coalesce(sum(image_size),0) from public.todo_items),
      'auditEvents',(select count(*) from private.owner_audit),
      'auditBytes',pg_total_relation_size('private.owner_audit'),
      'oldestEvent',(select min(occurred_at) from private.owner_audit),
      'cleanupQueue',(select count(*) from public.card_image_cleanup_queue)+(select count(*) from public.todo_image_cleanup_queue)
    ) into result;
  elsif view_name = 'audit' then
    cursor_id := nullif(filters->>'cursor','')::bigint;
    subject := nullif(filters->>'actor','')::uuid;
    oldest := coalesce(filters->>'sort','newest') = 'oldest';
    select coalesce(jsonb_agg(to_jsonb(r)), '[]') into result from (
      select a.*, p.nickname as actor_name from private.owner_audit a left join public.profiles p on p.id=a.actor_id
      where (cursor_id is null or (oldest and a.id>cursor_id) or (not oldest and a.id<cursor_id))
        and (subject is null or a.actor_id=subject)
        and (coalesce(filters->>'entity','')='' or a.entity_type=filters->>'entity')
        and (coalesce(filters->>'action','')='' or a.action=filters->>'action')
        and (nullif(filters->>'since','') is null or a.occurred_at >= (filters->>'since')::timestamptz)
        and (term='' or a.title ilike '%'||term||'%' or p.nickname ilike '%'||term||'%')
      order by case when oldest then a.id end asc, case when not oldest then a.id end desc limit rows_limit+1
    ) r;
  elsif view_name = 'members' then
    select coalesce(jsonb_agg(to_jsonb(r)), '[]') into result from (
      select p.id, p.nickname, p.avatar_path, p.active_color, p.created_at,
        (select max(occurred_at) from private.owner_audit where actor_id=p.id and action='sign_in') as last_seen,
        (select count(*) from public.cards where created_by=p.id and board_scope='personal') as personal_cards,
        (select count(*) from public.todo_blocks where created_by=p.id and board_scope='personal') as personal_blocks,
        (select coalesce(jsonb_agg(jsonb_build_object('team',t.name,'role',m.role)), '[]') from public.team_members m join public.teams t on t.id=m.team_id where m.user_id=p.id) as memberships
      from public.profiles p where term='' or p.nickname ilike '%'||term||'%'
      order by p.nickname,p.id limit rows_limit+1 offset page_number*rows_limit
    ) r;
  elsif view_name = 'projects' then
    select coalesce(jsonb_agg(to_jsonb(r)), '[]') into result from (
      select p.id,p.name,p.color,t.name as team,
        (select count(*) from public.cards where project_id=p.id) as cards,
        (select count(*) from public.cards where project_id=p.id and status='done') as done,
        (select count(*) from public.project_members where project_id=p.id) as members
      from public.projects p join public.teams t on t.id=p.team_id
      where term='' or p.name ilike '%'||term||'%' order by p.sort_order,p.id limit rows_limit+1 offset page_number*rows_limit
    ) r;
  elsif view_name = 'board' then
    subject := nullif(filters->>'userId','')::uuid;
    project := nullif(filters->>'projectId','')::uuid;
    kind := coalesce(filters->>'kind','cards');
    if (subject is null) = (project is null) then raise exception 'Choose a user or a project' using errcode='22023'; end if;
    if subject is not null and not exists(select 1 from public.profiles where id=subject) then raise exception 'Unknown user'; end if;
    if project is not null and not exists(select 1 from public.projects where id=project) then raise exception 'Unknown project'; end if;
    if kind='cards' then
      select coalesce(jsonb_agg(to_jsonb(r)), '[]') into result from (
        select c.id,c.title,c.description,c.status,c.is_active,c.created_by,c.active_by,c.completed_by,c.completed_at,c.deadline_at,c.created_at,c.image_path,c.image_width,c.image_height
        from public.cards c where ((subject is not null and c.board_scope='personal' and c.created_by=subject) or c.project_id=project)
          and (term='' or c.title ilike '%'||term||'%' or c.description ilike '%'||term||'%')
        order by c.created_at desc,c.id limit rows_limit+1 offset page_number*rows_limit
      ) r;
    elsif kind='todos' then
      select coalesce(jsonb_agg(to_jsonb(r)), '[]') into result from (
        select b.id,b.title,b.deadline_at,b.created_at,
          (select count(*) from public.todo_items where block_id=b.id) as items,
          (select count(*) from public.todo_items where block_id=b.id and is_done) as done
        from public.todo_blocks b where ((subject is not null and b.board_scope='personal' and b.created_by=subject) or b.project_id=project)
          and (term='' or b.title ilike '%'||term||'%') order by b.created_at desc,b.id limit rows_limit+1 offset page_number*rows_limit
      ) r;
    elsif kind='items' then
      select coalesce(jsonb_agg(to_jsonb(r)), '[]') into result from (
        select i.id,i.title,i.description,i.is_done,i.is_active,i.completed_at,i.image_path,i.image_width,i.image_height
        from public.todo_items i join public.todo_blocks b on b.id=i.block_id
        where b.id=(filters->>'blockId')::uuid and ((subject is not null and b.board_scope='personal' and b.created_by=subject) or b.project_id=project)
        order by i.sort_order,i.id limit rows_limit+1 offset page_number*rows_limit
      ) r;
    elsif kind='texts' then
      select coalesce(jsonb_agg(to_jsonb(r)), '[]') into result from (
        select b.id,b.content,b.color,b.font_family,b.font_size,b.created_at from public.board_texts b
        where ((subject is not null and b.board_scope='personal' and b.created_by=subject) or b.project_id=project)
          and (term='' or b.content ilike '%'||term||'%') order by b.created_at desc,b.id limit rows_limit+1 offset page_number*rows_limit
      ) r;
    elsif kind='links' then
      select coalesce(jsonb_agg(to_jsonb(r)), '[]') into result from (
        select l.id,l.from_card_id,l.to_card_id,l.from_todo_block_id,l.to_todo_block_id,l.created_at from public.card_links l
        where ((subject is not null and l.board_scope='personal' and l.created_by=subject) or l.project_id=project)
        order by l.created_at desc,l.id limit rows_limit+1 offset page_number*rows_limit
      ) r;
    else raise exception 'Unknown board section' using errcode='22023'; end if;
    insert into private.owner_audit(actor_id,action,entity_type,entity_id,project_id,board_scope,title)
      values(auth.uid(),'board_viewed','owner_console',subject,project,case when subject is not null then 'personal' else 'shared' end,kind);
  elsif view_name='invites' then
    select coalesce(jsonb_agg(to_jsonb(r)), '[]') into result from (
      select i.id,i.invitee_email,i.role,i.expires_at,t.name as team from public.team_invites i join public.teams t on t.id=i.team_id
      where i.accepted_at is null and i.revoked_at is null and i.expires_at>now()
      order by i.created_at desc,i.id limit rows_limit+1 offset page_number*rows_limit
    ) r;
  else raise exception 'Unknown console section' using errcode='22023'; end if;
  return result;
end;
$$;

create or replace function public.owner_console_action(action_name text, target_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.owner_console_unlocked() then raise exception 'Owner console is locked' using errcode='42501'; end if;
  if action_name is distinct from 'export_page' and not exists(select 1 from private.owner_console_config where user_id=auth.uid()) then
    raise exception 'Primary owner required' using errcode='42501';
  end if;
  if action_name='revoke_invite' then
    update public.team_invites set revoked_at=now() where id=target_id and accepted_at is null and revoked_at is null;
    if not found then raise exception 'Invitation is no longer pending'; end if;
  elsif action_name='purge_old_audit' then
    delete from private.owner_audit where id in (select id from private.owner_audit where occurred_at<now()-interval '90 days' order by id limit 5000);
    delete from private.owner_audited_sessions where recorded_at<now()-interval '90 days';
  elsif action_name <> 'export_page' then raise exception 'Unknown console action' using errcode='22023'; end if;
  insert into private.owner_audit(actor_id,action,entity_type,entity_id) values(auth.uid(),action_name,'owner_console',target_id);
end;
$$;

create or replace function public.owner_console_access(action_name text default 'list', target_email text default null, new_pin text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target uuid; salt_value text; crypto_schema text; result jsonb;
begin
  -- Serialize grants with owner transfer; recheck authority after acquiring the lock.
  perform 1 from private.owner_console_config where singleton=true for update;
  if not private.owner_console_unlocked() or not exists(select 1 from private.owner_console_config where user_id=auth.uid()) then
    raise exception 'Primary owner required' using errcode='42501';
  end if;
  if action_name in ('grant','revoke') then
    select id into target from auth.users where lower(email)=lower(trim(target_email));
    if target is null then raise exception 'Account not found' using errcode='22023'; end if;
    if target=auth.uid() then raise exception 'Cannot change the primary owner here' using errcode='22023'; end if;
    if action_name='grant' then
      if not exists(select 1 from auth.users where id=target and email_confirmed_at is not null) then
        raise exception 'Account email must be verified' using errcode='22023';
      end if;
      if not exists(select 1 from public.team_members a join public.team_members b on b.team_id=a.team_id where a.user_id=auth.uid() and b.user_id=target) then
        raise exception 'Account must belong to your team' using errcode='22023';
      end if;
      if new_pin is null or new_pin !~ '^[0-9]{6,12}$' then raise exception 'PIN must contain 6-12 digits' using errcode='22023'; end if;
      select n.nspname into crypto_schema from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto';
      execute format('select %I.gen_salt(''bf'',10)',crypto_schema) into salt_value;
      insert into private.owner_console_delegates(user_id,pin_hash,granted_by)
      values(target,private.owner_pin_crypt(new_pin,salt_value),auth.uid())
      on conflict(user_id) do update set pin_hash=excluded.pin_hash,granted_by=excluded.granted_by,failed_attempts=0,blocked_until=null;
    else
      delete from private.owner_console_delegates where user_id=target;
    end if;
    delete from private.owner_console_sessions where user_id=target;
    insert into private.owner_audit(actor_id,action,entity_type,entity_id) values(auth.uid(),'access_'||action_name,'security',target);
  elsif action_name is distinct from 'list' then raise exception 'Unknown access action' using errcode='22023'; end if;
  select coalesce(jsonb_agg(to_jsonb(r)),'[]') into result from (
    select d.user_id as id,u.email,p.nickname,d.created_at from private.owner_console_delegates d
    join auth.users u on u.id=d.user_id left join public.profiles p on p.id=d.user_id order by d.created_at,d.user_id
  ) r;
  return result;
end;
$$;

create or replace function public.owner_console_board(target_user_id uuid default null, target_project_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb; board_name text; total integer;
begin
  if not private.owner_console_unlocked() then raise exception 'Owner console is locked' using errcode='42501'; end if;
  if (target_user_id is null) = (target_project_id is null) then raise exception 'Choose one board' using errcode='22023'; end if;
  if target_user_id is not null then select nickname into board_name from public.profiles where id=target_user_id;
  else select name into board_name from public.projects where id=target_project_id; end if;
  if board_name is null then raise exception 'Board not found' using errcode='22023'; end if;
  with cards as materialized (
    select c.id,c.title,c.description,c.deadline_at,c.status,c.is_active,c.active_by,c.completed_by,c.completed_at,
      c.x,c.y,c.w,c.h,c.image_path,c.image_width,c.image_height,c.image_size,c.created_by,c.created_at,c.updated_at,c.board_scope,c.project_id
    from public.cards c where (target_user_id is not null and c.board_scope='personal' and c.created_by=target_user_id)
      or (c.board_scope='shared' and c.project_id=target_project_id) order by c.created_at,c.id limit 2001
  ), blocks as materialized (
    select b.id,b.title,b.deadline_at,b.x,b.y,b.w,b.created_by,b.created_at from public.todo_blocks b
    where (target_user_id is not null and b.board_scope='personal' and b.created_by=target_user_id)
      or (b.board_scope='shared' and b.project_id=target_project_id) order by b.created_at,b.id limit 2001
  ), items as materialized (
    select i.id,i.block_id,i.title,i.description,i.is_done,i.is_active,i.active_by,i.completed_by,i.completed_at,
      i.sort_order,i.image_path,i.image_width,i.image_height,i.created_by,i.created_at
    from public.todo_items i join blocks b on b.id=i.block_id order by i.sort_order,i.id limit 2001
  ), texts as materialized (
    select t.id,t.content,t.x,t.y,t.w,t.font_size,t.font_family,t.color,t.created_by,t.created_at from public.board_texts t
    where (target_user_id is not null and t.board_scope='personal' and t.created_by=target_user_id)
      or (t.board_scope='shared' and t.project_id=target_project_id) order by t.created_at,t.id limit 2001
  ), links as materialized (
    select l.id,l.from_card_id,l.to_card_id,l.from_todo_block_id,l.to_todo_block_id,l.from_side,l.to_side
    from public.card_links l where (target_user_id is not null and l.board_scope='personal' and l.created_by=target_user_id)
      or (l.board_scope='shared' and l.project_id=target_project_id) order by l.id limit 2001
  ), people as (
    select created_by as id from cards union select active_by from cards union select completed_by from cards
    union select created_by from items union select active_by from items union select completed_by from items
    union select created_by from blocks union select created_by from texts
  )
  select jsonb_build_object('name',board_name,'capturedAt',clock_timestamp(),
    'cards',coalesce((select jsonb_agg(to_jsonb(c)) from cards c),'[]'),
    'todos',coalesce((select jsonb_agg(to_jsonb(b)) from blocks b),'[]'),
    'items',coalesce((select jsonb_agg(to_jsonb(i)) from items i),'[]'),
    'texts',coalesce((select jsonb_agg(to_jsonb(t)) from texts t),'[]'),
    'links',coalesce((select jsonb_agg(to_jsonb(l)) from links l),'[]'),
    'profiles',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'nickname',p.nickname,'avatar_path',p.avatar_path,'active_color',p.active_color))
      from public.profiles p join people on people.id=p.id),'[]')) into result;
  select sum(jsonb_array_length(result->k)) into total from unnest(array['cards','todos','items','texts','links']) k;
  if total>2000 then raise exception 'Board exceeds 2000 objects; use list view' using errcode='54000'; end if;
  insert into private.owner_audit(actor_id,action,entity_type,entity_id,project_id,board_scope,title)
  values(auth.uid(),'board_viewed','owner_console',target_user_id,target_project_id,
    case when target_user_id is not null then 'personal' else 'shared' end,board_name);
  return result;
end;
$$;

revoke all on function public.owner_console_access(text,text,text),public.owner_console_board(uuid,uuid) from public,anon;
grant execute on function public.owner_console_access(text,text,text),public.owner_console_board(uuid,uuid) to authenticated;

-- Image access is SELECT-only. Do not add privileged policies to board tables.
drop policy if exists owner_console_images_select on storage.objects;
create policy owner_console_images_select on storage.objects for select to authenticated
using (bucket_id in ('card-images','todo-images') and private.owner_console_unlocked());

revoke all on function private.owner_pin_crypt(text,text), private.configure_owner_console(uuid,text), private.capture_owner_audit() from public,anon,authenticated;
revoke all on function private.owner_console_unlocked() from public,anon,authenticated;
grant execute on function private.owner_console_unlocked() to authenticated;
revoke all on function public.owner_console_status(), public.owner_console_unlock(text), public.owner_console_lock(), public.owner_console_read(text,jsonb), public.owner_console_action(text,uuid), public.record_app_session_audit() from public,anon;
grant execute on function public.owner_console_status(), public.owner_console_unlock(text), public.owner_console_lock(), public.owner_console_read(text,jsonb), public.owner_console_action(text,uuid), public.record_app_session_audit() to authenticated;

notify pgrst, 'reload schema';

commit;
