import { ImageOff } from 'lucide-react'
import { cn } from '../../lib/cn.ts'
import { usePrivateImage } from '../../lib/usePrivateImage.ts'
import { getCachedTodoImageSignedUrl, getTodoImageSignedUrl } from './todoImage.api.ts'

type TodoImageViewProps = {
  alt: string
  className?: string
  path: string | null
}

export function TodoImageView({ alt, className, path }: TodoImageViewProps) {
  const { failed, isLoaded, markFailed, markLoaded, url } = usePrivateImage(path, {
    getCachedUrl: getCachedTodoImageSignedUrl,
    getUrl: getTodoImageSignedUrl,
  })

  if (!path) return null

  return (
    <div className={cn('todo-item-image', className)}>
      {url && !failed ? (
        <img
          alt={alt}
          decoding="async"
          draggable={false}
          loading="lazy"
          src={url}
          onError={markFailed}
          onLoad={markLoaded}
        />
      ) : null}
      {!isLoaded && !failed ? <span className="todo-item-image-shimmer" /> : null}
      {failed ? <ImageOff size={16} /> : null}
    </div>
  )
}
