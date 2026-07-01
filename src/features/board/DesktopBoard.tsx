import { AlertTriangle, Plus } from 'lucide-react'
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type WheelEvent,
} from 'react'
import { useCardStore } from '../cards/card.store.ts'
import { DeadlineCard } from '../cards/DeadlineCard.tsx'
import type { BoardScope, Card } from '../cards/card.types.ts'
import { getCardRenderSize } from '../cards/card.utils.ts'
import { getDeadlineVisualState } from '../cards/deadlineColor.ts'
import { BoardControls, type BoardMode } from './BoardControls.tsx'
import type { DragGuide } from './dragGuide.types.ts'
import { HeatHorizon } from './HeatHorizon.tsx'
import { MiniMap } from './MiniMap.tsx'
import { useBoardCollaboration, type BoardCursor, type BoardMember } from './useBoardCollaboration.ts'
import type { BoardCamera } from './useBoardCamera.ts'

type DesktopBoardProps = {
  camera: BoardCamera
  boardScope: BoardScope
  cards: Card[]
  error: string | null
  isLoading: boolean
  now: number
  onCreateAtCenter: () => void
  onRetry: () => void
  resetCamera: () => void
  selectedCardId: string | null
  setCamera: (next: BoardCamera | ((current: BoardCamera) => BoardCamera)) => void
  userEmail: string | null
  userId: string | null
  zoomBy: (factor: number) => void
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
type UnderlightStyle = CSSProperties & Record<`--${string}`, string | number>
type SceneStyle = CSSProperties & Record<`--${string}`, string | number>

const realtimeLabels = {
  closed: 'отключена',
  connecting: 'подключаемся',
  error: 'ошибка',
  idle: 'ожидание',
  online: 'онлайн',
} as const

const CardUnderlight = memo(function CardUnderlight({ card, now }: { card: Card; now: number }) {
  const visual = getDeadlineVisualState(card.deadlineAt, card.status, now)
  const renderSize = getCardRenderSize(card)
  const horizontalBleed = Math.max(42, renderSize.w * 0.18)
  const verticalBleed = Math.max(36, renderSize.h * 0.28)
  const style: UnderlightStyle = {
    '--deadline-border': visual.borderColor,
    height: renderSize.h + verticalBleed * 2,
    left: card.x - horizontalBleed,
    top: card.y - verticalBleed,
    width: renderSize.w + horizontalBleed * 2,
  }

  return (
    <div
      aria-hidden="true"
      className="deadline-card-underlight pointer-events-none absolute"
      data-zone={visual.zone}
      style={style}
    />
  )
})

function MagneticGuides({
  camera,
  dragGuide,
  viewportSize,
}: {
  camera: BoardCamera
  dragGuide: DragGuide | null
  viewportSize: { height: number; width: number }
}) {
  if (!dragGuide || viewportSize.width === 0 || viewportSize.height === 0) {
    return null
  }

  const bounds = {
    height: viewportSize.height / camera.zoom,
    left: -camera.x / camera.zoom,
    top: -camera.y / camera.zoom,
    width: viewportSize.width / camera.zoom,
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-[6]">
      {dragGuide.x !== undefined ? (
        <div
          className="magnetic-guide magnetic-guide-vertical"
          style={{
            height: bounds.height + 240,
            left: dragGuide.x,
            top: bounds.top - 120,
          }}
        />
      ) : null}
      {dragGuide.y !== undefined ? (
        <div
          className="magnetic-guide magnetic-guide-horizontal"
          style={{
            left: bounds.left - 120,
            top: dragGuide.y,
            width: bounds.width + 240,
          }}
        />
      ) : null}
    </div>
  )
}

function RemoteCursor({ cursor }: { cursor: BoardCursor }) {
  return (
    <div
      className="remote-cursor pointer-events-none absolute z-[18]"
      style={{ left: cursor.x, top: cursor.y, '--member-color': cursor.color } as SceneStyle}
    >
      <span className="remote-cursor-point" />
      <span className="remote-cursor-label">{cursor.name}</span>
    </div>
  )
}

function PresenceCluster({
  members,
  self,
}: {
  members: BoardMember[]
  self: BoardMember
}) {
  const visibleMembers = [self, ...members].slice(0, 4)

  return (
    <aside className="presence-cluster absolute right-6 top-[178px] z-20 rounded-2xl border border-white/10 bg-black/35 px-3 py-2 text-white backdrop-blur-xl">
      <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/42">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgb(52_211_153_/_0.8)]" />
        {members.length + 1} онлайн
      </div>
      <div className="flex items-center">
        {visibleMembers.map((member) => (
          <div
            className="-ml-1 grid h-8 w-8 place-items-center rounded-full border border-black/60 text-xs font-black text-black first:ml-0"
            key={member.clientId}
            style={{ backgroundColor: member.color }}
            title={member.email}
          >
            {member.name.slice(0, 1).toUpperCase()}
          </div>
        ))}
      </div>
    </aside>
  )
}

export function DesktopBoard({
  camera,
  boardScope,
  cards,
  error,
  isLoading,
  now,
  onCreateAtCenter,
  onRetry,
  resetCamera,
  selectedCardId,
  setCamera,
  userEmail,
  userId,
  zoomBy,
}: DesktopBoardProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [mode, setMode] = useState<BoardMode>('select')
  const [viewportSize, setViewportSize] = useState({ height: 0, width: 0 })
  const deleteCard = useCardStore((state) => state.deleteCard)
  const dragGuide = useCardStore((state) => state.dragGuide)
  const editor = useCardStore((state) => state.editor)
  const saveError = useCardStore((state) => state.saveError)
  const realtimeStatus = useCardStore((state) => state.realtimeStatus)
  const selectCard = useCardStore((state) => state.selectCard)
  const { members, remoteCursors, self, sendCursor } = useBoardCollaboration({
    enabled: boardScope === 'shared',
    userEmail,
    userId,
  })
  const gridSize = clamp(34 * camera.zoom, 18, 72)
  const sceneStyle: SceneStyle = {
    '--scene-depth-x': `${camera.x * 0.018}px`,
    '--scene-depth-y': `${camera.y * 0.018}px`,
  }

  useEffect(() => {
    const viewport = viewportRef.current

    if (!viewport) {
      return undefined
    }

    const updateSize = () => {
      setViewportSize({
        height: viewport.clientHeight,
        width: viewport.clientWidth,
      })
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(viewport)

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const handleDeleteKey = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' || editor || !selectedCardId) {
        return
      }

      const target = event.target as HTMLElement | null

      if (
        target?.closest(
          'input, textarea, select, button, [contenteditable="true"], [data-card-action="true"]',
        )
      ) {
        return
      }

      const selectedCard = cards.find((card) => card.id === selectedCardId)

      if (!selectedCard) {
        return
      }

      event.preventDefault()

      if (!window.confirm(`Удалить карточку "${selectedCard.title}"?`)) {
        return
      }

      void deleteCard(selectedCard.id).catch(() => undefined)
    }

    window.addEventListener('keydown', handleDeleteKey)

    return () => window.removeEventListener('keydown', handleDeleteKey)
  }, [cards, deleteCard, editor, selectedCardId])

  const zoomAtPoint = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      event.preventDefault()
      const rect = event.currentTarget.getBoundingClientRect()
      const pointX = event.clientX - rect.left
      const pointY = event.clientY - rect.top
      const nextZoom = clamp(camera.zoom * (event.deltaY > 0 ? 0.9 : 1.1), 0.45, 1.6)
      const worldX = (pointX - camera.x) / camera.zoom
      const worldY = (pointY - camera.y) / camera.zoom

      setCamera({
        x: pointX - worldX * nextZoom,
        y: pointY - worldY * nextZoom,
        zoom: nextZoom,
      })
    },
    [camera, setCamera],
  )

  const handlePanStart = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return
    }

    const target = event.target as HTMLElement

    if (target.closest('[data-card-root="true"]')) {
      return
    }

    if (mode !== 'pan' && target !== event.currentTarget) {
      return
    }

    event.preventDefault()
    selectCard(null)

    const startClientX = event.clientX
    const startClientY = event.clientY
    const startCamera = camera
    let frameId: number | null = null
    let pendingCamera = startCamera

    const flushCamera = () => {
      frameId = null
      setCamera(pendingCamera)
    }

    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      pendingCamera = {
        ...startCamera,
        x: startCamera.x + moveEvent.clientX - startClientX,
        y: startCamera.y + moveEvent.clientY - startClientY,
      }

      if (frameId === null) {
        frameId = window.requestAnimationFrame(flushCamera)
      }
    }

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)

      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
        setCamera(pendingCamera)
      }
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
  }

  const handleScenePointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const scene = viewportRef.current

      if (!scene) {
        return
      }

      const rect = scene.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      sendCursor((x - camera.x) / camera.zoom, (y - camera.y) / camera.zoom)
    },
    [camera.x, camera.y, camera.zoom, sendCursor],
  )

  return (
    <main
      className="desktop-board-scene relative min-h-0 flex-1 overflow-hidden rounded-[28px] border border-white/10 bg-[#05070b] shadow-2xl"
      onPointerMove={handleScenePointerMove}
      ref={viewportRef}
      style={sceneStyle}
    >
      <div
        className="board-viewport absolute inset-0"
        onPointerDown={handlePanStart}
        onWheel={zoomAtPoint}
        style={{
          backgroundPosition: `${camera.x}px ${camera.y}px`,
          backgroundSize: `${gridSize}px ${gridSize}px`,
        }}
      >
        <div
          className="absolute left-0 top-0 h-0 w-0"
          style={{
            transform: `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.zoom})`,
            transformOrigin: '0 0',
          }}
        >
          <MagneticGuides camera={camera} dragGuide={dragGuide} viewportSize={viewportSize} />

          {cards.map((card) => (
            <CardUnderlight card={card} key={`light-${card.id}`} now={now} />
          ))}

          {cards.map((card) => (
            <div data-card-root="true" key={card.id}>
              <DeadlineCard
                camera={camera}
                canDrag={mode === 'select'}
                card={card}
                isSelected={selectedCardId === card.id}
              />
            </div>
          ))}

          {remoteCursors.map((cursor) => (
            <RemoteCursor cursor={cursor} key={cursor.clientId} />
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute left-5 top-5 z-20">
        <BoardControls
          camera={camera}
          mode={mode}
          onModeChange={setMode}
          onReset={resetCamera}
          onZoomIn={() => zoomBy(1.1)}
          onZoomOut={() => zoomBy(0.9)}
        />
      </div>

      <MiniMap
        camera={camera}
        cards={cards}
        now={now}
        setCamera={setCamera}
        viewportSize={viewportSize}
      />

      {boardScope === 'shared' ? <PresenceCluster members={members} self={self} /> : null}

      <HeatHorizon cards={cards} now={now} />

      {isLoading ? (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/25 backdrop-blur-[2px]">
          <div className="mission-state-card rounded-3xl border border-white/10 bg-black/45 px-6 py-5 text-white shadow-glow">
            <div className="mb-3 h-2 w-52 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-1/2 animate-[scan_1.2s_ease-in-out_infinite] rounded-full bg-[var(--accent)]" />
            </div>
            <p className="text-sm text-white/60">Загружаем доску...</p>
          </div>
        </div>
      ) : null}

      {!isLoading && error ? (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/35 p-6 backdrop-blur-sm">
          <div className="mission-state-card max-w-md rounded-3xl border border-red-400/30 bg-red-500/10 p-6 text-center text-red-50 shadow-glow">
            <AlertTriangle className="mx-auto mb-3 text-red-300" />
            <h2 className="mb-2 text-xl font-bold">Не удалось загрузить карточки</h2>
            <p className="mb-5 text-sm leading-6 text-red-100/75">{error}</p>
            <button className="primary-button mx-auto" type="button" onClick={onRetry}>
              Повторить
            </button>
          </div>
        </div>
      ) : null}

      {!isLoading && !error && cards.length === 0 ? (
        <div className="absolute inset-0 z-10 grid place-items-center p-6">
          <div className="mission-state-card rounded-3xl border border-white/10 bg-black/35 p-7 text-center text-white shadow-2xl backdrop-blur-xl">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)] shadow-glow">
              <Plus size={26} />
            </div>
            <h2 className="mb-2 text-2xl font-black">
              {boardScope === 'personal' ? 'Добавь первую личную задачу.' : 'Добавь первую карточку дедлайна.'}
            </h2>
            <p className="mb-5 max-w-sm text-sm leading-6 text-white/55">
              {boardScope === 'personal'
                ? 'Это приватный canvas для личных дел, планов и дедлайнов вне командной работы.'
                : 'Общие карточки будут появляться здесь в реальном времени после подключения Supabase.'}
            </p>
            <button className="primary-button mx-auto" type="button" onClick={onCreateAtCenter}>
              <Plus size={18} />
              Создать карточку
            </button>
          </div>
        </div>
      ) : null}

      <div className="absolute bottom-5 right-5 z-20 flex items-center gap-3 rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-xs uppercase tracking-[0.14em] text-white/45 backdrop-blur-xl">
        <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_14px_rgb(52_211_153_/_0.9)]" />
        Синхронизация: {realtimeLabels[realtimeStatus]}
      </div>

      {saveError ? (
        <div className="absolute bottom-5 left-5 z-20 max-w-md rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100 backdrop-blur-xl">
          {saveError}
        </div>
      ) : null}
    </main>
  )
}
