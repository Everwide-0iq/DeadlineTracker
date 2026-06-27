import type { CardStatus } from './card.types.ts'

const minuteMs = 60 * 1000
const hourMs = 60 * minuteMs
const dayMs = 24 * hourMs

const pad = (value: number) => String(value).padStart(2, '0')

function formatPositiveDuration(durationMs: number) {
  const days = Math.floor(durationMs / dayMs)
  const hours = Math.floor((durationMs % dayMs) / hourMs)
  const minutes = Math.floor((durationMs % hourMs) / minuteMs)

  if (days > 0) {
    return `${days}д ${pad(hours)}ч`
  }

  return `${hours}ч ${pad(minutes)}м`
}

export function formatCountdown(deadlineAt: string | Date, status: CardStatus, now = Date.now()) {
  if (status === 'done') {
    return 'Готово'
  }

  const deadlineTime = new Date(deadlineAt).getTime()
  const diff = deadlineTime - now

  if (Number.isNaN(deadlineTime)) {
    return 'Неверная дата'
  }

  if (diff < 0) {
    return `Просрочено на ${formatPositiveDuration(Math.abs(diff))}`
  }

  return formatPositiveDuration(diff)
}
