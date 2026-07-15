import { describe, expect, it } from 'vitest'
import { mapTodoBlockFromRow, mapTodoItemFromRow } from './todo.api.ts'
import type { TodoBlockRow, TodoItemRow } from './todo.types.ts'

describe('todo Supabase row mapping', () => {
  it('maps nullable block deadlines and board geometry', () => {
    const row: TodoBlockRow = {
      board_scope: 'personal',
      created_at: '2026-07-15T08:00:00.000Z',
      created_by: 'user-1',
      deadline_at: null,
      id: 'block-1',
      project_id: null,
      title: 'Personal checklist',
      updated_at: '2026-07-15T08:00:00.000Z',
      w: 520,
      x: 120,
      y: 240,
    }

    expect(mapTodoBlockFromRow(row)).toMatchObject({
      boardScope: 'personal',
      deadlineAt: null,
      projectId: null,
      w: 520,
      x: 120,
      y: 240,
    })
  })

  it('preserves active, completion, ordering, and image metadata', () => {
    const row: TodoItemRow = {
      active_by: null,
      block_id: 'block-1',
      completed_at: '2026-07-15T09:00:00.000Z',
      completed_by: 'user-2',
      created_at: '2026-07-15T08:00:00.000Z',
      created_by: 'user-1',
      description: 'Double-check the release package.',
      id: 'item-1',
      image_height: 900,
      image_path: 'user-1/item-1.webp',
      image_size: 120_000,
      image_width: 1600,
      is_active: false,
      is_done: true,
      sort_order: 2000,
      title: 'Review build',
      updated_at: '2026-07-15T09:00:00.000Z',
    }

    expect(mapTodoItemFromRow(row)).toMatchObject({
      completedBy: 'user-2',
      imageHeight: 900,
      imagePath: 'user-1/item-1.webp',
      imageSize: 120_000,
      imageWidth: 1600,
      isDone: true,
      sortOrder: 2000,
    })
  })
})
