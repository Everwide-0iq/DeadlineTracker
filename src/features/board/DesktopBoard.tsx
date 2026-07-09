import { AlertTriangle, Download, Plus } from 'lucide-react'
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react'
import { useCardLinkStore } from '../cardLinks/cardLink.store.ts'
import type { CardLink, CardLinkSide } from '../cardLinks/cardLink.types.ts'
import { BoardTextItem } from '../boardTexts/BoardTextItem.tsx'
import { useBoardTextStore } from '../boardTexts/boardText.store.ts'
import type { BoardText } from '../boardTexts/boardText.types.ts'
import { useCardStore } from '../cards/card.store.ts'
import { DeadlineCard } from '../cards/DeadlineCard.tsx'
import type { BoardScope, Card } from '../cards/card.types.ts'
import { getCardRenderSize } from '../cards/card.utils.ts'
import { getDeadlineVisualState } from '../cards/deadlineColor.ts'
import { useFeedbackStore } from '../feedback/feedback.store.ts'
import { useI18nStore } from '../i18n/i18n.store.ts'
import { translations } from '../i18n/translations.ts'
import { defaultProjectId } from '../projects/project.types.ts'
import { BoardControls } from './BoardControls.tsx'
import { CardLinkLayer, type DraftCardLink } from './CardLinkLayer.tsx'
import type { DragGuide } from './dragGuide.types.ts'
import { HeatHorizon } from './HeatHorizon.tsx'
import { MiniMap } from './MiniMap.tsx'
import { useBoardCollaboration, type BoardCursor, type BoardMember } from './useBoardCollaboration.ts'
import type { BoardCamera } from './useBoardCamera.ts'

type DesktopBoardProps = {
  camera: BoardCamera
  boardScope: BoardScope
  cards: Card[]
  exportContext: {
    boardName: string
    filterName: string
  }
  links: CardLink[]
  texts: BoardText[]
  error: string | null
  isLoading: boolean
  now: number
  onCreateAtCenter: () => void
  onRetry: () => void
  selectedCardId: string | null
  setCamera: (next: BoardCamera | ((current: BoardCamera) => BoardCamera)) => void
  userEmail: string | null
  userId: string | null
  viewKey: string
  zoomBy: (factor: number) => void
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
type UnderlightStyle = CSSProperties & Record<`--${string}`, string | number>
type SceneStyle = CSSProperties & Record<`--${string}`, string | number>
type WorldBounds = {
  bottom: number
  left: number
  right: number
  top: number
}

const cursorMeasureThrottleMs = 70
const cameraMoveSettleMs = 180
const viewportOverscan = 720

const getExportLocale = (language: 'en' | 'ru') => (language === 'ru' ? 'ru-RU' : 'en-US')

const sanitizeFileNamePart = (value: string) =>
  value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60) || 'board'

const formatExportDate = (date: Date, language: 'en' | 'ru') =>
  new Intl.DateTimeFormat(getExportLocale(language), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)

const getViewportWorldBounds = (
  camera: BoardCamera,
  viewportSize: { height: number; width: number },
): WorldBounds => {
  if (viewportSize.width === 0 || viewportSize.height === 0) {
    return {
      bottom: Number.POSITIVE_INFINITY,
      left: Number.NEGATIVE_INFINITY,
      right: Number.POSITIVE_INFINITY,
      top: Number.NEGATIVE_INFINITY,
    }
  }

  return {
    bottom: (viewportSize.height - camera.y) / camera.zoom + viewportOverscan,
    left: -camera.x / camera.zoom - viewportOverscan,
    right: (viewportSize.width - camera.x) / camera.zoom + viewportOverscan,
    top: -camera.y / camera.zoom - viewportOverscan,
  }
}

const intersectsBounds = (left: number, top: number, width: number, height: number, bounds: WorldBounds) =>
  left <= bounds.right &&
  left + width >= bounds.left &&
  top <= bounds.bottom &&
  top + height >= bounds.top

const getTextEstimatedHeight = (text: BoardText) => {
  const charactersPerLine = Math.max(Math.floor(text.w / Math.max(text.fontSize * 0.58, 1)), 1)
  const lineCount = text.content
    .replace(/\r/g, '')
    .split('\n')
    .reduce((count, line) => count + Math.max(Math.ceil(Math.max(line.length, 1) / charactersPerLine), 1), 0)

  return Math.max(text.fontSize * lineCount * 1.16 + 32, text.fontSize + 32)
}

