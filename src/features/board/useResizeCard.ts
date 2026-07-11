import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { useBoardTextStore } from '../boardTexts/boardText.store.ts'
import { useCardLinkStore } from '../cardLinks/cardLink.store.ts'
import { useCardStore } from '../cards/card.store.ts'
import type { Card } from '../cards/card.types.ts'
import { getCardContentHeight, getCardRenderSize } from '../cards/card.utils.ts'

export type CardResizeDirection = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

type CardGeometry = Pick<Card, 'h' | 'w' | 'x' | 'y'>

type ResizeState = {
  frameId: number | null
  latest: CardGeometryUpdate[]
  pending: CardGeometryUpdate[]
  removeListeners: () => void
}

type UseResizeCardOptions = {
  cameraZoom: number
  card: Card
  enabled: boolean
}

type CardGeometryUpdate = {
  geometry: CardGeometry
  id: string
}

type GroupBounds = {
  bottom: number
  left: number
  right: number
  top: number
}

const minCardWidth = 280
const maxCardWidth = 3200
const maxCardHeight = 6000
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const roundGeometry = ({ h, w, x, y }: CardGeometry): CardGeometry => ({
  h: Math.round(h),
  w: Math.round(w),
  x: Math.round(x),
  y: Math.round(y),
})

const getMinimumHeightForWidth = (card: Card, width: number) =>
  getCardContentHeight({
    description: card.description,
    imageHeight: card.imageHeight,
    imagePath: card.imagePath,
    imageWidth: card.imageWidth,
    title: card.title,
    w: width,
  })

const computeResizeGeometry = (
  card: Card,
  direction: CardResizeDirection,
  start: CardGeometry,
  deltaX: number,
  deltaY: number,
) => {
  const touchesLeft = direction.includes('w')
  const touchesRight = direction.includes('e')
  const touchesTop = direction.includes('n')
  const touchesBottom = direction.includes('s')

  let nextW = start.w
  let nextH = start.h

  if (touchesRight) {
    nextW = start.w + deltaX
  }

  if (touchesLeft) {
    nextW = start.w - deltaX
  }

  nextW = clamp(nextW, minCardWidth, maxCardWidth)

  const minHeight = getMinimumHeightForWidth(card, nextW)

  if (touchesBottom) {
    nextH = start.h + deltaY
  }

  if (touchesTop) {
    nextH = start.h - deltaY
  }

  nextH = clamp(nextH, minHeight, maxCardHeight)

  return roundGeometry({
    h: nextH,
    w: nextW,
    x: touchesLeft ? start.x + start.w - nextW : start.x,
    y: touchesTop ? start.y + start.h - nextH : start.y,
  })
}

const getCardGeometry = (card: Card): CardGeometry => {
  const renderSize = getCardRenderSize(card)
  return {
    h: renderSize.h,
    w: renderSize.w,
    x: card.x,
    y: card.y,
  }
}

const getGroupBounds = (geometries: CardGeometry[]): GroupBounds =>
  geometries.reduce<GroupBounds>(
    (bounds, geometry) => ({
      bottom: Math.max(bounds.bottom, geometry.y + geometry.h),
      left: Math.min(bounds.left, geometry.x),
      right: Math.max(bounds.right, geometry.x + geometry.w),
      top: Math.min(bounds.top, geometry.y),
    }),
    {
      bottom: Number.NEGATIVE_INFINITY,
      left: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
    },
  )

const computeGroupResizeGeometry = (
  cards: Card[],
  direction: CardResizeDirection,
  startUpdates: CardGeometryUpdate[],
  deltaX: number,
  deltaY: number,
): CardGeometryUpdate[] => {
  const geometryById = new Map(startUpdates.map((update) => [update.id, update.geometry]))
  const cardById = new Map(cards.map((item) => [item.id, item]))
  const startBounds = getGroupBounds(startUpdates.map((update) => update.geometry))
  const startWidth = Math.max(startBounds.right - startBounds.left, 1)
  const startHeight = Math.max(startBounds.bottom - startBounds.top, 1)
  const touchesLeft = direction.includes('w')
  const touchesRight = direction.includes('e')
  const touchesTop = direction.includes('n')
  const touchesBottom = direction.includes('s')
  let nextLeft = startBounds.left
  let nextRight = startBounds.right
  let nextTop = startBounds.top
  let nextBottom = startBounds.bottom

  if (touchesLeft) {
    nextLeft += deltaX
  }

  if (touchesRight) {
    nextRight += deltaX
  }

  if (touchesTop) {
    nextTop += deltaY
  }

  if (touchesBottom) {
    nextBottom += deltaY
  }

  let scaleX = Math.max((nextRight - nextLeft) / startWidth, 0.05)
  let scaleY = Math.max((nextBottom - nextTop) / startHeight, 0.05)

  if (!touchesLeft && !touchesRight) {
    scaleX = 1
  }

  if (!touchesTop && !touchesBottom) {
    scaleY = 1
  }

  const minScaleX = Math.max(
    0.05,
    ...startUpdates.map((update) => minCardWidth / Math.max(update.geometry.w, 1)),
  )
  const maxScaleX = Math.min(
    ...startUpdates.map((update) => maxCardWidth / Math.max(update.geometry.w, 1)),
  )

  scaleX = clamp(scaleX, minScaleX, maxScaleX)

  const getScaledGeometry = (update: CardGeometryUpdate, forcedScaleY = scaleY) => {
    const card = cardById.get(update.id)
    const start = update.geometry
    const nextW = clamp(start.w * scaleX, minCardWidth, maxCardWidth)
    const minHeight = card ? getMinimumHeightForWidth(card, nextW) : start.h
    const nextH = clamp(start.h * forcedScaleY, minHeight, maxCardHeight)
    const x = touchesLeft
      ? startBounds.right - (startBounds.right - start.x) * scaleX
      : startBounds.left + (start.x - startBounds.left) * scaleX
    const y = touchesTop
      ? startBounds.bottom - (startBounds.bottom - start.y) * forcedScaleY
      : startBounds.top + (start.y - startBounds.top) * forcedScaleY

    return roundGeometry({
      h: nextH,
      w: nextW,
      x,
      y,
    })
  }

  const minScaleY = Math.max(
    0.05,
    ...startUpdates.map((update) => {
      const card = cardById.get(update.id)
      const start = geometryById.get(update.id)

      if (!card || !start) {
        return 0.05
      }

      return getMinimumHeightForWidth(card, Math.max(minCardWidth, start.w * scaleX)) / Math.max(start.h, 1)
    }),
  )
  const maxScaleY = Math.min(
    ...startUpdates.map((update) => maxCardHeight / Math.max(update.geometry.h, 1)),
  )

  scaleY = clamp(scaleY, minScaleY, maxScaleY)

  return startUpdates.map((update) => ({
    geometry: getScaledGeometry(update, scaleY),
    id: update.id,
  }))
}

