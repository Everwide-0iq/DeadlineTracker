# Telegram Reminders

Personal reminders for ordinary cards: presets for two days, one day, one hour or 30 minutes before, at the deadline, or 30 minutes after. Custom intervals support whole minutes/hours/days, from 30 days before to 3 days after, with up to 8 reminders per card. Absolute date/time is also available, including for cards without deadlines. A completed card cannot receive new reminders. Completion/deletion cancels existing ones; changing a deadline reschedules relative reminders. Absolute reminders keep their chosen date. Notifications contain the card title, project, time and an authenticated card link, not descriptions or images.

## Test Delivery

Each personal card schedule can include an optional message of up to 1000 characters. The same message is used for all selected times on that card, kept private to the reminder owner and sent as plain text with line breaks. Editing it preserves job IDs and delivery statuses; it never replays a sent notification. A send already in flight may still contain the earlier text. Older clients that omit the new RPC argument preserve existing text; sending an empty string explicitly clears it. The database enforces the size limit independently of the UI.

Profile > Telegram and the card reminder dialog include **Test notification**. A test enters the same server queue and travels through Cron, the worker and Telegram, without a card or any changes to board content. The UI reports queued/sent/failed/unconfirmed status. "Sent" means Telegram accepted the message, not that the phone displayed it. A server-side per-account lock enforces a one-minute cooldown and a single outstanding test. Disconnecting cancels queued tests as well as card reminders. No recipient ID can be supplied by the client.

The queue uses an explicit `kind` (`card` or `test`) with database constraints and one test row per account. Test history is separate from card schedules in the state RPC. Shared interval constants/formatting live in `shared/reminders.ts`; the database independently validates every interval and limit.

For an existing deployment, deploy the updated worker first, reapply `supabase/patches/telegram_reminders.sql`, then deploy the frontend. The patch preserves schedules, IDs and delivery statuses, including on repeated application. It does not need a new bot token or a Cron change.

## Deployment

No bot credentials belong in Vercel, `VITE_*`, source code, screenshots or chat. Use a dedicated bot for this app: setting its webhook replaces any existing webhook.

### Windows CLI Setup

After `npx supabase login`, apply the reminder patch and deploy the function using the commands below. Then copy the bot token to the clipboard and run the provisioning script, substituting your own project, bot and site:

```powershell
npx supabase db query --linked --project-ref YOUR_PROJECT_REF --file supabase/patches/telegram_reminders.sql
npx supabase functions deploy telegram-reminders --project-ref YOUR_PROJECT_REF --no-verify-jwt --use-api
./scripts/provision-telegram.ps1 -ProjectRef YOUR_PROJECT_REF -BotUsername YOUR_BOT_USERNAME -AppUrl https://YOUR_FIREBOARD_DOMAIN
```

The script verifies the bot identity, refuses to replace an unrelated webhook, generates separate random secrets, configures Edge secrets/Vault/Cron and verifies the worker. Temporary credential files are restricted to the current Windows user, ignored by Git and deleted in `finally`. It does not print credentials or raw error responses. Re-running rotates the two internal secrets, so use it for setup/recovery rather than routine health checks. Clear the clipboard manually after successful setup. It does not deploy the frontend or connect an individual Telegram account.

### Manual Setup

1. Create a bot through Telegram **@BotFather** (`/newbot`). Keep the token private.
2. Apply `supabase/patches/telegram_reminders.sql` in Supabase SQL Editor. A fresh installation can instead use the single `supabase/migrations/0001_initial_schema.sql` file. Both are repeatable and preserve reminders.
3. In **Supabase > Edge Functions > Secrets**, add:
   - `TELEGRAM_BOT_TOKEN`: BotFather's token.
   - `TELEGRAM_WEBHOOK_SECRET`: a random 64-character hexadecimal secret.
   - `REMINDER_CRON_SECRET`: a different random 64-character hexadecimal secret.
   Generate each locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Do not publish the output.
4. Deploy the function with Supabase CLI, from this repo:

   ```sh
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase functions deploy telegram-reminders --no-verify-jwt
   ```

   JWT verification is intentionally disabled for Telegram and Cron. The handler checks their separate secret headers before making any database/API calls. Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the Edge Function. Do not expose that key in the frontend.

