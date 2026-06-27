import { create } from 'zustand'
import type { DragGuide } from '../board/dragGuide.types.ts'
import {
  createCard as createCardApi,
  deleteCard as deleteCardApi,
  fetchCards,
  subscribeToCardChanges,
  updateCard as updateCardApi,
  type CardRealtimeStatus,
} from './card.api.ts'
import type {
  BoardFilter,
  BoardScope,
  Card,
  CardEditorState,
  CreateCardInput,
  UpdateCardInput,
} from './card.types.ts'

type CardState = {
  cards: Card[]
  dragGuide: DragGuide | null
  editor: CardEditorState | null
  error: string | null
  filter: BoardFilter
  hasLoaded: boolean
  isLoading: boolean
  now: number
  realtimeStatus: CardRealtimeStatus
  saveError: string | null
  selectedCardId: string | null
  clearSaveError: () => void
  clearDragGuide: () => void
  closeEditor: () => void
  createCard: (input: CreateCardInput, userId: string | null) => Promise<void>
  deleteCard: (id: string) => Promise<void>
  loadCards: () => Promise<void>
  moveCardLocal: (id: string, x: number, y: number) => void
  openCreateEditor: (initialX: number, initialY: number, boardScope: BoardScope) => void
  openEditEditor: (cardId: string) => void
  persistCardPosition: (id: string, x: number, y: number) => Promise<void>
  selectCard: (id: string | null) => void
  setFilter: (filter: BoardFilter) => void
  setDragGuide: (guide: DragGuide | null) => void
  setNow: (now: number) => void
  subscribeRealtime: () => () => void
  updateCard: (id: string, input: UpdateCardInput) => Promise<void>
}

const getMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>
    const code = typeof record.code === 'string' ? record.code : null
    const message = typeof record.message === 'string' ? record.message : null

    if (code === 'PGRST205' || message?.includes("Could not find the table 'public.cards'")) {
      return 'Таблица public.cards не найдена. Открой Supabase SQL Editor и выполни миграцию supabase/migrations/0001_initial_schema.sql.'
    }

    if (message?.includes("Could not find the 'board_scope' column")) {
      return 'В таблице public.cards не найден столбец board_scope. Повтори выполнение миграции supabase/migrations/0001_initial_schema.sql в Supabase SQL Editor.'
    }

    if (message) {
      return message
    }
  }

  return 'Не удалось выполнить операцию с карточками.'
}

const upsertCard = (cards: Card[], card: Card) => {
  const index = cards.findIndex((item) => item.id === card.id)

  if (index === -1) {
    return [...cards, card]
  }

  const next = [...cards]
  next[index] = card
  return next
}

const applyLocalPatch = (card: Card, input: UpdateCardInput): Card => ({
  ...card,
  ...input,
  updatedAt: new Date().toISOString(),
})

export const useCardStore = create<CardState>((set, get) => ({
  cards: [],
  dragGuide: null,
  editor: null,
  error: null,
  filter: 'all',
  hasLoaded: false,
  isLoading: false,
  now: Date.now(),
  realtimeStatus: 'idle',
  saveError: null,
  selectedCardId: null,
  clearDragGuide: () => set({ dragGuide: null }),
  clearSaveError: () => set({ saveError: null }),
  closeEditor: () => set({ editor: null }),
  createCard: async (input, userId) => {
    set({ saveError: null })

    try {
      const card = await createCardApi(input, userId)
      set((state) => ({ cards: upsertCard(state.cards, card), editor: null, selectedCardId: card.id }))
    } catch (error) {
      set({ saveError: getMessage(error) })
      throw error
    }
  },
  deleteCard: async (id) => {
    const previousCards = get().cards
    set((state) => ({
      cards: state.cards.filter((card) => card.id !== id),
      saveError: null,
      selectedCardId: state.selectedCardId === id ? null : state.selectedCardId,
    }))

    try {
      await deleteCardApi(id)
    } catch (error) {
      set({ cards: previousCards, saveError: getMessage(error) })
      throw error
    }
  },
  loadCards: async () => {
    set({ error: null, isLoading: true })

    try {
      const cards = await fetchCards()
      set({ cards, error: null, hasLoaded: true, isLoading: false })
    } catch (error) {
      set({ error: getMessage(error), hasLoaded: true, isLoading: false })
    }
  },
  moveCardLocal: (id, x, y) => {
    set((state) => ({
      cards: state.cards.map((card) => (card.id === id ? { ...card, x, y } : card)),
    }))
  },
  openCreateEditor: (initialX, initialY, boardScope) =>
    set({ editor: { mode: 'create', boardScope, initialX, initialY } }),
  openEditEditor: (cardId) => set({ editor: { mode: 'edit', cardId }, selectedCardId: cardId }),
  persistCardPosition: async (id, x, y) => {
    set({ saveError: null })

    try {
      const card = await updateCardApi(id, { x, y })
      set((state) => ({ cards: upsertCard(state.cards, card) }))
    } catch (error) {
      set({ saveError: getMessage(error) })
      throw error
    }
  },
  selectCard: (id) => set({ selectedCardId: id }),
  setDragGuide: (guide) => set({ dragGuide: guide }),
  setFilter: (filter) => set({ filter }),
  setNow: (now) => set({ now }),
  subscribeRealtime: () =>
    subscribeToCardChanges(
      (event) => {
        if (event.type === 'DELETE') {
          set((state) => ({
            cards: state.cards.filter((card) => card.id !== event.id),
            selectedCardId: state.selectedCardId === event.id ? null : state.selectedCardId,
          }))
          return
        }

        set((state) => ({ cards: upsertCard(state.cards, event.card) }))
      },
      (realtimeStatus) => set({ realtimeStatus }),
    ),
  updateCard: async (id, input) => {
    const previousCard = get().cards.find((card) => card.id === id) ?? null
    set((state) => ({
      cards: state.cards.map((card) => (card.id === id ? applyLocalPatch(card, input) : card)),
      saveError: null,
    }))

    try {
      const card = await updateCardApi(id, input)
      set((state) => ({ cards: upsertCard(state.cards, card), editor: null }))
    } catch (error) {
      if (previousCard) {
        set((state) => ({ cards: upsertCard(state.cards, previousCard), saveError: getMessage(error) }))
      } else {
        set({ saveError: getMessage(error) })
      }

      throw error
    }
  },
}))
