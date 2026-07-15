export type CardStatus = 'todo' | 'done'

export type BoardScope = 'personal' | 'shared'

export type BoardFilter = 'all' | 'today' | 'week' | 'overdue' | 'done'

export type Card = {
  id: string
  title: string
  description: string | null
  imageHeight: number | null
  imagePath: string | null
  imageSize: number | null
  imageWidth: number | null
  deadlineAt: string
  status: CardStatus
  isActive: boolean
  activeBy: string | null
  completedAt: string | null
  boardScope: BoardScope
  projectId: string | null
  x: number
  y: number
  w: number
  h: number
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export type CardRow = {
  id: string
  title: string
  description: string | null
  image_height?: number | null
  image_path?: string | null
  image_size?: number | null
  image_width?: number | null
  deadline_at: string
  status: CardStatus
  is_active?: boolean
  active_by?: string | null
  completed_at?: string | null
  board_scope: BoardScope
  project_id: string | null
  x: number
  y: number
  w: number
  h: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export type CreateCardInput = {
  id?: string
  title: string
  description: string | null
  imageHeight?: number | null
  imagePath?: string | null
  imageSize?: number | null
  imageWidth?: number | null
  deadlineAt: string
  boardScope: BoardScope
  projectId: string | null
  status?: CardStatus
  isActive?: boolean
  activeBy?: string | null
  x: number
  y: number
  w?: number
  h?: number
}

export type UpdateCardInput = Partial<
  Pick<
    Card,
    | 'title'
    | 'description'
    | 'imageHeight'
    | 'imagePath'
    | 'imageSize'
    | 'imageWidth'
    | 'deadlineAt'
    | 'status'
    | 'isActive'
    | 'activeBy'
    | 'x'
    | 'y'
    | 'w'
    | 'h'
  >
>

export type CardEditorState =
  | {
      mode: 'create'
      boardScope: BoardScope
      projectId: string | null
      initialX: number
      initialY: number
    }
  | {
      mode: 'edit'
      cardId: string
    }

export type FilterCounts = Record<BoardFilter, number>
