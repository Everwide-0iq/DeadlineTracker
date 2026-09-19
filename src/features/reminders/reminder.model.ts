import type { Json } from '../../lib/supabase.ts'
import {
  isReminderOffset,
  REMINDER_PRESETS,
} from '../../../shared/reminders.ts'

export type Reminder = {
  id: string
  cardId: string
  slot: number
  dueAt: string
  status: string
  sentAt: string | null
}
export type ReminderState = {
  configured: boolean
  schedulerReady: boolean
  connected: boolean
  botUsername: string | null
  reminders: Reminder[]
  testDelivery: {
    status: string
    requestedAt: string
    sentAt: string | null
  } | null
  testAvailableAt: string | null
}
export const reminderOffsets = REMINDER_PRESETS
export function parseReminderState(value: Json): ReminderState {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid reminder state')
  if (
    typeof value.configured !== 'boolean' ||
    typeof value.schedulerReady !== 'boolean' ||
    typeof value.connected !== 'boolean' ||
    !Array.isArray(value.reminders)
  )
    throw new Error('Invalid reminder state')
  const reminders = value.reminders.map((row) => {
    if (
      !row ||
      typeof row !== 'object' ||
      Array.isArray(row) ||
      typeof row.id !== 'string' ||
      typeof row.cardId !== 'string' ||
      typeof row.slot !== 'number' ||
      !(isReminderOffset(row.slot) || row.slot === 9999) ||
      typeof row.dueAt !== 'string' ||
      !Number.isFinite(Date.parse(row.dueAt)) ||
      typeof row.status !== 'string'
    )
      throw new Error('Invalid reminder')
    return {
      id: row.id,
      cardId: row.cardId,
      slot: row.slot,
      dueAt: row.dueAt,
      status: row.status,
      sentAt: typeof row.sentAt === 'string' ? row.sentAt : null,
    }
  })
  return {
    testDelivery:
      value.testDelivery &&
      typeof value.testDelivery === 'object' &&
      !Array.isArray(value.testDelivery) &&
      typeof value.testDelivery.status === 'string' &&
      typeof value.testDelivery.requestedAt === 'string'
        ? {
            status: value.testDelivery.status,
            requestedAt: value.testDelivery.requestedAt,
            sentAt:
              typeof value.testDelivery.sentAt === 'string'
                ? value.testDelivery.sentAt
                : null,
          }
        : null,
    testAvailableAt:
      typeof value.testAvailableAt === 'string' ? value.testAvailableAt : null,
    configured: value.configured,
    schedulerReady: value.schedulerReady,
    connected: value.connected,
    botUsername:
      typeof value.botUsername === 'string' ? value.botUsername : null,
    reminders,
  }
}
export const reminderTime = (deadline: string, offset: number) =>
  new Date(Date.parse(deadline) + offset * 60_000).toISOString()
export function toLocalInput(value: string) {
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}
export function fromLocalInput(value: string) {
  const date = new Date(value)
  if (
    !Number.isFinite(date.getTime()) ||
    toLocalInput(date.toISOString()) !== value
  )
    throw new Error('Invalid local time')
  return date.toISOString()
}
