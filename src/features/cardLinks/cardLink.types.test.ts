import { describe, expect, it } from 'vitest'
import { getLinkSource, getLinkTarget, type CardLink } from './cardLink.types.ts'

const createLink = (overrides: Partial<CardLink> = {}): CardLink => ({
  boardScope: 'shared',
  createdAt: '2026-07-15T08:00:00.000Z',
  createdBy: 'user-1',
  fromCardId: 'card-1',
  fromSide: 'right',
  fromTodoBlockId: null,
  id: 'link-1',
  projectId: 'project-1',
  toCardId: null,
  toSide: 'left',
  toTodoBlockId: 'todo-1',
  updatedAt: '2026-07-15T08:00:00.000Z',
  ...overrides,
})

describe('board link endpoints', () => {
  it('maps mixed card and To-do endpoints without losing their sides', () => {
    const link = createLink()

    expect(getLinkSource(link)).toEqual({ id: 'card-1', kind: 'card', side: 'right' })
    expect(getLinkTarget(link)).toEqual({ id: 'todo-1', kind: 'todo', side: 'left' })
  })

  it('rejects an endpoint that has no persisted object id', () => {
    const malformed = createLink({ fromCardId: null, fromTodoBlockId: null })

    expect(getLinkSource(malformed)).toBeNull()
  })
})
