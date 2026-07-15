import { useCallback, useEffect, useState } from 'react'

type PrivateImageResource = {
  path: string
  url: string
}

type UsePrivateImageOptions = {
  getCachedUrl: (path: string) => string | null
  getUrl: (path: string) => Promise<string>
}

const loadedImageUrls = new Set<string>()
const pendingImageLoads = new Map<string, Promise<void>>()

export async function preloadPrivateImage(path: string, getUrl: (path: string) => Promise<string>) {
  const url = await getUrl(path)

  if (loadedImageUrls.has(url) || typeof Image === 'undefined') return

  const pending = pendingImageLoads.get(url)
  if (pending) return pending

  const request = new Promise<void>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      loadedImageUrls.add(url)
      resolve()
    }
    image.onerror = () => reject(new Error('image-preload-failed'))
    image.decoding = 'async'
    image.src = url
  }).finally(() => pendingImageLoads.delete(url))

  pendingImageLoads.set(url, request)
  return request
}

export function usePrivateImage(
  path: string | null,
  { getCachedUrl, getUrl }: UsePrivateImageOptions,
) {
  const [resource, setResource] = useState<PrivateImageResource | null>(() => {
    if (!path) return null
    const url = getCachedUrl(path)
    return url ? { path, url } : null
  })
  const [failedPath, setFailedPath] = useState<string | null>(null)
  const [loadedUrl, setLoadedUrl] = useState<string | null>(() =>
    resource?.url && loadedImageUrls.has(resource.url) ? resource.url : null,
  )
  const url = resource?.path === path ? resource.url : null
  const failed = Boolean(path && failedPath === path)
  const isLoaded = Boolean(url && (loadedUrl === url || loadedImageUrls.has(url)))

  useEffect(() => {
    let active = true

    setFailedPath(null)

    if (!path) {
      setResource(null)
      setLoadedUrl(null)
      return undefined
    }

    const cachedUrl = getCachedUrl(path)

    if (cachedUrl) {
      setResource({ path, url: cachedUrl })
      if (loadedImageUrls.has(cachedUrl)) setLoadedUrl(cachedUrl)
    } else {
      setResource((current) => (current?.path === path ? current : null))
      setLoadedUrl(null)
    }

    getUrl(path)
      .then((nextUrl) => {
        if (!active) return
        setResource({ path, url: nextUrl })
        if (loadedImageUrls.has(nextUrl)) setLoadedUrl(nextUrl)
      })
      .catch(() => {
        if (active) setFailedPath(path)
      })

    return () => {
      active = false
    }
  }, [getCachedUrl, getUrl, path])

  const markLoaded = useCallback(() => {
    if (!url) return
    loadedImageUrls.add(url)
    setLoadedUrl(url)
  }, [url])

  const markFailed = useCallback(() => {
    if (path) setFailedPath(path)
  }, [path])

  return {
    failed,
    isLoaded,
    markFailed,
    markLoaded,
    url,
  }
}
