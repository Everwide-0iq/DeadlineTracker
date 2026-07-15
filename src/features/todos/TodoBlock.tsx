import {
  CalendarClock,
  Check,
  CheckSquare2,
  ChevronDown,
  ChevronUp,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Unlink,
  Zap,
} from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'
import { cn } from '../../lib/cn.ts'
import { useAuthStore } from '../auth/auth.store.ts'
import type { CardLinkSide } from '../cardLinks/cardLink.types.ts'
import { useCardLinkStore } from '../cardLinks/cardLink.store.ts'
import { formatCompletionDate } from '../cards/completion.ts'
import { formatCountdown } from '../cards/countdown.ts'
import { getDeadlineVisualState } from '../cards/deadlineColor.ts'
import { useCompletionAnimation } from '../cards/useCompletionAnimation.ts'
import { useFeedbackStore } from '../feedback/feedback.store.ts'
import { useI18nStore } from '../i18n/i18n.store.ts'
import { translations } from '../i18n/translations.ts'
import { ProfileAvatar } from '../profile/ProfileAvatar.tsx'
import { useProfileStore } from '../profile/profile.store.ts'
import { defaultActiveColor } from '../profile/profile.types.ts'
import { useDragTodoBlock } from '../board/useDragTodoBlock.ts'
import { useResizeTodoBlock } from '../board/useResizeTodoBlock.ts'
import { TodoImageView } from './TodoImageView.tsx'
import { useTodoStore } from './todo.store.ts'
import type { TodoBlock as TodoBlockModel, TodoItem } from './todo.types.ts'
import { getTodoBlockStatus } from './todo.utils.ts'
import { useCardStore } from '../cards/card.store.ts'
import { useTodoItemReorder } from './useTodoItemReorder.ts'

type TodoBlockProps = {
  block: TodoBlockModel
  cameraZoom: number
  canConnect: boolean
  canDrag: boolean
  isConnecting: boolean
  isSelected: boolean
  items: TodoItem[]
  linkedCount: number
  now: number
  onMeasure: (id: string, height: number) => void
  onStartConnection: (
    block: TodoBlockModel,
    side: CardLinkSide,
    event: PointerEvent<HTMLButtonElement>,
  ) => void
}

type TodoStyle = CSSProperties & Record<`--${string}`, string | number>
const sides: CardLinkSide[] = ['top', 'right', 'bottom', 'left']

