import { CheckCircle2, Clock3, Flame, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { memo, useEffect, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'
import { cn } from '../../lib/cn.ts'
import { useDragCard } from '../board/useDragCard.ts'
import type { BoardCamera } from '../board/useBoardCamera.ts'
import { useCardStore } from './card.store.ts'
import type { Card } from './card.types.ts'
import { formatCountdown } from './countdown.ts'
import { getDeadlineVisualState } from './deadlineColor.ts'

type DeadlineCardProps = {
  camera: BoardCamera
  canDrag: boolean
  card: Card
  isSelected: boolean
}

type CardStyle = CSSProperties & Record<`--${string}`, string | number>
type MenuPosition = {
  x: number
  y: number
}

function DeadlineCardComponent({ camera, canDrag, card, isSelected }: DeadlineCardProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)
  const now = useCardStore((state) => state.now)
  const deleteCard = useCardStore((state) => state.deleteCard)
  const openEditEditor = useCardStore((state) => state.openEditEditor)
  const selectCard = useCardStore((state) => state.selectCard)
  const updateCard = useCardStore((state) => state.updateCard)
  const dragPointerDown = useDragCard({ camera, card, enabled: canDrag })
  const visual = getDeadlineVisualState(card.deadlineAt, card.status, now)
  const countdown = formatCountdown(card.deadlineAt, card.status, now)

  const cardStyle: CardStyle = {
    '--deadline-bg': visual.backgroundColor,
    '--deadline-border': visual.borderColor,
    '--deadline-glow': visual.glowColor,
    '--deadline-text': visual.textColor,
    left: card.x,
    minHeight: card.h,
    top: card.y,
    width: card.w,
  }

  useEffect(() => {
    if (!isMenuOpen) {
      return undefined
    }

    const closeOnOutsideLeftClick = (event: globalThis.PointerEvent) => {
      if (event.button !== 0) {
        return
      }

      const target = event.target as HTMLElement | null

      if (target?.closest('[data-card-action="true"]')) {
        return
      }

      setIsMenuOpen(false)
      setMenuPosition(null)
    }

    window.addEventListener('pointerdown', closeOnOutsideLeftClick)

    return () => window.removeEventListener('pointerdown', closeOnOutsideLeftClick)
  }, [isMenuOpen])

  const handleDelete = async () => {
    setIsMenuOpen(false)
    setMenuPosition(null)

    if (!window.confirm('Удалить эту карточку дедлайна?')) {
      return
    }

    await deleteCard(card.id).catch(() => undefined)
  }

  const handleToggleDone = async () => {
    setIsMenuOpen(false)
    setMenuPosition(null)
    await updateCard(card.id, { status: card.status === 'done' ? 'todo' : 'done' }).catch(
      () => undefined,
    )
  }

  const handleEdit = () => {
    setIsMenuOpen(false)
    setMenuPosition(null)
    openEditEditor(card.id)
  }

  const handleCardClick = (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement

    if (target.closest('[data-card-action="true"]')) {
      return
    }

    selectCard(card.id)
  }

  const handleContextMenu = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault()
    selectCard(card.id)

    const rect = event.currentTarget.getBoundingClientRect()
    setMenuPosition({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    })
    setIsMenuOpen(true)
  }

  const handleCardPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'touch' || event.buttons !== 0) {
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width
    const y = (event.clientY - rect.top) / rect.height
    event.currentTarget.style.setProperty('--card-tilt-x', `${(x - 0.5) * 2.6}deg`)
    event.currentTarget.style.setProperty('--card-tilt-y', `${(0.5 - y) * 2.1}deg`)
  }

  const handleCardPointerLeave = (event: PointerEvent<HTMLElement>) => {
    event.currentTarget.style.setProperty('--card-tilt-x', '0deg')
    event.currentTarget.style.setProperty('--card-tilt-y', '0deg')
  }

  return (
    <article
      className={cn(
        'deadline-card group absolute select-none overflow-visible rounded-[18px] border p-5 text-left transition duration-200',
        card.status === 'done' && 'deadline-card-done',
        visual.shouldPulse && 'deadline-card-pulse',
        isSelected && 'deadline-card-selected',
        canDrag && 'cursor-grab active:cursor-grabbing',
      )}
      data-zone={visual.zone}
      onClick={handleCardClick}
      onContextMenu={handleContextMenu}
      onDoubleClick={() => openEditEditor(card.id)}
      onPointerDown={dragPointerDown}
      onPointerLeave={handleCardPointerLeave}
      onPointerMove={handleCardPointerMove}
      style={cardStyle}
    >
      <div className="deadline-card-border pointer-events-none absolute inset-[-1px] rounded-[19px]" />
      <div className="pointer-events-none absolute inset-0 rounded-[18px] opacity-45 deadline-card-noise" />
      <div className="relative z-10">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="grid h-11 w-11 place-items-center rounded-xl border border-[var(--deadline-border)]/70 bg-black/30 text-[var(--deadline-text)] shadow-[0_0_22px_var(--deadline-glow)]">
            {card.status === 'done' ? <CheckCircle2 size={21} /> : <Flame size={21} />}
          </div>
          <div className="relative">
            <button
              aria-label="Действия с карточкой"
              className="icon-button h-9 w-9"
              data-card-action="true"
              type="button"
              onClick={() => {
                setMenuPosition(null)
                setIsMenuOpen((value) => !value)
              }}
            >
              <MoreHorizontal size={18} />
            </button>
          </div>
        </div>

        <h3
          className={cn(
            'mb-3 line-clamp-2 text-[22px] font-bold leading-tight text-white drop-shadow',
            card.status === 'done' && 'text-white/55 line-through',
          )}
        >
          {card.title}
        </h3>

        {card.description ? (
          <p className="mb-4 line-clamp-2 text-sm leading-6 text-white/55">{card.description}</p>
        ) : null}

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
      </div>

      {isMenuOpen ? (
        <div
          className={cn(
            'absolute z-30 min-w-44 rounded-2xl border border-white/10 bg-[#080a0f]/95 p-1.5 shadow-2xl backdrop-blur-xl',
            !menuPosition && 'right-5 top-16',
          )}
          data-card-action="true"
          style={menuPosition ? { left: menuPosition.x, top: menuPosition.y } : undefined}
        >
          <button className="menu-item" type="button" onClick={handleEdit}>
            <Pencil size={15} />
            Редактировать
          </button>
          <button className="menu-item" type="button" onClick={handleToggleDone}>
            <CheckCircle2 size={15} />
            {card.status === 'done' ? 'Вернуть в работу' : 'Отметить готово'}
          </button>
          <button className="menu-item menu-item-danger" type="button" onClick={handleDelete}>
            <Trash2 size={15} />
            Удалить
          </button>
        </div>
      ) : null}
    </article>
  )
}

export const DeadlineCard = memo(DeadlineCardComponent)
