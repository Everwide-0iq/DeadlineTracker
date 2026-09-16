-- Existing installations only: repair owner PIN entry with safeupdate enabled.
-- Does not change the configured account/PIN, board data, RLS, or protection settings.
begin;

create or replace function private.configure_owner_console(owner_user_id uuid, new_pin text)
returns void language plpgsql security definer set search_path = '' as $$
declare crypto_schema text; salt_value text;
begin
  if new_pin is null or new_pin !~ '^[0-9]{4,12}$' then raise exception 'PIN must contain 4-12 digits'; end if;
  if not exists(select 1 from auth.users where id = owner_user_id) then raise exception 'Unknown account'; end if;
  select n.nspname into crypto_schema from pg_catalog.pg_extension e
  join pg_catalog.pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgcrypto';
  execute format('select %I.gen_salt(''bf'', 10)', crypto_schema) into salt_value;
  insert into private.owner_console_config(singleton, user_id, pin_hash)
  values(true, owner_user_id, private.owner_pin_crypt(new_pin, salt_value))
  on conflict(singleton) do update set user_id = excluded.user_id, pin_hash = excluded.pin_hash, failed_attempts = 0, blocked_until = null;
  -- Explicitly revoke every configured console lease; compatible with safeupdate.
  delete from private.owner_console_sessions where user_id is not null;
  insert into private.owner_audit(action, entity_type, entity_id) values('owner_configured', 'security', owner_user_id);
end;
$$;
create or replace function public.owner_console_unlock(pin_value text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare config private.owner_console_config%rowtype; sid uuid; attempt integer;
begin
  select * into config from private.owner_console_config where user_id = auth.uid() for update;
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
    update private.owner_console_config set failed_attempts = attempt,
      blocked_until = case when attempt >= 5 then clock_timestamp() + interval '15 minutes' else null end
      where singleton = true and user_id = auth.uid();
    insert into private.owner_audit(actor_id, action, entity_type) values(auth.uid(), 'pin_failed', 'security');
    -- Return instead of raising: a rollback would erase the rate-limit counter.
    return public.owner_console_status() || jsonb_build_object('ok', false);
  end if;
  update private.owner_console_config set failed_attempts = 0, blocked_until = null
    where singleton = true and user_id = auth.uid();
  delete from private.owner_console_sessions where expires_at <= now();
  insert into private.owner_console_sessions(session_id, user_id, expires_at)
    values(sid, auth.uid(), clock_timestamp() + interval '10 minutes')
    on conflict(session_id) do update set expires_at = excluded.expires_at;
  insert into private.owner_audit(actor_id, action, entity_type) values(auth.uid(), 'console_unlocked', 'security');
  return public.owner_console_status() || jsonb_build_object('ok', true);
end;
$$;

revoke all on function private.configure_owner_console(uuid,text) from public,anon,authenticated;
revoke all on function public.owner_console_unlock(text) from public,anon;
grant execute on function public.owner_console_unlock(text) to authenticated;
notify pgrst, 'reload schema';
commit;

