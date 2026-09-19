begin;

-- Fireboard Telegram Reminders: private subscriptions and leased delivery queue.
create table if not exists private.telegram_settings (
  singleton boolean primary key default true check (singleton),
  bot_username text not null check (bot_username ~ '^[A-Za-z0-9_]{5,32}$'),
  app_url text not null check (app_url ~ '^https://[^/]+/?$'),
  last_worker_at timestamptz
);
create table if not exists private.telegram_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  chat_id bigint unique not null check (chat_id > 0),
  connected_at timestamptz not null default now()
);
create table if not exists private.telegram_link_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text unique not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create table if not exists private.card_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  slot integer not null check (slot in (-30,0,30,9999)),
  due_at timestamptz not null,
  timezone text not null default 'UTC',
  language text not null default 'ru' check (language in ('ru','en')),
  status text not null default 'pending' check (status in ('pending','claimed','sending','sent','failed','unknown','expired','cancelled')),
  lease uuid,
  lease_until timestamptz,
  retry_at timestamptz not null default now(),
  attempts integer not null default 0,
  sent_at timestamptz,
  error_code text,
  unique(user_id,card_id,slot)
);
create index if not exists card_reminders_due_idx on private.card_reminders(retry_at,due_at) where status in ('pending','claimed','sending');
create index if not exists card_reminders_card_idx on private.card_reminders(card_id);
-- Additive upgrade: existing card schedules retain their IDs, dates and status.
alter table private.telegram_accounts add column if not exists last_test_at timestamptz;
alter table private.card_reminders add column if not exists kind text not null default 'card';
alter table private.card_reminders add column if not exists note text not null default '';
alter table private.card_reminders drop constraint if exists card_reminders_note_check;
alter table private.card_reminders add constraint card_reminders_note_check check (char_length(note)<=1000);
alter table private.card_reminders alter column card_id drop not null;
alter table private.card_reminders drop constraint if exists card_reminders_slot_check;
alter table private.card_reminders add constraint card_reminders_slot_check check (slot between -43200 and 4320 or slot=9999);
alter table private.card_reminders drop constraint if exists card_reminders_kind_check;
alter table private.card_reminders add constraint card_reminders_kind_check check (
  (kind='card' and card_id is not null) or (kind='test' and card_id is null and slot=0)
);
create unique index if not exists card_reminders_test_user_idx on private.card_reminders(user_id) where kind='test';
alter table private.telegram_settings enable row level security;
alter table private.telegram_accounts enable row level security;
alter table private.telegram_link_tokens enable row level security;
alter table private.card_reminders enable row level security;
revoke all on private.telegram_settings,private.telegram_accounts,private.telegram_link_tokens,private.card_reminders from public,anon,authenticated;

create or replace function private.reminder_can_view(target_card uuid, target_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.cards c where c.id=target_card and (
    (c.board_scope='personal' and c.created_by=target_user)
    or (c.board_scope='shared' and exists(
      select 1 from public.projects p join public.team_members m on m.team_id=p.team_id and m.user_id=target_user
      where p.id=c.project_id and (m.role in ('owner','admin') or exists(
        select 1 from public.project_members pm where pm.project_id=p.id and pm.user_id=target_user
      ))
    ))
  ));
$$;
revoke all on function private.reminder_can_view(uuid,uuid) from public,anon,authenticated;

create or replace function public.telegram_reminder_state()
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select jsonb_build_object(
    'configured',exists(select 1 from private.telegram_settings),
    'schedulerReady',exists(select 1 from private.telegram_settings where last_worker_at>now()-interval '26 hours'),
    'connected',exists(select 1 from private.telegram_accounts where user_id=auth.uid()),
    'botUsername',(select bot_username from private.telegram_settings where singleton),
    'testDelivery',(select jsonb_build_object('status',r.status,'requestedAt',r.due_at,'sentAt',r.sent_at) from private.card_reminders r where r.user_id=auth.uid() and r.kind='test'),
    'testAvailableAt',(select last_test_at+interval '1 minute' from private.telegram_accounts where user_id=auth.uid()),
    'reminders',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'cardId',r.card_id,'slot',r.slot,'dueAt',r.due_at,'status',r.status,'sentAt',r.sent_at,'note',r.note) order by r.due_at)
      from private.card_reminders r where r.user_id=auth.uid() and r.kind='card' and private.reminder_can_view(r.card_id,auth.uid())),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.telegram_create_link()
