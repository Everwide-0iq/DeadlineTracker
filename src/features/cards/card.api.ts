import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { requireSupabase } from '../../lib/supabase.ts'
import type { Card, CardRow, CreateCardInput, UpdateCardInput } from './card.types.ts'

type CardPositionUpdate = Pick<Card, 'id' | 'x' | 'y'>
type CardGeometryUpdate = Pick<Card, 'h' | 'id' | 'w' | 'x' | 'y'>

export type CardRealtimeEvent =
  | { type: 'INSERT'; card: Card }
  | { type: 'UPDATE'; card: Card }
  | { type: 'DELETE'; id: string }

export type CardRealtimeStatus = 'idle' | 'connecting' | 'online' | 'error' | 'closed'

const defaultCardWidth = 340
const defaultCardHeight = 190

export function mapCardFromRow(row: CardRow): Card {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    imageHeight: row.image_height ?? null,
    imagePath: row.image_path ?? null,
    imageSize: row.image_size ?? null,
    imageWidth: row.image_width ?? null,
    deadlineAt: row.deadline_at,
    status: row.status,
    isActive: row.is_active ?? false,
    activeBy: row.active_by ?? null,
    completedAt: row.completed_at ?? null,
    completedBy: row.completed_by ?? null,
    boardScope: row.board_scope ?? 'shared',
    projectId: row.project_id ?? null,
    x: row.x,
    y: row.y,
    w: row.w,
    h: row.h,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toInsertRow(input: CreateCardInput, userId: string | null) {
  return {
    ...(input.id ? { id: input.id } : {}),
    title: input.title,
    description: input.description,
    image_height: input.imageHeight ?? null,
    image_path: input.imagePath ?? null,
    image_size: input.imageSize ?? null,
    image_width: input.imageWidth ?? null,
    deadline_at: input.deadlineAt,
    board_scope: input.boardScope,
    project_id: input.projectId,
    status: input.status ?? 'todo',
    is_active: input.isActive ?? false,
    active_by: input.activeBy ?? null,
    x: input.x,
    y: input.y,
    w: input.w ?? defaultCardWidth,
    h: input.h ?? defaultCardHeight,
    created_by: userId,
  }
}

function toUpdateRow(input: UpdateCardInput) {
  return {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.imageHeight !== undefined ? { image_height: input.imageHeight } : {}),
    ...(input.imagePath !== undefined ? { image_path: input.imagePath } : {}),
    ...(input.imageSize !== undefined ? { image_size: input.imageSize } : {}),
    ...(input.imageWidth !== undefined ? { image_width: input.imageWidth } : {}),
    ...(input.deadlineAt !== undefined ? { deadline_at: input.deadlineAt } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
    ...(input.activeBy !== undefined ? { active_by: input.activeBy } : {}),
    ...(input.x !== undefined ? { x: input.x } : {}),
    ...(input.y !== undefined ? { y: input.y } : {}),
    ...(input.w !== undefined ? { w: input.w } : {}),
    ...(input.h !== undefined ? { h: input.h } : {}),
  }
}

export async function fetchCards() {
  const { data, error } = await requireSupabase()
    .from('cards')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []).map(mapCardFromRow)
}

export async function createCard(input: CreateCardInput, userId: string | null) {
  const { data, error } = await requireSupabase()
    .from('cards')
    .insert(toInsertRow(input, userId))
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return mapCardFromRow(data)
}

export async function updateCard(id: string, input: UpdateCardInput) {
  const { data, error } = await requireSupabase()
    .from('cards')
    .update(toUpdateRow(input))
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return mapCardFromRow(data)
}

export async function updateCardPositions(updates: CardPositionUpdate[]) {
  const { data, error } = await requireSupabase().rpc('update_card_positions', {
    payload: updates,
  })

  if (error) {
    throw error
  }

  return (data ?? []).map(mapCardFromRow)
}

export async function updateCardGeometries(updates: CardGeometryUpdate[]) {
  const { data, error } = await requireSupabase().rpc('update_card_geometries', {
    payload: updates,
  })

  if (error) {
    throw error
  }

  return (data ?? []).map(mapCardFromRow)
}

export async function deleteCard(id: string) {
  return deleteCards([id])
}

export async function deleteCards(ids: string[]) {
  const uniqueIds = Array.from(new Set(ids))

  if (uniqueIds.length === 0) {
    return
  }

  const { error } = await requireSupabase().from('cards').delete().in('id', uniqueIds)

  if (error) {
    throw error
  }
}

export function subscribeToCardChanges(
  onEvent: (event: CardRealtimeEvent) => void,
  onStatus: (status: CardRealtimeStatus) => void,
) {
  const channel = requireSupabase()
    .channel('fireboard:cards')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'cards' },
      (payload: RealtimePostgresChangesPayload<CardRow>) => {
        if (payload.eventType === 'DELETE') {
          const id = payload.old.id

          if (typeof id === 'string') {
            onEvent({ type: 'DELETE', id })
          }

          return
        }

        const card = mapCardFromRow(payload.new)
        onEvent({ type: payload.eventType, card })
      },
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        onStatus('online')
        return
      }

      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onStatus('error')
        return
      }

      if (status === 'CLOSED') {
        onStatus('closed')
      }
    })

  onStatus('connecting')

  return () => {
    void requireSupabase().removeChannel(channel)
  }
}
