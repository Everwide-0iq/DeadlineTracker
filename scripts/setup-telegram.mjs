// Run locally with server-only environment variables. Never commit the secret file.
const required = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
  'FIREBOARD_APP_URL',
]
if (required.some((key) => !process.env[key]))
  throw new Error(`Required environment variables: ${required.join(', ')}`)
const secret = process.env.TELEGRAM_WEBHOOK_SECRET
if (!/^[A-Za-z0-9_-]{32,256}$/.test(secret))
  throw new Error('Use a random webhook secret of at least 32 characters')
for (const name of ['SUPABASE_URL', 'FIREBOARD_APP_URL']) {
  const url = new URL(process.env[name])
  if (
    url.protocol !== 'https:' ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new Error(`${name} must be an HTTPS origin`)
}
const call = async (url, payload, headers = {}) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok)
    throw new Error(
      'Setup request failed; verify deployment and server secrets',
    )
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (data?.ok === false) throw new Error('Telegram rejected setup')
  return data
}
try {
  const telegram = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`
  const me = await call(`${telegram}/getMe`, {})
  const project = process.env.SUPABASE_URL.replace(/\/$/, '')
  await call(`${telegram}/setWebhook`, {
    url: `${project}/functions/v1/telegram-reminders`,
    secret_token: secret,
    allowed_updates: ['message'],
    max_connections: 2,
  })
  await call(
    `${project}/rest/v1/rpc/telegram_configure`,
    { bot_name: me.result.username, site_url: process.env.FIREBOARD_APP_URL },
    {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  )
  console.log(
    'Telegram webhook and Fireboard bot settings configured. Finish the Vault/Cron setup in docs/telegram-reminders.md.',
  )
} catch {
  console.error(
    'Telegram setup failed. Check deployment, environment variables, and database migration. Secrets were not logged.',
  )
  process.exitCode = 1
}
