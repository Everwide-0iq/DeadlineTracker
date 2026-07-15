import { useEffect, useState, type CSSProperties } from 'react'
import { cn } from '../../lib/cn.ts'
import { getAvatarSignedUrl } from './avatar.api.ts'

type ProfileAvatarProps = {
  avatarPath?: string | null
  className?: string
  color: string
  name: string
  size?: number
}

type AvatarStyle = CSSProperties & Record<`--${string}`, string | number>

export function ProfileAvatar({
  avatarPath = null,
  className,
  color,
  name,
  size = 36,
}: ProfileAvatarProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [failedPath, setFailedPath] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setUrl(null)
    setFailedPath(null)

    if (!avatarPath) {
      return undefined
    }

    getAvatarSignedUrl(avatarPath)
      .then((signedUrl) => {
        if (active) {
          setUrl(signedUrl)
        }
      })
      .catch(() => {
        if (active) {
          setFailedPath(avatarPath)
        }
      })

    return () => {
      active = false
    }
  }, [avatarPath])

  const style: AvatarStyle = {
    '--profile-color': color,
    fontSize: Math.max(10, Math.round(size * 0.42)),
    height: size,
    width: size,
  }
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? '?'

  return (
    <span
      aria-hidden="true"
      className={cn('profile-avatar', className)}
      style={style}
    >
      {url && failedPath !== avatarPath ? (
        <img alt="" draggable={false} src={url} onError={() => setFailedPath(avatarPath)} />
      ) : (
        <span>{initial}</span>
      )}
    </span>
  )
}
