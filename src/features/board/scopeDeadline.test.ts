import { describe, expect, it } from 'vitest'
import { getScopeDeadline } from './scopeDeadline.ts'

const card = (deadlineAt: string | null, status: 'todo' | 'done' = 'todo', boardScope: 'shared' | 'personal' = 'shared') => ({ deadlineAt, status, boardScope, title: String(deadlineAt) })

describe('scope deadlines', () => {
  it('selects the oldest overdue task across projects, excluding completed and other scopes', () => {
    const cards = [card('2026-09-23'), card('2026-09-20'), card('2026-09-18'), card('2026-01-01', 'done'), card('2025-01-01', 'todo', 'personal')]
    expect(getScopeDeadline('shared', cards, [], [])?.deadlineAt).toBe('2026-09-18')
    expect(getScopeDeadline('personal', cards, [], [])?.deadlineAt).toBe('2025-01-01')
  })
  it('selects the nearest future deadline and ignores absent or invalid dates', () => {
    expect(getScopeDeadline('shared', [card(null), card('invalid'), card('2027-02-01'), card('2027-01-01')], [], [])?.deadlineAt).toBe('2027-01-01')
    expect(getScopeDeadline('shared', [card(null), card('invalid')], [], [])).toBeNull()
  })
  it('includes empty and incomplete todo blocks but excludes completed blocks', () => {
    const blocks = [{ ...card('2026-01-01'), id: 'done' }, { ...card('2026-02-01'), id: 'open' }, { ...card('2026-03-01'), id: 'empty' }]
    const items = [{ blockId: 'done', isDone: true }, { blockId: 'open', isDone: false }]
    expect(getScopeDeadline('shared', [], blocks, items)?.deadlineAt).toBe('2026-02-01')
    expect(getScopeDeadline('shared', [], blocks, items.map(item => ({ ...item, isDone: true })))?.deadlineAt).toBe('2026-03-01')
  })
})
