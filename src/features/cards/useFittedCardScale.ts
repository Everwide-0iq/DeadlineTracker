import { useLayoutEffect, useRef, useState } from 'react'

export function useFittedCardScale(proposed: number, layout: object) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState<{ layout: object; scale: number } | null>(null)
  const scale = fit?.layout === layout ? Math.min(proposed, fit.scale) : proposed
  useLayoutEffect(() => {
    const element = contentRef.current
    if (!element || scale <= 0.85) return
    // Localized countdowns and actual font metrics can wrap beyond the geometry estimate.
    // Measure only when content or size changes, never while panning.
    if (element.scrollHeight > element.clientHeight + 1) {
      const next = Math.max(0.85, Math.floor(scale * element.clientHeight / (element.scrollHeight + 2) * 1000) / 1000)
      if (next < scale) setFit({ layout, scale: next })
    }
  }, [layout, scale])
  return { contentRef, scale }
}
