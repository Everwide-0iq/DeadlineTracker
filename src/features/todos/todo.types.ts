import type { BoardScope } from '../cards/card.types.ts'

export type TodoBlock = {
  id: string
  title: string
  deadlineAt: string | null
  boardScope: BoardScope
  projectId: string | null
  x: number
  y: number
  w: number
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export type TodoBlockRow = {
  id: string
  title: string
  deadline_at: string | null
  board_scope: BoardScope
  project_id: string | null
  x: number
  y: number
  w: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export type TodoItem = {
  id: string
  blockId: string
  title: string
  description: string | null
  isDone: boolean
  isActive: boolean
  activeBy: string | null
  completedAt: string | null
  completedBy: string | null
  sortOrder: number
  imagePath: string | null
  imageWidth: number | null
  imageHeight: number | null
  imageSize: number | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export type TodoItemRow = {
  id: string
  block_id: string
  title: string
  description: string | null
  is_done: boolean
  is_active: boolean
  active_by: string | null
  completed_at: string | null
  completed_by: string | null
  sort_order: number
  image_path: string | null
  image_width: number | null
  image_height: number | null
  image_size: number | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type CreateTodoBlockInput = {
  id?: string
  title: string
  deadlineAt: string | null
  boardScope: BoardScope
  projectId: string | null
  x: number
  y: number
  w?: number
}

export type UpdateTodoBlockInput = Partial<Pick<TodoBlock, 'title' | 'deadlineAt' | 'x' | 'y' | 'w'>>

export type CreateTodoItemInput = {
  id?: string
  blockId: string
  title: string
  description?: string | null
  sortOrder?: number
  imagePath?: string | null
  imageWidth?: number | null
  imageHeight?: number | null
  imageSize?: number | null
}

export type UpdateTodoItemInput = Partial<
  Pick<
    TodoItem,
    | 'title'
    | 'description'
    | 'isDone'
    | 'isActive'
    | 'activeBy'
    | 'sortOrder'
    | 'imagePath'
    | 'imageWidth'
    | 'imageHeight'
    | 'imageSize'
  >
>

export type TodoBlockEditorState =
  | {
      mode: 'create'
      boardScope: BoardScope
      projectId: string | null
      initialX: number
      initialY: number
    }
  | { mode: 'edit'; blockId: string }

export type TodoItemEditorState =
  | { mode: 'create'; blockId: string }
  | { mode: 'edit'; itemId: string }

export type TodoBlockStatus = {
  completed: number
  isDone: boolean
  progress: number
  total: number
}

export type TodoBlockPosition = Pick<TodoBlock, 'id' | 'x' | 'y'>
export type TodoBlockGeometry = Pick<TodoBlock, 'id' | 'w' | 'x' | 'y'>

