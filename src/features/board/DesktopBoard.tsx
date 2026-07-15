import { Activity, AlertTriangle, Download, Plus } from 'lucide-react'
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
} from 'react'
import { useCardLinkStore } from '../cardLinks/cardLink.store.ts'
import type {
  BoardLinkEndpoint,
  CardLink,
  CardLinkSide,
} from '../cardLinks/cardLink.types.ts'
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
import { usePreferencesStore } from '../preferences/preferences.store.ts'
import { ProfileAvatar } from '../profile/ProfileAvatar.tsx'
import { useProfileStore } from '../profile/profile.store.ts'
import { defaultActiveColor, type UserProfile } from '../profile/profile.types.ts'
import { TodoBlock } from '../todos/TodoBlock.tsx'
import { useTodoStore } from '../todos/todo.store.ts'
import type { TodoBlock as TodoBlockModel, TodoItem } from '../todos/todo.types.ts'
import { getTodoBlockStatus, getTodoBlockRenderHeight } from '../todos/todo.utils.ts'
import { AddMenuItems } from './AddMenu.tsx'
import { BoardControls } from './BoardControls.tsx'
import { CardLinkLayer, type BoardLinkNodeMetric, type DraftCardLink } from './CardLinkLayer.tsx'
import { useBoardMotionStore } from './boardMotion.store.ts'
import type { DragGuide } from './dragGuide.types.ts'
import { HeatHorizon } from './HeatHorizon.tsx'
import { MiniMap } from './MiniMap.tsx'
import { useBoardCollaboration, type BoardCursor, type BoardMember } from './useBoardCollaboration.ts'
import type { BoardCamera } from './useBoardCamera.ts'