5. Create a local, ignored `telegram-secrets.local` environment file containing:

   ```env
   SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
   TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN
   TELEGRAM_WEBHOOK_SECRET=THE_SAME_WEBHOOK_SECRET_AS_ABOVE
   FIREBOARD_APP_URL=https://YOUR_FIREBOARD_DOMAIN
   ```

   Then run `node --env-file=telegram-secrets.local scripts/setup-telegram.mjs`. This verifies the bot with `getMe`, registers its webhook and stores only its public username and the app origin in private configuration. App URL must be an HTTPS origin, without a path/query. Remove the temporary secrets file after setup. No Vercel secrets are needed for this feature.

6. In **Supabase > Vault**, add secrets with these exact names:
   - `fireboard_project_url`: your `https://YOUR_PROJECT_REF.supabase.co` URL.
   - `fireboard_reminder_cron_secret`: exactly the same value as `REMINDER_CRON_SECRET` in Edge secrets.
7. Run `supabase/setup/telegram_cron.sql` in SQL Editor. Enable Cron/pg_net in Supabase Integrations first if the extensions cannot be installed from SQL Editor. The named Cron job is updated, not duplicated, on rerun. It checks once a minute and calls the Edge Function only for due work or a daily health/cleanup run.
8. Wait one minute, then open a bell or Profile > Telegram. The scheduler warning should disappear. Deploy the frontend to Vercel as usual.

For each member: click **Connect Telegram**, open the generated link, press **Start** in the bot, return to Fireboard, choose the card's reminder times and save. This works on iOS and Android with Telegram notifications allowed by the device. The bot cannot contact a user until they start it. The connection link expires after 10 minutes, is single-use, and must not be shared. Only its SHA-256 hash is stored.

## Verification

- Inspect `fireboard-telegram-reminders` in Supabase Cron. `private.telegram_settings.last_worker_at` should be set after the initial scheduled run.
- If Cron succeeds but the scheduler warning remains, inspect the Edge invocation status and pg_net response status. Check matching secrets and the deployed function; do not disable the handler's header checks.
- On a test card without a deadline, set a reminder 2-3 minutes in the future, close the website, and check delivery on the phone.
- The Telegram button should open the correct card after login, with its project selected. A deleted/inaccessible card shows an unavailable notice.
- Set another future reminder, complete/delete the card before dispatch, and verify it does not send.
- Move a deadline and check the bell's scheduled dates. Reopen after changing data in another tab if necessary.
- Disconnect Telegram from Profile or a bell: all personal reminders are cancelled. Team members' reminders are unaffected.

## Delivery Semantics

- This is a server scheduler, not a browser timer. Vercel or a user's computer can be offline. Minute-level scheduling is approximate; provider delays, paused Supabase projects, network outages and Telegram/device notification settings still affect delivery.
- Up to 5 jobs are claimed per invocation with `FOR UPDATE SKIP LOCKED`, per-job leases and a second permission/connection check immediately before sending. Larger bursts are drained over later minutes.
- A 429 response is retried with Telegram's retry delay, capped at 1 hour, with at most 5 attempts. A blocked bot disconnects that Telegram binding. Reconnect it from Fireboard after unblocking.
- Telegram `sendMessage` has no application idempotency key. After a timeout, ambiguous 5xx response or worker crash during sending, the state becomes **Delivery unconfirmed**, with no automatic resend. This deliberately favors avoiding duplicate notifications over pretending exactly-once delivery is possible.
- Overdue reminders more than 6 hours late are marked missed. Terminal history is retained for 30 days; at most 300 reminders per account. No descriptions, bot secrets or message contents are logged by the worker.
- Cancellation/access revocation prevents future prepares, but cannot retract a request already in flight to Telegram. Previously delivered messages remain in the recipient's chat. Titles and project names may appear on a phone's lock screen.
- Relative reminders removed by clearing a deadline or completing a card are not restored automatically when reopening the card. Saving preserves unchanged jobs and delivery history; removing a time cancels that job. Changing an absolute time creates a new job. This prevents accidental replay when saving an unchanged schedule.
- `schedulerReady` is a last-success health signal (26-hour window), not a guarantee that the next send will succeed. Inspect Supabase Cron/Edge dashboards for operational failures and usage. No claim of unlimited free hosting is made.
- Run `npm run test:reminders-sql` and `npm test`. Tests use isolated PostgreSQL and mocked HTTP, never send live Telegram messages.

## Official References

- [Supabase: scheduling Edge Functions using Cron, pg_net and Vault](https://supabase.com/docs/guides/functions/schedule-functions)
- [Telegram: deep linking](https://core.telegram.org/bots/features#deep-linking)
- [Telegram: webhook authentication](https://core.telegram.org/bots/api#setwebhook)
- [Telegram: sendMessage](https://core.telegram.org/bots/api#sendmessage)
