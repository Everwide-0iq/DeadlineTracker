import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { requireSupabase } from '../../lib/supabase.ts'
import type { CardLink, CardLinkRow, CreateCardLinkInput } from './cardLink.types.ts'

export type CardLinkRealtimeEvent =
  | { type: 'INSERT'; link: CardLink }
  | { type: 'UPDATE'; link: CardLink }
  | { type: 'DELETE'; id: string }

export function mapCardLinkFromRow(row: CardLinkRow): CardLink {
  return {
    id: row.id,
    fromCardId: row.from_card_id,
    fromTodoBlockId: row.from_todo_block_id ?? null,
    fromSide: row.from_side,
    toCardId: row.to_card_id,
    toTodoBlockId: row.to_todo_block_id ?? null,
    toSide: row.to_side,
    boardScope: row.board_scope,
    projectId: row.project_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toInsertRow(input: CreateCardLinkInput, userId: string | null) {
  return {
    from_card_id: input.from.kind === 'card' ? input.from.id : null,
    from_todo_block_id: input.from.kind === 'todo' ? input.from.id : null,
    from_side: input.from.side,
    to_card_id: input.to.kind === 'card' ? input.to.id : null,
    to_todo_block_id: input.to.kind === 'todo' ? input.to.id : null,
    to_side: input.to.side,
    board_scope: input.boardScope,
    project_id: input.projectId,
    created_by: userId,
  }
}

export async function fetchCardLinks() {
  const { data, error } = await requireSupabase()
    .from('card_links')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []).map(mapCardLinkFromRow)
}

export async function createCardLink(input: CreateCardLinkInput, userId: string | null) {
  const { data, error } = await requireSupabase()
    .from('card_links')
    .insert(toInsertRow(input, userId))
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return mapCardLinkFromRow(data)
}

export async function deleteCardLink(id: string) {
  const { error } = await requireSupabase().from('card_links').delete().eq('id', id)

  if (error) {
    throw error
  }
}

export async function deleteCardLinksForCard(cardId: string) {
  const { error } = await requireSupabase()
    .from('card_links')
    .delete()
    .or(`from_card_id.eq.${cardId},to_card_id.eq.${cardId}`)

  if (error) {
    throw error
  }
}

export async function deleteCardLinksForTodoBlock(blockId: string) {
  const { error } = await requireSupabase()
    .from('card_links')
    .delete()
    .or(`from_todo_block_id.eq.${blockId},to_todo_block_id.eq.${blockId}`)

  if (error) throw error
}

export function subscribeToCardLinkChanges(onEvent: (event: CardLinkRealtimeEvent) => void) {
  const channel = requireSupabase()
    .channel('fireboard:card-links')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'card_links' },
      (payload: RealtimePostgresChangesPayload<CardLinkRow>) => {
        if (payload.eventType === 'DELETE') {
          const id = payload.old.id

          if (typeof id === 'string') {
            onEvent({ type: 'DELETE', id })
          }

          return
        }

        const link = mapCardLinkFromRow(payload.new)
        onEvent({ type: payload.eventType, link })
      },
    )
    .subscribe()

  return () => {
    void requireSupabase().removeChannel(channel)
  }
}