const isTextInBounds = (text: BoardText, bounds: WorldBounds) =>
  intersectsBounds(text.x, text.y, text.w, getTextEstimatedHeight(text), bounds)

const CardUnderlight = memo(function CardUnderlight({ card, now }: { card: Card; now: number }) {
  const language = useI18nStore((state) => state.language)
  const visual = getDeadlineVisualState(card.deadlineAt, card.status, now, language)
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

const PresenceCluster = memo(function PresenceCluster({
  members,
  self,
}: {
  members: BoardMember[]
  self: BoardMember
}) {
  const language = useI18nStore((state) => state.language)
  const t = translations[language]
  const visibleMembers = [self, ...members].slice(0, 4)

  return (
    <aside className="presence-cluster absolute right-6 top-[178px] z-20 rounded-2xl border border-white/10 bg-black/35 px-3 py-2 text-white backdrop-blur-xl">
      <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/42">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgb(52_211_153_/_0.8)]" />
        {members.length + 1} {t.board.online}
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
})

export function DesktopBoard({
  camera,
  boardScope,
  cards,
  exportContext,
  links,
  texts,
  error,
  isLoading,
  now,
  onCreateAtCenter,
  onRetry,
  selectedCardId,
  setCamera,
  userEmail,
  userId,
  viewKey,
  zoomBy,
}: DesktopBoardProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const boardViewportRef = useRef<HTMLDivElement | null>(null)
  const boardWorldRef = useRef<HTMLDivElement | null>(null)
  const cameraRef = useRef(camera)
  const cameraMoveEndTimerRef = useRef<number | null>(null)
  const isCameraMovingRef = useRef(false)
  const linkDraftCleanupRef = useRef<(() => void) | null>(null)
  const lastCursorMeasureAtRef = useRef(0)
  const viewportRectRef = useRef<DOMRectReadOnly | null>(null)
  const [draftLink, setDraftLink] = useState<DraftCardLink | null>(null)
  const [viewportSize, setViewportSize] = useState({ height: 0, width: 0 })
  const createLink = useCardLinkStore((state) => state.createLink)
  const deleteLink = useCardLinkStore((state) => state.deleteLink)
  const linkSaveError = useCardLinkStore((state) => state.saveError)
  const selectedLinkId = useCardLinkStore((state) => state.selectedLinkId)
  const selectLink = useCardLinkStore((state) => state.selectLink)
  const deleteText = useBoardTextStore((state) => state.deleteText)
  const selectedTextId = useBoardTextStore((state) => state.selectedTextId)
  const selectText = useBoardTextStore((state) => state.selectText)
  const textSaveError = useBoardTextStore((state) => state.saveError)
  const deleteCard = useCardStore((state) => state.deleteCard)
  const dragGuide = useCardStore((state) => state.dragGuide)
  const editor = useCardStore((state) => state.editor)
  const saveError = useCardStore((state) => state.saveError)
  const realtimeStatus = useCardStore((state) => state.realtimeStatus)
  const selectCard = useCardStore((state) => state.selectCard)
  const confirm = useFeedbackStore((state) => state.confirm)
  const language = useI18nStore((state) => state.language)
  const t = translations[language]
  const { members, remoteCursors, self, sendCursor } = useBoardCollaboration({
    enabled: boardScope === 'shared',
    fallbackName: t.board.memberFallback,
    userEmail,
    userId,
  })
  const gridSize = clamp(34 * camera.zoom, 18, 72)
  const devicePixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  const displayCameraX = Math.round(camera.x * devicePixelRatio) / devicePixelRatio
  const displayCameraY = Math.round(camera.y * devicePixelRatio) / devicePixelRatio
  const cardById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards])
  const cardRenderSizeById = useMemo(
    () => new Map(cards.map((card) => [card.id, getCardRenderSize(card)])),
    [cards],
  )
  const visibleWorldBounds = useMemo(
    () => getViewportWorldBounds(camera, viewportSize),
    [camera, viewportSize],
  )
  const renderedCards = useMemo(
    () =>
      cards.filter((card) => {
        const renderSize = cardRenderSizeById.get(card.id)
        return renderSize
          ? intersectsBounds(card.x, card.y, renderSize.w, renderSize.h, visibleWorldBounds)
          : true
      }),
    [cardRenderSizeById, cards, visibleWorldBounds],
  )
  const renderedTexts = useMemo(
    () => texts.filter((text) => isTextInBounds(text, visibleWorldBounds)),
    [texts, visibleWorldBounds],
  )
  const sceneStyle: SceneStyle = {
    '--scene-depth-x': `${camera.x * 0.018}px`,
    '--scene-depth-y': `${camera.y * 0.018}px`,
  }

  const applyCameraToDom = useCallback((nextCamera: BoardCamera) => {
    const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
    const nextDisplayX = Math.round(nextCamera.x * dpr) / dpr
    const nextDisplayY = Math.round(nextCamera.y * dpr) / dpr
    const nextGridSize = clamp(34 * nextCamera.zoom, 18, 72)

    if (boardWorldRef.current) {
      boardWorldRef.current.style.transform = `translate(${nextDisplayX}px, ${nextDisplayY}px) scale(${nextCamera.zoom})`
    }

    if (boardViewportRef.current) {
      boardViewportRef.current.style.backgroundPosition = `${nextCamera.x}px ${nextCamera.y}px`
      boardViewportRef.current.style.backgroundSize = `${nextGridSize}px ${nextGridSize}px`
    }

    if (viewportRef.current) {
      viewportRef.current.style.setProperty('--scene-depth-x', `${nextCamera.x * 0.018}px`)
      viewportRef.current.style.setProperty('--scene-depth-y', `${nextCamera.y * 0.018}px`)
    }
  }, [])

  useEffect(() => {
    cameraRef.current = camera
    applyCameraToDom(camera)
  }, [applyCameraToDom, camera])

  const setCameraMoving = useCallback((value: boolean) => {
    if (isCameraMovingRef.current === value) {
      return
    }

    isCameraMovingRef.current = value
    if (viewportRef.current) {
      viewportRef.current.dataset.cameraMoving = value ? 'true' : 'false'
    }
  }, [])

  const clearCameraMoveTimer = useCallback(() => {
    if (cameraMoveEndTimerRef.current === null) {
      return
    }

    window.clearTimeout(cameraMoveEndTimerRef.current)
    cameraMoveEndTimerRef.current = null
  }, [])

  const beginCameraMove = useCallback(() => {
    clearCameraMoveTimer()
    setCameraMoving(true)
  }, [clearCameraMoveTimer, setCameraMoving])

  const settleCameraMoveSoon = useCallback((commitCamera = false) => {
    clearCameraMoveTimer()
    cameraMoveEndTimerRef.current = window.setTimeout(() => {
      cameraMoveEndTimerRef.current = null
      if (commitCamera) {
        setCamera(cameraRef.current)
      }
      setCameraMoving(false)
    }, cameraMoveSettleMs)
  }, [clearCameraMoveTimer, setCamera, setCameraMoving])

  const handleExportBoard = useCallback(() => {
    const exportedAt = new Date()
    const formatDate = (value: string) => {
      const date = new Date(value)

      if (Number.isNaN(date.getTime())) {
        return {
          iso: value,
          local: null,
        }
      }

      return {
        iso: date.toISOString(),
        local: formatExportDate(date, language),
      }
    }
    const payload = {
      exportedAt: exportedAt.toISOString(),
      exportedAtLocal: formatExportDate(exportedAt, language),
      board: {
        name: exportContext.boardName,
        type: boardScope === 'shared' ? 'team' : 'personal',
      },
      filter: exportContext.filterName,
      tasks: cards.map((card) => ({
        title: card.title,
        description: card.description || null,
        completed: card.status === 'done',
        status: card.status,
        deadline: formatDate(card.deadlineAt),
      })),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    const datePart = exportedAt.toISOString().slice(0, 10)
    const boardPart = sanitizeFileNamePart(exportContext.boardName)
    const filterPart = sanitizeFileNamePart(exportContext.filterName)

    link.href = url
    link.download = `fireboard-${boardPart}-${filterPart}-${datePart}.json`
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => window.URL.revokeObjectURL(url), 0)
  }, [boardScope, cards, exportContext.boardName, exportContext.filterName, language])

  useEffect(() => {
    return () => {
      linkDraftCleanupRef.current?.()
      clearCameraMoveTimer()
    }
  }, [clearCameraMoveTimer])

  useEffect(() => {
    const viewport = viewportRef.current

    if (!viewport) {
      return undefined
    }

    const updateSize = () => {
      viewportRectRef.current = viewport.getBoundingClientRect()
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
      if (event.key !== 'Delete' || editor) {
        return
      }

      const target = event.target

      if (
        target instanceof HTMLElement &&
        target?.closest(
          'input, textarea, select, button, [contenteditable="true"], [data-card-action="true"]',
        )
      ) {
        return
      }

      if (selectedTextId) {
        const selectedText = texts.find((text) => text.id === selectedTextId)

        if (!selectedText) {
          return
        }

        event.preventDefault()
        void confirm({
          confirmLabel: t.boardText.delete,
          description: t.boardText.deleteDescription(selectedText.content),
          title: t.boardText.deleteTitle,
          tone: 'danger',
        }).then((confirmed) => {
          if (confirmed) {
            void deleteText(selectedText.id).catch(() => undefined)
          }
        })
        return
      }

      if (selectedLinkId) {
        event.preventDefault()
        void confirm({
          confirmLabel: t.link.delete,
          description: t.link.deleteDescription,
          title: t.link.deleteTitle,
          tone: 'danger',
        }).then((confirmed) => {
          if (confirmed) {
            void deleteLink(selectedLinkId).catch(() => undefined)
          }
        })
        return
      }

      if (!selectedCardId) {
        return
      }

      const selectedCard = cards.find((card) => card.id === selectedCardId)

      if (!selectedCard) {
        return
      }

      event.preventDefault()

      void confirm({
        confirmLabel: t.card.delete,
        description: t.card.deleteDescription(selectedCard.title),
        title: t.card.deleteTitle,
        tone: 'danger',
      }).then((confirmed) => {
        if (confirmed) {
          void deleteCard(selectedCard.id).catch(() => undefined)
        }
      })
    }

    window.addEventListener('keydown', handleDeleteKey)

    return () => window.removeEventListener('keydown', handleDeleteKey)
  }, [
    cards,
    confirm,
    deleteCard,
    deleteLink,
    deleteText,
    editor,
    selectedCardId,
    selectedLinkId,
    selectedTextId,
    t,
    texts,
  ])

  const zoomAtPoint = useCallback(
    (event: globalThis.WheelEvent) => {
      const viewport = boardViewportRef.current

      if (!viewport) {
        return
      }

      event.preventDefault()
      beginCameraMove()
      const rect = viewport.getBoundingClientRect()
      viewportRectRef.current = rect
      const pointX = event.clientX - rect.left
      const pointY = event.clientY - rect.top
      const currentCamera = cameraRef.current
      const nextZoom = clamp(currentCamera.zoom * (event.deltaY > 0 ? 0.9 : 1.1), 0.1, 2)
      const worldX = (pointX - currentCamera.x) / currentCamera.zoom
      const worldY = (pointY - currentCamera.y) / currentCamera.zoom
      const nextCamera = {
        x: pointX - worldX * nextZoom,
        y: pointY - worldY * nextZoom,
        zoom: nextZoom,
      }

      cameraRef.current = nextCamera
      applyCameraToDom(nextCamera)
      settleCameraMoveSoon(true)
    },
    [applyCameraToDom, beginCameraMove, settleCameraMoveSoon],
  )

  useEffect(() => {
    const viewport = boardViewportRef.current

    if (!viewport) {
      return undefined
    }

    viewport.addEventListener('wheel', zoomAtPoint, { passive: false })

    return () => viewport.removeEventListener('wheel', zoomAtPoint)
  }, [zoomAtPoint])

  const handlePanStart = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return
    }

    const target = event.target
    const targetElement = target instanceof Element ? target : null

    if (targetElement?.closest('[data-card-root="true"]')) {
      return
    }

    if (target !== event.currentTarget) {
      return
    }

    event.preventDefault()
    selectCard(null)
    selectLink(null)
    selectText(null)
    beginCameraMove()

    const startClientX = event.clientX
    const startClientY = event.clientY
    const startCamera = cameraRef.current
    let frameId: number | null = null
    let pendingCamera = startCamera

    const flushCamera = () => {
      frameId = null
      cameraRef.current = pendingCamera
      applyCameraToDom(pendingCamera)
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
        cameraRef.current = pendingCamera
        applyCameraToDom(pendingCamera)
      }

      setCamera(pendingCamera)
      setCameraMoving(false)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
  }

  const getWorldPointFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const viewport = viewportRef.current

      if (!viewport) {
        return { x: 0, y: 0 }
      }

      const rect = viewportRectRef.current ?? viewport.getBoundingClientRect()
      viewportRectRef.current = rect
      const currentCamera = cameraRef.current
      return {
        x: (clientX - rect.left - currentCamera.x) / currentCamera.zoom,
        y: (clientY - rect.top - currentCamera.y) / currentCamera.zoom,
      }
    },
    [],
  )

  const handleStartConnection = useCallback(
    (card: Card, side: CardLinkSide, event: PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0 || event.pointerType === 'touch') {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      selectCard(null)
      selectLink(null)
      selectText(null)
      linkDraftCleanupRef.current?.()

      setDraftLink({
        fromCardId: card.id,
        fromSide: side,
        pointer: getWorldPointFromClient(event.clientX, event.clientY),
      })

      let frameId: number | null = null
      let pendingPointer = getWorldPointFromClient(event.clientX, event.clientY)

      const flushDraftLink = () => {
        frameId = null
        setDraftLink({
          fromCardId: card.id,
          fromSide: side,
          pointer: pendingPointer,
        })
      }

      const scheduleDraftLink = (pointer: { x: number; y: number }) => {
        pendingPointer = pointer

        if (frameId === null) {
          frameId = window.requestAnimationFrame(flushDraftLink)
        }
      }

      function handleMove(moveEvent: globalThis.PointerEvent) {
        scheduleDraftLink(getWorldPointFromClient(moveEvent.clientX, moveEvent.clientY))
      }

      function handleUp(upEvent: globalThis.PointerEvent) {
        const target = document.elementFromPoint(upEvent.clientX, upEvent.clientY) as HTMLElement | null
        const handle = target?.closest('[data-card-link-handle="true"]') as HTMLElement | null
        const targetCardId = handle?.dataset.cardId ?? null
        const targetSide = handle?.dataset.cardSide as CardLinkSide | undefined

        removeListeners()
        setDraftLink(null)

        if (!targetCardId || !targetSide || targetCardId === card.id) {
          return
        }

        const targetCard = cardById.get(targetCardId)

        if (!targetCard) {
          return
        }

        void createLink(
          {
            boardScope,
            fromCardId: card.id,
            fromSide: side,
            projectId: boardScope === 'shared' ? card.projectId ?? defaultProjectId : null,
            toCardId: targetCard.id,
            toSide: targetSide,
          },
          userId,
        ).catch(() => undefined)
      }

      function handleCancel() {
        removeListeners()
        setDraftLink(null)
      }

      function removeListeners() {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
        window.removeEventListener('pointercancel', handleCancel)

        if (frameId !== null) {
          window.cancelAnimationFrame(frameId)
          frameId = null
        }

        linkDraftCleanupRef.current = null
      }

      linkDraftCleanupRef.current = removeListeners
      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
      window.addEventListener('pointercancel', handleCancel)
    },
    [boardScope, cardById, createLink, getWorldPointFromClient, selectCard, selectLink, selectText, userId],
  )

  const handleScenePointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const nowMs = performance.now()

      if (nowMs - lastCursorMeasureAtRef.current < cursorMeasureThrottleMs) {
        return
      }

      const scene = viewportRef.current

      if (!scene) {
        return
      }

      lastCursorMeasureAtRef.current = nowMs
      const rect = viewportRectRef.current ?? scene.getBoundingClientRect()
      viewportRectRef.current = rect
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      const currentCamera = cameraRef.current
      sendCursor((x - currentCamera.x) / currentCamera.zoom, (y - currentCamera.y) / currentCamera.zoom)
    },
    [sendCursor],
  )

  const handleDeleteLink = useCallback(
    (id: string) => {
      void confirm({
        confirmLabel: t.link.delete,
        description: t.link.deleteDescription,
        title: t.link.deleteTitle,
        tone: 'danger',
      }).then((confirmed) => {
        if (confirmed) {
          void deleteLink(id).catch(() => undefined)
        }
      })
    },
    [confirm, deleteLink, t.link],
  )

  const handleZoomIn = useCallback(() => zoomBy(1.1), [zoomBy])
  const handleZoomOut = useCallback(() => zoomBy(0.9), [zoomBy])

  return (
    <main
      className="desktop-board-scene relative min-h-0 flex-1 overflow-hidden rounded-[28px] border border-white/10 bg-[#05070b] shadow-2xl"
      data-camera-moving={isCameraMovingRef.current ? 'true' : 'false'}
      onPointerMove={handleScenePointerMove}
      ref={viewportRef}
      style={sceneStyle}
    >
      <div
        className="board-viewport absolute inset-0"
        onPointerDown={handlePanStart}
        ref={boardViewportRef}
        style={{
          backgroundPosition: `${camera.x}px ${camera.y}px`,
          backgroundSize: `${gridSize}px ${gridSize}px`,
        }}
      >
        <div
          className="board-world absolute left-0 top-0 h-0 w-0"
          ref={boardWorldRef}
          style={{
            transform: `translate(${displayCameraX}px, ${displayCameraY}px) scale(${camera.zoom})`,
            transformOrigin: '0 0',
          }}
        >
          <MagneticGuides camera={camera} dragGuide={dragGuide} viewportSize={viewportSize} />

          <div className="board-content-transition" key={viewKey}>
            {renderedCards.map((card) => (
              <CardUnderlight card={card} key={`light-${card.id}`} now={now} />
            ))}

            <CardLinkLayer
              cards={cards}
              draftLink={draftLink}
              links={links}
              now={now}
              selectedLinkId={selectedLinkId}
              onDeleteLink={handleDeleteLink}
              onSelectLink={(id) => {
                selectCard(null)
                selectText(null)
                selectLink(id)
              }}
            />

            {renderedTexts.map((text) => (
              <BoardTextItem
                cameraZoom={camera.zoom}
                isSelected={selectedTextId === text.id}
                key={text.id}
                text={text}
              />
            ))}

            {renderedCards.map((card) => (
              <div data-card-root="true" key={card.id}>
                <DeadlineCard
                  cameraZoom={camera.zoom}
                  canConnect
                  canDrag
                  card={card}
                  isConnecting={Boolean(draftLink)}
                  isSelected={selectedCardId === card.id}
                  onStartConnection={handleStartConnection}
                />
              </div>
            ))}
          </div>

          {remoteCursors.map((cursor) => (
            <RemoteCursor cursor={cursor} key={cursor.clientId} />
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute left-5 top-5 z-20">
        <BoardControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          zoom={camera.zoom}
        />
      </div>

      <button
        aria-label={t.board.exportJson}
        className="pointer-events-auto absolute right-[274px] top-6 z-20 hidden items-center gap-2 rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-white/70 shadow-2xl backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:border-red-300/40 hover:bg-red-500/10 hover:text-white xl:flex"
        type="button"
        onClick={handleExportBoard}
      >
        <Download size={15} />
        {t.board.exportJson}
      </button>

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
            <p className="text-sm text-white/60">{t.board.loading}</p>
          </div>
        </div>
      ) : null}

      {!isLoading && error ? (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/35 p-6 backdrop-blur-sm">
          <div className="mission-state-card max-w-md rounded-3xl border border-red-400/30 bg-red-500/10 p-6 text-center text-red-50 shadow-glow">
            <AlertTriangle className="mx-auto mb-3 text-red-300" />
            <h2 className="mb-2 text-xl font-bold">{t.board.failedCards}</h2>
            <p className="mb-5 text-sm leading-6 text-red-100/75">{error}</p>
            <button className="primary-button mx-auto" type="button" onClick={onRetry}>
              {t.common.retry}
            </button>
          </div>
        </div>
      ) : null}

      {!isLoading && !error && cards.length === 0 && texts.length === 0 ? (
        <div className="absolute inset-0 z-10 grid place-items-center p-6">
          <div className="mission-state-card rounded-3xl border border-white/10 bg-black/35 p-7 text-center text-white shadow-2xl backdrop-blur-xl">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)] shadow-glow">
              <Plus size={26} />
            </div>
            <h2 className="mb-2 text-2xl font-black">
              {boardScope === 'personal' ? t.board.addFirstPersonal : t.board.addFirstCard}
            </h2>
            <p className="mb-5 max-w-sm text-sm leading-6 text-white/55">
              {boardScope === 'personal'
                ? t.board.personalEmptyDescription
                : t.board.cardEmptyDescription}
            </p>
            <button className="primary-button mx-auto" type="button" onClick={onCreateAtCenter}>
              <Plus size={18} />
              {t.common.createCard}
            </button>
          </div>
        </div>
      ) : null}

      <div className="absolute bottom-5 right-5 z-20 flex items-center gap-3 rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-xs uppercase tracking-[0.14em] text-white/45 backdrop-blur-xl">
        <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_14px_rgb(52_211_153_/_0.9)]" />
        {t.board.sync}: {t.board.realtime[realtimeStatus]}
      </div>

      {saveError || linkSaveError || textSaveError ? (
        <div className="absolute bottom-5 left-5 z-20 max-w-md rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100 backdrop-blur-xl">
          {saveError ?? linkSaveError ?? textSaveError}
        </div>
      ) : null}
    </main>
  )
}
