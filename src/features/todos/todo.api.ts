import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { requireSupabase } from '../../lib/supabase.ts'
import type {
  CreateTodoBlockInput,
  CreateTodoItemInput,
  TodoBlock,
  TodoBlockGeometry,
  TodoBlockPosition,
  TodoBlockRow,
  TodoItem,
  TodoItemRow,
  UpdateTodoBlockInput,
  UpdateTodoItemInput,
} from './todo.types.ts'

export type TodoBlockRealtimeEvent =
  | { type: 'INSERT' | 'UPDATE'; block: TodoBlock }
  | { type: 'DELETE'; id: string }

export type TodoItemRealtimeEvent =
  | { type: 'INSERT' | 'UPDATE'; item: TodoItem }
  | { type: 'DELETE'; id: string }

export function mapTodoBlockFromRow(row: TodoBlockRow): TodoBlock {
  return {
    id: row.id,
    title: row.title,
    deadlineAt: row.deadline_at,
    boardScope: row.board_scope,
    projectId: row.project_id,
    x: row.x,
    y: row.y,
    w: row.w,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapTodoItemFromRow(row: TodoItemRow): TodoItem {
  return {
    id: row.id,
    blockId: row.block_id,
    title: row.title,
    description: row.description,
    isDone: row.is_done,
    isActive: row.is_active,
    activeBy: row.active_by,
    completedAt: row.completed_at,
    completedBy: row.completed_by,
    sortOrder: row.sort_order,
    imagePath: row.image_path,
    imageWidth: row.image_width,
    imageHeight: row.image_height,
    imageSize: row.image_size,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const toBlockInsertRow = (input: CreateTodoBlockInput, userId: string | null) => ({
  ...(input.id ? { id: input.id } : {}),
  title: input.title,
  deadline_at: input.deadlineAt,
  board_scope: input.boardScope,
  project_id: input.projectId,
  x: input.x,
  y: input.y,
  w: input.w ?? 420,
  created_by: userId,
})

const toBlockUpdateRow = (input: UpdateTodoBlockInput) => ({
  ...(input.title !== undefined ? { title: input.title } : {}),
  ...(input.deadlineAt !== undefined ? { deadline_at: input.deadlineAt } : {}),
  ...(input.x !== undefined ? { x: input.x } : {}),
  ...(input.y !== undefined ? { y: input.y } : {}),
  ...(input.w !== undefined ? { w: input.w } : {}),
})

const toItemInsertRow = (input: CreateTodoItemInput, userId: string | null) => ({
  ...(input.id ? { id: input.id } : {}),
  block_id: input.blockId,
  title: input.title,
  description: input.description ?? null,
  sort_order: input.sortOrder ?? 0,
  image_path: input.imagePath ?? null,
  image_width: input.imageWidth ?? null,
  image_height: input.imageHeight ?? null,
  image_size: input.imageSize ?? null,
  created_by: userId,
})

const toItemUpdateRow = (input: UpdateTodoItemInput) => ({
  ...(input.title !== undefined ? { title: input.title } : {}),
  ...(input.description !== undefined ? { description: input.description } : {}),
  ...(input.isDone !== undefined ? { is_done: input.isDone } : {}),
  ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
  ...(input.activeBy !== undefined ? { active_by: input.activeBy } : {}),
  ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
  ...(input.imagePath !== undefined ? { image_path: input.imagePath } : {}),
  ...(input.imageWidth !== undefined ? { image_width: input.imageWidth } : {}),
  ...(input.imageHeight !== undefined ? { image_height: input.imageHeight } : {}),
  ...(input.imageSize !== undefined ? { image_size: input.imageSize } : {}),
})

export async function fetchTodoData() {
  const supabase = requireSupabase()
  const [blocksResult, itemsResult] = await Promise.all([
    supabase.from('todo_blocks').select('*').order('created_at', { ascending: true }),
    supabase.from('todo_items').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
  ])

  if (blocksResult.error) throw blocksResult.error
  if (itemsResult.error) throw itemsResult.error

  return {
    blocks: (blocksResult.data ?? []).map(mapTodoBlockFromRow),
    items: (itemsResult.data ?? []).map(mapTodoItemFromRow),
  }
}

export async function createTodoBlock(input: CreateTodoBlockInput, userId: string | null) {
  const { data, error } = await requireSupabase().from('todo_blocks').insert(toBlockInsertRow(input, userId)).select('*').single()
  if (error) throw error
  return mapTodoBlockFromRow(data)
}

export async function updateTodoBlock(id: string, input: UpdateTodoBlockInput) {
  const { data, error } = await requireSupabase().from('todo_blocks').update(toBlockUpdateRow(input)).eq('id', id).select('*').single()
  if (error) throw error
  return mapTodoBlockFromRow(data)
}

export async function deleteTodoBlocks(ids: string[]) {
  const uniqueIds = Array.from(new Set(ids))
  if (uniqueIds.length === 0) return
  const { error } = await requireSupabase().from('todo_blocks').delete().in('id', uniqueIds)
  if (error) throw error
}

export async function updateTodoBlockPositions(updates: TodoBlockPosition[]) {
  const { data, error } = await requireSupabase().rpc('update_todo_block_positions', { payload: updates })
  if (error) throw error
  return (data ?? []).map(mapTodoBlockFromRow)
}

export async function updateTodoBlockGeometries(updates: TodoBlockGeometry[]) {
  const { data, error } = await requireSupabase().rpc('update_todo_block_geometries', { payload: updates })
  if (error) throw error
  return (data ?? []).map(mapTodoBlockFromRow)
}

export async function createTodoItem(input: CreateTodoItemInput, userId: string | null) {
  const { data, error } = await requireSupabase().from('todo_items').insert(toItemInsertRow(input, userId)).select('*').single()
  if (error) throw error
  return mapTodoItemFromRow(data)
}

export async function updateTodoItem(id: string, input: UpdateTodoItemInput) {
  const { data, error } = await requireSupabase().from('todo_items').update(toItemUpdateRow(input)).eq('id', id).select('*').single()
  if (error) throw error
  return mapTodoItemFromRow(data)
}

export async function deleteTodoItem(id: string) {
  const { error } = await requireSupabase().from('todo_items').delete().eq('id', id)
  if (error) throw error
}

export async function reorderTodoItems(blockId: string, orderedIds: string[]) {
  const payload = orderedIds.map((id, index) => ({ id, sort_order: (index + 1) * 1000 }))
  const { data, error } = await requireSupabase().rpc('reorder_todo_items', {
    target_block_id: blockId,
    payload,
  })
  if (error) throw error
  return (data ?? []).map(mapTodoItemFromRow)
}

export function subscribeToTodoChanges(
  onBlockEvent: (event: TodoBlockRealtimeEvent) => void,
  onItemEvent: (event: TodoItemRealtimeEvent) => void,
) {
  const supabase = requireSupabase()
  const channel = supabase
    .channel('fireboard:todos')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'todo_blocks' }, (payload: RealtimePostgresChangesPayload<TodoBlockRow>) => {
      if (payload.eventType === 'DELETE') {
        if (typeof payload.old.id === 'string') onBlockEvent({ type: 'DELETE', id: payload.old.id })
        return
      }
      onBlockEvent({ type: payload.eventType, block: mapTodoBlockFromRow(payload.new) })
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'todo_items' }, (payload: RealtimePostgresChangesPayload<TodoItemRow>) => {
      if (payload.eventType === 'DELETE') {
        if (typeof payload.old.id === 'string') onItemEvent({ type: 'DELETE', id: payload.old.id })
        return
      }
      onItemEvent({ type: payload.eventType, item: mapTodoItemFromRow(payload.new) })
    })
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}

