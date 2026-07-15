import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { useCardStore } from '../cards/card.store.ts'
import { useTodoStore } from '../todos/todo.store.ts'
import type { TodoBlock, TodoBlockGeometry } from '../todos/todo.types.ts'

type ResizeState = {
  frameId: number | null
  latest: TodoBlockGeometry[]
  pending: TodoBlockGeometry[]
  starts: TodoBlockGeometry[]
  remove: () => void
}

const clamp = (value: number) => Math.min(Math.max(value, 320), 1600)

export function useResizeTodoBlock(block: TodoBlock, cameraZoom: number, enabled: boolean) {
  const ref = useRef<ResizeState | null>(null)
  useEffect(() => () => ref.current?.remove(), [])

  return useCallback((side: 'e' | 'w', event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!enabled || event.button !== 0 || event.pointerType === 'touch') return
    event.preventDefault()
    event.stopPropagation()
    const state = useTodoStore.getState()
    const selected = new Set(state.selectedBlockIds)
    const blocks = selected.has(block.id) && selected.size > 1
      ? state.blocks.filter((candidate) => selected.has(candidate.id))
      : [block]
    if (blocks.length === 1) state.selectBlocks([block.id])
    useCardStore.getState().setGeometryInteracting(true)
    const starts = blocks.map((candidate) => ({ id: candidate.id, x: candidate.x, y: candidate.y, w: candidate.w }))
    const startX = event.clientX

    const flush = () => {
      const current = ref.current
      if (!current) return
      current.frameId = null
      current.latest = current.pending
      useTodoStore.getState().resizeBlocksLocal(current.pending)
    }

    const move = (moveEvent: PointerEvent) => {
      const current = ref.current
      if (!current) return
      const delta = (moveEvent.clientX - startX) / cameraZoom
      current.pending = current.starts.map((start) => {
        const width = clamp(side === 'e' ? start.w + delta : start.w - delta)
        return { ...start, w: width, x: side === 'w' ? start.x + start.w - width : start.x }
      })
      if (current.frameId === null) current.frameId = requestAnimationFrame(flush)
    }

    const up = () => {
      const current = ref.current
      remove()
      if (!current) return
      void useTodoStore.getState().persistBlockGeometries(current.latest).catch(() => {
        useTodoStore.getState().resizeBlocksLocal(current.starts)
      })
    }

    function remove() {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      if (ref.current?.frameId !== null && ref.current?.frameId !== undefined) {
        cancelAnimationFrame(ref.current.frameId)
        ref.current.latest = ref.current.pending
        useTodoStore.getState().resizeBlocksLocal(ref.current.latest)
      }
      ref.current = null
      useCardStore.getState().setGeometryInteracting(false)
    }

    ref.current = { frameId: null, latest: starts, pending: starts, remove, starts }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }, [block, cameraZoom, enabled])
}

