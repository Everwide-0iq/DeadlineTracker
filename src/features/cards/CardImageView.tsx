import { ImageOff } from 'lucide-react'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { cn } from '../../lib/cn.ts'
import { getCardImageSignedUrl } from './cardImage.api.ts'

type CardImageViewProps = {
  alt: string
  className?: string
  height?: number | null
  imageClassName?: string
  path: string | null
  width?: number | null
}

type ImageFrameStyle = CSSProperties & Record<`--${string}`, string | number>

export function CardImageView({
  alt,
  className,
  height,
  imageClassName,
  path,
  width,
}: CardImageViewProps) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [isUnavailable, setIsUnavailable] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const imageRatio = useMemo(() => {
    if (!width || !height) {
      return null
    }

    return Math.min(Math.max(width / height, 0.42), 3.2)
  }, [height, width])
  const frameStyle: ImageFrameStyle | undefined = imageRatio
    ? { '--card-image-ratio': imageRatio.toFixed(4) }
    : undefined

  useEffect(() => {
    let isActive = true

    setIsLoaded(false)
    setIsUnavailable(false)
    setUrl(null)

    if (!path) {
      return undefined
    }

    getCardImageSignedUrl(path)
      .then((signedUrl) => {
        if (isActive) {
          setUrl(signedUrl)
        }
      })
      .catch(() => {
        if (isActive) {
          setIsUnavailable(true)
        }
      })

    return () => {
      isActive = false
    }
  }, [path])

  if (!path) {
    return null
  }

  return (
    <div
      className={cn('card-image-frame', className)}
      data-loaded={isLoaded ? 'true' : 'false'}
      data-orientation={imageRatio && imageRatio < 0.82 ? 'portrait' : 'landscape'}
      style={frameStyle}
    >
      {url && !isUnavailable ? (
        <img
          alt={alt}
          className={cn('card-image-media', imageClassName)}
          draggable={false}
          src={url}
          onError={() => setIsUnavailable(true)}
          onLoad={() => setIsLoaded(true)}
        />
      ) : null}
      {!isLoaded && !isUnavailable ? <div className="card-image-shimmer" /> : null}
      {isUnavailable ? (
        <div className="card-image-fallback">
          <ImageOff size={18} />
        </div>
      ) : null}
    </div>
  )
}
