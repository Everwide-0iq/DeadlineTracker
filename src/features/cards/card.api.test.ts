import { describe, expect, it } from 'vitest'
import { mapCardFromRow } from './card.api.ts'
import type { CardRow } from './card.types.ts'

const createRow = (overrides: Partial<CardRow> = {}): CardRow => ({
  board_scope: 'shared',
  created_at: '2026-07-01T00:00:00.000Z',
  created_by: 'user-1',
  deadline_at: '2026-07-12T12:00:00.000Z',
  description: null,
  h: 190,
  id: 'card-1',
  image_height: null,
  image_path: null,
  image_size: null,
  image_width: null,
  is_active: false,
  project_id: 'project-1',
  status: 'todo',
  title: 'Task',
  updated_at: '2026-07-01T00:00:00.000Z',
  w: 340,
  x: 0,
  y: 0,
  ...overrides,
})

describe('mapCardFromRow', () => {
  it('maps the persisted active state', () => {
    expect(mapCardFromRow(createRow({ is_active: true })).isActive).toBe(true)
  })

  it('keeps legacy rows inactive until the migration is applied', () => {
    expect(mapCardFromRow(createRow({ is_active: undefined })).isActive).toBe(false)
  })
})
