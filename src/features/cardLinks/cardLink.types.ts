import type { ConnectableBoardObjectKind } from '../board/boardObject.types.ts'
import type { BoardScope } from '../cards/card.types.ts'

export type CardLinkSide = 'top' | 'right' | 'bottom' | 'left'
export type BoardLinkNodeKind = ConnectableBoardObjectKind

export type BoardLinkEndpoint = {
  id: string
  kind: BoardLinkNodeKind
  side: CardLinkSide
}

export type CardLink = {
  id: string
  fromCardId: string | null
  fromTodoBlockId: string | null
  fromSide: CardLinkSide
  toCardId: string | null
  toTodoBlockId: string | null
  toSide: CardLinkSide
  boardScope: BoardScope
  projectId: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export type CardLinkRow = {
  id: string
  from_card_id: string | null
  from_todo_block_id?: string | null
  from_side: CardLinkSide
  to_card_id: string | null
  to_todo_block_id?: string | null
  to_side: CardLinkSide
  board_scope: BoardScope
  project_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type CreateCardLinkInput = {
  from: BoardLinkEndpoint
  to: BoardLinkEndpoint
  boardScope: BoardScope
  projectId: string | null
}

export function getLinkSource(link: CardLink): BoardLinkEndpoint | null {
  if (link.fromCardId) return { id: link.fromCardId, kind: 'card', side: link.fromSide }
  if (link.fromTodoBlockId) return { id: link.fromTodoBlockId, kind: 'todo', side: link.fromSide }
  return null
}

export function getLinkTarget(link: CardLink): BoardLinkEndpoint | null {
  if (link.toCardId) return { id: link.toCardId, kind: 'card', side: link.toSide }
  if (link.toTodoBlockId) return { id: link.toTodoBlockId, kind: 'todo', side: link.toSide }
  return null
}
