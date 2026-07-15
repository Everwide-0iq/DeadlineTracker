import { CalendarCheck2, CheckCircle2, Clock3, Flame, MoreHorizontal, Pencil, Trash2, Unlink, Zap } from 'lucide-react'
import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn.ts'
import { useAuthStore } from '../auth/auth.store.ts'
import { useDragCard } from '../board/useDragCard.ts'
import { useResizeCard, type CardResizeDirection } from '../board/useResizeCard.ts'
import { useBoardTextStore } from '../boardTexts/boardText.store.ts'
import { useCardLinkStore } from '../cardLinks/cardLink.store.ts'
import type { CardLinkSide } from '../cardLinks/cardLink.types.ts'
import { useFeedbackStore } from '../feedback/feedback.store.ts'
import { useI18nStore } from '../i18n/i18n.store.ts'
import { translations } from '../i18n/translations.ts'
import { ProfileAvatar } from '../profile/ProfileAvatar.tsx'
import { useProfileStore } from '../profile/profile.store.ts'
import { defaultActiveColor } from '../profile/profile.types.ts'
import { useCardStore } from './card.store.ts'
import { CardImageView } from './CardImageView.tsx'
import type { Card } from './card.types.ts'
import { getCardRenderSize } from './card.utils.ts'
import { formatCompletionDate } from './completion.ts'
import { formatCountdown } from './countdown.ts'
import { getDeadlineVisualState } from './deadlineColor.ts'
import { useCompletionAnimation } from './useCompletionAnimation.ts'
import { useTodoStore } from '../todos/todo.store.ts'

type DeadlineCardProps = {
  cameraZoom: number
  canDrag: boolean
  canConnect?: boolean
  card: Card
  isConnecting?: boolean
  isSelected: boolean
  onStartConnection?: (
    card: Card,
    side: CardLinkSide,
    event: PointerEvent<HTMLButtonElement>,
  ) => void
}

type CardStyle = CSSProperties & Record<`--${string}`, string | number>
type MenuPosition = {
  x: number
  y: number
}

