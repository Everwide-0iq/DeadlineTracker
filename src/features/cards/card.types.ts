export type CardStatus = 'todo' | 'done'

export type BoardScope = 'personal' | 'shared'

export type BoardFilter = 'all' | 'today' | 'week' | 'overdue' | 'done'

export type Card = {
  id: string
  title: string
  description: string | null
  deadlineAt: string
  status: CardStatus
  boardScope: BoardScope
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
  deadline_at: string
  status: CardStatus
  board_scope: BoardScope
  x: number
  y: number
  w: number
  h: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export type CreateCardInput = {
  title: string
  description: string | null
  deadlineAt: string
  boardScope: BoardScope
  status?: CardStatus
  x: number
  y: number
  w?: number
  h?: number
}

export type UpdateCardInput = Partial<
  Pick<Card, 'title' | 'description' | 'deadlineAt' | 'status' | 'x' | 'y' | 'w' | 'h'>
>

export type CardEditorState =
  | {
      mode: 'create'
      boardScope: BoardScope
      initialX: number
      initialY: number
    }
  | {
      mode: 'edit'
      cardId: string
    }

export type FilterCounts = Record<BoardFilter, number>
