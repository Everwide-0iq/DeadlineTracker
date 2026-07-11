import { requireSupabase } from '../../lib/supabase.ts'

export const cardImageBucket = 'card-images'

const maxSourceBytes = 10 * 1024 * 1024
const maxStoredBytes = 1_800 * 1024
const maxImageSide = 2400
const signedUrlLifetimeSeconds = 60 * 60
const signedUrlRefreshPaddingMs = 60 * 1000
const cleanupBatchSize = 100
const maxCleanupBatchesPerRun = 20

type SignedUrlCacheEntry = {
  expiresAt: number
  url: string
}

export type PreparedCardImage = {
  blob: Blob
  height: number
  objectUrl: string
  size: number
  width: number
}

export type CardImageMetadata = {
  imageHeight: number
  imagePath: string
  imageSize: number
  imageWidth: number
}

const signedUrlCache = new Map<string, SignedUrlCacheEntry>()

function ensureImageFile(file: File) {
  if (!file.type.startsWith('image/')) {
    throw new Error('unsupported')
  }

  if (file.size > maxSourceBytes) {
    throw new Error('source-too-large')
  }
}

function loadImage(file: File) {
  return new Promise<{ height: number; image: HTMLImageElement; objectUrl: string; width: number }>(
    (resolve, reject) => {
      const objectUrl = URL.createObjectURL(file)
      const image = new Image()

      image.onload = () => {
        resolve({
          height: image.naturalHeight,
          image,
          objectUrl,
          width: image.naturalWidth,
        })
      }
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl)
        reject(new Error('decode-failed'))
      }
      image.src = objectUrl
    },
  )
}

function getTargetSize(width: number, height: number, maxSide: number) {
  const ratio = Math.min(1, maxSide / Math.max(width, height))

  return {
    height: Math.max(Math.round(height * ratio), 1),
    width: Math.max(Math.round(width * ratio), 1),
  }
}

function canvasToWebp(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('encode-failed'))
          return
        }

        resolve(blob)
      },
      'image/webp',
      quality,
    )
  })
}

async function renderWebp(image: HTMLImageElement, width: number, height: number, quality: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d', {
    alpha: false,
    colorSpace: 'srgb',
  })

  if (!context) {
    throw new Error('canvas-unavailable')
  }

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, width, height)

  return canvasToWebp(canvas, quality)
}

export async function prepareCardImage(file: File): Promise<PreparedCardImage> {
  ensureImageFile(file)

  const { height, image, objectUrl, width } = await loadImage(file)
  const qualitySteps = [0.92, 0.86, 0.78, 0.68]
  const sizeSteps = [maxImageSide, 2000, 1700, 1400, 1100]
  const seenTargetSizes = new Set<string>()

  try {
    for (const maxSide of sizeSteps) {
      const target = getTargetSize(width, height, maxSide)
      const targetKey = `${target.width}x${target.height}`

      if (seenTargetSizes.has(targetKey)) {
        continue
      }

      seenTargetSizes.add(targetKey)

      for (const quality of qualitySteps) {
        const blob = await renderWebp(image, target.width, target.height, quality)

        if (blob.size <= maxStoredBytes) {
          return {
            blob,
            height: target.height,
            objectUrl: URL.createObjectURL(blob),
            size: blob.size,
            width: target.width,
          }
        }
      }
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }

  throw new Error('compressed-too-large')
}

export function revokePreparedCardImage(image: PreparedCardImage | null) {
  if (image) {
    URL.revokeObjectURL(image.objectUrl)
  }
}

export async function uploadCardImage(
  cardId: string,
  userId: string,
  image: PreparedCardImage,
): Promise<CardImageMetadata> {
  const path = `${userId}/${cardId}-${crypto.randomUUID()}.webp`
  const { error } = await requireSupabase().storage.from(cardImageBucket).upload(path, image.blob, {
    cacheControl: '3600',
    contentType: 'image/webp',
    upsert: false,
  })

  if (error) {
    throw error
  }

  return {
    imageHeight: image.height,
    imagePath: path,
    imageSize: image.size,
    imageWidth: image.width,
  }
}

export async function removeCardImage(path: string | null) {
  if (!path) {
    return
  }

  signedUrlCache.delete(path)

  const { error } = await requireSupabase().storage.from(cardImageBucket).remove([path])

  if (error) {
    throw error
  }

  const { error: cleanupError } = await requireSupabase()
    .from('card_image_cleanup_queue')
    .delete()
    .eq('image_path', path)

  if (cleanupError) {
    throw cleanupError
  }
}

export async function cleanupPendingCardImages() {
  const supabase = requireSupabase()

  for (let batch = 0; batch < maxCleanupBatchesPerRun; batch += 1) {
    const { data, error } = await supabase
      .from('card_image_cleanup_queue')
      .select('image_path')
      .order('created_at', { ascending: true })
      .limit(cleanupBatchSize)

    if (error) {
      throw error
    }

    const paths = (data ?? []).map((item) => item.image_path)

    if (paths.length === 0) {
      return
    }

    const { error: removeError } = await supabase.storage.from(cardImageBucket).remove(paths)

    if (removeError) {
      throw removeError
    }

    paths.forEach((path) => signedUrlCache.delete(path))

    const { error: queueError } = await supabase
      .from('card_image_cleanup_queue')
      .delete()
      .in('image_path', paths)

    if (queueError) {
      throw queueError
    }

    if (paths.length < cleanupBatchSize) {
      return
    }
  }
}

export async function getCardImageSignedUrl(path: string) {
  const cached = signedUrlCache.get(path)

  if (cached && cached.expiresAt > Date.now() + signedUrlRefreshPaddingMs) {
    return cached.url
  }

  const { data, error } = await requireSupabase()
    .storage.from(cardImageBucket)
    .createSignedUrl(path, signedUrlLifetimeSeconds)

  if (error) {
    throw error
  }

  signedUrlCache.set(path, {
    expiresAt: Date.now() + signedUrlLifetimeSeconds * 1000,
    url: data.signedUrl,
  })

  return data.signedUrl
}