const TodoItemRow = memo(function TodoItemRow({
  index,
  item,
  itemCount,
  onMove,
  onStartReorder,
  reorderStyle,
}: {
  index: number
  item: TodoItem
  itemCount: number
  onMove: (id: string, direction: -1 | 1) => void
  onStartReorder: (id: string, event: PointerEvent<HTMLButtonElement>) => void
  reorderStyle?: CSSProperties
}) {
  const updateItem = useTodoStore((state) => state.updateItem)
  const toggleItemActive = useTodoStore((state) => state.toggleItemActive)
  const openEditItem = useTodoStore((state) => state.openEditItemEditor)
  const deleteItem = useTodoStore((state) => state.deleteItem)
  const userId = useAuthStore((state) => state.user?.id ?? null)
  const confirm = useFeedbackStore((state) => state.confirm)
  const language = useI18nStore((state) => state.language)
  const t = translations[language]
  const activeProfile = useProfileStore((state) => item.activeBy ? state.profiles[item.activeBy] ?? null : null)
  const completedProfile = useProfileStore((state) => item.completedBy ? state.profiles[item.completedBy] ?? null : null)
  const profile = item.isDone ? completedProfile : activeProfile
  const profileName = profile?.nickname ?? t.card.activeOwnerUnknown
  const profileColor = profile?.activeColor ?? defaultActiveColor
  const completedAt = formatCompletionDate(item.completedAt, language)
  const isCompleting = useCompletionAnimation(item.isDone)

  const handleDelete = async () => {
    const confirmed = await confirm({
      confirmLabel: t.todo.deleteItem,
      description: item.title,
      title: t.todo.deleteItem,
      tone: 'danger',
    })
    if (confirmed) void deleteItem(item.id).catch(() => undefined)
  }

  return (
    <div
      className={cn(
        'todo-item-row',
        item.isDone && 'todo-item-row-done',
        item.isActive && 'todo-item-row-active',
        isCompleting && 'todo-item-row-completed',
      )}
      data-todo-item-id={item.id}
      data-todo-reorder-id={item.id}
      style={{ '--todo-owner-color': profileColor, ...reorderStyle } as TodoStyle}
    >
      <button
        aria-label={item.isDone ? t.card.backToWork : t.card.markDone}
        className="todo-item-check"
        data-todo-action="true"
        type="button"
        onClick={() => updateItem(item.id, { isDone: !item.isDone }).catch(() => undefined)}
      >
        {item.isDone ? <Check size={15} strokeWidth={3} /> : null}
      </button>

      <button className="todo-item-copy" data-todo-action="true" type="button" onClick={() => openEditItem(item.id)}>
        <strong>{item.title}</strong>
        {item.description ? <span>{item.description}</span> : null}
        {item.isActive ? (
          <small className="todo-item-owner">
            <ProfileAvatar avatarPath={profile?.avatarPath} color={profileColor} name={profileName} size={18} />
            <Zap fill="currentColor" size={10} />
            {t.todo.activeBy(profileName)}
          </small>
        ) : null}
        {item.isDone ? (
          <small className="todo-item-owner todo-item-completed-owner">
            <ProfileAvatar
              avatarPath={profile?.avatarPath}
              className={cn(isCompleting && 'completion-avatar-pulse')}
              color={profileColor}
              name={profileName}
              size={18}
            />
            {completedAt ? t.todo.completedBy(profileName, completedAt) : t.card.completionUnknown}
          </small>
        ) : null}
      </button>

      {item.imagePath ? <TodoImageView alt={item.title} path={item.imagePath} /> : null}

      <div className="todo-item-actions" data-todo-action="true">
        <button
          aria-label={t.card.activate}
          className="todo-row-action"
          disabled={item.isDone}
          title={t.card.activate}
          type="button"
          onClick={() => toggleItemActive(item.id, userId).catch(() => undefined)}
        ><Zap fill={item.isActive ? 'currentColor' : 'none'} size={14} /></button>
        <button aria-label={t.todo.moveUp} className="todo-row-action" disabled={index === 0} type="button" onClick={() => onMove(item.id, -1)}><ChevronUp size={14} /></button>
        <button aria-label={t.todo.moveDown} className="todo-row-action" disabled={index === itemCount - 1} type="button" onClick={() => onMove(item.id, 1)}><ChevronDown size={14} /></button>
        <button aria-label={t.card.edit} className="todo-row-action" type="button" onClick={() => openEditItem(item.id)}><Pencil size={13} /></button>
        <button aria-label={t.todo.deleteItem} className="todo-row-action todo-row-action-danger" type="button" onClick={() => void handleDelete()}><Trash2 size={13} /></button>
        <button aria-label={t.todo.reorder} className="todo-item-drag" type="button" onPointerDown={(event) => onStartReorder(item.id, event)}><GripVertical size={15} /></button>
      </div>
    </div>
  )
})

