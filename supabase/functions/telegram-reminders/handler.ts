import {
  MAX_REMINDER_NOTE_LENGTH,
  offsetLabel,
} from '../../../shared/reminders.ts'

type Environment = {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  TELEGRAM_BOT_TOKEN: string
  TELEGRAM_WEBHOOK_SECRET: string
  REMINDER_CRON_SECRET: string
}
type Job = { id: string; lease: string }
export type Delivery = {
  kind?: 'card'
  chatId: string
  cardId: string
  title: string
  project: string | null
  projectId: string | null
  boardScope: string
  deadlineAt: string | null
  dueAt: string
  slot: number
  timezone: string
  language: string
  appUrl: string
  note?: string
}
export type TestDelivery = { kind: 'test'; chatId: string; language: string }

export function reminderMessage(job: Delivery | TestDelivery) {
  const ru = job.language === 'ru'
  if (job.kind === 'test')
    return {
      chat_id: job.chatId,
      text: ru
        ? 'Fireboard · Тестовое уведомление\n\nTelegram подключён, серверная очередь работает. Это проверка доставки, твои карточки не изменились.'
        : 'Fireboard · Test notification\n\nTelegram is connected and the server queue is working. This is a delivery check; your cards are unchanged.',
    }
  const when = new Intl.DateTimeFormat(ru ? 'ru-RU' : 'en-GB', {
    timeZone: job.timezone,
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  const timing =
    job.slot === 9999
      ? ru
        ? 'Напоминание'
        : 'Reminder'
      : `${offsetLabel(job.slot, job.language)}${job.slot === 0 ? '' : ru ? (job.slot < 0 ? ' до дедлайна' : ' после дедлайна') : ' deadline'}`
  const url = new URL(job.appUrl)
  url.searchParams.set('card', job.cardId)
  const title = job.title.slice(0, 500)
  const note = Array.from(job.note ?? '')
    .slice(0, MAX_REMINDER_NOTE_LENGTH)
    .join('')
    .trim()
  const displayedTime =
    job.slot === 9999 ? job.dueAt : (job.deadlineAt ?? job.dueAt)
  const board =
    job.boardScope === 'personal'
      ? ru
        ? 'Личная доска'
        : 'Personal board'
      : (job.project ?? 'Fireboard').slice(0, 150)
  return {
    chat_id: job.chatId,
    text: `Fireboard · ${timing}\n\n${title}\n${board}${note ? `\n\n${note}` : ''}\n\n${when.format(new Date(displayedTime))} (${job.timezone})`,
    link_preview_options: { is_disabled: true },
    reply_markup: {
      inline_keyboard: [
        [{ text: ru ? 'Открыть карточку' : 'Open card', url: url.toString() }],
      ],
    },
    // Deliberately no parse_mode: user text is never interpreted as Telegram markup.
  }
}

function sameSecret(received: string | null, expected: string) {
  if (!received || !expected || received.length !== expected.length)
    return false
  let diff = 0
  for (let i = 0; i < expected.length; i++)
    diff |= received.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

export function createTelegramHandler(
  env: Environment,
  fetcher: typeof fetch = fetch,
) {
  const rpc = async <T>(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<T> => {
    const response = await fetcher(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) throw new Error('Database operation failed')
    const body = await response.text()
    return body ? (JSON.parse(body) as T) : (undefined as T)
  }
  const send = async (payload: object) => {
    try {
      const response = await fetcher(
        `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(8_000),
        },
      )
      const body = (await response.json()) as {
        ok?: boolean
        error_code?: number
        parameters?: { retry_after?: number }
      }
      if (response.ok && body.ok === true) return { outcome: 'sent', retry: 0 }
      if (body.error_code === 429)
        return {
          outcome: 'retry',
          retry: Number.isFinite(body.parameters?.retry_after)
            ? body.parameters!.retry_after!
            : 60,
        }
      if (body.error_code === 403) return { outcome: 'blocked', retry: 0 }
      return {
        outcome: response.status >= 500 ? 'unknown' : 'failed',
        retry: 0,
      }
    } catch {
      // Telegram has no idempotency key. Timeout may mean it sent the message.
      return { outcome: 'unknown', retry: 0 }
    }
  }
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST')
      return new Response('Method not allowed', { status: 405 })
    if (
      Object.values(env).some((value) => !value) ||
      env.TELEGRAM_WEBHOOK_SECRET.length < 32 ||
      env.REMINDER_CRON_SECRET.length < 32
    )
      return new Response('Reminder service is not configured', { status: 503 })
    const isCron = sameSecret(
      request.headers.get('X-Fireboard-Cron-Secret'),
      env.REMINDER_CRON_SECRET,
    )
    const isTelegram = sameSecret(
      request.headers.get('X-Telegram-Bot-Api-Secret-Token'),
      env.TELEGRAM_WEBHOOK_SECRET,
    )
    if (!isCron && !isTelegram)
      return new Response('Unauthorized', { status: 401 })
    try {
      if (isCron) {
        const jobs = await rpc<Job[]>('telegram_claim_reminders')
        for (const job of jobs) {
          const delivery = await rpc<Delivery | TestDelivery | null>(
            'telegram_prepare_reminder',
            { job_id: job.id, claim_token: job.lease },
          )
          if (!delivery) continue
          const result = await send(reminderMessage(delivery))
          await rpc('telegram_complete_reminder', {
            job_id: job.id,
            claim_token: job.lease,
            outcome: result.outcome,
            retry_seconds: Math.ceil(result.retry),
          })
          // Stay below Telegram's per-chat rate even when several reminders coincide.
          if (jobs.length > 1)
            await new Promise((resolve) => setTimeout(resolve, 1100))
        }
      } else {
        if (Number(request.headers.get('content-length')) > 65_536)
          return new Response('Too large', { status: 413 })
        const body = await request.text()
        if (body.length > 65_536)
          return new Response('Too large', { status: 413 })
        let update: {
          message?: {
            chat?: { id?: number; type?: string }
            from?: { id?: number; is_bot?: boolean }
            text?: string
          }
        }
        try {
          update = JSON.parse(body)
        } catch {
          return new Response('Invalid JSON', { status: 400 })
        }
        const message = update?.message
        const chat = message?.chat
        if (
          chat?.type !== 'private' ||
          !Number.isSafeInteger(chat.id) ||
          chat.id! <= 0 ||
          message?.from?.id !== chat.id ||
          message?.from?.is_bot
        )
          return new Response('OK')
        const token =
          typeof message?.text === 'string'
            ? /^\/start(?:@[A-Za-z0-9_]+)? ([a-f0-9]{64})$/.exec(
                message.text,
              )?.[1]
            : undefined
        if (token) {
          const linked = await rpc<boolean>('telegram_finish_link', {
            raw_token: token,
            telegram_chat: chat.id,
          })
          if (linked)
            await send({
              chat_id: chat.id,
              text: 'Fireboard: Telegram подключён. Вернись к карточке и выбери время напоминания.\n\nTelegram connected. Return to your card to schedule a reminder.',
            })
        }
      }
      return new Response('OK')
    } catch {
      // Never print request bodies, linking tokens, Telegram chat IDs or bot URLs.
      return new Response('Reminder service temporarily unavailable', {
        status: 503,
      })
    }
  }
}
