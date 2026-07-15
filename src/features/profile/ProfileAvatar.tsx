import type { CSSProperties } from 'react'
import { cn } from '../../lib/cn.ts'
import { usePrivateImage } from '../../lib/usePrivateImage.ts'
import { getAvatarSignedUrl, getCachedAvatarSignedUrl } from './avatar.api.ts'

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
  const { failed, isLoaded, markFailed, markLoaded, url } = usePrivateImage(avatarPath, {
    getCachedUrl: getCachedAvatarSignedUrl,
    getUrl: getAvatarSignedUrl,
  })

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
      data-image-state={failed ? 'failed' : isLoaded ? 'loaded' : avatarPath ? 'loading' : 'initial'}
      style={style}
    >
      {url && !failed ? (
        <img
          alt=""
          decoding="async"
          draggable={false}
          src={url}
          onError={markFailed}
          onLoad={markLoaded}
        />
      ) : avatarPath && !failed ? (
        <span className="profile-avatar-loading" />
      ) : (
        <span>{initial}</span>
      )}
    </span>
  )
}
