import { CalendarClock, Check, CheckSquare2, ChevronDown, ChevronUp, GripVertical, MoreHorizontal, Plus, Trash2, Zap } from 'lucide-react'
import { memo, useMemo, useState, type CSSProperties, type PointerEvent } from 'react'
import { cn } from '../../lib/cn.ts'
import { useAuthStore } from '../auth/auth.store.ts'
import { formatCompletionDate } from '../cards/completion.ts'
import { formatCountdown } from '../cards/countdown.ts'
import { getDeadlineVisualState } from '../cards/deadlineColor.ts'
import { useFeedbackStore } from '../feedback/feedback.store.ts'
import { useI18nStore } from '../i18n/i18n.store.ts'
import { translations } from '../i18n/translations.ts'
import { ProfileAvatar } from '../profile/ProfileAvatar.tsx'
import { useProfileStore } from '../profile/profile.store.ts'
import { defaultActiveColor } from '../profile/profile.types.ts'
import { TodoImageView } from './TodoImageView.tsx'
import { useTodoStore } from './todo.store.ts'
import type { TodoBlock, TodoItem } from './todo.types.ts'
import { getTodoBlockStatus } from './todo.utils.ts'

type TodoListBlockProps = {
  block: TodoBlock
  items: TodoItem[]
  now: number
}

type Style = CSSProperties & Record<`--${string}`, string | number>

const TodoListItem = memo(function TodoListItem({ item, index, count, onMove, onStartReorder }: {
  item: TodoItem
  index: number
  count: number
  onMove: (id: string, direction: -1 | 1) => void
  onStartReorder: (item: TodoItem, event: PointerEvent<HTMLButtonElement>) => void
}) {
  const updateItem = useTodoStore((state) => state.updateItem)
  const toggleActive = useTodoStore((state) => state.toggleItemActive)
  const editItem = useTodoStore((state) => state.openEditItemEditor)
  const userId = useAuthStore((state) => state.user?.id ?? null)
  const language = useI18nStore((state) => state.language)
  const t = translations[language]
  const ownerId = item.isDone ? item.completedBy : item.activeBy
  const profile = useProfileStore((state) => ownerId ? state.profiles[ownerId] ?? null : null)
  const name = profile?.nickname ?? t.card.activeOwnerUnknown
  const color = profile?.activeColor ?? defaultActiveColor
  const date = formatCompletionDate(item.completedAt, language)

  return (
    <div className={cn('todo-list-item', item.isDone && 'todo-list-item-done', item.isActive && 'todo-list-item-active')} data-todo-list-item-id={item.id} style={{ '--todo-owner-color': color } as Style}>
      <button className="todo-item-check" type="button" onClick={() => updateItem(item.id, { isDone: !item.isDone }).catch(() => undefined)}>{item.isDone ? <Check size={15} strokeWidth={3} /> : null}</button>
      <button className="todo-list-item-copy" type="button" onClick={() => editItem(item.id)}>
        <strong>{item.title}</strong>
        {item.description ? <span>{item.description}</span> : null}
        {item.isActive || item.isDone ? (
          <small><ProfileAvatar avatarPath={profile?.avatarPath} color={color} name={name} size={18} />{item.isDone ? (date ? t.todo.completedBy(name, date) : t.card.completionUnknown) : t.todo.activeBy(name)}</small>
        ) : null}
      </button>
      {item.imagePath ? <TodoImageView alt={item.title} path={item.imagePath} /> : null}
      <div className="todo-list-item-actions">
        <button aria-label={t.card.activate} className="todo-row-action" disabled={item.isDone} type="button" onClick={() => toggleActive(item.id, userId).catch(() => undefined)}><Zap fill={item.isActive ? 'currentColor' : 'none'} size={15} /></button>
        <button aria-label={t.todo.moveUp} className="todo-row-action" disabled={index === 0} type="button" onClick={() => onMove(item.id, -1)}><ChevronUp size={15} /></button>
        <button aria-label={t.todo.moveDown} className="todo-row-action" disabled={index === count - 1} type="button" onClick={() => onMove(item.id, 1)}><ChevronDown size={15} /></button>
        <button aria-label={t.todo.reorder} className="todo-item-drag" type="button" onPointerDown={(event) => onStartReorder(item, event)}><GripVertical size={16} /></button>
      </div>
    </div>
  )
})

