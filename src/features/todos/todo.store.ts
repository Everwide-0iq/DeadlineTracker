import { create } from 'zustand'
import { useAuthStore } from '../auth/auth.store.ts'
import { getCurrentTranslation } from '../i18n/i18n.store.ts'
import {
  createTodoBlock as createTodoBlockApi,
  createTodoItem as createTodoItemApi,
  deleteTodoBlocks as deleteTodoBlocksApi,
  deleteTodoItem as deleteTodoItemApi,
  fetchTodoData,
  reorderTodoItems as reorderTodoItemsApi,
  subscribeToTodoChanges,
  updateTodoBlock as updateTodoBlockApi,
  updateTodoBlockGeometries as updateTodoBlockGeometriesApi,
  updateTodoBlockPositions as updateTodoBlockPositionsApi,
  updateTodoItem as updateTodoItemApi,
} from './todo.api.ts'
import { cleanupPendingTodoImages } from './todoImage.api.ts'
import type {
  CreateTodoBlockInput,
  CreateTodoItemInput,
  TodoBlock,
  TodoBlockEditorState,
  TodoBlockGeometry,
  TodoBlockPosition,
  TodoItem,
  TodoItemEditorState,
  UpdateTodoBlockInput,
  UpdateTodoItemInput,
} from './todo.types.ts'

type TodoState = {
  blocks: TodoBlock[]
  items: TodoItem[]
  blockEditor: TodoBlockEditorState | null
  itemEditor: TodoItemEditorState | null
  error: string | null
  isLoading: boolean
  saveError: string | null
  selectedBlockIds: string[]
  expandedBlockIds: string[]
  clearSaveError: () => void
  closeBlockEditor: () => void
  closeItemEditor: () => void
  createBlock: (input: CreateTodoBlockInput, userId: string | null) => Promise<TodoBlock>
  createItem: (input: CreateTodoItemInput, userId: string | null) => Promise<TodoItem>
  deleteBlocks: (ids: string[]) => Promise<void>
  deleteItem: (id: string) => Promise<void>
  loadTodos: () => Promise<void>
  moveBlocksLocal: (positions: TodoBlockPosition[]) => void
  openCreateBlockEditor: (
    x: number,
    y: number,
    boardScope: CreateTodoBlockInput['boardScope'],
    projectId: string | null,
  ) => void
  openCreateItemEditor: (blockId: string) => void
  openEditBlockEditor: (blockId: string) => void
  openEditItemEditor: (itemId: string) => void
  persistBlockGeometries: (updates: TodoBlockGeometry[]) => Promise<void>
  persistBlockPositions: (positions: TodoBlockPosition[]) => Promise<void>
  reorderItems: (blockId: string, orderedIds: string[]) => Promise<void>
  resizeBlocksLocal: (updates: TodoBlockGeometry[]) => void
  selectBlocks: (ids: string[]) => void
  subscribeRealtime: () => () => void
  toggleBlockExpanded: (id: string) => void
  toggleBlockSelection: (id: string) => void
  toggleItemActive: (id: string, userId: string | null) => Promise<void>
  updateBlock: (id: string, input: UpdateTodoBlockInput) => Promise<void>
  updateItem: (id: string, input: UpdateTodoItemInput) => Promise<void>
}

const uniqueIds = (ids: string[]) => Array.from(new Set(ids))

const upsertBlock = (blocks: TodoBlock[], block: TodoBlock) => {
  const index = blocks.findIndex((item) => item.id === block.id)
  if (index < 0) return [...blocks, block]
  const next = [...blocks]
  next[index] = block
  return next
}

const upsertItem = (items: TodoItem[], item: TodoItem) => {
  const index = items.findIndex((candidate) => candidate.id === item.id)
  if (index < 0) return [...items, item]
  const next = [...items]
  next[index] = item
  return next
}

const restoreMissingBlocks = (blocks: TodoBlock[], removedBlocks: TodoBlock[]) =>
  removedBlocks.reduce(
    (current, block) =>
      current.some((item) => item.id === block.id) ? current : upsertBlock(current, block),
    blocks,
  )

const restoreMissingItems = (items: TodoItem[], removedItems: TodoItem[]) =>
  removedItems.reduce(
    (current, item) =>
      current.some((candidate) => candidate.id === item.id) ? current : upsertItem(current, item),
    items,
  )

const getMessage = (error: unknown) => {
  const t = getCurrentTranslation()

  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>
    const message = typeof record.message === 'string' ? record.message : null
    if (message?.includes("Could not find the table 'public.todo_")) return t.errors.todosMissingTable
    if (message?.includes('completed_by')) return t.errors.todosMissingCompletionOwner
    if (message) return message
  }

  return t.errors.todosGeneric
}

