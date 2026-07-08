import { GripVertical, Pencil, Trash2 } from 'lucide-react'
import { memo, useEffect, useRef, type CSSProperties, type PointerEvent } from 'react'
import { useCardLinkStore } from '../cardLinks/cardLink.store.ts'
import { useCardStore } from '../cards/card.store.ts'
import { useFeedbackStore } from '../feedback/feedback.store.ts'
import { useI18nStore } from '../i18n/i18n.store.ts'
import { translations } from '../i18n/translations.ts'
import type { BoardCamera } from '../board/useBoardCamera.ts'
import { useBoardTextStore } from './boardText.store.ts'
import type { BoardText, BoardTextFontFamily } from './boardText.types.ts'

type BoardTextItemProps = {
  camera: BoardCamera
  isSelected: boolean
  text: BoardText
}

type TextStyle = CSSProperties & Record<`--${string}`, string | number>
type DragState = {
  frameId: number | null
  latestX: number
  latestY: number
  pendingX: number
  pendingY: number
  removeListeners: () => void
}
type ResizeState = {
  frameId: number | null
  latestW: number
  pendingW: number
  removeListeners: () => void
}

const maxTextWidth = 1400
const minTextWidth = 140

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const fontFamilies: Record<BoardTextFontFamily, string> = {
  display: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  serif: 'Georgia, Cambria, "Times New Roman", Times, serif',
  system: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

function BoardTextItemComponent({ camera, isSelected, text }: BoardTextItemProps) {
  const dragRef = useRef<DragState | null>(null)
  const resizeRef = useRef<ResizeState | null>(null)
  const openEditEditor = useBoardTextStore((state) => state.openEditEditor)
  const deleteText = useBoardTextStore((state) => state.deleteText)
  const selectText = useBoardTextStore((state) => state.selectText)
  const selectCard = useCardStore((state) => state.selectCard)
  const selectLink = useCardLinkStore((state) => state.selectLink)
  const confirm = useFeedbackStore((state) => state.confirm)
  const language = useI18nStore((state) => state.language)
  const t = translations[language]

  useEffect(
    () => () => {
      dragRef.current?.removeListeners()
      resizeRef.current?.removeListeners()
    },
    [],
  )

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return
    }

    const target = event.target

    if (target instanceof Element && target.closest('[data-board-text-action="true"]')) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    selectCard(null)
    selectLink(null)
    selectText(text.id)

    const startClientX = event.clientX
    const startClientY = event.clientY
    const startX = text.x
    const startY = text.y

    const flushMove = () => {
      const dragState = dragRef.current

      if (!dragState) {
        return
      }

      dragState.frameId = null
      dragState.latestX = dragState.pendingX
      dragState.latestY = dragState.pendingY
      useBoardTextStore.getState().moveTextLocal(text.id, dragState.pendingX, dragState.pendingY)
    }

    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      const dragState = dragRef.current

      if (!dragState) {
        return
      }

      dragState.pendingX = startX + (moveEvent.clientX - startClientX) / camera.zoom
      dragState.pendingY = startY + (moveEvent.clientY - startClientY) / camera.zoom

      if (dragState.frameId === null) {
        dragState.frameId = window.requestAnimationFrame(flushMove)
      }
    }

    const handleUp = () => {
      const dragState = dragRef.current
      removeListeners()

      if (!dragState) {
        return
      }

      void useBoardTextStore
        .getState()
        .persistTextPosition(text.id, dragState.latestX, dragState.latestY)
        .catch(() => undefined)
    }

    function removeListeners() {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)

      if (dragRef.current?.frameId !== null && dragRef.current?.frameId !== undefined) {
        window.cancelAnimationFrame(dragRef.current.frameId)
        dragRef.current.latestX = dragRef.current.pendingX
        dragRef.current.latestY = dragRef.current.pendingY
        useBoardTextStore.getState().moveTextLocal(text.id, dragRef.current.latestX, dragRef.current.latestY)
      }

      dragRef.current = null
    }

    dragRef.current = {
      frameId: null,
      latestX: text.x,
      latestY: text.y,
      pendingX: text.x,
      pendingY: text.y,
      removeListeners,
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
  }

  const handleDelete = async () => {
    const confirmed = await confirm({
      confirmLabel: t.boardText.delete,
      description: t.boardText.deleteDescription(text.content),
      title: t.boardText.deleteTitle,
      tone: 'danger',
    })

    if (!confirmed) {
      return
    }

    await deleteText(text.id).catch(() => undefined)
  }

  const handleResizePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    selectCard(null)
    selectLink(null)
    selectText(text.id)

    const startClientX = event.clientX
    const startW = text.w

    const flushResize = () => {
      const resizeState = resizeRef.current

      if (!resizeState) {
        return
      }

      resizeState.frameId = null
      resizeState.latestW = resizeState.pendingW
      useBoardTextStore.getState().resizeTextLocal(text.id, resizeState.pendingW)
    }

    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      const resizeState = resizeRef.current

      if (!resizeState) {
        return
      }

      resizeState.pendingW = clamp(startW + (moveEvent.clientX - startClientX) / camera.zoom, minTextWidth, maxTextWidth)

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

      void useBoardTextStore
        .getState()
        .persistTextWidth(text.id, resizeState.latestW)
        .catch(() => undefined)
    }

    function removeListeners() {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)

      if (resizeRef.current?.frameId !== null && resizeRef.current?.frameId !== undefined) {
        window.cancelAnimationFrame(resizeRef.current.frameId)
        resizeRef.current.latestW = resizeRef.current.pendingW
        useBoardTextStore.getState().resizeTextLocal(text.id, resizeRef.current.latestW)
      }

      resizeRef.current = null
    }

    resizeRef.current = {
      frameId: null,
      latestW: text.w,
      pendingW: text.w,
      removeListeners,
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
  }

  const style: TextStyle = {
    '--board-text-color': text.color,
    color: text.color,
    fontFamily: fontFamilies[text.fontFamily],
    fontSize: text.fontSize,
    left: text.x,
    top: text.y,
    width: text.w,
  }

  return (
    <article
      aria-label={t.boardText.label}
      className="board-text-item group absolute z-[11] select-none"
      data-selected={isSelected ? 'true' : 'false'}
      data-text-root="true"
      onClick={() => {
        selectCard(null)
        selectLink(null)
        selectText(text.id)
      }}
      onDoubleClick={() => openEditEditor(text.id)}
      onPointerDown={handlePointerDown}
      style={style}
    >
      <p>{text.content}</p>
      <button
        aria-label={t.boardText.resize}
        className="board-text-resize-handle"
        data-board-text-action="true"
        type="button"
        onPointerDown={handleResizePointerDown}
      >
        <GripVertical size={15} />
      </button>
      <div className="board-text-actions" data-board-text-action="true">
        <button
          aria-label={t.boardText.edit}
          className="icon-button h-8 w-8 rounded-lg"
          type="button"
          onClick={() => openEditEditor(text.id)}
        >
          <Pencil size={14} />
        </button>
        <button
          aria-label={t.boardText.delete}
          className="icon-button h-8 w-8 rounded-lg"
          type="button"
          onClick={handleDelete}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </article>
  )
}

export const BoardTextItem = memo(BoardTextItemComponent)