export function useResizeCard({ cameraZoom, card, enabled }: UseResizeCardOptions) {
  const resizeRef = useRef<ResizeState | null>(null)

  useEffect(
    () => () => {
      resizeRef.current?.removeListeners()
    },
    [],
  )

  return useCallback(
    (direction: CardResizeDirection, event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!enabled || event.button !== 0 || event.pointerType === 'touch') {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      useCardLinkStore.getState().selectLink(null)
      useBoardTextStore.getState().selectText(null)
      const state = useCardStore.getState()
      state.setGeometryInteracting(true)
      const selectedIds = new Set(state.selectedCardIds)
      const resizeCards =
        selectedIds.has(card.id) && selectedIds.size > 1
          ? state.cards.filter((item) => selectedIds.has(item.id))
          : [card]

      if (resizeCards.length === 1) {
        state.selectCard(card.id)
      }

      const startClientX = event.clientX
      const startClientY = event.clientY
      const renderSize = getCardRenderSize(card)
      const cardElement = event.currentTarget.closest('.deadline-card') as HTMLElement | null
      const start: CardGeometry = {
        h: cardElement?.offsetHeight ?? renderSize.h,
        w: cardElement?.offsetWidth ?? renderSize.w,
        x: card.x,
        y: card.y,
      }
      const startUpdates =
        resizeCards.length > 1
          ? resizeCards.map((item) => ({ geometry: getCardGeometry(item), id: item.id }))
          : [{ geometry: start, id: card.id }]

      const flushResize = () => {
        const resizeState = resizeRef.current

        if (!resizeState) {
          return
        }

        resizeState.frameId = null
        resizeState.latest = resizeState.pending
        useCardStore.getState().resizeCardsLocal(resizeState.pending)
      }

      const handleMove = (moveEvent: PointerEvent) => {
        const resizeState = resizeRef.current

        if (!resizeState) {
          return
        }

        const deltaX = (moveEvent.clientX - startClientX) / cameraZoom
        const deltaY = (moveEvent.clientY - startClientY) / cameraZoom

        resizeState.pending =
          startUpdates.length > 1
            ? computeGroupResizeGeometry(resizeCards, direction, startUpdates, deltaX, deltaY)
            : [
                {
                  geometry: computeResizeGeometry(card, direction, start, deltaX, deltaY),
                  id: card.id,
                },
              ]

        if (resizeState.frameId === null) {
          resizeState.frameId = window.requestAnimationFrame(flushResize)
        }
      }

      const handleUp = () => {
        const resizeState = resizeRef.current
        removeListeners()

        if (!resizeState) {
          return
        }

        void useCardStore
          .getState()
          .persistCardsGeometry(resizeState.latest)
          .catch(() => {
            const state = useCardStore.getState()
            const attemptedById = new Map(
              resizeState.latest.map((update) => [update.id, update.geometry]),
            )
            const safeRollback = startUpdates.filter((update) => {
              const current = state.cards.find((item) => item.id === update.id)
              const attempted = attemptedById.get(update.id)
              return (
                current &&
                attempted &&
                current.x === attempted.x &&
                current.y === attempted.y &&
                current.w === attempted.w &&
                current.h === attempted.h
              )
            })

            state.resizeCardsLocal(safeRollback)
          })
      }

      function removeListeners() {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
        window.removeEventListener('pointercancel', handleUp)

        if (resizeRef.current?.frameId !== null && resizeRef.current?.frameId !== undefined) {
          window.cancelAnimationFrame(resizeRef.current.frameId)
          resizeRef.current.latest = resizeRef.current.pending
          useCardStore.getState().resizeCardsLocal(resizeRef.current.latest)
        }

        resizeRef.current = null
        useCardStore.getState().setGeometryInteracting(false)
      }

      resizeRef.current = {
        frameId: null,
        latest: startUpdates,
        pending: startUpdates,
        removeListeners,
      }
      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
      window.addEventListener('pointercancel', handleUp)
    },
    [cameraZoom, card, enabled],
  )
}
