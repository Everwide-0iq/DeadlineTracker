import { cn } from '../lib/cn.ts'

export function BrandIcon({ size = 48, className }: { size?: number; className?: string }) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={cn('block shrink-0 select-none rounded-xl object-contain', className)}
      draggable={false}
      height={size}
      width={size}
      style={{ width: size, height: size }}
      src="/brand/fireboard-128.png"
      srcSet="/brand/fireboard-64.png 64w, /brand/fireboard-128.png 128w, /brand/fireboard-192.png 192w"
      sizes={`${size}px`}
    />
  )
}
