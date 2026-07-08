import type { CardStatus } from './card.types.ts'
import type { Language } from '../i18n/i18n.types.ts'
import { translations } from '../i18n/translations.ts'

const minuteMs = 60 * 1000
const hourMs = 60 * minuteMs
const dayMs = 24 * hourMs

const pad = (value: number) => String(value).padStart(2, '0')

function formatPositiveDuration(durationMs: number, language: Language) {
  const t = translations[language].countdown
  const days = Math.floor(durationMs / dayMs)
  const hours = Math.floor((durationMs % dayMs) / hourMs)
  const minutes = Math.floor((durationMs % hourMs) / minuteMs)

  if (days > 0) {
    return `${days}${t.day} ${pad(hours)}${t.hour}`
  }

  return `${hours}${t.hour} ${pad(minutes)}${t.minute}`
}

export function formatCountdown(deadlineAt: string | Date, status: CardStatus, now = Date.now(), language: Language = 'ru') {
  const t = translations[language].countdown

  if (status === 'done') {
    return t.done
  }

  const deadlineTime = new Date(deadlineAt).getTime()
  const diff = deadlineTime - now

  if (Number.isNaN(deadlineTime)) {
    return t.invalid
  }

  if (diff < 0) {
    return t.overdue(formatPositiveDuration(Math.abs(diff), language))
  }

  return formatPositiveDuration(diff, language)
}
