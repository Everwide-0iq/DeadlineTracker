import { afterEach, describe, expect, it, vi } from 'vitest'
import { observeNearViewport } from './observeNearViewport.ts'

afterEach(() => vi.unstubAllGlobals())

describe('observeNearViewport', () => {
  it('falls back when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const visible = vi.fn()
    const cleanup = observeNearViewport({} as Element, visible)
    expect(visible).toHaveBeenCalledOnce()
    cleanup()
  })

  it('shares one observer, loads once, and cleans up unmounted targets', () => {
    let notify: (entries: Partial<IntersectionObserverEntry>[]) => void = () => undefined
    const observe = vi.fn(), unobserve = vi.fn(), disconnect = vi.fn()
    const constructed = vi.fn()
    vi.stubGlobal('IntersectionObserver', class {
      observe = observe
      unobserve = unobserve
      disconnect = disconnect
      constructor(callback: typeof notify, options: IntersectionObserverInit) {
        constructed(options)
        notify = callback
      }
    })
    const first = {} as Element, second = {} as Element
    const ready = vi.fn(), removed = vi.fn()
    const cleanupFirst = observeNearViewport(first, ready)
    const cleanupSecond = observeNearViewport(second, removed)
    expect(constructed).toHaveBeenCalledTimes(1)
    expect(constructed).toHaveBeenCalledWith({ rootMargin: '600px' })
    notify([{ target: first, isIntersecting: false }])
    expect(ready).not.toHaveBeenCalled()
    cleanupSecond()
    notify([{ target: first, isIntersecting: true }, { target: second, isIntersecting: true }])
    expect(ready).toHaveBeenCalledOnce()
    expect(removed).not.toHaveBeenCalled()
    expect(disconnect).toHaveBeenCalled()
    cleanupFirst()
    const cleanupNew = observeNearViewport(first, ready)
    expect(constructed).toHaveBeenCalledTimes(2)
    cleanupNew()
  })
})
