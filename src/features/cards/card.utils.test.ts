import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Card } from './card.types.ts'
import {
  filterCards,
  getCardContentHeight,
  getFilterCounts,
  sortCardsForMobile,
} from './card.utils.ts'
import { formatCountdown } from './countdown.ts'
import { getDeadlineVisualState } from './deadlineColor.ts'

const now = new Date(2026, 6, 11, 12, 0, 0)

const createCard = (overrides: Partial<Card> = {}): Card => ({
  boardScope: 'shared',
  createdAt: '2026-07-01T00:00:00.000Z',
  createdBy: 'user-1',
  deadlineAt: new Date(2026, 6, 12, 12, 0, 0).toISOString(),
  description: null,
  h: 190,
  id: crypto.randomUUID(),
  imageHeight: null,
  imagePath: null,
  imageSize: null,
  imageWidth: null,
  isActive: false,
  activeBy: null,
  completedAt: null,
  completedBy: null,
  projectId: 'project-1',
  status: 'todo',
  title: 'Task',
  updatedAt: '2026-07-01T00:00:00.000Z',
  w: 340,
  x: 0,
  y: 0,
  ...overrides,
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('card sizing', () => {
  it('grows to fit long descriptions', () => {
    const shortHeight = getCardContentHeight({
      description: 'Short description',
      title: 'Task',
      w: 340,
    })
    const longHeight = getCardContentHeight({
      description: 'Detailed context '.repeat(80),
      title: 'Task',
      w: 340,
    })

    expect(longHeight).toBeGreaterThan(shortHeight)
  })

  it('reserves metadata space for active and completed cards', () => {
    const baseHeight = getCardContentHeight({ description: null, title: 'Task', w: 340 })
    const activeHeight = getCardContentHeight({
      description: null,
      isActive: true,
      status: 'todo',
      title: 'Task',
      w: 340,
    })
    const completedHeight = getCardContentHeight({
      description: null,
      status: 'done',
      title: 'Task',
      w: 340,
    })

    expect(activeHeight).toBeGreaterThan(baseHeight)
    expect(completedHeight).toBeGreaterThan(baseHeight)
  })

  it('respects a manually enlarged card', () => {
    expect(
      getCardContentHeight({ description: null, h: 1200, title: 'Task', w: 600 }),
    ).toBe(1200)
  })
})

describe('filters and ordering', () => {
  const todayCard = createCard({ deadlineAt: new Date(2026, 6, 11, 18).toISOString() })
  const upcomingCard = createCard({ deadlineAt: new Date(2026, 6, 13, 18).toISOString() })
  const overdueCard = createCard({ deadlineAt: new Date(2026, 6, 10, 18).toISOString() })
  const doneCard = createCard({ status: 'done' })
  const cards = [upcomingCard, doneCard, todayCard, overdueCard]

  it('keeps active filters mutually predictable', () => {
    expect(filterCards(cards, 'today', now.getTime())).toEqual([todayCard])
    expect(filterCards(cards, 'overdue', now.getTime())).toEqual([overdueCard])
    expect(filterCards(cards, 'done', now.getTime())).toEqual([doneCard])
    expect(getFilterCounts(cards, now.getTime()).all).toBe(4)
  })

  it('puts overdue work first and completed work last on mobile', () => {
    expect(sortCardsForMobile(cards, now.getTime())).toEqual([
      overdueCard,
      todayCard,
      upcomingCard,
      doneCard,
    ])
  })

  it('keeps undated work out of deadline filters and after active dated cards', () => {
    const undatedCard = createCard({
      createdAt: '2026-07-02T00:00:00.000Z',
      deadlineAt: null,
    })
    const doneUndatedCard = createCard({
      createdAt: '2026-07-03T00:00:00.000Z',
      deadlineAt: null,
      status: 'done',
    })
    const mixedCards = [undatedCard, doneUndatedCard, upcomingCard, overdueCard]

    expect(filterCards(mixedCards, 'all', now.getTime())).toEqual(mixedCards)
    expect(filterCards(mixedCards, 'today', now.getTime())).toEqual([])
    expect(filterCards(mixedCards, 'overdue', now.getTime())).toEqual([overdueCard])
    expect(filterCards(mixedCards, 'done', now.getTime())).toEqual([doneUndatedCard])
    expect(sortCardsForMobile(mixedCards, now.getTime())).toEqual([
      overdueCard,
      upcomingCard,
      undatedCard,
      doneUndatedCard,
    ])
  })
})

describe('countdown formatting', () => {
  it('formats active, overdue, completed, and invalid deadlines', () => {
    expect(formatCountdown(new Date(now.getTime() + 26 * 60 * 60 * 1000), 'todo', now.getTime(), 'en')).toBe(
      '1d 02h',
    )
    expect(formatCountdown(new Date(now.getTime() - 90 * 60 * 1000), 'todo', now.getTime(), 'en')).toBe(
      'Overdue by 1h 30m',
    )
    expect(formatCountdown(now, 'done', now.getTime(), 'en')).toBe('Done')
    expect(formatCountdown('invalid', 'todo', now.getTime(), 'en')).toBe('Invalid date')
  })

  it('uses a calm label for undated work while preserving the completed state', () => {
    expect(formatCountdown(null, 'todo', now.getTime(), 'en')).toBe('No deadline')
    expect(formatCountdown(null, 'done', now.getTime(), 'en')).toBe('Done')

    const visual = getDeadlineVisualState(null, 'todo', now.getTime(), 'en')
    expect(visual.zone).toBe('undated')
    expect(visual.label).toBe('No deadline')
    expect(visual.shouldPulse).toBe(false)
  })
})