type DesktopBoardProps = {
  camera: BoardCamera
  boardScope: BoardScope
  collaborationRoomId: string
  cards: Card[]
  todoBlocks: TodoBlockModel[]
  todoItems: TodoItem[]
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
  onCreateAtPosition: (x: number, y: number) => void
  onCreateTextAtPosition: (x: number, y: number) => void
  onCreateTodoAtPosition: (x: number, y: number) => void
  onRetry: () => void
  setCamera: (next: BoardCamera | ((current: BoardCamera) => BoardCamera)) => void
  userEmail: string | null
  userId: string | null
  userProfile: UserProfile | null
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
type SelectionBox = {
  currentX: number
  currentY: number
  startX: number
  startY: number
}
type BoardContextMenu = {
  screenX: number
  screenY: number
  worldX: number
  worldY: number
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

const getSelectionBounds = (box: SelectionBox): WorldBounds => ({
  bottom: Math.max(box.startY, box.currentY),
  left: Math.min(box.startX, box.currentX),
  right: Math.max(box.startX, box.currentX),
  top: Math.min(box.startY, box.currentY),
})

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
  const activeProfile = useProfileStore((state) =>
    card.activeBy ? state.profiles[card.activeBy] ?? null : null,
  )
  const visual = getDeadlineVisualState(card.deadlineAt, card.status, now, language)
  const renderSize = getCardRenderSize(card)
  const horizontalBleed = Math.max(42, renderSize.w * 0.18)
  const verticalBleed = Math.max(36, renderSize.h * 0.28)
  const style: UnderlightStyle = {
    '--deadline-border': card.isActive ? activeProfile?.activeColor ?? defaultActiveColor : visual.borderColor,
    height: renderSize.h + verticalBleed * 2,
    left: card.x - horizontalBleed,
    top: card.y - verticalBleed,
    width: renderSize.w + horizontalBleed * 2,
  }

  return (
    <div
      aria-hidden="true"
      className="deadline-card-underlight pointer-events-none absolute"
      data-active={card.isActive ? 'true' : 'false'}
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
      <span className="remote-cursor-label">
        <ProfileAvatar
          avatarPath={cursor.avatarPath}
          color={cursor.color}
          name={cursor.name}
          size={20}
        />
        {cursor.name}
      </span>
    </div>
  )
}

const PresenceCluster = memo(function PresenceCluster({
  members,
  onFocusMember,
  self,
}: {
  members: BoardMember[]
  onFocusMember: (clientId: string) => void
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
        {visibleMembers.map((member) => member.clientId === self.clientId ? (
          <span className="-ml-1 first:ml-0" key={member.clientId} title={member.name}>
            <ProfileAvatar avatarPath={member.avatarPath} color={member.color} name={member.name} size={32} />
          </span>
        ) : (
          <button
            aria-label={member.name}
            className="presence-avatar-button -ml-1 first:ml-0"
            key={member.clientId}
            title={member.name}
            type="button"
            onClick={() => onFocusMember(member.clientId)}
          >
            <ProfileAvatar avatarPath={member.avatarPath} color={member.color} name={member.name} size={32} />
          </button>
        ))}
      </div>
    </aside>
  )
})

export function DesktopBoard({
  camera,
  boardScope,
  collaborationRoomId,
  cards,
  todoBlocks,
  todoItems,
  exportContext,
  links,
  texts,
  error,
  isLoading,
  now,
  onCreateAtCenter,
  onCreateAtPosition,
  onCreateTextAtPosition,
  onCreateTodoAtPosition,
  onRetry,
  setCamera,
  userEmail,
  userId,
  userProfile,
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
  const [boardContextMenu, setBoardContextMenu] = useState<BoardContextMenu | null>(null)
  const isPerformanceMode = usePreferencesStore((state) => state.performanceMode)
  const togglePerformanceMode = usePreferencesStore((state) => state.togglePerformanceMode)
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null)
  const [viewportSize, setViewportSize] = useState({ height: 0, width: 0 })
  const [todoHeightById, setTodoHeightById] = useState<Record<string, number>>({})
  const createLink = useCardLinkStore((state) => state.createLink)
  const deleteLink = useCardLinkStore((state) => state.deleteLink)
  const linkSaveError = useCardLinkStore((state) => state.saveError)
  const selectedLinkId = useCardLinkStore((state) => state.selectedLinkId)
  const selectLink = useCardLinkStore((state) => state.selectLink)
  const deleteText = useBoardTextStore((state) => state.deleteText)
  const selectedTextId = useBoardTextStore((state) => state.selectedTextId)
  const selectText = useBoardTextStore((state) => state.selectText)
  const textSaveError = useBoardTextStore((state) => state.saveError)
  const deleteCards = useCardStore((state) => state.deleteCards)
  const dragGuide = useCardStore((state) => state.dragGuide)
  const editor = useCardStore((state) => state.editor)
  const isGeometryInteracting = useCardStore((state) => state.isGeometryInteracting)
  const saveError = useCardStore((state) => state.saveError)
  const realtimeStatus = useCardStore((state) => state.realtimeStatus)
  const selectCard = useCardStore((state) => state.selectCard)
  const selectedCardIds = useCardStore((state) => state.selectedCardIds)
  const selectCards = useCardStore((state) => state.selectCards)
  const deleteTodoBlocks = useTodoStore((state) => state.deleteBlocks)
  const selectedTodoBlockIds = useTodoStore((state) => state.selectedBlockIds)
  const expandedTodoBlockIds = useTodoStore((state) => state.expandedBlockIds)
  const selectTodoBlocks = useTodoStore((state) => state.selectBlocks)
  const todoSaveError = useTodoStore((state) => state.saveError)
  const confirm = useFeedbackStore((state) => state.confirm)
  const language = useI18nStore((state) => state.language)
  const t = translations[language]
  const setLiveCamera = useBoardMotionStore((state) => state.setLiveCamera)
  const clearLiveCamera = useBoardMotionStore((state) => state.clearLiveCamera)
  const { members, remoteCursors, self, sendCursor } = useBoardCollaboration({
    enabled: boardScope === 'shared',
    fallbackName: t.board.memberFallback,
    roomId: collaborationRoomId,
    userAvatarPath: userProfile?.avatarPath,
    userColor: userProfile?.activeColor,
    userEmail,
    userId,
    userName: userProfile?.nickname,
  })
  const gridSize = clamp(34 * camera.zoom, 18, 72)
  const devicePixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  const displayCameraX = Math.round(camera.x * devicePixelRatio) / devicePixelRatio
  const displayCameraY = Math.round(camera.y * devicePixelRatio) / devicePixelRatio
  const cardById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards])
  const todoBlockById = useMemo(() => new Map(todoBlocks.map((block) => [block.id, block])), [todoBlocks])
  const todoItemsByBlock = useMemo(() => {
    const grouped = new Map<string, TodoItem[]>()
    for (const item of todoItems) {
      const current = grouped.get(item.blockId)
      if (current) current.push(item)
      else grouped.set(item.blockId, [item])
    }
    for (const items of grouped.values()) {
      items.sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt.localeCompare(right.createdAt))
    }
    return grouped
  }, [todoItems])
  const cardRenderSizeById = useMemo(
    () => new Map(cards.map((card) => [card.id, getCardRenderSize(card)])),
    [cards],
  )
  const selectedCardIdSet = useMemo(() => new Set(selectedCardIds), [selectedCardIds])
  const selectedTodoIdSet = useMemo(() => new Set(selectedTodoBlockIds), [selectedTodoBlockIds])
  const expandedTodoIdSet = useMemo(() => new Set(expandedTodoBlockIds), [expandedTodoBlockIds])
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
  const renderedTodoBlocks = useMemo(
    () => todoBlocks.filter((block) => {
      const itemCount = todoItemsByBlock.get(block.id)?.length ?? 0
      const height = todoHeightById[block.id] ?? getTodoBlockRenderHeight(itemCount, expandedTodoIdSet.has(block.id))
      return intersectsBounds(block.x, block.y, block.w, height, visibleWorldBounds)
    }),
    [expandedTodoIdSet, todoBlocks, todoHeightById, todoItemsByBlock, visibleWorldBounds],
  )
  const linkNodes = useMemo<BoardLinkNodeMetric[]>(() => {
    const cardNodes = cards.map((card) => {
      const size = cardRenderSizeById.get(card.id) ?? getCardRenderSize(card)
      const visual = getDeadlineVisualState(card.deadlineAt, card.status, now, language)
      return { color: visual.borderColor, h: size.h, id: card.id, kind: 'card' as const, w: size.w, x: card.x, y: card.y }
    })
    const todoNodes = todoBlocks.map((block) => {
      const items = todoItemsByBlock.get(block.id) ?? []
      const status = getTodoBlockStatus(items, block.id)
      const visual = block.deadlineAt
        ? getDeadlineVisualState(block.deadlineAt, status.isDone ? 'done' : 'todo', now, language)
        : { borderColor: '#55d9e8' }
      return {
        color: visual.borderColor,
        h: todoHeightById[block.id] ?? getTodoBlockRenderHeight(items.length, expandedTodoIdSet.has(block.id)),
        id: block.id,
        kind: 'todo' as const,
        w: block.w,
        x: block.x,
        y: block.y,
      }
    })
    return [...cardNodes, ...todoNodes]
  }, [cardRenderSizeById, cards, expandedTodoIdSet, language, now, todoBlocks, todoHeightById, todoItemsByBlock])
  const todoLinkCountById = useMemo(() => {
    const counts = new Map<string, number>()
    for (const link of links) {
      if (link.fromTodoBlockId) {
        counts.set(link.fromTodoBlockId, (counts.get(link.fromTodoBlockId) ?? 0) + 1)
      }
      if (link.toTodoBlockId) {
        counts.set(link.toTodoBlockId, (counts.get(link.toTodoBlockId) ?? 0) + 1)
      }
    }
    return counts
  }, [links])
  const renderedTexts = useMemo(
    () => texts.filter((text) => isTextInBounds(text, visibleWorldBounds)),
    [texts, visibleWorldBounds],
  )
  const selectionBoxStyle = useMemo<CSSProperties | null>(() => {
    if (!selectionBox) {
      return null
    }

    const bounds = getSelectionBounds(selectionBox)
    return {
      height: bounds.bottom - bounds.top,
      left: bounds.left,
      top: bounds.top,
      width: bounds.right - bounds.left,
    }
  }, [selectionBox])
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

  const measureTodoBlock = useCallback((id: string, height: number) => {
    const roundedHeight = Math.max(1, Math.round(height))
    setTodoHeightById((current) =>
      current[id] === roundedHeight ? current : { ...current, [id]: roundedHeight },
    )
  }, [])

  useEffect(() => {
    cameraRef.current = camera
    applyCameraToDom(camera)
  }, [applyCameraToDom, camera])

  useEffect(() => {
    if (selectedCardIds.length === 0) {
      return
    }

    const visibleCardIds = new Set(cards.map((card) => card.id))
    const nextSelectedIds = selectedCardIds.filter((id) => visibleCardIds.has(id))

    if (nextSelectedIds.length !== selectedCardIds.length) {
      selectCards(nextSelectedIds)
    }
  }, [cards, selectCards, selectedCardIds])

  useEffect(() => {
    if (selectedTodoBlockIds.length === 0) return
    const visibleIds = new Set(todoBlocks.map((block) => block.id))
    const next = selectedTodoBlockIds.filter((id) => visibleIds.has(id))
    if (next.length !== selectedTodoBlockIds.length) selectTodoBlocks(next)
  }, [selectTodoBlocks, selectedTodoBlockIds, todoBlocks])

  useEffect(() => {
    if (!boardContextMenu) {
      return undefined
    }

    const closeOnOutsidePointer = (event: globalThis.PointerEvent) => {
      const target = event.target

      if (target instanceof Element && target.closest('[data-board-context-menu="true"]')) {
        return
      }

      setBoardContextMenu(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setBoardContextMenu(null)
      }
    }
    const closeOnWheel = () => setBoardContextMenu(null)

    window.addEventListener('pointerdown', closeOnOutsidePointer, true)
    window.addEventListener('keydown', closeOnEscape)
    window.addEventListener('wheel', closeOnWheel, { passive: true })

    return () => {
      window.removeEventListener('pointerdown', closeOnOutsidePointer, true)
      window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('wheel', closeOnWheel)
    }
  }, [boardContextMenu])

  useEffect(() => setBoardContextMenu(null), [viewKey])

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
    setLiveCamera(cameraRef.current)
  }, [clearCameraMoveTimer, setCameraMoving, setLiveCamera])

  const settleCameraMoveSoon = useCallback((commitCamera = false) => {
    clearCameraMoveTimer()
    cameraMoveEndTimerRef.current = window.setTimeout(() => {
      cameraMoveEndTimerRef.current = null
      if (commitCamera) {
        setCamera(cameraRef.current)
      }
      setCameraMoving(false)
      clearLiveCamera()
    }, cameraMoveSettleMs)
  }, [clearCameraMoveTimer, clearLiveCamera, setCamera, setCameraMoving])

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
        type: 'card',
        title: card.title,
        description: card.description || null,
        active: card.isActive,
        completed: card.status === 'done',
        status: card.status,
        deadline: formatDate(card.deadlineAt),
      })),
      todoBlocks: todoBlocks.map((block) => {
        const items = todoItemsByBlock.get(block.id) ?? []
        const status = getTodoBlockStatus(items, block.id)
        return {
          type: 'todo',
          title: block.title,
          completed: status.isDone,
          progress: { completed: status.completed, total: status.total },
          deadline: block.deadlineAt ? formatDate(block.deadlineAt) : null,
          items: items.map((item) => ({
            title: item.title,
            description: item.description || null,
            active: item.isActive,
            completed: item.isDone,
          })),
        }
      }),
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
  }, [boardScope, cards, exportContext.boardName, exportContext.filterName, language, todoBlocks, todoItemsByBlock])

  useEffect(() => {
    return () => {
      linkDraftCleanupRef.current?.()
      clearCameraMoveTimer()
      clearLiveCamera()
    }
  }, [clearCameraMoveTimer, clearLiveCamera])

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

      if (selectedCardIds.length === 0 && selectedTodoBlockIds.length === 0) {
        return
      }

      const selectedIdSet = new Set(selectedCardIds)
      const selectedCards = cards.filter((card) => selectedIdSet.has(card.id))
      const selectedTodoSet = new Set(selectedTodoBlockIds)
      const selectedTodos = todoBlocks.filter((block) => selectedTodoSet.has(block.id))

      if (selectedCards.length === 0 && selectedTodos.length === 0) {
        return
      }

      event.preventDefault()

      void confirm({
        confirmLabel: t.card.delete,
        description:
          selectedTodos.length > 0
            ? `${selectedCards.length + selectedTodos.length} ${t.common.confirm.toLowerCase()}`
            : selectedCards.length > 1
              ? t.card.deleteManyDescription(selectedCards.length)
              : t.card.deleteDescription(selectedCards[0].title),
        title:
          selectedTodos.length > 0
            ? t.todo.deleteBlockTitle
            : selectedCards.length > 1
              ? t.card.deleteManyTitle(selectedCards.length)
              : t.card.deleteTitle,
        tone: 'danger',
      }).then((confirmed) => {
        if (confirmed) {
          if (selectedCards.length > 0) {
            void deleteCards(selectedCards.map((card) => card.id)).catch(() => undefined)
          }
          if (selectedTodos.length > 0) {
            void deleteTodoBlocks(selectedTodos.map((block) => block.id)).catch(() => undefined)
          }
        }
      })
    }

    window.addEventListener('keydown', handleDeleteKey)

    return () => window.removeEventListener('keydown', handleDeleteKey)
  }, [
    cards,
    confirm,
    deleteCards,
    deleteTodoBlocks,
    deleteLink,
    deleteText,
    editor,
    selectedCardIds,
    selectedTodoBlockIds,
    selectedLinkId,
    selectedTextId,
    t,
    texts,
    todoBlocks,
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
      setLiveCamera(nextCamera)
      settleCameraMoveSoon(true)
    },
    [applyCameraToDom, beginCameraMove, setLiveCamera, settleCameraMoveSoon],
  )

  useEffect(() => {
    const viewport = boardViewportRef.current

    if (!viewport) {
      return undefined
    }

    viewport.addEventListener('wheel', zoomAtPoint, { passive: false })

    return () => viewport.removeEventListener('wheel', zoomAtPoint)
  }, [zoomAtPoint])

  const getSelectedIdsInBox = useCallback(
    (box: SelectionBox, baseCardIds: string[], baseTodoIds: string[]) => {
      const bounds = getSelectionBounds(box)
      const nextCardIds = new Set(baseCardIds)
      const nextTodoIds = new Set(baseTodoIds)

      for (const card of cards) {
        const renderSize = cardRenderSizeById.get(card.id)

        if (
          renderSize &&
          intersectsBounds(card.x, card.y, renderSize.w, renderSize.h, bounds)
        ) {
          nextCardIds.add(card.id)
        }
      }

      for (const block of todoBlocks) {
        const itemCount = todoItemsByBlock.get(block.id)?.length ?? 0
        const height =
          todoHeightById[block.id] ??
          getTodoBlockRenderHeight(itemCount, expandedTodoIdSet.has(block.id))
        if (intersectsBounds(block.x, block.y, block.w, height, bounds)) {
          nextTodoIds.add(block.id)
        }
      }

      return {
        cardIds: Array.from(nextCardIds),
        todoIds: Array.from(nextTodoIds),
      }
    },
    [cardRenderSizeById, cards, expandedTodoIdSet, todoBlocks, todoHeightById, todoItemsByBlock],
  )

  const handlePanStart = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return
    }

    const target = event.target
    const targetElement = target instanceof Element ? target : null

    if (targetElement?.closest('[data-board-object="true"]')) {
      return
    }

    if (target !== event.currentTarget) {
      return
    }

    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      event.preventDefault()
      selectLink(null)
      selectText(null)

      const startPoint = getWorldPointFromClient(event.clientX, event.clientY)
      const baseCardIds = [...selectedCardIds]
      const baseTodoIds = [...selectedTodoBlockIds]
      let frameId: number | null = null
      let pendingBox: SelectionBox = {
        currentX: startPoint.x,
        currentY: startPoint.y,
        startX: startPoint.x,
        startY: startPoint.y,
      }

      setSelectionBox(pendingBox)

      const flushSelection = () => {
        frameId = null
        setSelectionBox(pendingBox)
        const next = getSelectedIdsInBox(pendingBox, baseCardIds, baseTodoIds)
        selectCards(next.cardIds)
        selectTodoBlocks(next.todoIds)
      }

      const handleMove = (moveEvent: globalThis.PointerEvent) => {
        const point = getWorldPointFromClient(moveEvent.clientX, moveEvent.clientY)
        pendingBox = {
          ...pendingBox,
          currentX: point.x,
          currentY: point.y,
        }

        if (frameId === null) {
          frameId = window.requestAnimationFrame(flushSelection)
        }
      }

      const handleUp = () => {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
        window.removeEventListener('pointercancel', handleUp)

        if (frameId !== null) {
          window.cancelAnimationFrame(frameId)
        }

        const next = getSelectedIdsInBox(pendingBox, baseCardIds, baseTodoIds)
        selectCards(next.cardIds)
        selectTodoBlocks(next.todoIds)
        setSelectionBox(null)
      }

      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
      window.addEventListener('pointercancel', handleUp)
      return
    }

    event.preventDefault()
    selectCard(null)
    selectTodoBlocks([])
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
      setLiveCamera(pendingCamera)
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
        setLiveCamera(pendingCamera)
      }

      setCamera(pendingCamera)
      setCameraMoving(false)
      clearLiveCamera()
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

  const handleBoardContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault()
      const target = event.target
      const targetElement = target instanceof Element ? target : null

      if (
        targetElement?.closest(
          '[data-board-object="true"], [data-card-root="true"], [data-card-action="true"], .card-link-group',
        )
      ) {
        setBoardContextMenu(null)
        return
      }

      const viewport = viewportRef.current

      if (!viewport) {
        return
      }

      const rect = viewportRectRef.current ?? viewport.getBoundingClientRect()
      viewportRectRef.current = rect
      const worldPoint = getWorldPointFromClient(event.clientX, event.clientY)
      const menuWidth = 226
      const menuHeight = 248

      selectCard(null)
      selectTodoBlocks([])
      selectLink(null)
      selectText(null)
      setBoardContextMenu({
        screenX: clamp(event.clientX - rect.left, 12, Math.max(12, rect.width - menuWidth - 12)),
        screenY: clamp(event.clientY - rect.top, 12, Math.max(12, rect.height - menuHeight - 12)),
        worldX: Math.round(worldPoint.x),
        worldY: Math.round(worldPoint.y),
      })
    },
    [getWorldPointFromClient, selectCard, selectLink, selectText, selectTodoBlocks],
  )

  const createCardFromContext = useCallback(() => {
    if (!boardContextMenu) {
      return
    }

    onCreateAtPosition(boardContextMenu.worldX, boardContextMenu.worldY)
    setBoardContextMenu(null)
  }, [boardContextMenu, onCreateAtPosition])

  const createTextFromContext = useCallback(() => {
    if (!boardContextMenu) {
      return
    }

    onCreateTextAtPosition(boardContextMenu.worldX, boardContextMenu.worldY)
    setBoardContextMenu(null)
  }, [boardContextMenu, onCreateTextAtPosition])

  const createTodoFromContext = useCallback(() => {
    if (!boardContextMenu) {
      return
    }

    onCreateTodoAtPosition(boardContextMenu.worldX, boardContextMenu.worldY)
    setBoardContextMenu(null)
  }, [boardContextMenu, onCreateTodoAtPosition])

  const handleStartConnection = useCallback(
    (from: BoardLinkEndpoint, event: PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0 || event.pointerType === 'touch') {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      selectCard(null)
      selectTodoBlocks([])
      selectLink(null)
      selectText(null)
      linkDraftCleanupRef.current?.()

      setDraftLink({
        from,
        pointer: getWorldPointFromClient(event.clientX, event.clientY),
      })

      let frameId: number | null = null
      let pendingPointer = getWorldPointFromClient(event.clientX, event.clientY)

      const flushDraftLink = () => {
        frameId = null
        setDraftLink({
          from,
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
        const targetId = handle?.dataset.linkNodeId ?? null
        const targetKind = handle?.dataset.linkNodeKind === 'todo' ? 'todo' : 'card'
        const targetSide = handle?.dataset.cardSide as CardLinkSide | undefined

        removeListeners()
        setDraftLink(null)

        if (!targetId || !targetSide || (targetKind === from.kind && targetId === from.id)) {
          return
        }

        const sourceNode =
          from.kind === 'card' ? cardById.get(from.id) : todoBlockById.get(from.id)
        const targetNode =
          targetKind === 'card' ? cardById.get(targetId) : todoBlockById.get(targetId)
        if (!sourceNode || !targetNode) {
          return
        }

        void createLink(
          {
            boardScope,
            from,
            projectId:
              boardScope === 'shared' ? sourceNode.projectId ?? defaultProjectId : null,
            to: { id: targetId, kind: targetKind, side: targetSide },
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
    [
      boardScope,
      cardById,
      createLink,
      getWorldPointFromClient,
      selectCard,
      selectLink,
      selectText,
      selectTodoBlocks,
      todoBlockById,
      userId,
    ],
  )

  const handleStartCardConnection = useCallback(
    (card: Card, side: CardLinkSide, event: PointerEvent<HTMLButtonElement>) =>
      handleStartConnection({ id: card.id, kind: 'card', side }, event),
    [handleStartConnection],
  )

  const handleStartTodoConnection = useCallback(
    (block: TodoBlockModel, side: CardLinkSide, event: PointerEvent<HTMLButtonElement>) =>
      handleStartConnection({ id: block.id, kind: 'todo', side }, event),
    [handleStartConnection],
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

  const focusRemoteMember = useCallback(
    (clientId: string) => {
      const cursor = remoteCursors.find((candidate) => candidate.clientId === clientId)
      if (!cursor || viewportSize.width === 0 || viewportSize.height === 0) {
        return
      }

      setCamera((current) => ({
        ...current,
        x: viewportSize.width / 2 - cursor.x * current.zoom,
        y: viewportSize.height / 2 - cursor.y * current.zoom,
      }))
    },
    [remoteCursors, setCamera, viewportSize.height, viewportSize.width],
  )

  const handleZoomIn = useCallback(() => zoomBy(1.1), [zoomBy])
  const handleZoomOut = useCallback(() => zoomBy(0.9), [zoomBy])
  return (
    <main
      className="desktop-board-scene relative min-h-0 flex-1 overflow-hidden rounded-[28px] border border-white/10 bg-[#05070b] shadow-2xl"
      data-camera-moving={isCameraMovingRef.current ? 'true' : 'false'}
      data-geometry-interacting={isGeometryInteracting ? 'true' : 'false'}
      data-performance-mode={isPerformanceMode ? 'true' : 'false'}
      onPointerMove={handleScenePointerMove}
      ref={viewportRef}
      style={sceneStyle}
    >
      <div
        className="board-viewport absolute inset-0"
        onContextMenu={handleBoardContextMenu}
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
          {selectionBoxStyle ? (
            <div className="board-selection-box pointer-events-none absolute z-[24]" style={selectionBoxStyle} />
          ) : null}

          <div className="board-content-transition" key={viewKey}>
            {renderedCards
              .filter((card) => !isPerformanceMode || card.isActive)
              .map((card) => (
                  <CardUnderlight card={card} key={`light-${card.id}`} now={now} />
              ))}

            <CardLinkLayer
              draftLink={draftLink}
              links={links}
              nodes={linkNodes}
              selectedLinkId={selectedLinkId}
              onDeleteLink={handleDeleteLink}
              onSelectLink={(id) => {
                selectCard(null)
                selectTodoBlocks([])
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
              <div data-board-object="true" data-card-root="true" key={card.id}>
                <DeadlineCard
                  cameraZoom={camera.zoom}
                  canConnect
                  canDrag
                  card={card}
                  isConnecting={Boolean(draftLink)}
                  isSelected={selectedCardIdSet.has(card.id)}
                  onStartConnection={handleStartCardConnection}
                />
              </div>
            ))}

            {renderedTodoBlocks.map((block) => (
              <TodoBlock
                block={block}
                cameraZoom={camera.zoom}
                canConnect
                canDrag
                isConnecting={Boolean(draftLink)}
                isSelected={selectedTodoIdSet.has(block.id)}
                items={todoItemsByBlock.get(block.id) ?? []}
                key={block.id}
                linkedCount={todoLinkCountById.get(block.id) ?? 0}
                now={now}
                onMeasure={measureTodoBlock}
                onStartConnection={handleStartTodoConnection}
              />
            ))}
          </div>

          {remoteCursors.map((cursor) => (
            <RemoteCursor cursor={cursor} key={cursor.clientId} />
          ))}
        </div>
      </div>

      {boardContextMenu ? (
        <div
          aria-label={t.board.createMenu}
          className="board-context-menu absolute z-40 w-[226px] rounded-2xl border border-white/10 bg-[#080a0f]/96 p-1.5 shadow-2xl backdrop-blur-xl"
          data-board-context-menu="true"
          role="menu"
          style={{ left: boardContextMenu.screenX, top: boardContextMenu.screenY }}
        >
          <div className="board-context-menu-kicker">{t.board.createHere}</div>
          <AddMenuItems
            onAddCard={createCardFromContext}
            onAddText={createTextFromContext}
            onAddTodo={createTodoFromContext}
          />
        </div>
      ) : null}

      <div className="pointer-events-none absolute left-5 top-5 z-20">
        <BoardControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          zoom={camera.zoom}
        />
      </div>

      <div className="pointer-events-auto absolute right-6 top-6 z-20 hidden items-center gap-2 lg:flex xl:right-[274px]">
        <button
          aria-label={t.board.exportJson}
          className="board-top-action"
          type="button"
          onClick={handleExportBoard}
        >
          <Download size={15} />
          {t.board.exportJson}
        </button>

        <button
          aria-label={t.board.performanceMode}
          aria-pressed={isPerformanceMode}
          className="board-top-action board-performance-toggle"
          data-active={isPerformanceMode ? 'true' : 'false'}
          type="button"
          onClick={togglePerformanceMode}
        >
          <Activity size={15} />
          {t.board.performanceMode}
        </button>
      </div>

      <MiniMap
        camera={camera}
        cursors={remoteCursors}
        nodes={linkNodes}
        setCamera={setCamera}
        viewportSize={viewportSize}
      />

      {boardScope === 'shared' ? (
        <PresenceCluster members={members} onFocusMember={focusRemoteMember} self={self} />
      ) : null}

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

      {!isLoading && !error && cards.length === 0 && todoBlocks.length === 0 && texts.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center p-6">
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
            <button className="primary-button pointer-events-auto mx-auto" type="button" onClick={onCreateAtCenter}>
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

      {saveError || linkSaveError || textSaveError || todoSaveError ? (
        <div className="absolute bottom-5 left-5 z-20 max-w-md rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100 backdrop-blur-xl">
          {saveError ?? linkSaveError ?? textSaveError ?? todoSaveError}
        </div>
      ) : null}
    </main>
  )
}
