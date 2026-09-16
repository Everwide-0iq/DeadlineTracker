import type { Json } from '../../lib/supabase.ts'
import type { BoardCamera } from '../board/useBoardCamera.ts'
import type { Card } from '../cards/card.types.ts'
import type { CardLink, CardLinkSide } from '../cardLinks/cardLink.types.ts'
import { asRow, field, type OwnerRow } from './owner.api.ts'

export type BoardSnapshot = {
  name: string
  capturedAt: string
  cards: Card[]
  todos: OwnerRow[]
  items: OwnerRow[]
  texts: OwnerRow[]
  links: CardLink[]
  profiles: OwnerRow[]
}
export type Rect = { x: number; y: number; w: number; h: number }
export const numberField = (row: OwnerRow, key: string) => {
  const value = row[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid board geometry')
  return value
}
const nullable = (row: OwnerRow, key: string) => field(row, key) || null
const side = (row: OwnerRow, key: string): CardLinkSide => {
  const value = field(row, key)
  if (value !== 'top' && value !== 'bottom' && value !== 'left' && value !== 'right') throw new Error('Invalid link side')
  return value
}
export function parseBoardSnapshot(value: Json): BoardSnapshot {
  const root = asRow(value)
  const list = (key: string) => {
    const rows = root[key]
    if (!Array.isArray(rows)) throw new Error('Invalid board snapshot')
    return rows.map(asRow)
  }
  const geometry = (row: OwnerRow) => ({ x: numberField(row, 'x'), y: numberField(row, 'y'), w: numberField(row, 'w') })
  const todos = list('todos')
  const texts = list('texts')
  for (const row of [...todos, ...texts]) {
    if (geometry(row).w <= 0) throw new Error('Invalid board width')
  }
  for (const row of texts) if (numberField(row, 'font_size') <= 0) throw new Error('Invalid text size')
  const cards: Card[] = list('cards').map(row => ({
    id: field(row, 'id'), title: field(row, 'title'), description: nullable(row, 'description'),
    deadlineAt: nullable(row, 'deadline_at'), status: row.status === 'done' ? 'done' : 'todo',
    isActive: row.is_active === true, activeBy: nullable(row, 'active_by'), completedBy: nullable(row, 'completed_by'), completedAt: nullable(row, 'completed_at'),
    ...geometry(row), h: numberField(row, 'h'), imagePath: nullable(row, 'image_path'),
    imageWidth: typeof row.image_width === 'number' ? row.image_width : null,
    imageHeight: typeof row.image_height === 'number' ? row.image_height : null,
    imageSize: typeof row.image_size === 'number' ? row.image_size : null,
    createdBy: nullable(row, 'created_by'), createdAt: field(row, 'created_at'), updatedAt: field(row, 'updated_at'),
    projectId: nullable(row, 'project_id'), boardScope: row.board_scope === 'personal' ? 'personal' : 'shared',
  }))
  return {
    name: field(root, 'name'), capturedAt: field(root, 'capturedAt'), cards, todos, texts, items: list('items'), profiles: list('profiles'),
    links: list('links').map(row => ({
      id: field(row, 'id'), fromCardId: nullable(row, 'from_card_id'), toCardId: nullable(row, 'to_card_id'),
      fromTodoBlockId: nullable(row, 'from_todo_block_id'), toTodoBlockId: nullable(row, 'to_todo_block_id'),
      fromSide: side(row, 'from_side'), toSide: side(row, 'to_side'),
      boardScope: 'shared', projectId: null, createdBy: null, createdAt: '', updatedAt: '',
    })),
  }
}
export function boardBounds(rects: Rect[]): Rect {
  if (!rects.length) return { x: 0, y: 0, w: 800, h: 600 }
  const left = Math.min(...rects.map(r => r.x))
  const top = Math.min(...rects.map(r => r.y))
  return { x: left, y: top, w: Math.max(1, ...rects.map(r => r.x + r.w - left)), h: Math.max(1, ...rects.map(r => r.y + r.h - top)) }
}
export function fitBoard(bounds: Rect, width: number, height: number): BoardCamera {
  const zoom = Math.max(0.02, Math.min(1, (width - 80) / bounds.w, (height - 80) / bounds.h))
  return { zoom, x: (width - bounds.w * zoom) / 2 - bounds.x * zoom, y: (height - bounds.h * zoom) / 2 - bounds.y * zoom }
}
export function zoomAt(camera: BoardCamera, factor: number, x: number, y: number): BoardCamera {
  const zoom = Math.max(0.02, Math.min(2, camera.zoom * factor))
  const ratio = zoom / camera.zoom
  return { zoom, x: x - (x - camera.x) * ratio, y: y - (y - camera.y) * ratio }
}
export const inViewport = (r: Rect, camera: BoardCamera, width: number, height: number) =>
  (r.x + r.w) * camera.zoom + camera.x > -150 && r.x * camera.zoom + camera.x < width + 150 &&
  (r.y + r.h) * camera.zoom + camera.y > -150 && r.y * camera.zoom + camera.y < height + 150
