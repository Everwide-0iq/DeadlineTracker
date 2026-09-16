import { describe, expect, it } from 'vitest'
import { asRow, field, isLockedError, parseOwnerStatus } from './owner.api.ts'

describe('owner console response boundaries', () => {
  it('rejects missing or malformed access decisions', () => {
    for (const value of [null, [], 'true', { isOwner: 'true' }, { isOwner: true, unlockedUntil: 'forever', blockedUntil: null }]) {
      expect(() => parseOwnerStatus(value)).toThrow()
    }
  })
  it('requires explicit owner flag and a valid lease timestamp', () => {
    expect(parseOwnerStatus({ isOwner: false, unlockedUntil: null, blockedUntil: null }).isOwner).toBe(false)
    expect(parseOwnerStatus({ isOwner: true, unlockedUntil: '2026-09-16T10:00:00Z', blockedUntil: null, ok: true }).ok).toBe(true)
  })
  it('does not stringify nested records or interpret user text as markup', () => {
    expect(field({ title: '<script>test</script>' }, 'title')).toBe('<script>test</script>')
    expect(field({ nested: { secret: 'value' } }, 'nested')).toBe('')
    expect(() => asRow([])).toThrow()
  })
  it('recognizes server access denial without depending on translated messages', () => {
    expect(isLockedError({ code: '42501', message: 'denied' })).toBe(true)
    expect(isLockedError(new Error('42501'))).toBe(false)
  })
})
