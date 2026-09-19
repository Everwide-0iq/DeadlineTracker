export const ABSOLUTE_REMINDER_SLOT = 9999
export const MIN_REMINDER_OFFSET = -30 * 24 * 60
export const MAX_REMINDER_OFFSET = 3 * 24 * 60
export const MAX_CARD_REMINDERS = 8
export const MAX_REMINDER_NOTE_LENGTH = 1000
export const REMINDER_PRESETS = [-2880, -1440, -60, -30, 0, 30] as const

export function isReminderOffset(value: number) {
  return (
    Number.isInteger(value) &&
    value >= MIN_REMINDER_OFFSET &&
    value <= MAX_REMINDER_OFFSET
  )
}

export function offsetLabel(minutes: number, language: string) {
  const ru = language === 'ru'
  if (minutes === 0) return ru ? 'В срок' : 'On time'
  const absolute = Math.abs(minutes)
  const unit =
    absolute % 1440 === 0 ? 'day' : absolute % 60 === 0 ? 'hour' : 'minute'
  const value = absolute / (unit === 'day' ? 1440 : unit === 'hour' ? 60 : 1)
  const duration = new Intl.NumberFormat(ru ? 'ru-RU' : 'en-GB', {
    style: 'unit',
    unit,
    unitDisplay: 'long',
  }).format(value)
  return ru
    ? `${minutes < 0 ? 'За' : 'Через'} ${duration}`
    : `${duration} ${minutes < 0 ? 'before' : 'after'}`
}