function TodoListBlockComponent({ block, items, now }: TodoListBlockProps) {
  const expanded = useTodoStore((state) => state.expandedBlockIds.includes(block.id))
  const toggleExpanded = useTodoStore((state) => state.toggleBlockExpanded)
  const editBlock = useTodoStore((state) => state.openEditBlockEditor)
  const addItem = useTodoStore((state) => state.openCreateItemEditor)
  const deleteBlocks = useTodoStore((state) => state.deleteBlocks)
  const reorder = useTodoStore((state) => state.reorderItems)
  const confirm = useFeedbackStore((state) => state.confirm)
  const language = useI18nStore((state) => state.language)
  const t = translations[language]
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const status = useMemo(() => getTodoBlockStatus(items, block.id), [block.id, items])
  const visible = expanded ? items : items.slice(0, 10)
  const visual = block.deadlineAt
    ? getDeadlineVisualState(block.deadlineAt, status.isDone ? 'done' : 'todo', now, language)
    : { backgroundColor: 'rgb(15 33 39 / .72)', borderColor: '#55d9e8', glowColor: 'rgb(85 217 232 / .4)', textColor: '#8cecf3' }
  const style: Style = {
    '--deadline-bg': visual.backgroundColor,
    '--deadline-border': visual.borderColor,
    '--deadline-glow': visual.glowColor,
    '--deadline-text': visual.textColor,
  }

  const move = (id: string, direction: -1 | 1) => {
    const from = items.findIndex((item) => item.id === id)
    const to = from + direction
    if (from < 0 || to < 0 || to >= items.length) return
    const ordered = [...items]
    const [item] = ordered.splice(from, 1)
    ordered.splice(to, 0, item)
    void reorder(block.id, ordered.map((candidate) => candidate.id)).catch(() => undefined)
  }

  const startReorder = (item: TodoItem, event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    let targetId = item.id
    let started = event.pointerType !== 'touch'
    let timer = started ? null : window.setTimeout(() => { started = true; setDraggedId(item.id) }, 280)
    if (started) setDraggedId(item.id)
    const movePointer = (pointer: globalThis.PointerEvent) => {
      if (!started) {
        if (Math.hypot(pointer.clientX - event.clientX, pointer.clientY - event.clientY) > 8 && timer !== null) { clearTimeout(timer); timer = null }
        return
      }
      const row = document.elementFromPoint(pointer.clientX, pointer.clientY)?.closest<HTMLElement>('[data-todo-list-item-id]')
      if (row?.dataset.todoListItemId) targetId = row.dataset.todoListItemId
    }
    const up = () => {
      if (timer !== null) clearTimeout(timer)
      window.removeEventListener('pointermove', movePointer)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      setDraggedId(null)
      if (!started || targetId === item.id) return
      const from = items.findIndex((candidate) => candidate.id === item.id)
      const to = items.findIndex((candidate) => candidate.id === targetId)
      if (from < 0 || to < 0) return
      const ordered = [...items]
      const [moved] = ordered.splice(from, 1)
      ordered.splice(to, 0, moved)
      void reorder(block.id, ordered.map((candidate) => candidate.id)).catch(() => undefined)
    }
    window.addEventListener('pointermove', movePointer)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const handleDelete = async () => {
    const confirmed = await confirm({ confirmLabel: t.todo.deleteBlock, description: t.todo.deleteBlockDescription(block.title), title: t.todo.deleteBlockTitle, tone: 'danger' })
    if (confirmed) void deleteBlocks([block.id]).catch(() => undefined)
  }

  return (
    <article className={cn('todo-list-block', status.isDone && 'todo-list-block-done')} style={style}>
      <header className="todo-list-header">
        <span className="todo-block-icon"><CheckSquare2 size={19} /></span>
        <div><small>{t.todo.block}</small><h3>{block.title}</h3></div>
        <button aria-label={t.card.edit} className="icon-button" type="button" onClick={() => editBlock(block.id)}><MoreHorizontal size={18} /></button>
      </header>
      <div className="todo-list-meta">
        <span><CalendarClock size={15} />{block.deadlineAt ? formatCountdown(block.deadlineAt, status.isDone ? 'done' : 'todo', now, language) : t.todo.noDeadline}</span>
        <strong>{t.todo.progress(status.completed, status.total)}</strong>
      </div>
      <div className="todo-progress"><span style={{ width: `${status.progress * 100}%` }} /></div>
      <div className="todo-list-items" data-dragging-item={draggedId ?? undefined}>
        {visible.map((item, index) => <TodoListItem count={items.length} index={index} item={item} key={item.id} onMove={move} onStartReorder={startReorder} />)}
        {items.length === 0 ? <div className="todo-empty-state">{t.todo.empty}</div> : null}
      </div>
      <footer className="todo-list-footer">
        <button className="todo-add-item" type="button" onClick={() => addItem(block.id)}><Plus size={16} />{t.todo.addItem}</button>
        {items.length > 10 ? <button className="todo-expand-button" type="button" onClick={() => toggleExpanded(block.id)}>{expanded ? t.todo.collapse : t.todo.expand(items.length - 10)}<ChevronDown className={cn(expanded && 'rotate-180')} size={15} /></button> : null}
        <button aria-label={t.todo.deleteBlock} className="todo-delete-block" type="button" onClick={() => void handleDelete()}><Trash2 size={15} /></button>
      </footer>
    </article>
  )
}

export const TodoListBlock = memo(TodoListBlockComponent)
