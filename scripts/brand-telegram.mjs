import { readFile } from 'node:fs/promises'

// Supply the token through the process environment, never a CLI argument.
const token = process.env.TELEGRAM_BOT_TOKEN
const expectedUsername = process.env.TELEGRAM_BOT_USERNAME
if (!token || !expectedUsername) {
  console.error('Set TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME locally.')
  process.exit(1)
}

async function call(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error('Telegram request failed')
  const data = await response.json()
  if (!data.ok) throw new Error('Telegram rejected the request')
  return data.result
}

try {
  const bytes = await readFile(new URL('../public/brand/fireboard-telegram.jpg', import.meta.url))
  const bot = await call('getMe')
  if (bot.username.toLowerCase() !== expectedUsername.replace(/^@/, '').toLowerCase()) {
    throw new Error('Unexpected bot account')
  }
  const form = new FormData()
  form.set('photo', JSON.stringify({ type: 'static', photo: 'attach://avatar' }))
  form.set('avatar', new Blob([bytes], { type: 'image/jpeg' }), 'fireboard.jpg')
  await call('setMyProfilePhoto', form)
  const photos = await call('getUserProfilePhotos', new URLSearchParams({ user_id: String(bot.id), limit: '1' }))
  if (!photos.total_count) throw new Error('Profile photo verification failed')
  console.log(`Updated and verified the profile photo for @${bot.username}.`)
} catch {
  console.error('Bot branding failed. Verify the token, username and Telegram availability. No credentials were logged.')
  process.exitCode = 1
}
