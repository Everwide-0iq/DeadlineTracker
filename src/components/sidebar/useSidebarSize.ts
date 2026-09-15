import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { readStorageValue, writeStorageValue } from '../../lib/storage.ts'

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const readSize = (key: string, fallback: number) => {
  const stored = readStorageValue(key)
  const value = stored === null ? fallback : Number(stored)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function useSidebarSize(scope: string) {
  const root = useRef<HTMLElement>(null)
  const projects = useRef<HTMLDivElement>(null)
  const drag = useRef<{ axis: 'width' | 'height'; start: number; size: number } | null>(null)
  const [width, setWidth] = useState(() => readSize('fireboard.sidebar.width', 320))
  const [height, setHeight] = useState(() => readSize('fireboard.sidebar.projects', 10000))
  const [limits, setLimits] = useState({ width: 560, height: 400 })
  useEffect(() => {
    const element = root.current
    if (!element) return
    const measure = () => {
      let occupied = 40
      for (const child of Array.from(element.children)) {
        if (!(child instanceof HTMLElement) || child === projects.current || child.dataset.resize === 'width') continue
        const style = getComputedStyle(child)
        occupied += child.offsetHeight + (child.classList.contains('mt-auto') ? 0 : parseFloat(style.marginTop)) + parseFloat(style.marginBottom)
      }
      setLimits({ width: Math.max(300, Math.min(600, window.innerWidth - 620)), height: Math.max(100, element.clientHeight - occupied) })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    for (const child of Array.from(element.children)) if (child !== projects.current) observer.observe(child)
    measure()
    window.addEventListener('resize', measure)
    return () => { observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [scope])

  const size = { width: clamp(width, 300, limits.width), height: clamp(height, 100, limits.height) }
  const update = (axis: 'width' | 'height', value: number) => {
    const next = clamp(value, axis === 'width' ? 300 : 100, limits[axis])
    if (axis === 'width') setWidth(next)
    else setHeight(next)
    return next
  }
  const persist = (axis: 'width' | 'height') => {
    writeStorageValue(axis === 'width' ? 'fireboard.sidebar.width' : 'fireboard.sidebar.projects', String(size[axis]))
  }
  const handle = (axis: 'width' | 'height') => ({
    role: 'separator' as const,
    tabIndex: 0,
    'aria-orientation': axis === 'width' ? 'vertical' as const : 'horizontal' as const,
    'aria-valuemin': axis === 'width' ? 300 : 100,
    'aria-valuemax': limits[axis],
    'aria-valuenow': Math.round(size[axis]),
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      drag.current = { axis, start: axis === 'width' ? event.clientX : event.clientY, size: size[axis] }
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      if (drag.current?.axis !== axis) return
      update(axis, drag.current.size + (axis === 'width' ? event.clientX : event.clientY) - drag.current.start)
    },
    onPointerUp: () => { drag.current = null; persist(axis) },
    onPointerCancel: () => { drag.current = null; persist(axis) },
    onLostPointerCapture: () => { drag.current = null },
    onDoubleClick: () => { update(axis, axis === 'width' ? 320 : limits.height); writeStorageValue(axis === 'width' ? 'fireboard.sidebar.width' : 'fireboard.sidebar.projects', String(axis === 'width' ? 320 : 10000)) },
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      const delta = ({ ArrowLeft: -16, ArrowUp: -16, ArrowRight: 16, ArrowDown: 16 } as Record<string, number>)[event.key]
      if (delta === undefined && event.key !== 'Home' && event.key !== 'End') return
      event.preventDefault()
      const next = update(axis, event.key === 'Home' ? 0 : event.key === 'End' ? limits[axis] : size[axis] + delta)
      writeStorageValue(axis === 'width' ? 'fireboard.sidebar.width' : 'fireboard.sidebar.projects', String(next))
    },
  })
  return { root, projects, size, handle }
}