returns jsonb language plpgsql security definer set search_path='' as $$
declare token text; bot text; previous timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,714));
  select bot_username into bot from private.telegram_settings where singleton;
  if bot is null then raise exception 'Telegram is not configured' using errcode='55000'; end if;
  if exists(select 1 from private.telegram_accounts where user_id=auth.uid()) then raise exception 'Already connected' using errcode='22023'; end if;
  select created_at into previous from private.telegram_link_tokens where user_id=auth.uid();
  if previous > now()-interval '30 seconds' then raise exception 'Wait before creating another link' using errcode='P0001'; end if;
  token := replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  insert into private.telegram_link_tokens(user_id,token_hash,expires_at)
    values(auth.uid(),encode(sha256(convert_to(token,'UTF8')),'hex'),now()+interval '10 minutes')
    on conflict(user_id) do update set token_hash=excluded.token_hash,created_at=now(),expires_at=excluded.expires_at;
  return jsonb_build_object('url','https://t.me/'||bot||'?start='||token,'expiresAt',now()+interval '10 minutes');
end;
$$;

create or replace function public.telegram_disconnect()
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,714));
  delete from private.telegram_link_tokens where user_id=auth.uid();
  delete from private.telegram_accounts where user_id=auth.uid();
  delete from private.card_reminders where user_id=auth.uid();
end;
$$;

-- Remove the old overload so PostgREST can resolve calls with optional arguments.
drop function if exists public.set_card_reminders(uuid,integer[],timestamptz,text,text);
create or replace function public.set_card_reminders(target_card uuid, selected_offsets integer[] default '{}', custom_time timestamptz default null, time_zone text default 'UTC', reminder_language text default 'ru', reminder_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.cards; minutes integer; delivery timestamptz; slots integer[]; note_value text;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,714));
  select * into c from public.cards where id=target_card for update;
  if not found or not private.reminder_can_view(target_card,auth.uid()) then raise exception 'Card access required' using errcode='42501'; end if;
  if char_length(reminder_note)>1000 then raise exception 'Reminder text is too long' using errcode='22023'; end if;
  -- Omitted text from older clients preserves the existing personal note.
  note_value := coalesce(reminder_note,(select note from private.card_reminders where user_id=auth.uid() and card_id=target_card order by due_at limit 1),'');
  if selected_offsets is null or cardinality(selected_offsets)>8 or array_position(selected_offsets,null) is not null
    or exists(select 1 from unnest(selected_offsets) n where n < -43200 or n > 4320) then
    raise exception 'Invalid reminder offsets' using errcode='22023';
  end if;
  if cardinality(selected_offsets)>0 and (c.deadline_at is null or custom_time is not null) then raise exception 'Choose deadline offsets or a custom time' using errcode='22023'; end if;
  if reminder_language is null or reminder_language not in ('ru','en') or time_zone is null or not exists(select 1 from pg_timezone_names where name=time_zone) then raise exception 'Invalid locale' using errcode='22023'; end if;
  if (cardinality(selected_offsets)>0 or custom_time is not null) and (c.status='done' or not exists(select 1 from private.telegram_accounts where user_id=auth.uid())) then
    raise exception 'Connect Telegram and choose an unfinished card' using errcode='22023';
  end if;
  if (cardinality(selected_offsets)>0 or custom_time is not null) and not exists(select 1 from private.telegram_settings where last_worker_at>now()-interval '26 hours') then
    raise exception 'Reminder scheduler is not running' using errcode='55000';
  end if;
  slots := case when custom_time is not null then array[9999] else selected_offsets end;
  if (select count(*) from private.card_reminders where user_id=auth.uid() and kind='card' and card_id<>target_card)+cardinality(slots)>300 then raise exception 'Reminder limit reached' using errcode='54000'; end if;
  -- Keep unchanged jobs and their delivery status; saving must not replay them.
  delete from private.card_reminders where user_id=auth.uid() and card_id=target_card and not (slot=any(slots));
  foreach minutes in array slots loop
    delivery := case when minutes=9999 then custom_time else c.deadline_at+make_interval(mins=>minutes) end;
    if exists(select 1 from private.card_reminders where user_id=auth.uid() and card_id=target_card and slot=minutes and due_at=delivery) then
      update private.card_reminders set note=note_value where user_id=auth.uid() and card_id=target_card and slot=minutes;
      continue;
    end if;
    if delivery<=now() or delivery>now()+interval '2 years' then raise exception 'Choose a future time within two years' using errcode='22023'; end if;
    delete from private.card_reminders where user_id=auth.uid() and card_id=target_card and slot=minutes;
    insert into private.card_reminders(user_id,card_id,slot,due_at,timezone,language,note)
      values(auth.uid(),target_card,minutes,delivery,time_zone,reminder_language,note_value) on conflict(user_id,card_id,slot) do nothing;
  end loop;
  return public.telegram_reminder_state();
