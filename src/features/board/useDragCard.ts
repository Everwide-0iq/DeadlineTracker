import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { useCardStore } from '../cards/card.store.ts'
import type { Card } from '../cards/card.types.ts'
import { getCardRenderSize } from '../cards/card.utils.ts'
import type { DragGuide } from './dragGuide.types.ts'

type DragState = {
  didMove: boolean
  frameId: number | null
  latestPositions: CardPosition[]
  lastGuide: DragGuide | null
  ownSize: {
    h: number
    w: number
  }
  pendingPositions: CardPosition[]
  primaryStart: {
    x: number
    y: number
  }
  removeListeners: () => void
  startPositions: CardPosition[]
  targetLines: CardLineSet[]
}

type UseDragCardOptions = {
  cameraZoom: number
  card: Card
  enabled: boolean
}

const snapDistance = 16

type SnapAxis = {
  coordinate: number
  delta: number
}

type CardPosition = {
  id: string
  x: number
  y: number
}

type CardLineSet = {
  horizontal: Array<{ coordinate: number; offset: number }>
  vertical: Array<{ coordinate: number; offset: number }>
}

const getLinesFromSize = (x: number, y: number, w: number, h: number): CardLineSet => ({
  horizontal: [
    { coordinate: x, offset: 0 },
    { coordinate: x + w / 2, offset: w / 2 },
    { coordinate: x + w, offset: w },
  ],
  vertical: [
    { coordinate: y, offset: 0 },
    { coordinate: y + h / 2, offset: h / 2 },
    { coordinate: y + h, offset: h },
  ],
})

const getCardLines = (card: Card) => {
  const renderSize = getCardRenderSize(card)
  return getLinesFromSize(card.x, card.y, renderSize.w, renderSize.h)
}

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

const areGuidesEqual = (left: DragGuide | null, right: DragGuide | null) =>
  left?.cardId === right?.cardId && left?.x === right?.x && left?.y === right?.y

const getMagneticPosition = (
  card: Card,
  ownSize: { h: number; w: number },
  targetLines: CardLineSet[],
  rawX: number,
  rawY: number,
) => {
  const ownLines = getLinesFromSize(rawX, rawY, ownSize.w, ownSize.h)
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

export function useDragCard({ cameraZoom, card, enabled }: UseDragCardOptions) {
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

      const target = event.target

      if (target instanceof Element && target.closest('[data-card-action="true"]')) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const cardElement = event.currentTarget
      const startClientX = event.clientX
      const startClientY = event.clientY
      const startX = card.x
      const startY = card.y
      const state = useCardStore.getState()
      state.setGeometryInteracting(true)
      const selectedIds = new Set(state.selectedCardIds)
      const shouldDragSelection = selectedIds.has(card.id) && selectedIds.size > 1

      if (!shouldDragSelection && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        state.selectCard(card.id)
      }

      const dragCards =
        shouldDragSelection ? state.cards.filter((item) => selectedIds.has(item.id)) : [card]
      const dragCardIds = new Set(dragCards.map((item) => item.id))
      const startPositions = dragCards.map((item) => ({
        id: item.id,
        x: item.x,
        y: item.y,
      }))
      const ownSize = getCardRenderSize(card)
      const targetLines = state.cards
        .filter((item) => !dragCardIds.has(item.id))
        .map((item) => getCardLines(item))
      const flushMove = () => {
        const dragState = dragRef.current

        if (!dragState) {
          return
        }

        dragState.frameId = null
        dragState.latestPositions = dragState.pendingPositions
        useCardStore.getState().moveCardsLocal(dragState.pendingPositions)
      }

      const handleMove = (moveEvent: PointerEvent) => {
        const dragState = dragRef.current

        if (!dragState) {
          return
        }

        const movedEnough =
          Math.abs(moveEvent.clientX - startClientX) > 3 ||
          Math.abs(moveEvent.clientY - startClientY) > 3

        if (!dragState.didMove && !movedEnough) {
          return
        }

        dragState.didMove = true
        if (movedEnough) {
          cardElement.dataset.cardDragMoved = 'true'
        }

        const rawX = startX + (moveEvent.clientX - startClientX) / cameraZoom
        const rawY = startY + (moveEvent.clientY - startClientY) / cameraZoom
        const next = moveEvent.shiftKey
          ? { guide: null, x: rawX, y: rawY }
          : getMagneticPosition(card, dragState.ownSize, dragState.targetLines, rawX, rawY)
        const deltaX = next.x - dragState.primaryStart.x
        const deltaY = next.y - dragState.primaryStart.y

        dragState.pendingPositions = dragState.startPositions.map((position) => ({
          id: position.id,
          x: position.x + deltaX,
          y: position.y + deltaY,
        }))

        if (!areGuidesEqual(dragState.lastGuide, next.guide)) {
          dragState.lastGuide = next.guide
          useCardStore.getState().setDragGuide(next.guide)
        }

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

        if (dragState.didMove) {
          void useCardStore
            .getState()
            .persistCardPositions(dragState.latestPositions)
            .catch(() => {
              const state = useCardStore.getState()
              const attemptedById = new Map(
                dragState.latestPositions.map((position) => [position.id, position]),
              )
              const safeRollback = dragState.startPositions.filter((position) => {
                const current = state.cards.find((item) => item.id === position.id)
                const attempted = attemptedById.get(position.id)
                return current && attempted && current.x === attempted.x && current.y === attempted.y
              })

              state.moveCardsLocal(safeRollback)
            })
        }
      }

      function removeListeners() {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
        window.removeEventListener('pointercancel', handleUp)

        if (dragRef.current?.frameId !== null && dragRef.current?.frameId !== undefined) {
          window.cancelAnimationFrame(dragRef.current.frameId)
          dragRef.current.latestPositions = dragRef.current.pendingPositions
          useCardStore.getState().moveCardsLocal(dragRef.current.latestPositions)
        }

        dragRef.current = null
        useCardStore.getState().clearDragGuide()
        useCardStore.getState().setGeometryInteracting(false)
        window.setTimeout(() => {
          delete cardElement.dataset.cardDragMoved
        }, 0)
      }

      dragRef.current = {
        didMove: false,
        frameId: null,
        latestPositions: startPositions,
        lastGuide: null,
        ownSize,
        pendingPositions: startPositions,
        primaryStart: {
          x: startX,
          y: startY,
        },
        removeListeners,
        startPositions,
        targetLines,
      }
      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
      window.addEventListener('pointercancel', handleUp)
    },
    [cameraZoom, card, enabled],
  )
}
