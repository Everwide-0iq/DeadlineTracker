import { memo, useLayoutEffect, useRef } from 'react'
import { cn } from '../../lib/cn.ts'
import { findFittingTextScale } from './cardTextFit.ts'

type Props = {
  title: string
  description: string | null
  completed: boolean
  fill: boolean
}

export const CardTextContent = memo(function CardTextContent({ title, description, completed, fill }: Props) {
  const areaRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const area = areaRef.current
    const text = textRef.current
    if (!area || !text) return
    if (!fill) {
      text.style.removeProperty('--card-text-fit')
      text.style.removeProperty('--card-text-leading')
      return
    }
    let disposed = false
    let frame = 0
    let previousWidth = 0
    let previousHeight = 0
    const fit = () => {
      if (disposed) return
      const height = area.clientHeight
      const width = area.clientWidth
      if (height <= 0 || width <= 0) return
      text.style.setProperty('--card-text-leading', '1')
      // The box has independent flex geometry, so font changes cannot resize the card.
      const scale = findFittingTextScale(Math.max(1, height / 28), candidate => {
        text.style.setProperty('--card-text-fit', String(candidate))
        return text.offsetHeight <= height - 1 && text.scrollWidth <= width
      })
      text.style.setProperty('--card-text-fit', String(scale))
      // A new wrapped line can prevent the next font size from fitting. Spread the
      // small remainder through line spacing, with a readability cap.
      const margin = description ? 12 : 0
      const leading = Math.max(1, Math.min(1.25, (height - margin - 2) / Math.max(1, text.offsetHeight - margin)))
      text.style.setProperty('--card-text-leading', String(leading))
      previousWidth = width
      previousHeight = height
    }
    fit()
    const observer = new ResizeObserver(() => {
      if (area.clientWidth === previousWidth && area.clientHeight === previousHeight) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(fit)
    })
    observer.observe(area)
    if (document.fonts.status !== 'loaded') void document.fonts.ready.then(fit)
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [title, description, fill])

  return (
    <div ref={areaRef} className="deadline-card-copy" data-fill={fill}>
      <div ref={textRef} className="deadline-card-copy-text">
        <h3 className={cn('deadline-card-title whitespace-pre-wrap break-words font-bold text-white drop-shadow', completed && 'text-white/55 line-through')}>
          {title}
        </h3>
        {description ? <p className="deadline-card-description whitespace-pre-wrap break-words text-white/55">{description}</p> : null}
      </div>
    </div>
  )
})
