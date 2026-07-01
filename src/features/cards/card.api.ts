import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { requireSupabase } from '../../lib/supabase.ts'
import type { Card, CardRow, CreateCardInput, UpdateCardInput } from './card.types.ts'

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
    deadlineAt: row.deadline_at,
    status: row.status,
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
    title: input.title,
    description: input.description,
    deadline_at: input.deadlineAt,
    board_scope: input.boardScope,
    project_id: input.projectId,
    status: input.status ?? 'todo',
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
    ...(input.deadlineAt !== undefined ? { deadline_at: input.deadlineAt } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
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

export async function deleteCard(id: string) {
  const { error } = await requireSupabase().from('cards').delete().eq('id', id)

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
