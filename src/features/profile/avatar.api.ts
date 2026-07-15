import { requireSupabase } from '../../lib/supabase.ts'

export const avatarBucket = 'avatars'

const maxSourceBytes = 8 * 1024 * 1024
const maxStoredBytes = 480 * 1024
const signedUrlLifetimeSeconds = 60 * 60
const signedUrlRefreshPaddingMs = 60 * 1000

type SignedUrlCacheEntry = {
  expiresAt: number
  url: string
}

export type PreparedAvatar = {
  blob: Blob
  objectUrl: string
  size: number
}

const signedUrlCache = new Map<string, SignedUrlCacheEntry>()
const pendingSignedUrls = new Map<string, Promise<string>>()

function loadImage(file: File) {
  return new Promise<{ image: HTMLImageElement; objectUrl: string }>((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('unsupported'))
      return
    }

    if (file.size > maxSourceBytes) {
      reject(new Error('source-too-large'))
      return
    }

    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => resolve({ image, objectUrl })
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('decode-failed'))
    }
    image.src = objectUrl
  })
}

function canvasToWebp(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encode-failed'))),
      'image/webp',
      quality,
    )
  })
}

async function renderSquare(image: HTMLImageElement, size: number, quality: number) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d', { alpha: true, colorSpace: 'srgb' })

  if (!context) {
    throw new Error('canvas-unavailable')
  }

  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight)
  const sourceX = (image.naturalWidth - sourceSize) / 2
  const sourceY = (image.naturalHeight - sourceSize) / 2
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size)
  return canvasToWebp(canvas, quality)
}

export async function prepareAvatar(file: File): Promise<PreparedAvatar> {
  const { image, objectUrl } = await loadImage(file)

  try {
    for (const size of [512, 448, 384]) {
      for (const quality of [0.9, 0.82, 0.74]) {
        const blob = await renderSquare(image, size, quality)

        if (blob.size <= maxStoredBytes) {
          return { blob, objectUrl: URL.createObjectURL(blob), size: blob.size }
        }
      }
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }

  throw new Error('compressed-too-large')
}

export function revokePreparedAvatar(avatar: PreparedAvatar | null) {
  if (avatar) {
    URL.revokeObjectURL(avatar.objectUrl)
  }
}

export async function uploadAvatar(userId: string, avatar: PreparedAvatar) {
  const path = `${userId}/${crypto.randomUUID()}.webp`
  const { error } = await requireSupabase().storage.from(avatarBucket).upload(path, avatar.blob, {
    cacheControl: '3600',
    contentType: 'image/webp',
    upsert: false,
  })

  if (error) {
    throw error
  }

  return path
}

export async function removeAvatar(path: string | null) {
  if (!path) {
    return
  }

  signedUrlCache.delete(path)
  pendingSignedUrls.delete(path)
  const { error } = await requireSupabase().storage.from(avatarBucket).remove([path])

  if (error) {
    throw error
  }
}

export function getAvatarSignedUrl(path: string) {
  const cached = signedUrlCache.get(path)

  if (cached && cached.expiresAt > Date.now() + signedUrlRefreshPaddingMs) {
    return Promise.resolve(cached.url)
  }

  const pending = pendingSignedUrls.get(path)

  if (pending) {
    return pending
  }

  const request = requireSupabase()
    .storage.from(avatarBucket)
    .createSignedUrl(path, signedUrlLifetimeSeconds)
    .then(({ data, error }) => {
      if (error) {
        throw error
      }

      signedUrlCache.set(path, {
        expiresAt: Date.now() + signedUrlLifetimeSeconds * 1000,
        url: data.signedUrl,
      })
      return data.signedUrl
    })
    .finally(() => pendingSignedUrls.delete(path))

  pendingSignedUrls.set(path, request)
  return request
}
