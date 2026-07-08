import type { BoardScope } from '../cards/card.types.ts'

export type BoardTextFontFamily = 'display' | 'mono' | 'serif' | 'system'

export type BoardText = {
  id: string
  content: string
  boardScope: BoardScope
  projectId: string | null
  x: number
  y: number
  w: number
  fontSize: number
  fontFamily: BoardTextFontFamily
  color: string
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export type BoardTextRow = {
  id: string
  content: string
  board_scope: BoardScope
  project_id: string | null
  x: number
  y: number
  w?: number
  font_size: number
  font_family: BoardTextFontFamily
  color: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export type CreateBoardTextInput = {
  content: string
  boardScope: BoardScope
  projectId: string | null
  x: number
  y: number
  w: number
  fontSize: number
  fontFamily: BoardTextFontFamily
  color: string
}

export type UpdateBoardTextInput = Partial<
  Pick<BoardText, 'content' | 'x' | 'y' | 'w' | 'fontSize' | 'fontFamily' | 'color'>
>

export type BoardTextEditorState =
  | {
      mode: 'create'
      boardScope: BoardScope
      projectId: string | null
      initialX: number
      initialY: number
    }
  | {
      mode: 'edit'
      textId: string
    }
