import type { Language } from '../i18n/i18n.types.ts'
import { translations } from '../i18n/translations.ts'
import type { ActivityEvent } from './activity.types.ts'

export function getActivityActor(event: ActivityEvent, userId: string | null, language: Language = 'ru') {
  const t = translations[language]

  if (event.actorId && event.actorId === userId) {
    return t.activity.actorYou
  }

  return event.actorLabel || t.activity.unknownActor
}

export function getActivitySentence(event: ActivityEvent, userId: string | null, language: Language = 'ru') {
  const t = translations[language]
  const actor = getActivityActor(event, userId, language)
  const action = t.activity.action[event.action]
  const title = event.entityTitle ? ` "${event.entityTitle}"` : ''

  return `${actor} ${action.detail}${title}`
}

export function getActivityToast(event: ActivityEvent, userId: string | null, language: Language = 'ru') {
  const t = translations[language]
  const action = t.activity.action[event.action]
  const actor = getActivityActor(event, userId, language)

  return {
    description: getActivitySentence(event, userId, language),
    title: actor === t.activity.actorYou ? action.short : `${action.short}: ${actor}`,
  }
}

export function getActivityTone(event: ActivityEvent) {
  if (event.action === 'card_completed') {
    return 'success'
  }

  if (event.action === 'card_deleted' || event.action === 'project_deleted' || event.action === 'link_deleted') {
    return 'danger'
  }

  return 'info'
}
