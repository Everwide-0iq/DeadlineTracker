import { describe, expect, it } from 'vitest'
import type { Card } from './card.types.ts'
import { applyOptimisticCardPatch, getActivityTogglePatch } from './card.store.ts'

const createCard = (overrides: Partial<Card> = {}): Card => ({
  activeBy: 'user-1',
  boardScope: 'shared',
  completedAt: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  createdBy: 'user-1',
  deadlineAt: '2026-07-20T12:00:00.000Z',
  description: null,
  h: 190,
  id: 'card-1',
  imageHeight: null,
  imagePath: null,
  imageSize: null,
  imageWidth: null,
  isActive: true,
  projectId: 'project-1',
  status: 'todo',
  title: 'Task',
  updatedAt: '2026-07-01T00:00:00.000Z',
  w: 340,
  x: 0,
  y: 0,
  ...overrides,
})

describe('applyOptimisticCardPatch', () => {
  it('clears activity and records a provisional completion time when completed', () => {
    const card = applyOptimisticCardPatch(createCard(), { status: 'done' })

    expect(card.status).toBe('done')
    expect(card.isActive).toBe(false)
    expect(card.activeBy).toBeNull()
    expect(card.completedAt).toBe(card.updatedAt)
  })

  it('keeps a known completion time while an already completed card updates', () => {
    const completedAt = '2026-07-14T10:30:00.000Z'
    const card = applyOptimisticCardPatch(
      createCard({ activeBy: null, completedAt, isActive: false, status: 'done' }),
      { title: 'Updated task' },
    )

    expect(card.completedAt).toBe(completedAt)
    expect(card.isActive).toBe(false)
  })

  it('clears completion time when reopened', () => {
    const card = applyOptimisticCardPatch(
      createCard({
        activeBy: null,
        completedAt: '2026-07-14T10:30:00.000Z',
        isActive: false,
        status: 'done',
      }),
      { status: 'todo' },
    )

    expect(card.status).toBe('todo')
    expect(card.completedAt).toBeNull()
  })

  it('clears the owner when activity is disabled', () => {
    const card = applyOptimisticCardPatch(createCard(), { activeBy: null, isActive: false })

    expect(card.isActive).toBe(false)
    expect(card.activeBy).toBeNull()
  })
})

describe('getActivityTogglePatch', () => {
  it('activates an inactive card for the current user', () => {
    expect(
      getActivityTogglePatch(createCard({ activeBy: null, isActive: false }), 'user-2'),
    ).toEqual({ activeBy: 'user-2', isActive: true })
  })

  it('transfers another member activity to the current user', () => {
    expect(getActivityTogglePatch(createCard(), 'user-2')).toEqual({
      activeBy: 'user-2',
      isActive: true,
    })
    expect(
      getActivityTogglePatch(createCard({ activeBy: null, isActive: true }), 'user-2'),
    ).toEqual({ activeBy: 'user-2', isActive: true })
  })

  it('clears activity owned by the current user', () => {
    expect(getActivityTogglePatch(createCard(), 'user-1')).toEqual({
      activeBy: null,
      isActive: false,
    })
  })

  it('does nothing for completed cards or a missing session', () => {
    expect(getActivityTogglePatch(createCard({ status: 'done' }), 'user-1')).toBeNull()
    expect(getActivityTogglePatch(createCard(), null)).toBeNull()
  })
})
