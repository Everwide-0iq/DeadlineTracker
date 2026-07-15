import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { useBoardTextStore } from '../boardTexts/boardText.store.ts'
import { useCardLinkStore } from '../cardLinks/cardLink.store.ts'
import { useCardStore } from '../cards/card.store.ts'
import { useTodoStore } from '../todos/todo.store.ts'
import type { TodoBlockPosition, TodoBlock } from '../todos/todo.types.ts'

type DragState = {
  frameId: number | null
  moved: boolean
  pending: TodoBlockPosition[]
  latest: TodoBlockPosition[]
  starts: TodoBlockPosition[]
  remove: () => void
}

export function useDragTodoBlock(block: TodoBlock, cameraZoom: number, enabled: boolean) {
  const ref = useRef<DragState | null>(null)
  useEffect(() => () => ref.current?.remove(), [])

  return useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!enabled || event.button !== 0) return
    const target = event.target
    if (target instanceof Element && target.closest('[data-todo-action="true"]')) return

    event.preventDefault()
    event.stopPropagation()
    const element = event.currentTarget
    const startClientX = event.clientX
    const startClientY = event.clientY
    const state = useTodoStore.getState()
    const selected = new Set(state.selectedBlockIds)
    const dragSelection = selected.has(block.id) && selected.size > 1

    if (!dragSelection && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      state.selectBlocks([block.id])
      useCardStore.getState().selectCard(null)
    }
    useBoardTextStore.getState().selectText(null)
    useCardLinkStore.getState().selectLink(null)
    useCardStore.getState().setGeometryInteracting(true)

    const blocks = dragSelection ? state.blocks.filter((candidate) => selected.has(candidate.id)) : [block]
    const starts = blocks.map((candidate) => ({ id: candidate.id, x: candidate.x, y: candidate.y }))

    const flush = () => {
      const current = ref.current
      if (!current) return
      current.frameId = null
      current.latest = current.pending
      useTodoStore.getState().moveBlocksLocal(current.pending)
    }

    const move = (moveEvent: PointerEvent) => {
      const current = ref.current
      if (!current) return
      const dx = (moveEvent.clientX - startClientX) / cameraZoom
      const dy = (moveEvent.clientY - startClientY) / cameraZoom
      if (!current.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return
      current.moved = true
      element.dataset.todoDragMoved = 'true'
      current.pending = current.starts.map((start) => ({ id: start.id, x: start.x + dx, y: start.y + dy }))
      if (current.frameId === null) current.frameId = requestAnimationFrame(flush)
    }

    const up = () => {
      const current = ref.current
      remove()
      if (!current?.moved) return
      void useTodoStore.getState().persistBlockPositions(current.latest).catch(() => {
        useTodoStore.getState().moveBlocksLocal(current.starts)
      })
    }

    function remove() {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      if (ref.current?.frameId !== null && ref.current?.frameId !== undefined) {
        cancelAnimationFrame(ref.current.frameId)
        ref.current.latest = ref.current.pending
        useTodoStore.getState().moveBlocksLocal(ref.current.latest)
      }
      ref.current = null
      useCardStore.getState().setGeometryInteracting(false)
      setTimeout(() => delete element.dataset.todoDragMoved, 0)
    }

    ref.current = { frameId: null, latest: starts, moved: false, pending: starts, remove, starts }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }, [block, cameraZoom, enabled])
}

