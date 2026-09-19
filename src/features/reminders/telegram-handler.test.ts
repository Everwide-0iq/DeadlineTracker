import { describe, expect, it, vi } from 'vitest'
import {
  createTelegramHandler,
  reminderMessage,
  type Delivery,
} from '../../../supabase/functions/telegram-reminders/handler.ts'

const env = {
  SUPABASE_URL: 'https://db.example.invalid',
  SUPABASE_SERVICE_ROLE_KEY: 'test-only',
  TELEGRAM_BOT_TOKEN: 'test-only',
  TELEGRAM_WEBHOOK_SECRET: 'webhook-test-only'.repeat(3),
  REMINDER_CRON_SECRET: 'cron-test-only'.repeat(3),
}
const delivery: Delivery = {
  chatId: '123',
  cardId: 'card-id',
  title: '<b>Not markup</b>',
  project: 'Work',
  projectId: 'project',
  boardScope: 'shared',
  deadlineAt: '2026-09-19T12:00:00Z',
  dueAt: '2026-09-19T11:30:00Z',
  slot: -30,
  timezone: 'UTC',
  language: 'en',
  appUrl: 'https://app.example.invalid',
}
describe('Telegram server boundary', () => {
  it('rejects unauthorized calls without touching external services', async () => {
    const fetcher = vi.fn()
    const handler = createTelegramHandler(env, fetcher)
    expect(
      (await handler(new Request('https://worker.invalid', { method: 'POST' })))
        .status,
    ).toBe(401)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('does not link group chats or mismatched sender IDs', async () => {
    const fetcher = vi.fn()
    const handler = createTelegramHandler(env, fetcher)
    for (const chat of [
      { id: -123, type: 'group' },
      { id: 123, type: 'private' },
    ]) {
      await handler(
        new Request('https://worker.invalid', {
          method: 'POST',
          headers: {
            'X-Telegram-Bot-Api-Secret-Token': env.TELEGRAM_WEBHOOK_SECRET,
          },
          body: JSON.stringify({
            message: {
              chat,
              from: { id: 999 },
              text: '/start ' + 'a'.repeat(64),
            },
          }),
        }),
      )
    }
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('links only a valid private start token', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(true))
      .mockResolvedValueOnce(Response.json({ ok: true }))
    const handler = createTelegramHandler(env, fetcher)
    expect(
      (
        await handler(
          new Request('https://worker.invalid', {
            method: 'POST',
            headers: {
              'X-Telegram-Bot-Api-Secret-Token': env.TELEGRAM_WEBHOOK_SECRET,
            },
            body: JSON.stringify({
              message: {
                chat: { id: 123, type: 'private' },
                from: { id: 123 },
                text: '/start ' + 'a'.repeat(64),
              },
            }),
          }),
        )
      ).status,
    ).toBe(200)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(String(fetcher.mock.calls[0][0])).toContain('telegram_finish_link')
  })
  it('sends plain text and a card link, never description or HTML mode', () => {
    const message = reminderMessage(delivery)
    expect(message.text).toContain('<b>Not markup</b>')
    expect(message).not.toHaveProperty('parse_mode')
    expect(message.reply_markup?.inline_keyboard[0][0].url).toBe(
      'https://app.example.invalid/?card=card-id',
    )
  })
  it('keeps the custom reminder time when a deadline is added later', () => {
    const message = reminderMessage({ ...delivery, slot: 9999 })
    expect(message.text).toContain('11:30')
    expect(message.text).not.toContain('12:00')
  })
  it('formats day offsets without claiming a 30-minute deadline', () => {
    expect(reminderMessage({ ...delivery, slot: -2880 }).text).toContain(
      '2 days before deadline',
    )
    expect(
      reminderMessage({ ...delivery, slot: -1440, language: 'ru' }).text,
    ).toContain('За 1 день до дедлайна')
  })
  it('sends a separate test message without any card data', () => {
    const message = reminderMessage({
      kind: 'test',
      chatId: '123',
      language: 'ru',
    })
    expect(message.text).toContain('Тестовое уведомление')
    expect(message).not.toHaveProperty('reply_markup')
    expect(message.text).not.toContain(delivery.title)
  })
  it.each(['sent', 'retry', 'blocked', 'unknown'] as const)(
    'handles %s delivery without an unconditional retry',
    async (outcome) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json([{ id: 'job', lease: 'lease' }]))
        .mockResolvedValueOnce(Response.json(delivery))
      if (outcome === 'unknown')
        fetcher.mockRejectedValueOnce(new Error('timeout'))
      else
        fetcher.mockResolvedValueOnce(
          Response.json(
            outcome === 'sent'
              ? { ok: true }
              : outcome === 'retry'
                ? {
                    ok: false,
                    error_code: 429,
                    parameters: { retry_after: 120 },
                  }
                : { ok: false, error_code: 403 },
            {
              status:
                outcome === 'sent' ? 200 : outcome === 'retry' ? 429 : 403,
            },
          ),
        )
      fetcher.mockResolvedValueOnce(new Response(''))
      const result = await createTelegramHandler(
        env,
        fetcher,
      )(
        new Request('https://worker.invalid', {
          method: 'POST',
          headers: { 'X-Fireboard-Cron-Secret': env.REMINDER_CRON_SECRET },
        }),
      )
      expect(result.status).toBe(200)
      expect(JSON.parse(String(fetcher.mock.calls[3][1]?.body)).outcome).toBe(
        outcome,
      )
      expect(fetcher).toHaveBeenCalledTimes(4)
    },
  )
})
