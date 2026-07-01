import type { BoardScope } from '../cards/card.types.ts'

export type CardLinkSide = 'top' | 'right' | 'bottom' | 'left'

export type CardLink = {
  id: string
  fromCardId: string
  fromSide: CardLinkSide
  toCardId: string
  toSide: CardLinkSide
  boardScope: BoardScope
  projectId: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export type CardLinkRow = {
  id: string
  from_card_id: string
  from_side: CardLinkSide
  to_card_id: string
  to_side: CardLinkSide
  board_scope: BoardScope
  project_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type CreateCardLinkInput = {
  fromCardId: string
  fromSide: CardLinkSide
  toCardId: string
  toSide: CardLinkSide
  boardScope: BoardScope
  projectId: string | null
}
