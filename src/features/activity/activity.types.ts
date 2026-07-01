import type { BoardScope } from '../cards/card.types.ts'

export type ActivityAction =
  | 'card_created'
  | 'card_updated'
  | 'card_deadline_changed'
  | 'card_completed'
  | 'card_reopened'
  | 'card_moved'
  | 'card_deleted'
  | 'project_created'
  | 'project_updated'
  | 'project_deleted'
  | 'link_created'
  | 'link_deleted'

export type ActivityEntityType = 'card' | 'link' | 'project'

export type ActivityEvent = {
  id: string
  action: ActivityAction
  actorId: string | null
  actorLabel: string
  boardScope: BoardScope
  cardId: string | null
  createdAt: string
  entityId: string
  entityTitle: string
  entityType: ActivityEntityType
  metadata: Record<string, unknown>
  projectId: string | null
}

export type ActivityEventRow = {
  id: string
  action: ActivityAction
  actor_id: string | null
  actor_label: string
  board_scope: BoardScope
  card_id: string | null
  created_at: string
  entity_id: string
  entity_title: string
  entity_type: ActivityEntityType
  metadata: unknown
  project_id: string | null
}
