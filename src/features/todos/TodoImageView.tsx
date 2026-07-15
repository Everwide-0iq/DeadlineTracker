import { ImageOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '../../lib/cn.ts'
import { getTodoImageSignedUrl } from './todoImage.api.ts'

type TodoImageViewProps = {
  alt: string
  className?: string
  path: string | null
}

export function TodoImageView({ alt, className, path }: TodoImageViewProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    setUrl(null)
    setFailed(false)

    if (!path) return undefined

    getTodoImageSignedUrl(path)
      .then((signedUrl) => {
        if (active) setUrl(signedUrl)
      })
      .catch(() => {
        if (active) setFailed(true)
      })

    return () => {
      active = false
    }
  }, [path])

  if (!path) return null

  return (
    <div className={cn('todo-item-image', className)}>
      {url && !failed ? (
        <img alt={alt} decoding="async" draggable={false} loading="lazy" src={url} onError={() => setFailed(true)} />
      ) : null}
      {!url && !failed ? <span className="todo-item-image-shimmer" /> : null}
      {failed ? <ImageOff size={16} /> : null}
    </div>
  )
}

