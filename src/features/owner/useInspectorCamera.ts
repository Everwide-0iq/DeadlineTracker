import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import type { BoardCamera } from '../board/useBoardCamera.ts'
import { zoomAt } from './ownerBoard.model.ts'

// Isolated camera: never writes the working board's store or browser preferences.
export function useInspectorCamera() {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [camera, setCamera] = useState<BoardCamera>({ x: 0, y: 0, zoom: 1 })
  const [size, setSize] = useState({ width: 0, height: 0 })
  const latest = useRef(camera)
  const frame = useRef(0)
  const points = useRef(new Map<number, { x: number; y: number }>())
  const moved = useRef(false)
  const travel = useRef(0)
  const move = useCallback((next: BoardCamera) => {
    latest.current = next
    if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; setCamera(latest.current) })
  }, [])
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const activePoints = points.current
    const observer = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }))
    observer.observe(el)
    const wheel = (event: WheelEvent) => {
      if ((event.target as HTMLElement).closest('[data-inspector-ui]')) return
      event.preventDefault()
      const rect = el.getBoundingClientRect()
      move(zoomAt(latest.current, Math.exp(-event.deltaY * 0.0015), event.clientX - rect.left, event.clientY - rect.top))
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => { observer.disconnect(); el.removeEventListener('wheel', wheel); cancelAnimationFrame(frame.current); frame.current = 0; activePoints.clear() }
  }, [move])
  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('[data-inspector-ui]')) return
    if (!points.current.size) { moved.current = false; travel.current = 0 }
    points.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    // Capture on the original node, retaining click selection after a stationary press.
    const target = event.target instanceof Element ? event.target : event.currentTarget
    target.setPointerCapture(event.pointerId)
  }
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const prev = points.current.get(event.pointerId)
    if (!prev) return
    const before = [...points.current.values()]
    const next = { x: event.clientX, y: event.clientY }
    points.current.set(event.pointerId, next)
    const dx = next.x - prev.x, dy = next.y - prev.y
    travel.current += Math.hypot(dx, dy)
    if (travel.current > 4) moved.current = true
    if (before.length === 2) {
      moved.current = true
      const after = [...points.current.values()]
      const distance = (p: { x: number; y: number }[]) => Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y)
      const center = (p: { x: number; y: number }[]) => ({ x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 })
      const a = center(before), b = center(after), rect = event.currentTarget.getBoundingClientRect()
      const zoomed = zoomAt(latest.current, distance(after) / Math.max(1, distance(before)), a.x - rect.left, a.y - rect.top)
      move({ ...zoomed, x: zoomed.x + b.x - a.x, y: zoomed.y + b.y - a.y })
    } else move({ ...latest.current, x: latest.current.x + dx, y: latest.current.y + dy })
  }
  const pointerUp = (event: PointerEvent<HTMLDivElement>) => { points.current.delete(event.pointerId) }
  return { viewportRef, camera, size, move, latest, moved, pointerDown, pointerMove, pointerUp }
}
