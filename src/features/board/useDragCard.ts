import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { useCardStore } from '../cards/card.store.ts'
import type { Card } from '../cards/card.types.ts'
import type { BoardCamera } from './useBoardCamera.ts'

type DragState = {
  frameId: number | null
  latestX: number
  latestY: number
  pendingX: number
  pendingY: number
  removeListeners: () => void
}

type UseDragCardOptions = {
  camera: BoardCamera
  card: Card
  enabled: boolean
}

const snapDistance = 16

type SnapAxis = {
  coordinate: number
  delta: number
}

const getCardLines = (card: Card, x = card.x, y = card.y) => ({
  horizontal: [
    { coordinate: x, offset: 0 },
    { coordinate: x + card.w / 2, offset: card.w / 2 },
    { coordinate: x + card.w, offset: card.w },
  ],
  vertical: [
    { coordinate: y, offset: 0 },
    { coordinate: y + card.h / 2, offset: card.h / 2 },
    { coordinate: y + card.h, offset: card.h },
  ],
})

const findSnapAxis = (
  ownLines: Array<{ coordinate: number; offset: number }>,
  targetLines: Array<{ coordinate: number }>,
): SnapAxis | null => {
  let best: SnapAxis | null = null

  for (const ownLine of ownLines) {
    for (const targetLine of targetLines) {
      const distance = Math.abs(targetLine.coordinate - ownLine.coordinate)

      if (distance > snapDistance || (best && distance >= Math.abs(best.delta))) {
        continue
      }

      best = {
        coordinate: targetLine.coordinate,
        delta: targetLine.coordinate - ownLine.coordinate,
      }
    }
  }

  return best
}

const getMagneticPosition = (cards: Card[], card: Card, rawX: number, rawY: number) => {
  const ownLines = getCardLines(card, rawX, rawY)
  const targetLines = cards
    .filter((item) => item.id !== card.id)
    .map((item) => getCardLines(item))

  const snapX = findSnapAxis(
    ownLines.horizontal,
    targetLines.flatMap((lines) => lines.horizontal),
  )
  const snapY = findSnapAxis(
    ownLines.vertical,
    targetLines.flatMap((lines) => lines.vertical),
  )

  return {
    guide: snapX || snapY ? { cardId: card.id, x: snapX?.coordinate, y: snapY?.coordinate } : null,
    x: rawX + (snapX?.delta ?? 0),
    y: rawY + (snapY?.delta ?? 0),
  }
}

export function useDragCard({ camera, card, enabled }: UseDragCardOptions) {
  const dragRef = useRef<DragState | null>(null)

  useEffect(
    () => () => {
      dragRef.current?.removeListeners()
    },
    [],
  )

  return useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || event.button !== 0) {
        return
      }

      const target = event.target as HTMLElement

      if (target.closest('[data-card-action="true"]')) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const startClientX = event.clientX
      const startClientY = event.clientY
      const startX = card.x
      const startY = card.y
      const flushMove = () => {
        const dragState = dragRef.current

        if (!dragState) {
          return
        }

        dragState.frameId = null
        dragState.latestX = dragState.pendingX
        dragState.latestY = dragState.pendingY
        useCardStore.getState().moveCardLocal(card.id, dragState.pendingX, dragState.pendingY)
      }

      const handleMove = (moveEvent: PointerEvent) => {
        const rawX = startX + (moveEvent.clientX - startClientX) / camera.zoom
        const rawY = startY + (moveEvent.clientY - startClientY) / camera.zoom
        const next = moveEvent.shiftKey
          ? { guide: null, x: rawX, y: rawY }
          : getMagneticPosition(useCardStore.getState().cards, card, rawX, rawY)
        const dragState = dragRef.current

        if (!dragState) {
          return
        }

        dragState.pendingX = next.x
        dragState.pendingY = next.y
        useCardStore.getState().setDragGuide(next.guide)

        if (dragState.frameId === null) {
          dragState.frameId = window.requestAnimationFrame(flushMove)
        }
      }

      const handleUp = () => {
        const dragState = dragRef.current
        removeListeners()

        if (!dragState) {
          return
        }

        void useCardStore
          .getState()
          .persistCardPosition(card.id, dragState.latestX, dragState.latestY)
          .catch(() => undefined)
      }

      function removeListeners() {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
        window.removeEventListener('pointercancel', handleUp)

        if (dragRef.current?.frameId !== null && dragRef.current?.frameId !== undefined) {
          window.cancelAnimationFrame(dragRef.current.frameId)
          dragRef.current.latestX = dragRef.current.pendingX
          dragRef.current.latestY = dragRef.current.pendingY
          useCardStore.getState().moveCardLocal(card.id, dragRef.current.latestX, dragRef.current.latestY)
        }

        dragRef.current = null
        useCardStore.getState().clearDragGuide()
      }

      dragRef.current = {
        frameId: null,
        latestX: card.x,
        latestY: card.y,
        pendingX: card.x,
        pendingY: card.y,
        removeListeners,
      }
      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
      window.addEventListener('pointercancel', handleUp)
    },
    [camera.zoom, card, enabled],
  )
}
