import { describe, expect, it } from 'vitest'
import { applyOptimisticItemPatch } from './todo.store.ts'
import type { TodoItem } from './todo.types.ts'

const createItem = (overrides: Partial<TodoItem> = {}): TodoItem => ({
  activeBy: 'user-1',
  blockId: 'block-1',
  completedAt: null,
  completedBy: null,
  createdAt: '2026-07-15T08:00:00.000Z',
  createdBy: 'user-1',
  description: null,
  id: 'item-1',
  imageHeight: null,
  imagePath: null,
  imageSize: null,
  imageWidth: null,
  isActive: true,
  isDone: false,
  sortOrder: 1000,
  title: 'Ship build',
  updatedAt: '2026-07-15T08:00:00.000Z',
  ...overrides,
})

describe('optimistic To-do item updates', () => {
  it('attributes completion immediately and clears activity', () => {
    const item = applyOptimisticItemPatch(createItem(), { isDone: true }, 'user-2')

    expect(item.isDone).toBe(true)
    expect(item.isActive).toBe(false)
    expect(item.activeBy).toBeNull()
    expect(item.completedBy).toBe('user-2')
    expect(item.completedAt).toBe(item.updatedAt)
  })

  it('clears completion metadata when reopened', () => {
    const item = applyOptimisticItemPatch(
      createItem({
        activeBy: null,
        completedAt: '2026-07-15T09:00:00.000Z',
        completedBy: 'user-2',
        isActive: false,
        isDone: true,
      }),
      { isDone: false },
      'user-1',
    )

    expect(item.completedAt).toBeNull()
    expect(item.completedBy).toBeNull()
  })
})