export function applyOptimisticItemPatch(
  item: TodoItem,
  input: UpdateTodoItemInput,
  actorId: string | null = null,
): TodoItem {
  const updatedAt = new Date().toISOString()
  const next = { ...item, ...input, updatedAt }

  if (input.isDone === true) {
    next.isDone = true
    next.isActive = false
    next.activeBy = null
    next.completedAt = item.isDone ? item.completedAt : updatedAt
    next.completedBy = item.isDone ? item.completedBy : actorId
  } else if (input.isDone === false && item.isDone) {
    next.completedAt = null
    next.completedBy = null
  }

  if (input.isActive === false) next.activeBy = null
  if (next.isDone) {
    next.isActive = false
    next.activeBy = null
  }

  return next
}

export const useTodoStore = create<TodoState>((set, get) => ({
  blocks: [],
  items: [],
  blockEditor: null,
  itemEditor: null,
  error: null,
  isLoading: false,
  saveError: null,
  selectedBlockIds: [],
  expandedBlockIds: [],
  clearSaveError: () => set({ saveError: null }),
  closeBlockEditor: () => set({ blockEditor: null }),
  closeItemEditor: () => set({ itemEditor: null }),
  createBlock: async (input, userId) => {
    set({ saveError: null })
    try {
      const block = await createTodoBlockApi(input, userId)
      set((state) => ({
        blocks: upsertBlock(state.blocks, block),
        blockEditor: null,
        selectedBlockIds: [block.id],
      }))
      return block
    } catch (error) {
      set({ saveError: getMessage(error) })
      throw error
    }
  },
  createItem: async (input, userId) => {
    set({ saveError: null })
    try {
      const item = await createTodoItemApi(input, userId)
      set((state) => ({ items: upsertItem(state.items, item), itemEditor: null }))
      return item
    } catch (error) {
      set({ saveError: getMessage(error) })
      throw error
    }
  },
  deleteBlocks: async (ids) => {
    const deleteIds = uniqueIds(ids)
    if (deleteIds.length === 0) return
    const deleteSet = new Set(deleteIds)
    const previousState = get()
    const deletedBlocks = previousState.blocks.filter((block) => deleteSet.has(block.id))
    const deletedItems = previousState.items.filter((item) => deleteSet.has(item.blockId))
    const previouslySelectedIds = previousState.selectedBlockIds.filter((id) => deleteSet.has(id))
    set((state) => ({
      blocks: state.blocks.filter((block) => !deleteSet.has(block.id)),
      items: state.items.filter((item) => !deleteSet.has(item.blockId)),
      selectedBlockIds: state.selectedBlockIds.filter((id) => !deleteSet.has(id)),
      saveError: null,
    }))
    try {
      await deleteTodoBlocksApi(deleteIds)
      void cleanupPendingTodoImages().catch(() => undefined)
    } catch (error) {
      set((state) => ({
        blocks: restoreMissingBlocks(state.blocks, deletedBlocks),
        items: restoreMissingItems(state.items, deletedItems),
        saveError: getMessage(error),
        selectedBlockIds: uniqueIds([...state.selectedBlockIds, ...previouslySelectedIds]),
      }))
      throw error
    }
  },
  deleteItem: async (id) => {
    const previous = get().items.find((item) => item.id === id)
    if (!previous) return
    set((state) => ({ items: state.items.filter((item) => item.id !== id), saveError: null }))
    try {
      await deleteTodoItemApi(id)
      void cleanupPendingTodoImages().catch(() => undefined)
    } catch (error) {
      set((state) => ({
        items: restoreMissingItems(state.items, [previous]),
        saveError: getMessage(error),
      }))
      throw error
    }
  },
  loadTodos: async () => {
    set({ error: null, isLoading: true })
    try {
      const data = await fetchTodoData()
      set({ ...data, error: null, isLoading: false })
    } catch (error) {
      set({ error: getMessage(error), isLoading: false })
    }
  },
  moveBlocksLocal: (positions) => {
    const byId = new Map(positions.map((position) => [position.id, position]))
    set((state) => ({
      blocks: state.blocks.map((block) => {
        const position = byId.get(block.id)
        return position ? { ...block, x: position.x, y: position.y } : block
      }),
    }))
  },
  openCreateBlockEditor: (initialX, initialY, boardScope, projectId) =>
    set({ blockEditor: { mode: 'create', initialX, initialY, boardScope, projectId } }),
  openCreateItemEditor: (blockId) => set({ itemEditor: { mode: 'create', blockId } }),
  openEditBlockEditor: (blockId) => set({ blockEditor: { mode: 'edit', blockId }, selectedBlockIds: [blockId] }),
  openEditItemEditor: (itemId) => set({ itemEditor: { mode: 'edit', itemId } }),
  persistBlockGeometries: async (updates) => {
    set({ saveError: null })
    try {
      const blocks = await updateTodoBlockGeometriesApi(updates)
      set((state) => ({ blocks: blocks.reduce(upsertBlock, state.blocks) }))
    } catch (error) {
      set({ saveError: getMessage(error) })
      throw error
    }
  },
  persistBlockPositions: async (positions) => {
    set({ saveError: null })
    try {
      const blocks = await updateTodoBlockPositionsApi(positions)
      set((state) => ({ blocks: blocks.reduce(upsertBlock, state.blocks) }))
    } catch (error) {
      set({ saveError: getMessage(error) })
      throw error
    }
  },
  reorderItems: async (blockId, orderedIds) => {
    const previousSortOrder = new Map(
      get().items
        .filter((item) => item.blockId === blockId)
        .map((item) => [item.id, item.sortOrder]),
    )
    const order = new Map(orderedIds.map((id, index) => [id, (index + 1) * 1000]))
    set((state) => ({
      items: state.items.map((item) => {
        const sortOrder = item.blockId === blockId ? order.get(item.id) : undefined
        return sortOrder ? { ...item, sortOrder } : item
      }),
      saveError: null,
    }))
    try {
      const items = await reorderTodoItemsApi(blockId, orderedIds)
      set((state) => ({ items: items.reduce(upsertItem, state.items) }))
    } catch (error) {
      set((state) => ({
        items: state.items.map((item) => {
          const attemptedSortOrder = order.get(item.id)
          const previous = previousSortOrder.get(item.id)

          return item.blockId === blockId &&
            attemptedSortOrder !== undefined &&
            previous !== undefined &&
            item.sortOrder === attemptedSortOrder
            ? { ...item, sortOrder: previous }
            : item
        }),
        saveError: getMessage(error),
      }))
      throw error
    }
  },
  resizeBlocksLocal: (updates) => {
    const byId = new Map(updates.map((update) => [update.id, update]))
    set((state) => ({
      blocks: state.blocks.map((block) => {
        const geometry = byId.get(block.id)
        return geometry ? { ...block, ...geometry } : block
      }),
    }))
  },
  selectBlocks: (ids) => set({ selectedBlockIds: uniqueIds(ids) }),
  subscribeRealtime: () =>
    subscribeToTodoChanges(
      (event) => {
        if (event.type === 'DELETE') {
          set((state) => ({
            blocks: state.blocks.filter((block) => block.id !== event.id),
            items: state.items.filter((item) => item.blockId !== event.id),
            selectedBlockIds: state.selectedBlockIds.filter((id) => id !== event.id),
          }))
          return
        }
        set((state) => ({ blocks: upsertBlock(state.blocks, event.block) }))
      },
      (event) => {
        if (event.type === 'DELETE') {
          set((state) => ({ items: state.items.filter((item) => item.id !== event.id) }))
          return
        }
        set((state) => ({ items: upsertItem(state.items, event.item) }))
      },
    ),
  toggleBlockExpanded: (id) =>
    set((state) => ({
      expandedBlockIds: state.expandedBlockIds.includes(id)
        ? state.expandedBlockIds.filter((blockId) => blockId !== id)
        : [...state.expandedBlockIds, id],
    })),
  toggleBlockSelection: (id) =>
    set((state) => ({
      selectedBlockIds: state.selectedBlockIds.includes(id)
        ? state.selectedBlockIds.filter((blockId) => blockId !== id)
        : [...state.selectedBlockIds, id],
    })),
  toggleItemActive: async (id, userId) => {
    const item = get().items.find((candidate) => candidate.id === id)
    if (!item || item.isDone || !userId) return
    const owned = item.isActive && item.activeBy === userId
    await get().updateItem(id, { isActive: !owned, activeBy: owned ? null : userId })
  },
  updateBlock: async (id, input) => {
    const previous = get().blocks.find((block) => block.id === id)
    if (!previous) return
    const optimistic = { ...previous, ...input, updatedAt: new Date().toISOString() }
    set((state) => ({
      blocks: state.blocks.map((block) => block.id === id ? optimistic : block),
      saveError: null,
    }))
    try {
      const block = await updateTodoBlockApi(id, input)
      set((state) => ({ blocks: upsertBlock(state.blocks, block), blockEditor: null }))
    } catch (error) {
      set((state) => {
        const current = state.blocks.find((block) => block.id === id)
        return {
          blocks: current?.updatedAt === optimistic.updatedAt
            ? upsertBlock(state.blocks, previous)
            : state.blocks,
          saveError: getMessage(error),
        }
      })
      throw error
    }
  },
  updateItem: async (id, input) => {
    const previous = get().items.find((item) => item.id === id)
    if (!previous) return
    const actorId = useAuthStore.getState().user?.id ?? null
    const optimistic = applyOptimisticItemPatch(previous, input, actorId)
    set((state) => ({
      items: state.items.map((item) => item.id === id ? optimistic : item),
      saveError: null,
    }))
    try {
      const item = await updateTodoItemApi(id, input)
      set((state) => ({ items: upsertItem(state.items, item), itemEditor: null }))
    } catch (error) {
      set((state) => {
        const current = state.items.find((item) => item.id === id)
        return {
          items: current?.updatedAt === optimistic.updatedAt
            ? upsertItem(state.items, previous)
            : state.items,
          saveError: getMessage(error),
        }
      })
      throw error
    }
  },
}))
