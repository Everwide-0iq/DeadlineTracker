import { isThisWeek, isToday } from 'date-fns'
import type { BoardFilter, Card, FilterCounts } from './card.types.ts'

export const boardFilters: Array<{ id: BoardFilter }> = [
  { id: 'all' },
  { id: 'today' },
  { id: 'week' },
  { id: 'overdue' },
  { id: 'done' },
]

export const defaultCardSize = {
  w: 340,
  h: 190,
}

const cardHorizontalPadding = 40
const titleAverageCharWidth = 12.5
const descriptionAverageCharWidth = 7.4
const titleLineHeight = 28
const descriptionLineHeight = 24
const includedTitleLines = 2
const includedDescriptionLines = 2

type CardContentSizeInput = {
  description: string | null
  h?: number
  title: string
  w?: number
}

const getTextLineCount = (value: string | null, charactersPerLine: number) => {
  const normalizedValue = value?.trim()

  if (!normalizedValue) {
    return 0
  }

  return normalizedValue
    .replace(/\r/g, '')
    .split('\n')
    .reduce((lineCount, paragraph) => {
      const length = Math.max(Array.from(paragraph.trim()).length, 1)
      return lineCount + Math.max(Math.ceil(length / charactersPerLine), 1)
    }, 0)
}

export function getCardContentHeight({ description, h, title, w }: CardContentSizeInput) {
  const cardWidth = w ?? defaultCardSize.w
  const contentWidth = Math.max(cardWidth - cardHorizontalPadding, 220)
  const titleCharactersPerLine = Math.max(Math.floor(contentWidth / titleAverageCharWidth), 12)
  const descriptionCharactersPerLine = Math.max(
    Math.floor(contentWidth / descriptionAverageCharWidth),
    18,
  )
  const titleLines = Math.max(getTextLineCount(title, titleCharactersPerLine), 1)
  const descriptionLines = getTextLineCount(description, descriptionCharactersPerLine)
  const titleExtraHeight = Math.max(titleLines - includedTitleLines, 0) * titleLineHeight
  const descriptionExtraHeight =
    Math.max(descriptionLines - includedDescriptionLines, 0) * descriptionLineHeight

  return Math.ceil(Math.max(h ?? defaultCardSize.h, defaultCardSize.h + titleExtraHeight + descriptionExtraHeight))
}

export function getCardRenderSize(card: Pick<Card, 'description' | 'h' | 'title' | 'w'>) {
  const width = card.w || defaultCardSize.w

  return {
    h: getCardContentHeight({
      description: card.description,
      h: card.h,
      title: card.title,
      w: width,
    }),
    w: width,
  }
}

export function getDefaultDeadline() {
  const nextDay = new Date()
  nextDay.setDate(nextDay.getDate() + 1)
  nextDay.setHours(nextDay.getHours() + 1, 0, 0, 0)
  return nextDay
}

export function toDateTimeLocalValue(value: string | Date) {
  const date = new Date(value)
  const timezoneOffset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16)
}

export function fromDateTimeLocalValue(value: string) {
  return new Date(value).toISOString()
}

export function isCardOverdue(card: Card, now = Date.now()) {
  return card.status !== 'done' && new Date(card.deadlineAt).getTime() < now
}

function isCardThisWeek(card: Card) {
  return card.status !== 'done' && isThisWeek(new Date(card.deadlineAt), { weekStartsOn: 1 })
}

function matchesFilter(card: Card, filter: BoardFilter, now: number) {
  if (filter === 'all') {
    return true
  }

  if (filter === 'done') {
    return card.status === 'done'
  }

  if (card.status === 'done') {
    return false
  }

  if (filter === 'today') {
    return isToday(new Date(card.deadlineAt))
  }

  if (filter === 'week') {
    return isCardThisWeek(card)
  }

  return isCardOverdue(card, now)
}

export function filterCards(cards: Card[], filter: BoardFilter, now: number) {
  return cards.filter((card) => matchesFilter(card, filter, now))
}

export function getFilterCounts(cards: Card[], now: number): FilterCounts {
  return {
    all: cards.length,
    today: filterCards(cards, 'today', now).length,
    week: filterCards(cards, 'week', now).length,
    overdue: filterCards(cards, 'overdue', now).length,
    done: filterCards(cards, 'done', now).length,
  }
}

export function sortCardsForMobile(cards: Card[], now: number) {
  return [...cards].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === 'done' ? 1 : -1
    }

    const leftOverdue = isCardOverdue(left, now)
    const rightOverdue = isCardOverdue(right, now)

    if (leftOverdue !== rightOverdue) {
      return leftOverdue ? -1 : 1
    }

    return new Date(left.deadlineAt).getTime() - new Date(right.deadlineAt).getTime()
  })
}
