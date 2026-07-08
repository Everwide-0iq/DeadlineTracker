import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { requireSupabase } from '../../lib/supabase.ts'
import type {
  BoardText,
  BoardTextRow,
  CreateBoardTextInput,
  UpdateBoardTextInput,
} from './boardText.types.ts'

export type BoardTextRealtimeEvent =
  | { type: 'INSERT'; text: BoardText }
  | { type: 'UPDATE'; text: BoardText }
  | { type: 'DELETE'; id: string }

export function mapBoardTextFromRow(row: BoardTextRow): BoardText {
  return {
    id: row.id,
    content: row.content,
    boardScope: row.board_scope,
    projectId: row.project_id,
    x: row.x,
    y: row.y,
    w: row.w ?? 360,
    fontSize: row.font_size,
    fontFamily: row.font_family,
    color: row.color,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toInsertRow(input: CreateBoardTextInput, userId: string | null) {
  return {
    content: input.content,
    board_scope: input.boardScope,
    project_id: input.projectId,
    x: input.x,
    y: input.y,
    w: input.w,
    font_size: input.fontSize,
    font_family: input.fontFamily,
    color: input.color,
    created_by: userId,
  }
}

function toUpdateRow(input: UpdateBoardTextInput) {
  return {
    ...(input.content !== undefined ? { content: input.content } : {}),
    ...(input.x !== undefined ? { x: input.x } : {}),
    ...(input.y !== undefined ? { y: input.y } : {}),
    ...(input.w !== undefined ? { w: input.w } : {}),
    ...(input.fontSize !== undefined ? { font_size: input.fontSize } : {}),
    ...(input.fontFamily !== undefined ? { font_family: input.fontFamily } : {}),
    ...(input.color !== undefined ? { color: input.color } : {}),
  }
}

export async function fetchBoardTexts() {
  const { data, error } = await requireSupabase()
    .from('board_texts')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []).map(mapBoardTextFromRow)
}

export async function createBoardText(input: CreateBoardTextInput, userId: string | null) {
  const { data, error } = await requireSupabase()
    .from('board_texts')
    .insert(toInsertRow(input, userId))
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return mapBoardTextFromRow(data)
}

export async function updateBoardText(id: string, input: UpdateBoardTextInput) {
  const { data, error } = await requireSupabase()
    .from('board_texts')
    .update(toUpdateRow(input))
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return mapBoardTextFromRow(data)
}

export async function deleteBoardText(id: string) {
  const { error } = await requireSupabase().from('board_texts').delete().eq('id', id)

  if (error) {
    throw error
  }
}

export function subscribeToBoardTextChanges(onEvent: (event: BoardTextRealtimeEvent) => void) {
  const channel = requireSupabase()
    .channel('fireboard:board-texts')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'board_texts' },
      (payload: RealtimePostgresChangesPayload<BoardTextRow>) => {
        if (payload.eventType === 'DELETE') {
          const id = payload.old.id

          if (typeof id === 'string') {
            onEvent({ type: 'DELETE', id })
          }

          return
        }

        const text = mapBoardTextFromRow(payload.new)
        onEvent({ type: payload.eventType, text })
      },
    )
    .subscribe()

  return () => {
    void requireSupabase().removeChannel(channel)
  }
}
