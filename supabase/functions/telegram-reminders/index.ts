import { createTelegramHandler } from './handler.ts'

const env = {
  SUPABASE_URL: Deno.env.get('SUPABASE_URL') ?? '',
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  TELEGRAM_BOT_TOKEN: Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '',
  TELEGRAM_WEBHOOK_SECRET: Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? '',
  REMINDER_CRON_SECRET: Deno.env.get('REMINDER_CRON_SECRET') ?? '',
}
Deno.serve(createTelegramHandler(env))