end;
$$;

create or replace function private.sync_card_reminders()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='done' then
    delete from private.card_reminders where card_id=new.id;
  elsif new.deadline_at is distinct from old.deadline_at then
    delete from private.card_reminders where card_id=new.id and slot<>9999 and new.deadline_at is null;
    update private.card_reminders set id=gen_random_uuid(),due_at=new.deadline_at+make_interval(mins=>slot),
      status=case when new.deadline_at+make_interval(mins=>slot)>now() then 'pending' else 'expired' end,
      attempts=0,lease=null,lease_until=null,sent_at=null,error_code=null,retry_at=now()
      where card_id=new.id and slot<>9999;
  end if;
  return new;
end;
$$;
drop trigger if exists sync_card_reminders on public.cards;
create trigger sync_card_reminders after update of deadline_at,status on public.cards for each row execute function private.sync_card_reminders();
revoke all on function private.sync_card_reminders() from public,anon,authenticated;

-- Server-only RPCs. Neither the client nor a team admin can choose a Telegram chat ID.
create or replace function public.telegram_finish_link(raw_token text, telegram_chat bigint)
returns boolean language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
  if telegram_chat is null or telegram_chat<=0 or raw_token is null or raw_token !~ '^[a-f0-9]{64}$' then return false; end if;
  select user_id into target from private.telegram_link_tokens where token_hash=encode(sha256(convert_to(raw_token,'UTF8')),'hex') and expires_at>now();
  if target is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(target::text,714));
  delete from private.telegram_link_tokens where user_id=target and token_hash=encode(sha256(convert_to(raw_token,'UTF8')),'hex') and expires_at>now();
  if not found then return false; end if;
  if exists(select 1 from private.telegram_accounts where user_id=target or chat_id=telegram_chat) then return false; end if;
  insert into private.telegram_accounts(user_id,chat_id) values(target,telegram_chat) on conflict do nothing;
  return found;
end;
$$;

create or replace function public.telegram_claim_reminders()
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  update private.telegram_settings set last_worker_at=now() where singleton=true;
  delete from private.telegram_link_tokens where expires_at<now()-interval '1 day';
  delete from private.card_reminders where due_at<now()-interval '30 days' and status not in ('pending','claimed','sending');
  -- A crashed worker might already have sent a message: never blindly resend it.
  update private.card_reminders set status='unknown',error_code='delivery_unknown' where status='sending' and lease_until<now();
  update private.card_reminders set status='expired',lease=null where status in ('pending','claimed') and due_at<now()-interval '6 hours';
  with due as (
    select r.id from private.card_reminders r where ((r.status='pending' and r.retry_at<=now()) or (r.status='claimed' and r.lease_until<now()))
      and r.due_at<=now() order by r.due_at,r.id for update skip locked limit 5
  ), claimed as (
    update private.card_reminders r set status='claimed',lease=gen_random_uuid(),lease_until=now()+interval '3 minutes'
    from due where r.id=due.id returning r.id,r.lease
  ) select coalesce(jsonb_agg(to_jsonb(claimed)),'[]') into result from claimed;
  return result;
end;
$$;

