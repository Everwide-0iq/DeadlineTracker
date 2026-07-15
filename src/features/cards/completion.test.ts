import { describe, expect, it } from 'vitest'
import { formatCompletionDate } from './completion.ts'

describe('formatCompletionDate', () => {
  const completedAt = '2026-07-15T12:00:00.000Z'

  it('formats the same instant in the viewer time zone', () => {
    const utc = formatCompletionDate(completedAt, 'en', 'UTC')
    const teammate = formatCompletionDate(completedAt, 'en', 'Europe/Helsinki')

    expect(utc).toContain('12:00')
    expect(teammate).toContain('3:00')
  })

  it('returns null for missing or invalid timestamps', () => {
    expect(formatCompletionDate(null, 'ru')).toBeNull()
    expect(formatCompletionDate('not-a-date', 'ru')).toBeNull()
  })
})
