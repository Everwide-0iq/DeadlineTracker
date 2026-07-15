type SignedUrlCacheEntry = {
  expiresAt: number
  url: string
}

type SignedUrlCacheOptions = {
  lifetimeSeconds: number
  refreshPaddingMs: number
}

export function createSignedUrlCache({
  lifetimeSeconds,
  refreshPaddingMs,
}: SignedUrlCacheOptions) {
  const entries = new Map<string, SignedUrlCacheEntry>()
  const pending = new Map<string, Promise<string>>()
  const versions = new Map<string, number>()

  const peek = (key: string) => {
    const cached = entries.get(key)

    if (!cached || cached.expiresAt <= Date.now() + refreshPaddingMs) {
      return null
    }

    return cached.url
  }

  const get = (key: string, load: () => Promise<string>) => {
    const cached = peek(key)

    if (cached) {
      return Promise.resolve(cached)
    }

    const pendingRequest = pending.get(key)

    if (pendingRequest) {
      return pendingRequest
    }

    const version = versions.get(key) ?? 0
    let request: Promise<string>
    request = load()
      .then((url) => {
        if ((versions.get(key) ?? 0) === version) {
          entries.set(key, {
            expiresAt: Date.now() + lifetimeSeconds * 1000,
            url,
          })
        }
        return url
      })
      .finally(() => {
        if (pending.get(key) === request) {
          pending.delete(key)
        }
      })

    pending.set(key, request)
    return request
  }

  const invalidate = (key: string) => {
    versions.set(key, (versions.get(key) ?? 0) + 1)
    entries.delete(key)
    pending.delete(key)
  }

  const invalidateMany = (keys: Iterable<string>) => {
    for (const key of keys) {
      invalidate(key)
    }
  }

  return {
    get,
    invalidate,
    invalidateMany,
    peek,
  }
}