function TodoBlockComponent({
  block,
  cameraZoom,
  canConnect,
  canDrag,
  isConnecting,
  isSelected,
  items,
  linkedCount,
  now,
  onMeasure,
  onStartConnection,
}: TodoBlockProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const expanded = useTodoStore((state) => state.expandedBlockIds.includes(block.id))
  const toggleExpanded = useTodoStore((state) => state.toggleBlockExpanded)
  const selectBlocks = useTodoStore((state) => state.selectBlocks)
  const toggleSelection = useTodoStore((state) => state.toggleBlockSelection)
  const selectCard = useCardStore((state) => state.selectCard)
  const openCreateItem = useTodoStore((state) => state.openCreateItemEditor)
  const openEditBlock = useTodoStore((state) => state.openEditBlockEditor)
  const deleteBlocks = useTodoStore((state) => state.deleteBlocks)
  const reorderItems = useTodoStore((state) => state.reorderItems)
  const deleteLinks = useCardLinkStore((state) => state.deleteLinksForTodoBlock)
  const confirm = useFeedbackStore((state) => state.confirm)
  const language = useI18nStore((state) => state.language)
  const t = translations[language]
  const drag = useDragTodoBlock(block, cameraZoom, canDrag)
  const resize = useResizeTodoBlock(block, cameraZoom, canDrag)
  const status = useMemo(() => getTodoBlockStatus(items, block.id), [block.id, items])
  const visibleItems = expanded ? items : items.slice(0, 10)
  const itemIds = useMemo(() => items.map((item) => item.id), [items])
  const commitReorder = useCallback((orderedIds: string[]) => {
    void reorderItems(block.id, orderedIds).catch(() => undefined)
  }, [block.id, reorderItems])
  const { draggedId, getItemStyle, startReorder } = useTodoItemReorder(itemIds, commitReorder)
  const visual = block.deadlineAt
    ? getDeadlineVisualState(block.deadlineAt, status.isDone ? 'done' : 'todo', now, language)
    : {
        backgroundColor: 'rgb(15 33 39 / 0.72)',
        borderColor: '#55d9e8',
        glowColor: 'rgb(85 217 232 / 0.46)',
        textColor: '#8cecf3',
        label: t.todo.noDeadline,
      }
  const countdown = block.deadlineAt ? formatCountdown(block.deadlineAt, status.isDone ? 'done' : 'todo', now, language) : t.todo.noDeadline
  const style: TodoStyle = {
    '--deadline-bg': visual.backgroundColor,
    '--deadline-border': visual.borderColor,
    '--deadline-glow': visual.glowColor,
    '--deadline-text': visual.textColor,
    left: block.x,
    top: block.y,
    width: block.w,
  }

  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    const measure = () => onMeasure(block.id, root.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    return () => observer.disconnect()
  }, [block.id, onMeasure])

  useEffect(() => {
    if (!menuOpen) return undefined
    const close = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setMenuOpen(false)
    }
    window.addEventListener('pointerdown', close, true)
    return () => window.removeEventListener('pointerdown', close, true)
  }, [menuOpen])

  const moveItem = (id: string, direction: -1 | 1) => {
    const index = items.findIndex((item) => item.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= items.length) return
    const ordered = [...items]
    const [moved] = ordered.splice(index, 1)
    ordered.splice(target, 0, moved)
    void reorderItems(block.id, ordered.map((item) => item.id)).catch(() => undefined)
  }

  const handleSelect = (event: MouseEvent<HTMLElement>) => {
    if (rootRef.current?.dataset.todoDragMoved === 'true') return
    if (event.ctrlKey || event.metaKey || event.shiftKey) toggleSelection(block.id)
    else if (!isSelected) {
      selectCard(null)
      selectBlocks([block.id])
    }
  }

  const handleDelete = async () => {
    const selectedIds = useTodoStore.getState().selectedBlockIds
    const ids = isSelected && selectedIds.length > 1 ? selectedIds : [block.id]
    const confirmed = await confirm({
      confirmLabel: t.todo.deleteBlock,
      description: ids.length > 1 ? `${ids.length} To-do` : t.todo.deleteBlockDescription(block.title),
      title: t.todo.deleteBlockTitle,
      tone: 'danger',
    })
    if (confirmed) void deleteBlocks(ids).catch(() => undefined)
  }

  const handleDeleteLinks = async () => {
    if (linkedCount === 0) return
    const confirmed = await confirm({
      confirmLabel: t.link.deleteAll,
      description: t.link.deleteAllDescription(block.title, linkedCount),
      title: t.link.deleteAllTitle,
      tone: 'danger',
    })
    if (confirmed) void deleteLinks(block.id).catch(() => undefined)
  }

  return (
    <article
      className={cn('todo-block absolute', status.isDone && 'todo-block-done', isSelected && 'todo-block-selected')}
      data-board-object="true"
      data-todo-root="true"
      onClick={handleSelect}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        if (!isSelected) {
          selectCard(null)
          selectBlocks([block.id])
        }
        setMenuOpen(true)
      }}
      onPointerDown={drag}
      ref={rootRef}
      style={style}
    >
      <div className="todo-block-header">
        <div className="todo-block-icon"><CheckSquare2 size={19} /></div>
        <div className="min-w-0 flex-1">
          <div className="todo-block-type">{t.todo.block}</div>
          <h3>{block.title}</h3>
        </div>
        <button aria-label={t.card.actions} className="todo-block-menu-button" data-todo-action="true" type="button" onClick={() => setMenuOpen((open) => !open)}><MoreHorizontal size={18} /></button>
      </div>

      <div className="todo-block-meta">
        <span><CalendarClock size={15} />{countdown}</span>
        <strong>{t.todo.progress(status.completed, status.total)}</strong>
      </div>
      <div className="todo-progress"><span style={{ width: `${status.progress * 100}%` }} /></div>

      <div className="todo-items" data-dragging-item={draggedId ?? undefined}>
        {visibleItems.map((item, index) => (
          <TodoItemRow
            index={index}
            item={item}
            itemCount={items.length}
            key={item.id}
            onMove={moveItem}
            onStartReorder={startReorder}
            reorderStyle={getItemStyle(item.id)}
          />
        ))}
        {items.length === 0 ? <div className="todo-empty-state">{t.todo.empty}</div> : null}
      </div>

      <footer className="todo-block-footer">
        <button className="todo-add-item" data-todo-action="true" type="button" onClick={() => openCreateItem(block.id)}><Plus size={16} />{t.todo.addItem}</button>
        {items.length > 10 ? (
          <button className="todo-expand-button" data-todo-action="true" type="button" onClick={() => toggleExpanded(block.id)}>
            {expanded ? t.todo.collapse : t.todo.expand(items.length - 10)}
            <ChevronDown className={cn(expanded && 'rotate-180')} size={15} />
          </button>
        ) : null}
      </footer>

      {menuOpen ? (
        <div className="todo-block-menu" data-todo-action="true" ref={menuRef}>
          <button className="menu-item" type="button" onClick={() => { setMenuOpen(false); openEditBlock(block.id) }}><Pencil size={15} />{t.card.edit}</button>
          {linkedCount > 0 ? <button className="menu-item" type="button" onClick={() => { setMenuOpen(false); void handleDeleteLinks() }}><Unlink size={15} />{t.link.deleteAll}</button> : null}
          <button className="menu-item text-red-200" type="button" onClick={() => { setMenuOpen(false); void handleDelete() }}><Trash2 size={15} />{t.todo.deleteBlock}</button>
        </div>
      ) : null}

      {canDrag ? (
        <>
          <button aria-label={t.todo.resize} className="todo-resize-handle todo-resize-e" data-todo-action="true" type="button" onPointerDown={(event) => resize('e', event)} />
          <button aria-label={t.todo.resize} className="todo-resize-handle todo-resize-w" data-todo-action="true" type="button" onPointerDown={(event) => resize('w', event)} />
        </>
      ) : null}

      {canConnect ? sides.map((side) => (
        <button
          aria-label={t.card.createConnection(side)}
          className={cn('card-link-handle', `card-link-handle-${side}`)}
          data-card-action="true"
          data-card-link-handle="true"
          data-link-node-id={block.id}
          data-link-node-kind="todo"
          data-card-side={side}
          data-visible={isConnecting ? 'true' : 'false'}
          key={side}
          type="button"
          onPointerDown={(event) => onStartConnection(block, side, event)}
        />
      )) : null}
    </article>
  )
}

export const TodoBlock = memo(TodoBlockComponent)
