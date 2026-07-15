import { describe, expect, it } from 'vitest'
import type { TodoBlock, TodoItem } from './todo.types.ts'
import { getTodoBlockStatus, matchesTodoFilter } from './todo.utils.ts'

const now = new Date(2026, 6, 15, 12, 0, 0).getTime()

const createBlock = (overrides: Partial<TodoBlock> = {}): TodoBlock => ({
  boardScope: 'shared',
  createdAt: '2026-07-15T08:00:00.000Z',
  createdBy: 'user-1',
  deadlineAt: new Date(2026, 6, 15, 18, 0, 0).toISOString(),
  id: 'block-1',
  projectId: 'project-1',
  title: 'Release checklist',
  updatedAt: '2026-07-15T08:00:00.000Z',
  w: 420,
  x: 0,
  y: 0,
  ...overrides,
})

const createItem = (overrides: Partial<TodoItem> = {}): TodoItem => ({
  activeBy: null,
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
  isActive: false,
  isDone: false,
  sortOrder: 1000,
  title: 'Ship build',
  updatedAt: '2026-07-15T08:00:00.000Z',
  ...overrides,
})

describe('todo block status', () => {
  it('only treats a non-empty, fully checked block as done', () => {
    expect(getTodoBlockStatus([], 'block-1').isDone).toBe(false)
    expect(getTodoBlockStatus([createItem({ isDone: true })], 'block-1')).toMatchObject({
      completed: 1,
      isDone: true,
      progress: 1,
      total: 1,
    })
  })
})

describe('todo filters', () => {
  it('keeps completed blocks on the All board and also exposes them through Done', () => {
    const block = createBlock()
    const status = getTodoBlockStatus([createItem({ isDone: true })], block.id)

    expect(matchesTodoFilter(block, status, 'all', now)).toBe(true)
    expect(matchesTodoFilter(block, status, 'done', now)).toBe(true)
    expect(matchesTodoFilter(block, status, 'today', now)).toBe(false)
  })

  it('keeps unfinished blocks without a deadline in All only', () => {
    const block = createBlock({ deadlineAt: null })
    const status = getTodoBlockStatus([createItem()], block.id)

    expect(matchesTodoFilter(block, status, 'all', now)).toBe(true)
    expect(matchesTodoFilter(block, status, 'today', now)).toBe(false)
    expect(matchesTodoFilter(block, status, 'week', now)).toBe(false)
    expect(matchesTodoFilter(block, status, 'overdue', now)).toBe(false)
  })
})