create or replace function public.telegram_prepare_reminder(job_id uuid, claim_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.card_reminders; c public.cards; chat bigint; result jsonb;
begin
  select * into r from private.card_reminders where id=job_id and lease=claim_token and status='claimed' and lease_until>now() for update;
  if not found then return null; end if;
  select chat_id into chat from private.telegram_accounts where user_id=r.user_id;
  if r.kind='test' and chat is not null then
    update private.card_reminders set status='sending',attempts=attempts+1 where id=r.id;
    return jsonb_build_object('kind','test','chatId',chat::text,'language',r.language);
  end if;
  select * into c from public.cards where id=r.card_id;
  if c.id is null or c.status='done' or chat is null or not private.reminder_can_view(r.card_id,r.user_id) then
    update private.card_reminders set status='cancelled',lease=null where id=r.id;
    return null;
  end if;
  update private.card_reminders set status='sending',attempts=attempts+1 where id=r.id;
  select jsonb_build_object('id',r.id,'chatId',chat::text,'cardId',c.id,'title',c.title,'project',p.name,'boardScope',c.board_scope,'projectId',c.project_id,
    'dueAt',r.due_at,'deadlineAt',c.deadline_at,'slot',r.slot,'timezone',r.timezone,'language',r.language,'appUrl',s.app_url,'note',r.note)
    into result from private.telegram_settings s left join public.projects p on p.id=c.project_id where s.singleton;
  return result;
end;
$$;

create or replace function public.telegram_complete_reminder(job_id uuid, claim_token uuid, outcome text, retry_seconds integer default 60)
returns void language plpgsql security definer set search_path='' as $$
begin
  if outcome not in ('sent','failed','unknown','retry','blocked') then raise exception 'Invalid outcome'; end if;
  if outcome='blocked' then
    delete from private.telegram_accounts where user_id in (select user_id from private.card_reminders where id=job_id and lease=claim_token and status='sending');
  end if;
  update private.card_reminders set
    status=case when outcome='retry' and attempts<5 then 'pending' when outcome in ('retry','blocked') then 'failed' else outcome end,
    retry_at=now()+make_interval(secs=>greatest(30,least(coalesce(retry_seconds,60),3600))),
    sent_at=case when outcome='sent' then now() else null end,
    error_code=case when outcome='sent' then null else outcome end,lease=null,lease_until=null
    where id=job_id and lease=claim_token and status='sending';
end;
$$;

create or replace function public.telegram_configure(bot_name text, site_url text)
returns void language plpgsql security definer set search_path='' as $$
begin
  insert into private.telegram_settings(singleton,bot_username,app_url) values(true,bot_name,rtrim(site_url,'/'))
    on conflict(singleton) do update set bot_username=excluded.bot_username,app_url=excluded.app_url;
end;
$$;

create or replace function public.telegram_send_test(reminder_language text default 'ru')
returns jsonb language plpgsql security definer set search_path='' as $$
declare last_test timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if reminder_language is null or reminder_language not in ('ru','en') then raise exception 'Invalid locale' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,714));
  select last_test_at into last_test from private.telegram_accounts where user_id=auth.uid();
  if not found then raise exception 'Connect Telegram first' using errcode='22023'; end if;
  if not exists(select 1 from private.telegram_settings where last_worker_at>now()-interval '26 hours') then raise exception 'Scheduler unavailable' using errcode='55000'; end if;
  if last_test>now()-interval '1 minute' or exists(select 1 from private.card_reminders where user_id=auth.uid() and kind='test' and status in ('pending','claimed','sending')) then
    raise exception 'Test already queued or rate limited' using errcode='P0001';
  end if;
  update private.telegram_accounts set last_test_at=now() where user_id=auth.uid();
  delete from private.card_reminders where user_id=auth.uid() and kind='test';
  insert into private.card_reminders(user_id,card_id,slot,due_at,kind,language) values(auth.uid(),null,0,now(),'test',reminder_language);
  return public.telegram_reminder_state();
end;
$$;
revoke all on function public.telegram_send_test(text) from public,anon;
grant execute on function public.telegram_send_test(text) to authenticated;

revoke all on function public.telegram_reminder_state(),public.telegram_create_link(),public.telegram_disconnect(),public.set_card_reminders(uuid,integer[],timestamptz,text,text,text) from public,anon;
grant execute on function public.telegram_reminder_state(),public.telegram_create_link(),public.telegram_disconnect(),public.set_card_reminders(uuid,integer[],timestamptz,text,text,text) to authenticated;
revoke all on function public.telegram_finish_link(text,bigint),public.telegram_claim_reminders(),public.telegram_prepare_reminder(uuid,uuid),public.telegram_complete_reminder(uuid,uuid,text,integer),public.telegram_configure(text,text) from public,anon,authenticated;
grant execute on function public.telegram_finish_link(text,bigint),public.telegram_claim_reminders(),public.telegram_prepare_reminder(uuid,uuid),public.telegram_complete_reminder(uuid,uuid,text,integer),public.telegram_configure(text,text) to service_role;

notify pgrst, 'reload schema';
commit;
