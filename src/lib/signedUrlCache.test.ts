import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSignedUrlCache } from './signedUrlCache.ts'

afterEach(() => {
  vi.useRealTimers()
})

describe('signed URL cache', () => {
  it('deduplicates concurrent requests and exposes a synchronous cached value', async () => {
    const cache = createSignedUrlCache({ lifetimeSeconds: 3600, refreshPaddingMs: 60_000 })
    const load = vi.fn(async () => 'signed-url')

    const [first, second] = await Promise.all([
      cache.get('image.webp', load),
      cache.get('image.webp', load),
    ])

    expect(first).toBe('signed-url')
    expect(second).toBe('signed-url')
    expect(load).toHaveBeenCalledTimes(1)
    expect(cache.peek('image.webp')).toBe('signed-url')
  })

  it('refreshes entries that are inside the expiry padding', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-15T12:00:00.000Z'))
    const cache = createSignedUrlCache({ lifetimeSeconds: 120, refreshPaddingMs: 60_000 })

    await cache.get('image.webp', async () => 'first-url')
    vi.advanceTimersByTime(61_000)

    expect(cache.peek('image.webp')).toBeNull()
    await expect(cache.get('image.webp', async () => 'refreshed-url')).resolves.toBe('refreshed-url')
  })

  it('does not let an invalidated request overwrite or detach its replacement', async () => {
    const cache = createSignedUrlCache({ lifetimeSeconds: 3600, refreshPaddingMs: 60_000 })
    let resolveStale: (url: string) => void = () => undefined
    let resolveFresh: (url: string) => void = () => undefined
    const stale = cache.get('image.webp', () => new Promise((resolve) => { resolveStale = resolve }))

    cache.invalidate('image.webp')
    const freshLoader = vi.fn(() => new Promise<string>((resolve) => { resolveFresh = resolve }))
    const fresh = cache.get('image.webp', freshLoader)

    resolveStale('stale-url')
    await expect(stale).resolves.toBe('stale-url')

    const deduplicated = cache.get('image.webp', freshLoader)
    expect(freshLoader).toHaveBeenCalledTimes(1)

    resolveFresh('fresh-url')
    await expect(Promise.all([fresh, deduplicated])).resolves.toEqual(['fresh-url', 'fresh-url'])
    expect(cache.peek('image.webp')).toBe('fresh-url')
  })
})
