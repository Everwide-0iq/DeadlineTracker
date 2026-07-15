import type { BoardFilter } from '../cards/card.types.ts'
import { isSameDay, isWithinInterval, endOfWeek, startOfDay, startOfWeek } from 'date-fns'
import type { TodoBlock, TodoBlockStatus, TodoItem } from './todo.types.ts'

export const defaultTodoBlockWidth = 420

export function getTodoItemsForBlock(items: TodoItem[], blockId: string) {
  return items
    .filter((item) => item.blockId === blockId)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt.localeCompare(right.createdAt))
}

export function getTodoBlockStatus(items: TodoItem[], blockId: string): TodoBlockStatus {
  let total = 0
  let completed = 0

  for (const item of items) {
    if (item.blockId !== blockId) {
      continue
    }

    total += 1
    if (item.isDone) {
      completed += 1
    }
  }

  return {
    completed,
    isDone: total > 0 && completed === total,
    progress: total > 0 ? completed / total : 0,
    total,
  }
}

export function matchesTodoFilter(
  block: TodoBlock,
  status: TodoBlockStatus,
  filter: BoardFilter,
  now: number,
) {
  if (filter === 'all') {
    return true
  }

  if (filter === 'done') {
    return status.isDone
  }

  if (status.isDone) {
    return false
  }

  if (!block.deadlineAt) {
    return false
  }

  const deadline = new Date(block.deadlineAt)
  const current = new Date(now)

  if (Number.isNaN(deadline.getTime())) {
    return false
  }

  if (filter === 'today') {
    return isSameDay(deadline, current)
  }

  if (filter === 'week') {
    return isWithinInterval(deadline, {
      start: startOfWeek(current, { weekStartsOn: 1 }),
      end: endOfWeek(current, { weekStartsOn: 1 }),
    })
  }

  return deadline.getTime() < startOfDay(current).getTime()
}

export function getTodoBlockRenderHeight(itemCount: number, expanded: boolean) {
  const visibleCount = expanded ? itemCount : Math.min(itemCount, 10)
  const header = 152
  const rowHeight = 64
  const footer = itemCount > 10 ? 54 : 28
  const empty = itemCount === 0 ? 92 : 0
  return header + visibleCount * rowHeight + footer + empty
}
