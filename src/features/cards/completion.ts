import type { Language } from '../i18n/i18n.types.ts'

const localeByLanguage: Record<Language, string> = {
  en: 'en-US',
  ru: 'ru-RU',
}

export function formatCompletionDate(
  completedAt: string | null,
  language: Language,
  timeZone?: string,
) {
  if (!completedAt) {
    return null
  }

  const date = new Date(completedAt)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return new Intl.DateTimeFormat(localeByLanguage[language], {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...(timeZone ? { timeZone } : {}),
  }).format(date)
}
