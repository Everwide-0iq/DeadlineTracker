import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { useBoardTextStore } from '../boardTexts/boardText.store.ts'
import { useCardLinkStore } from '../cardLinks/cardLink.store.ts'
import { useCardStore } from '../cards/card.store.ts'
import type { Card } from '../cards/card.types.ts'
import { getCardContentHeight, getCardRenderSize } from '../cards/card.utils.ts'
import type { BoardCamera } from './useBoardCamera.ts'

export type CardResizeDirection = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

type CardGeometry = Pick<Card, 'h' | 'w' | 'x' | 'y'>

type ResizeState = {
  frameId: number | null
  latest: CardGeometry
  pending: CardGeometry
  removeListeners: () => void
}

type UseResizeCardOptions = {
  camera: BoardCamera
  card: Card
  enabled: boolean
}

const minCardWidth = 280

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

  nextW = Math.max(minCardWidth, nextW)

  const minHeight = getMinimumHeightForWidth(card, nextW)

  if (touchesBottom) {
    nextH = start.h + deltaY
  }

  if (touchesTop) {
    nextH = start.h - deltaY
  }

  nextH = Math.max(minHeight, nextH)

  return roundGeometry({
    h: nextH,
    w: nextW,
    x: touchesLeft ? start.x + start.w - nextW : start.x,
    y: touchesTop ? start.y + start.h - nextH : start.y,
  })
}

export function useResizeCard({ camera, card, enabled }: UseResizeCardOptions) {
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
      useCardStore.getState().selectCard(card.id)

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

      const flushResize = () => {
        const resizeState = resizeRef.current

        if (!resizeState) {
          return
        }

        resizeState.frameId = null
        resizeState.latest = resizeState.pending
        useCardStore.getState().resizeCardLocal(card.id, resizeState.pending)
      }

      const handleMove = (moveEvent: PointerEvent) => {
        const resizeState = resizeRef.current

        if (!resizeState) {
          return
        }

        resizeState.pending = computeResizeGeometry(
          card,
          direction,
          start,
          (moveEvent.clientX - startClientX) / camera.zoom,
          (moveEvent.clientY - startClientY) / camera.zoom,
        )

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
          .persistCardGeometry(card.id, resizeState.latest)
          .catch(() => undefined)
      }

      function removeListeners() {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
        window.removeEventListener('pointercancel', handleUp)

        if (resizeRef.current?.frameId !== null && resizeRef.current?.frameId !== undefined) {
          window.cancelAnimationFrame(resizeRef.current.frameId)
          resizeRef.current.latest = resizeRef.current.pending
          useCardStore.getState().resizeCardLocal(card.id, resizeRef.current.latest)
        }

        resizeRef.current = null
      }

      resizeRef.current = {
        frameId: null,
        latest: start,
        pending: start,
        removeListeners,
      }
      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
      window.addEventListener('pointercancel', handleUp)
    },
    [camera.zoom, card, enabled],
  )
}
