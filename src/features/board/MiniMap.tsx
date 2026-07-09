import {
  memo,
  useMemo,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { Card } from '../cards/card.types.ts'
import { getCardRenderSize } from '../cards/card.utils.ts'
import { getDeadlineVisualState } from '../cards/deadlineColor.ts'
import { useI18nStore } from '../i18n/i18n.store.ts'
import { translations } from '../i18n/translations.ts'
import type { BoardCamera } from './useBoardCamera.ts'

type ViewportSize = {
  height: number
  width: number
}

type WorldBounds = {
  maxX: number
  maxY: number
  minX: number
  minY: number
}

type MiniMapProps = {
  camera: BoardCamera
  cards: Card[]
  now: number
  setCamera: (next: BoardCamera | ((current: BoardCamera) => BoardCamera)) => void
  viewportSize: ViewportSize
}

type MiniMapCardMetric = {
  color: string
  glowColor: string
  h: number
  id: string
  w: number
  x: number
  y: number
}

const mapSize = {
  height: 114,
  width: 212,
}

const boundsPadding = 260

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

function getViewportBounds(camera: BoardCamera, viewportSize: ViewportSize): WorldBounds {
  const width = Math.max(viewportSize.width, 1)
  const height = Math.max(viewportSize.height, 1)

  return {
    maxX: (width - camera.x) / camera.zoom,
    maxY: (height - camera.y) / camera.zoom,
    minX: -camera.x / camera.zoom,
    minY: -camera.y / camera.zoom,
  }
}

function getMiniMapGeometry(
  cardMetrics: MiniMapCardMetric[],
  camera: BoardCamera,
  viewportSize: ViewportSize,
) {
  const viewportBounds = getViewportBounds(camera, viewportSize)
  const cardBounds = cardMetrics.reduce<WorldBounds>(
    (acc, card) => ({
      maxX: Math.max(acc.maxX, card.x + card.w),
      maxY: Math.max(acc.maxY, card.y + card.h),
      minX: Math.min(acc.minX, card.x),
      minY: Math.min(acc.minY, card.y),
    }),
    viewportBounds,
  )

  const bounds = {
    maxX: cardBounds.maxX + boundsPadding,
    maxY: cardBounds.maxY + boundsPadding,
    minX: cardBounds.minX - boundsPadding,
    minY: cardBounds.minY - boundsPadding,
  }
  const worldWidth = Math.max(bounds.maxX - bounds.minX, 1)
  const worldHeight = Math.max(bounds.maxY - bounds.minY, 1)
  const scale = Math.min(mapSize.width / worldWidth, mapSize.height / worldHeight)
  const renderedWidth = worldWidth * scale
  const renderedHeight = worldHeight * scale
  const offsetX = (mapSize.width - renderedWidth) / 2
  const offsetY = (mapSize.height - renderedHeight) / 2

  return {
    bounds,
    offsetX,
    offsetY,
    renderedHeight,
    renderedWidth,
    scale,
    viewportBounds,
  }
}

function MiniMapComponent({ camera, cards, now, setCamera, viewportSize }: MiniMapProps) {
  const language = useI18nStore((state) => state.language)
  const t = translations[language]
  const cardMetrics = useMemo(
    () =>
      cards.map((card) => {
        const visual = getDeadlineVisualState(card.deadlineAt, card.status, now, language)
        const renderSize = getCardRenderSize(card)

        return {
          color: visual.borderColor,
          glowColor: visual.glowColor,
          h: renderSize.h,
          id: card.id,
          w: renderSize.w,
          x: card.x,
          y: card.y,
        }
      }),
    [cards, language, now],
  )
  const geometry = getMiniMapGeometry(cardMetrics, camera, viewportSize)

  const toMapX = (worldX: number) => geometry.offsetX + (worldX - geometry.bounds.minX) * geometry.scale
  const toMapY = (worldY: number) => geometry.offsetY + (worldY - geometry.bounds.minY) * geometry.scale

  const viewportX = toMapX(geometry.viewportBounds.minX)
  const viewportY = toMapY(geometry.viewportBounds.minY)
  const viewportWidth = Math.max(
    (geometry.viewportBounds.maxX - geometry.viewportBounds.minX) * geometry.scale,
    14,
  )
  const viewportHeight = Math.max(
    (geometry.viewportBounds.maxY - geometry.viewportBounds.minY) * geometry.scale,
    14,
  )

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const rect = event.currentTarget.getBoundingClientRect()
    const localX = clamp(event.clientX - rect.left - geometry.offsetX, 0, geometry.renderedWidth)
    const localY = clamp(event.clientY - rect.top - geometry.offsetY, 0, geometry.renderedHeight)
    const targetWorldX = geometry.bounds.minX + localX / geometry.scale
    const targetWorldY = geometry.bounds.minY + localY / geometry.scale
    const width = Math.max(viewportSize.width, 1)
    const height = Math.max(viewportSize.height, 1)

    setCamera((current) => ({
      ...current,
      x: width / 2 - targetWorldX * current.zoom,
      y: height / 2 - targetWorldY * current.zoom,
    }))
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }

    event.preventDefault()

    const targetWorldX = geometry.bounds.minX + (geometry.renderedWidth / 2) / geometry.scale
    const targetWorldY = geometry.bounds.minY + (geometry.renderedHeight / 2) / geometry.scale
    const width = Math.max(viewportSize.width, 1)
    const height = Math.max(viewportSize.height, 1)

    setCamera((current) => ({
      ...current,
      x: width / 2 - targetWorldX * current.zoom,
      y: height / 2 - targetWorldY * current.zoom,
    }))
  }

  return (
    <div className="pointer-events-auto absolute right-6 top-6 z-20 hidden rounded-2xl border border-white/10 bg-black/35 p-3 shadow-2xl backdrop-blur-xl xl:block">
      <div
        aria-label={t.board.minimap}
        className="relative cursor-crosshair overflow-hidden rounded-xl border border-white/[0.08] bg-[#05080d]"
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        role="button"
        style={{ height: mapSize.height, width: mapSize.width }}
        tabIndex={0}
      >
        {cardMetrics.map((card) => {
          const left = toMapX(card.x)
          const top = toMapY(card.y)

          return (
            <div
              className="absolute rounded-[3px]"
              key={card.id}
              style={{
                backgroundColor: card.color,
                boxShadow: `0 0 10px ${card.glowColor}`,
                height: Math.max(card.h * geometry.scale, 4),
                left,
                top,
                width: Math.max(card.w * geometry.scale, 6),
              }}
            />
          )
        })}
        <div
          className="absolute rounded border border-[var(--accent)]/80 bg-[var(--accent)]/10 shadow-[0_0_16px_rgb(255_70_61_/_0.28)]"
          style={{
            height: viewportHeight,
            left: viewportX,
            top: viewportY,
            width: viewportWidth,
          }}
        />
      </div>
    </div>
  )
}

export const MiniMap = memo(MiniMapComponent)
