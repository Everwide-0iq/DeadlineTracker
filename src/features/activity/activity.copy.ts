import type { ActivityAction, ActivityEvent } from './activity.types.ts'

const actionLabels: Record<ActivityAction, { detail: string; short: string }> = {
  card_completed: { detail: 'закрыл карточку', short: 'Карточка закрыта' },
  card_created: { detail: 'создал карточку', short: 'Новая карточка' },
  card_deadline_changed: { detail: 'перенёс дедлайн', short: 'Дедлайн перенесён' },
  card_deleted: { detail: 'удалил карточку', short: 'Карточка удалена' },
  card_moved: { detail: 'переместил карточку', short: 'Карточка перемещена' },
  card_reopened: { detail: 'вернул карточку в работу', short: 'Карточка снова в работе' },
  card_updated: { detail: 'обновил карточку', short: 'Карточка обновлена' },
  link_created: { detail: 'создал связь', short: 'Связь создана' },
  link_deleted: { detail: 'удалил связь', short: 'Связь удалена' },
  project_created: { detail: 'создал проект', short: 'Новый проект' },
  project_deleted: { detail: 'удалил проект', short: 'Проект удалён' },
  project_updated: { detail: 'обновил проект', short: 'Проект обновлён' },
}

export function getActivityActor(event: ActivityEvent, userId: string | null) {
  if (event.actorId && event.actorId === userId) {
    return 'Ты'
  }

  return event.actorLabel || 'Участник'
}

export function getActivitySentence(event: ActivityEvent, userId: string | null) {
  const actor = getActivityActor(event, userId)
  const action = actionLabels[event.action]
  const title = event.entityTitle ? ` «${event.entityTitle}»` : ''

  return `${actor} ${action.detail}${title}`
}

export function getActivityToast(event: ActivityEvent, userId: string | null) {
  const action = actionLabels[event.action]
  const actor = getActivityActor(event, userId)

  return {
    description: getActivitySentence(event, userId),
    title: actor === 'Ты' ? action.short : `${action.short}: ${actor}`,
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
