import {
  memo,
  useMemo,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useI18nStore } from '../i18n/i18n.store.ts'
import { translations } from '../i18n/translations.ts'
import type { BoardCursor } from './useBoardCollaboration.ts'
import type { BoardLinkNodeMetric } from './CardLinkLayer.tsx'
import { useBoardMotionStore } from './boardMotion.store.ts'
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
  cursors: BoardCursor[]
  nodes: BoardLinkNodeMetric[]
  setCamera: (next: BoardCamera | ((current: BoardCamera) => BoardCamera)) => void
  viewportSize: ViewportSize
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
  nodeMetrics: BoardLinkNodeMetric[],
  camera: BoardCamera,
  viewportSize: ViewportSize,
) {
  const viewportBounds = getViewportBounds(camera, viewportSize)
  const cardBounds = nodeMetrics.reduce<WorldBounds>(
    (acc, node) => ({
      maxX: Math.max(acc.maxX, node.x + node.w),
      maxY: Math.max(acc.maxY, node.y + node.h),
      minX: Math.min(acc.minX, node.x),
      minY: Math.min(acc.minY, node.y),
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

function MiniMapComponent({ camera, cursors, nodes, setCamera, viewportSize }: MiniMapProps) {
  const language = useI18nStore((state) => state.language)
  const t = translations[language]
  const liveCamera = useBoardMotionStore((state) => state.liveCamera)
  const displayCamera = liveCamera ?? camera
  const geometry = useMemo(
    () => getMiniMapGeometry(nodes, displayCamera, viewportSize),
    [displayCamera, nodes, viewportSize],
  )
  const pointerInteractionRef = useRef<{
    geometry: ReturnType<typeof getMiniMapGeometry>
    pointerId: number
  } | null>(null)

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

  const moveCameraToPointer = (
    event: ReactPointerEvent<HTMLDivElement>,
    interactionGeometry = geometry,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const localX = clamp(
      event.clientX - rect.left - interactionGeometry.offsetX,
      0,
      interactionGeometry.renderedWidth,
    )
    const localY = clamp(
      event.clientY - rect.top - interactionGeometry.offsetY,
      0,
      interactionGeometry.renderedHeight,
    )
    const targetWorldX = interactionGeometry.bounds.minX + localX / interactionGeometry.scale
    const targetWorldY = interactionGeometry.bounds.minY + localY / interactionGeometry.scale
    const width = Math.max(viewportSize.width, 1)
    const height = Math.max(viewportSize.height, 1)

    setCamera((current) => ({
      ...current,
      x: width / 2 - targetWorldX * current.zoom,
      y: height / 2 - targetWorldY * current.zoom,
    }))
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    pointerInteractionRef.current = { geometry, pointerId: event.pointerId }
    event.currentTarget.setPointerCapture(event.pointerId)
    moveCameraToPointer(event, geometry)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = pointerInteractionRef.current

    if (!interaction || interaction.pointerId !== event.pointerId) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    moveCameraToPointer(event, interaction.geometry)
  }

  const finishPointerInteraction = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerInteractionRef.current?.pointerId !== event.pointerId) {
      return
    }

    pointerInteractionRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
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
        className="relative touch-none cursor-crosshair overflow-hidden rounded-xl border border-white/[0.08] bg-[#05080d] active:cursor-grabbing"
        onKeyDown={handleKeyDown}
        onLostPointerCapture={finishPointerInteraction}
        onPointerCancel={finishPointerInteraction}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerInteraction}
        role="button"
        style={{ height: mapSize.height, width: mapSize.width }}
        tabIndex={0}
      >
        {nodes.map((node) => {
          const left = toMapX(node.x)
          const top = toMapY(node.y)

          return (
            <div
              className="mini-map-node absolute rounded-[3px]"
              data-kind={node.kind}
              key={`${node.kind}:${node.id}`}
              style={{
                backgroundColor: node.color,
                boxShadow: `0 0 9px color-mix(in srgb, ${node.color} 72%, transparent)`,
                height: Math.max(node.h * geometry.scale, 4),
                left,
                top,
                width: Math.max(node.w * geometry.scale, 6),
              }}
            />
          )
        })}
        {cursors.map((cursor) => (
          <span
            aria-hidden="true"
            className="mini-map-cursor"
            key={cursor.clientId}
            style={{ backgroundColor: cursor.color, left: toMapX(cursor.x), top: toMapY(cursor.y) }}
          />
        ))}
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
