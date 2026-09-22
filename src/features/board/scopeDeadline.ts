import type { BoardScope, Card } from '../cards/card.types.ts'
import type { TodoBlock, TodoItem } from '../todos/todo.types.ts'

type Candidate = Pick<Card, 'boardScope' | 'deadlineAt' | 'title'>

export function getScopeDeadline(
  scope: BoardScope,
  cards: (Candidate & Pick<Card, 'status'>)[],
  blocks: (Candidate & Pick<TodoBlock, 'id'>)[],
  items: Pick<TodoItem, 'blockId' | 'isDone'>[],
) {
  let nearest: Candidate | null = null
  let earliestTime = Infinity
  const consider = (candidate: Candidate) => {
    if (candidate.boardScope !== scope || !candidate.deadlineAt) return
    const time = Date.parse(candidate.deadlineAt)
    if (time < earliestTime) {
      earliestTime = time
      nearest = candidate
    }
  }
  for (const card of cards) if (card.status !== 'done') consider(card)
  const hasItems = new Set<string>()
  const incomplete = new Set<string>()
  for (const item of items) {
    hasItems.add(item.blockId)
    if (!item.isDone) incomplete.add(item.blockId)
  }
  for (const block of blocks) {
    if (!hasItems.has(block.id) || incomplete.has(block.id)) consider(block)
  }
  return nearest as Candidate | null
}
