-- Run after setting Vault secrets fireboard_project_url and fireboard_reminder_cron_secret.
-- The latter must match REMINDER_CRON_SECRET in Edge Function secrets.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function private.dispatch_due_telegram_reminders()
returns void language plpgsql security definer set search_path='' as $$
declare project_url text; cron_secret text;
begin
  -- No idle Edge invocations. Also wake for stale leases and daily token cleanup.
  if not exists(select 1 from private.telegram_settings) then return; end if;
  if not exists(select 1 from private.card_reminders where due_at<=now() and retry_at<=now() and status in ('pending','claimed','sending'))
    and not exists(select 1 from private.telegram_settings where last_worker_at is null or last_worker_at<now()-interval '1 day') then return; end if;
  select decrypted_secret into project_url from vault.decrypted_secrets where name='fireboard_project_url';
  select decrypted_secret into cron_secret from vault.decrypted_secrets where name='fireboard_reminder_cron_secret';
  if project_url is null or cron_secret is null then raise exception 'Telegram Vault settings are missing'; end if;
  perform net.http_post(url:=rtrim(project_url,'/')||'/functions/v1/telegram-reminders',
    headers:=jsonb_build_object('Content-Type','application/json','X-Fireboard-Cron-Secret',cron_secret),body:='{}'::jsonb,timeout_milliseconds:=145000);
end;
$$;
revoke all on function private.dispatch_due_telegram_reminders() from public,anon,authenticated;
select cron.schedule('fireboard-telegram-reminders','* * * * *','select private.dispatch_due_telegram_reminders()');
