import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'

type ReorderPreview = {
  draggedId: string
  shift: number
  targetId: string
}

type ReorderSession = {
  cleanup: (animateOverlay?: boolean, updateState?: boolean) => void
  frameId: number | null
  latestX: number
  latestY: number
  overlay: HTMLElement | null
  pointerId: number
  sourceId: string
  sourceRow: HTMLElement
  startX: number
  startY: number
  started: boolean
  targetId: string
  timerId: number | null
}

type ReorderStyle = CSSProperties & Record<`--${string}`, string | number>

const rowSelector = '[data-todo-reorder-id]'
const touchHoldMs = 280
const touchCancelDistance = 8

export function useTodoItemReorder(
  itemIds: string[],
  onCommit: (orderedIds: string[]) => void,
) {
  const [preview, setPreview] = useState<ReorderPreview | null>(null)
  const itemIdsRef = useRef(itemIds)
  const onCommitRef = useRef(onCommit)
  const sessionRef = useRef<ReorderSession | null>(null)
  itemIdsRef.current = itemIds
  onCommitRef.current = onCommit

  useEffect(() => () => sessionRef.current?.cleanup(false, false), [])

  const startReorder = useCallback((id: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || sessionRef.current) return

    const sourceRow = event.currentTarget.closest<HTMLElement>(rowSelector)
    if (!sourceRow) return

    event.preventDefault()
    event.stopPropagation()

    const pointerId = event.pointerId
    const startX = event.clientX
    const startY = event.clientY

    const updateOverlay = () => {
      const session = sessionRef.current
      if (!session?.overlay) return
      session.frameId = null
      session.overlay.style.transform = `translate3d(${session.latestX - session.startX}px, ${session.latestY - session.startY}px, 0) scale(1.018)`
    }

    const begin = () => {
      const session = sessionRef.current
      if (!session || session.started || !session.sourceRow.isConnected) return

      const rect = session.sourceRow.getBoundingClientRect()
      const container = session.sourceRow.parentElement
      if (!container) return

      const overlay = session.sourceRow.cloneNode(true) as HTMLElement
      overlay.classList.add('todo-drag-overlay')
      overlay.removeAttribute('data-todo-reorder-id')
      overlay.setAttribute('aria-hidden', 'true')
      overlay.querySelectorAll<HTMLElement>('button, [tabindex]').forEach((element) => {
        element.tabIndex = -1
      })
      Object.assign(overlay.style, {
        height: `${rect.height}px`,
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
      })
      document.body.append(overlay)

      const gap = Number.parseFloat(window.getComputedStyle(container).rowGap) || 7
      session.overlay = overlay
      session.started = true
      session.timerId = null
      setPreview({ draggedId: id, shift: rect.height + gap, targetId: id })
      updateOverlay()
    }

    const handleMove = (pointerEvent: PointerEvent) => {
      const session = sessionRef.current
      if (!session || pointerEvent.pointerId !== session.pointerId) return

      session.latestX = pointerEvent.clientX
      session.latestY = pointerEvent.clientY

      if (!session.started) {
        if (
          Math.hypot(pointerEvent.clientX - startX, pointerEvent.clientY - startY) >
          touchCancelDistance
        ) {
          session.cleanup(false)
        }
        return
      }

      pointerEvent.preventDefault()

      if (session.frameId === null) {
        session.frameId = window.requestAnimationFrame(updateOverlay)
      }

      const target = document.elementFromPoint(pointerEvent.clientX, pointerEvent.clientY)
        ?.closest<HTMLElement>(rowSelector)
      const targetId = target?.dataset.todoReorderId

      if (!targetId || target?.parentElement !== session.sourceRow.parentElement || targetId === session.targetId) {
        return
      }

      session.targetId = targetId
      setPreview((current) => current ? { ...current, targetId } : current)
    }

    const handleEnd = (pointerEvent: PointerEvent) => {
      const session = sessionRef.current
      if (!session || pointerEvent.pointerId !== session.pointerId) return

      const { sourceId, started, targetId } = session
      const currentIds = itemIdsRef.current
      const from = currentIds.indexOf(sourceId)
      const to = currentIds.indexOf(targetId)
      session.cleanup(started)

      if (!started || from < 0 || to < 0 || from === to) return

      const orderedIds = [...currentIds]
      const [movedId] = orderedIds.splice(from, 1)
      orderedIds.splice(to, 0, movedId)
      onCommitRef.current(orderedIds)
    }

    const cleanup = (animateOverlay = false, updateState = true) => {
      const session = sessionRef.current
      if (!session) return

      if (session.timerId !== null) window.clearTimeout(session.timerId)
      if (session.frameId !== null) window.cancelAnimationFrame(session.frameId)
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleEnd)
      window.removeEventListener('pointercancel', handleEnd)

      if (session.overlay) {
        const overlay = session.overlay
        if (animateOverlay) {
          overlay.classList.add('todo-drag-overlay-drop')
          window.setTimeout(() => overlay.remove(), 140)
        } else {
          overlay.remove()
        }
      }

      sessionRef.current = null
      if (updateState) setPreview(null)
    }

    const startsImmediately = event.pointerType !== 'touch'
    const session: ReorderSession = {
      cleanup,
      frameId: null,
      latestX: startX,
      latestY: startY,
      overlay: null,
      pointerId,
      sourceId: id,
      sourceRow,
      startX,
      startY,
      started: false,
      targetId: id,
      timerId: null,
    }
    sessionRef.current = session
    window.addEventListener('pointermove', handleMove, { passive: false })
    window.addEventListener('pointerup', handleEnd)
    window.addEventListener('pointercancel', handleEnd)

    if (startsImmediately) {
      begin()
    } else {
      session.timerId = window.setTimeout(begin, touchHoldMs)
    }
  }, [])

  const getItemStyle = useCallback((id: string): ReorderStyle | undefined => {
    if (!preview) return undefined

    if (id === preview.draggedId) {
      return { opacity: 0 }
    }

    const from = itemIds.indexOf(preview.draggedId)
    const to = itemIds.indexOf(preview.targetId)
    const index = itemIds.indexOf(id)
    if (from < 0 || to < 0 || index < 0) return undefined

    if (from < to && index > from && index <= to) {
      return { '--todo-reorder-shift': `${-preview.shift}px` }
    }

    if (from > to && index >= to && index < from) {
      return { '--todo-reorder-shift': `${preview.shift}px` }
    }

    return undefined
  }, [itemIds, preview])

  return {
    draggedId: preview?.draggedId ?? null,
    getItemStyle,
    startReorder,
  }
}