const linkSides: CardLinkSide[] = ['top', 'right', 'bottom', 'left']
const resizeDirections: CardResizeDirection[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']

function DeadlineCardComponent({
  cameraZoom,
  canConnect = false,
  canDrag,
  card,
  isConnecting = false,
  isSelected,
  onStartConnection,
}: DeadlineCardProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const now = useCardStore((state) => state.now)
  const deleteCards = useCardStore((state) => state.deleteCards)
  const openEditEditor = useCardStore((state) => state.openEditEditor)
  const selectCard = useCardStore((state) => state.selectCard)
  const selectedCardIds = useCardStore((state) => state.selectedCardIds)
  const toggleCardSelection = useCardStore((state) => state.toggleCardSelection)
  const toggleCardActive = useCardStore((state) => state.toggleCardActive)
  const updateCard = useCardStore((state) => state.updateCard)
  const userId = useAuthStore((state) => state.user?.id ?? null)
  const deleteLinksForCard = useCardLinkStore((state) => state.deleteLinksForCard)
  const linkedCount = useCardLinkStore((state) =>
    state.links.reduce(
      (count, link) =>
        link.fromCardId === card.id || link.toCardId === card.id ? count + 1 : count,
      0,
    ),
  )
  const selectLink = useCardLinkStore((state) => state.selectLink)
  const selectText = useBoardTextStore((state) => state.selectText)
  const selectTodoBlocks = useTodoStore((state) => state.selectBlocks)
  const confirm = useFeedbackStore((state) => state.confirm)
  const language = useI18nStore((state) => state.language)
  const t = translations[language]
  const activeProfile = useProfileStore((state) =>
    card.activeBy ? state.profiles[card.activeBy] ?? null : null,
  )
  const completedProfile = useProfileStore((state) =>
    card.completedBy ? state.profiles[card.completedBy] ?? null : null,
  )
  const dragPointerDown = useDragCard({ cameraZoom, card, enabled: canDrag })
  const resizePointerDown = useResizeCard({ cameraZoom, card, enabled: canDrag })
  const visual = getDeadlineVisualState(card.deadlineAt, card.status, now, language)
  const countdown = formatCountdown(card.deadlineAt, card.status, now, language)
  const renderSize = getCardRenderSize(card)
  const isCompleting = useCompletionAnimation(card.status === 'done')
  const activeColor = activeProfile?.activeColor ?? defaultActiveColor
  const activeOwnerName = activeProfile?.nickname ?? t.card.activeOwnerUnknown
  const activeActionLabel =
    card.isActive && card.activeBy === userId
      ? t.card.deactivate
      : card.isActive
        ? t.card.takeActivity
        : t.card.activate
  const completionDate = formatCompletionDate(card.completedAt, language)
  const completedOwnerName = completedProfile?.nickname ?? t.card.activeOwnerUnknown
  const completedOwnerColor = completedProfile?.activeColor ?? defaultActiveColor
  const resizeZoom = Math.max(cameraZoom, 0.1)
  const resizeEdgeSize = 16 / resizeZoom
  const resizeCornerSize = 24 / resizeZoom

  const cardStyle: CardStyle = {
    '--active-color': activeColor,
    '--card-resize-corner': `${resizeCornerSize}px`,
    '--card-resize-corner-offset': `${resizeCornerSize / -2}px`,
    '--card-resize-dot': `${8 / resizeZoom}px`,
    '--card-resize-edge': `${resizeEdgeSize}px`,
    '--card-resize-edge-offset': `${resizeEdgeSize / -2}px`,
    '--card-resize-inset': `${resizeCornerSize * 0.56}px`,
    '--card-resize-line': `${2 / resizeZoom}px`,
    '--deadline-bg': visual.backgroundColor,
    '--deadline-border': visual.borderColor,
    '--deadline-glow': visual.glowColor,
    '--deadline-text': visual.textColor,
    height: renderSize.h,
    left: card.x,
    minHeight: renderSize.h,
    top: card.y,
    width: renderSize.w,
  }

  useEffect(() => {
    if (!isMenuOpen) {
      return undefined
    }

    const closeMenu = () => {
      setIsMenuOpen(false)
      setMenuPosition(null)
    }

    const closeOnOutsideLeftClick = (event: globalThis.PointerEvent) => {
      const target = event.target

      if (target instanceof Element && target.closest(`[data-card-menu-owner="${card.id}"]`)) {
        return
      }

      closeMenu()
    }

    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu()
      }
    }

    window.addEventListener('pointerdown', closeOnOutsideLeftClick)
    window.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', closeMenu)

    return () => {
      window.removeEventListener('pointerdown', closeOnOutsideLeftClick)
      window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', closeMenu)
    }
  }, [card.id, isMenuOpen])

  useLayoutEffect(() => {
    if (!isMenuOpen || !menuPosition || !menuRef.current) {
      return
    }

    const padding = 12
    const rect = menuRef.current.getBoundingClientRect()
    const next = {
      x: Math.min(Math.max(menuPosition.x, padding), Math.max(window.innerWidth - rect.width - padding, padding)),
      y: Math.min(Math.max(menuPosition.y, padding), Math.max(window.innerHeight - rect.height - padding, padding)),
    }

    if (next.x !== menuPosition.x || next.y !== menuPosition.y) {
      setMenuPosition(next)
    }
  }, [isMenuOpen, linkedCount, menuPosition, selectedCardIds.length])

  const handleDelete = async () => {
    setIsMenuOpen(false)
    setMenuPosition(null)
    const ids = isSelected && selectedCardIds.length > 1 ? selectedCardIds : [card.id]
    const isBulkDelete = ids.length > 1

    const confirmed = await confirm({
      confirmLabel: t.card.delete,
      description: isBulkDelete
        ? t.card.deleteManyDescription(ids.length)
        : t.card.deleteDescription(card.title),
      title: isBulkDelete ? t.card.deleteManyTitle(ids.length) : t.card.deleteTitle,
      tone: 'danger',
    })

    if (!confirmed) {
      return
    }

    await deleteCards(ids).catch(() => undefined)
  }

  const handleToggleActive = async () => {
    setIsMenuOpen(false)
    setMenuPosition(null)
    await toggleCardActive(card.id, userId).catch(() => undefined)
  }

  const handleToggleDone = async () => {
    setIsMenuOpen(false)
    setMenuPosition(null)
    await updateCard(card.id, { status: card.status === 'done' ? 'todo' : 'done' }).catch(
      () => undefined,
    )
  }

  const handleDeleteAllLinks = async () => {
    setIsMenuOpen(false)
    setMenuPosition(null)

    const confirmed = await confirm({
      confirmLabel: t.link.deleteAll,
      description: t.link.deleteAllDescription(card.title, linkedCount),
      title: t.link.deleteAllTitle,
      tone: 'danger',
    })

    if (!confirmed) {
      return
    }

    await deleteLinksForCard(card.id).catch(() => undefined)
  }

  const handleEdit = () => {
    setIsMenuOpen(false)
    setMenuPosition(null)
    openEditEditor(card.id)
  }

  const handleCardClick = (event: MouseEvent<HTMLElement>) => {
    if (event.currentTarget.dataset.cardDragMoved === 'true') {
      event.preventDefault()
      return
    }

    const target = event.target

    if (target instanceof Element && target.closest('[data-card-action="true"]')) {
      return
    }

    selectLink(null)
    selectText(null)

    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      toggleCardSelection(card.id)
      return
    }

    selectTodoBlocks([])
    selectCard(card.id)
  }

  const handleContextMenu = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault()
    selectLink(null)
    selectText(null)
    if (!isSelected) {
      selectTodoBlocks([])
      selectCard(card.id)
    }

    setMenuPosition({
      x: event.clientX,
      y: event.clientY,
    })
    setIsMenuOpen(true)
  }

  const handleCardKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) {
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      openEditEditor(card.id)
      return
    }

    if (event.key === ' ') {
      event.preventDefault()
      selectLink(null)
      selectText(null)
      if (event.ctrlKey || event.metaKey || event.shiftKey) {
        toggleCardSelection(card.id)
      } else {
        selectTodoBlocks([])
        selectCard(card.id)
      }
    }
  }

  const handleCardPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'touch' || event.buttons !== 0) {
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    const edgeDistance = Math.min(
      event.clientX - rect.left,
      rect.right - event.clientX,
      event.clientY - rect.top,
      rect.bottom - event.clientY,
    )

    if (edgeDistance <= 22) {
      event.currentTarget.dataset.resizeReady = 'true'
      event.currentTarget.style.setProperty('--card-tilt-x', '0deg')
      event.currentTarget.style.setProperty('--card-tilt-y', '0deg')
      return
    }

    delete event.currentTarget.dataset.resizeReady
    const x = (event.clientX - rect.left) / rect.width
    const y = (event.clientY - rect.top) / rect.height
    event.currentTarget.style.setProperty('--card-tilt-x', `${(x - 0.5) * 2.6}deg`)
    event.currentTarget.style.setProperty('--card-tilt-y', `${(0.5 - y) * 2.1}deg`)
  }

  const handleCardPointerLeave = (event: PointerEvent<HTMLElement>) => {
    delete event.currentTarget.dataset.resizeReady
    event.currentTarget.style.setProperty('--card-tilt-x', '0deg')
    event.currentTarget.style.setProperty('--card-tilt-y', '0deg')
  }

  return (
    <article
      aria-label={`${card.title}, ${countdown}${card.isActive ? `, ${t.card.activeBy(activeOwnerName)}` : ''}`}
      className={cn(
        'deadline-card group absolute z-[12] flex select-none flex-col overflow-visible rounded-[18px] border p-5 text-left transition duration-200',
        card.status === 'done' && 'deadline-card-done',
        card.isActive && 'deadline-card-active',
        isCompleting && 'deadline-card-completed',
        isConnecting && 'deadline-card-connecting',
        isSelected && 'deadline-card-selected',
        canDrag && 'cursor-grab active:cursor-grabbing',
      )}
      data-zone={visual.zone}
      data-board-object="true"
      onClick={handleCardClick}
      onContextMenu={handleContextMenu}
      onDoubleClick={() => openEditEditor(card.id)}
      onKeyDown={handleCardKeyDown}
      onPointerDown={dragPointerDown}
      onPointerLeave={handleCardPointerLeave}
      onPointerMove={handleCardPointerMove}
      style={cardStyle}
      tabIndex={0}
    >
      {card.isActive ? <span aria-hidden="true" className="deadline-card-active-rim" /> : null}
      <div className="pointer-events-none absolute inset-0 rounded-[18px] opacity-45 deadline-card-noise" />
      {canDrag
        ? resizeDirections.map((direction) => (
            <button
              aria-label={`${t.card.actions}: resize ${direction}`}
              className={cn('card-resize-handle', `card-resize-handle-${direction}`)}
              data-card-action="true"
              key={direction}
              tabIndex={-1}
              type="button"
              onPointerDown={(event) => resizePointerDown(direction, event)}
            >
              <span />
            </button>
          ))
        : null}
      {canConnect
        ? linkSides.map((side) => (
            <button
              aria-label={t.card.createConnection(side)}
              className={cn('card-link-handle', `card-link-handle-${side}`)}
              data-card-action="true"
              data-card-link-handle="true"
              data-link-node-id={card.id}
              data-link-node-kind="card"
              data-card-side={side}
              key={side}
              tabIndex={-1}
              type="button"
              onPointerDown={(event) => onStartConnection?.(card, side, event)}
            >
              <span />
            </button>
          ))
        : null}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <div className="mb-4 flex shrink-0 items-start justify-between gap-4">
          <div className="grid h-11 w-11 place-items-center rounded-xl border border-[var(--deadline-border)]/70 bg-black/30 text-[var(--deadline-text)] shadow-[0_0_22px_var(--deadline-glow)]">
            {card.status === 'done' ? <CheckCircle2 size={21} /> : <Flame size={21} />}
          </div>
          <div className="relative flex items-center gap-2">
            <button
              aria-label={activeActionLabel}
              aria-pressed={card.isActive}
              className="icon-button card-active-toggle h-9 w-9"
              data-active={card.isActive ? 'true' : 'false'}
              data-card-action="true"
              disabled={card.status === 'done'}
              title={activeActionLabel}
              type="button"
              onClick={handleToggleActive}
            >
              <Zap fill={card.isActive ? 'currentColor' : 'none'} size={17} />
            </button>
            <button
              aria-label={t.card.actions}
              className="icon-button h-9 w-9"
              data-card-action="true"
              data-card-menu-owner={card.id}
              type="button"
              onClick={(event) => {
                if (isMenuOpen) {
                  setIsMenuOpen(false)
                  setMenuPosition(null)
                  return
                }

                const rect = event.currentTarget.getBoundingClientRect()
                setMenuPosition({ x: rect.right - 240, y: rect.bottom + 8 })
                setIsMenuOpen(true)
              }}
            >
              <MoreHorizontal size={18} />
            </button>
          </div>
        </div>

        {card.isActive ? (
          <div className="deadline-card-active-owner" style={{ '--active-color': activeColor } as CardStyle}>
            <ProfileAvatar
              avatarPath={activeProfile?.avatarPath}
              color={activeColor}
              name={activeOwnerName}
              size={22}
            />
            <Zap fill="currentColor" size={13} />
            <span>{t.card.activeBy(activeOwnerName)}</span>
          </div>
        ) : null}

        <h3
          className={cn(
            'mb-3 shrink-0 whitespace-pre-wrap break-words text-[22px] font-bold leading-tight text-white drop-shadow',
            card.status === 'done' && 'text-white/55 line-through',
          )}
        >
          {card.title}
        </h3>

        {card.description ? (
          <p className="mb-4 shrink-0 whitespace-pre-wrap break-words text-sm leading-6 text-white/55">
            {card.description}
          </p>
        ) : null}

        {card.imagePath ? (
          <div className="deadline-card-image-slot mb-4">
            <CardImageView
              alt={t.cardImage.previewAlt(card.title)}
              className="deadline-card-image"
              height={card.imageHeight}
              path={card.imagePath}
              width={card.imageWidth}
            />
          </div>
        ) : null}

        <div className="mt-auto shrink-0">
          <div className="mb-4 flex items-center gap-3 text-[var(--deadline-text)]">
            <Clock3 size={23} />
            <span className="countdown-text text-[34px] font-black tracking-normal">{countdown}</span>
          </div>

          <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[var(--deadline-border)] shadow-[0_0_18px_var(--deadline-glow)] transition-all"
              style={{ width: `${Math.round(visual.progress * 100)}%` }}
            />
          </div>

          <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.08em] text-[var(--deadline-text)]">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--deadline-border)] shadow-[0_0_12px_var(--deadline-glow)]" />
            {visual.label}
          </div>
          {card.status === 'done' ? (
            <div className="deadline-card-completion-date">
              <ProfileAvatar
                avatarPath={completedProfile?.avatarPath}
                className="completion-avatar-pulse"
                color={completedOwnerColor}
                name={completedOwnerName}
                size={22}
              />
              <CalendarCheck2 size={14} />
              <span>
                {completionDate
                  ? t.card.completedBy(completedOwnerName, completionDate)
                  : t.card.completionUnknown}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {isMenuOpen && menuPosition ? createPortal(
        <div
          aria-label={t.card.actions}
          className="card-action-menu fixed z-[70] w-60 rounded-2xl border border-white/10 bg-[#080a0f]/96 p-1.5 shadow-2xl backdrop-blur-xl"
          data-card-action="true"
          data-card-menu-owner={card.id}
          ref={menuRef}
          role="menu"
          style={{ left: menuPosition.x, top: menuPosition.y }}
        >
          <button className="menu-item" type="button" onClick={handleEdit}>
            <Pencil size={15} />
            {t.card.edit}
          </button>
          <button className="menu-item" type="button" onClick={handleToggleDone}>
            <CheckCircle2 size={15} />
            {card.status === 'done' ? t.card.backToWork : t.card.markDone}
          </button>
          {card.status !== 'done' ? (
            <button className="menu-item" type="button" onClick={handleToggleActive}>
              <Zap fill={card.isActive ? 'currentColor' : 'none'} size={15} />
              {activeActionLabel}
            </button>
          ) : null}
          {linkedCount > 0 ? (
            <button className="menu-item menu-item-danger" type="button" onClick={handleDeleteAllLinks}>
              <Unlink size={15} />
              {t.link.deleteAll}
              <span className="ml-auto rounded-full bg-red-400/10 px-2 py-0.5 text-[11px] text-red-100/70">
                {linkedCount}
              </span>
            </button>
          ) : null}
          <div className="mx-2 my-1 h-px bg-white/[0.07]" />
          <button className="menu-item menu-item-danger" type="button" onClick={handleDelete}>
            <Trash2 size={15} />
            {isSelected && selectedCardIds.length > 1
              ? t.card.deleteSelected(selectedCardIds.length)
              : t.card.delete}
          </button>
        </div>,
        document.body,
      ) : null}
    </article>
  )
}

export const DeadlineCard = memo(DeadlineCardComponent)
