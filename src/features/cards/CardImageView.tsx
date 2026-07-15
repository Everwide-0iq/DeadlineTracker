import { ImageOff } from 'lucide-react'
import { useMemo, type CSSProperties } from 'react'
import { cn } from '../../lib/cn.ts'
import { usePrivateImage } from '../../lib/usePrivateImage.ts'
import { getCachedCardImageSignedUrl, getCardImageSignedUrl } from './cardImage.api.ts'

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
  const { failed: isUnavailable, isLoaded, markFailed, markLoaded, url } = usePrivateImage(path, {
    getCachedUrl: getCachedCardImageSignedUrl,
    getUrl: getCardImageSignedUrl,
  })
  const imageRatio = useMemo(() => {
    if (!width || !height) {
      return null
    }

    return Math.min(Math.max(width / height, 0.42), 3.2)
  }, [height, width])
  const frameStyle: ImageFrameStyle | undefined = imageRatio
    ? { '--card-image-ratio': imageRatio.toFixed(4) }
    : undefined

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
        <>
          <img
            aria-hidden="true"
            alt=""
            className="card-image-backdrop"
            decoding="async"
            draggable={false}
            loading="lazy"
            src={url}
          />
          <img
            alt={alt}
            className={cn('card-image-media', imageClassName)}
            decoding="async"
            draggable={false}
            loading="lazy"
            src={url}
            onError={markFailed}
            onLoad={markLoaded}
          />
        </>
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
