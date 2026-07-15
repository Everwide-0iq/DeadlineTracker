import { create } from 'zustand'
import type { DragGuide } from '../board/dragGuide.types.ts'
import { getCurrentTranslation } from '../i18n/i18n.store.ts'
import {
  createCard as createCardApi,
  deleteCards as deleteCardsApi,
  fetchCards,
  subscribeToCardChanges,
  updateCard as updateCardApi,
  updateCardGeometries as updateCardGeometriesApi,
  updateCardPositions as updateCardPositionsApi,
  type CardRealtimeStatus,
} from './card.api.ts'
import { cleanupPendingCardImages } from './cardImage.api.ts'
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
  isGeometryInteracting: boolean
  isLoading: boolean
  now: number
  realtimeStatus: CardRealtimeStatus
  saveError: string | null
  selectedCardId: string | null
  selectedCardIds: string[]
  clearSaveError: () => void
  clearDragGuide: () => void
  closeEditor: () => void
  createCard: (input: CreateCardInput, userId: string | null) => Promise<Card>
  deleteCard: (id: string) => Promise<void>
  deleteCards: (ids: string[]) => Promise<void>
  loadCards: () => Promise<void>
  moveCardLocal: (id: string, x: number, y: number) => void
  moveCardsLocal: (positions: Array<{ id: string; x: number; y: number }>) => void
  openCreateEditor: (
    initialX: number,
    initialY: number,
    boardScope: BoardScope,
    projectId: string | null,
  ) => void
  openEditEditor: (cardId: string) => void
  persistCardPosition: (id: string, x: number, y: number) => Promise<void>
  persistCardPositions: (positions: Array<{ id: string; x: number; y: number }>) => Promise<void>
  persistCardGeometry: (id: string, geometry: Pick<Card, 'h' | 'w' | 'x' | 'y'>) => Promise<void>
  persistCardsGeometry: (
    updates: Array<{ geometry: Pick<Card, 'h' | 'w' | 'x' | 'y'>; id: string }>,
  ) => Promise<void>
  resizeCardLocal: (id: string, geometry: Pick<Card, 'h' | 'w' | 'x' | 'y'>) => void
  resizeCardsLocal: (updates: Array<{ geometry: Pick<Card, 'h' | 'w' | 'x' | 'y'>; id: string }>) => void
  selectCard: (id: string | null) => void
  selectCards: (ids: string[]) => void
  setGeometryInteracting: (isInteracting: boolean) => void
  setFilter: (filter: BoardFilter) => void
  setDragGuide: (guide: DragGuide | null) => void
  setNow: (now: number) => void
  subscribeRealtime: () => () => void
  toggleCardSelection: (id: string) => void
  toggleCardActive: (id: string, userId: string | null) => Promise<void>
  updateCard: (id: string, input: UpdateCardInput) => Promise<void>
}

const getMessage = (error: unknown) => {
  const t = getCurrentTranslation()

  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>
    const code = typeof record.code === 'string' ? record.code : null
    const message = typeof record.message === 'string' ? record.message : null

    if (code === 'PGRST205' || message?.includes("Could not find the table 'public.cards'")) {
      return t.errors.cardsMissingTable
    }

    if (message?.includes("Could not find the 'board_scope' column")) {
      return t.errors.cardsMissingScope
    }

    if (message?.includes("Could not find the 'project_id' column")) {
      return t.errors.cardsMissingProject
    }

    if (message?.includes("Could not find the 'image_path' column")) {
      return t.errors.cardsMissingImage
    }

    if (message?.includes("Could not find the 'active_by' column") || message?.includes('active_by')) {
      return t.errors.cardsMissingActiveOwner
    }

    if (message?.includes("Could not find the 'completed_at' column") || message?.includes('completed_at')) {
      return t.errors.cardsMissingCompletedAt
    }

    if (message?.includes("Could not find the 'is_active' column") || message?.includes('is_active')) {
      return t.errors.cardsMissingActive
    }

    if (message) {
      return message
    }
  }

  return t.errors.cardsGeneric
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

export const applyOptimisticCardPatch = (card: Card, input: UpdateCardInput): Card => {
  const updatedAt = new Date().toISOString()
  const next: Card = { ...card, ...input, updatedAt }

  if (input.status === 'done') {
    next.status = 'done'
    next.isActive = false
    next.activeBy = null
    next.completedAt = card.status === 'done' ? card.completedAt : updatedAt
    next.completedBy = card.status === 'done' ? card.completedBy : next.completedBy
    return next
  }

  if (input.status === 'todo' && card.status === 'done') {
    next.completedAt = null
    next.completedBy = null
  }

  if (input.isActive === false) {
    next.activeBy = null
  }

  if (next.status === 'done') {
    next.isActive = false
    next.activeBy = null
  }

  return next
}

export function getActivityTogglePatch(
  card: Card,
  userId: string | null,
): UpdateCardInput | null {
  if (card.status === 'done' || !userId) {
    return null
  }

  const isOwnedByCurrentUser = card.isActive && card.activeBy === userId
  return {
    activeBy: isOwnedByCurrentUser ? null : userId,
    isActive: !isOwnedByCurrentUser,
  }
}

const uniqueIds = (ids: string[]) => Array.from(new Set(ids))

export const useCardStore = create<CardState>((set, get) => ({
  cards: [],
  dragGuide: null,
  editor: null,
  error: null,
  filter: 'all',
  hasLoaded: false,
  isGeometryInteracting: false,
  isLoading: false,
  now: Date.now(),
  realtimeStatus: 'idle',
  saveError: null,
  selectedCardId: null,
  selectedCardIds: [],
  clearDragGuide: () => set({ dragGuide: null }),
  clearSaveError: () => set({ saveError: null }),
  closeEditor: () => set({ editor: null }),
  createCard: async (input, userId) => {
    set({ saveError: null })

    try {
      const card = await createCardApi(input, userId)
      set((state) => ({
        cards: upsertCard(state.cards, card),
        editor: null,
        selectedCardId: card.id,
        selectedCardIds: [card.id],
      }))
      return card
    } catch (error) {
      set({ saveError: getMessage(error) })
      throw error
    }
  },
  deleteCard: async (id) => get().deleteCards([id]),
  deleteCards: async (ids) => {
    const deleteIds = uniqueIds(ids)
    const deleteIdSet = new Set(deleteIds)
    const previousCards = get().cards
    const deletedCards = previousCards.filter((card) => deleteIdSet.has(card.id))
    const previousSelectedCardId = get().selectedCardId
    const previousSelectedCardIds = get().selectedCardIds

    if (deleteIds.length === 0) {
      return
    }

    set((state) => ({
      cards: state.cards.filter((card) => !deleteIdSet.has(card.id)),
      saveError: null,
      selectedCardId: state.selectedCardId && deleteIdSet.has(state.selectedCardId) ? null : state.selectedCardId,
      selectedCardIds: state.selectedCardIds.filter((cardId) => !deleteIdSet.has(cardId)),
    }))

    try {
      await deleteCardsApi(deleteIds)
      void cleanupPendingCardImages().catch(() => undefined)
    } catch (error) {
      set((state) => {
        const restoredById = new Map(state.cards.map((card) => [card.id, card]))
        const originalIndexById = new Map(previousCards.map((card, index) => [card.id, index]))

        deletedCards.forEach((card) => {
          if (!restoredById.has(card.id)) {
            restoredById.set(card.id, card)
          }
        })

        const cards = Array.from(restoredById.values()).sort((left, right) => {
          const leftIndex = originalIndexById.get(left.id) ?? Number.MAX_SAFE_INTEGER
          const rightIndex = originalIndexById.get(right.id) ?? Number.MAX_SAFE_INTEGER
          return leftIndex - rightIndex
        })

        return {
          cards,
          saveError: getMessage(error),
          selectedCardId: previousSelectedCardId,
          selectedCardIds: previousSelectedCardIds,
        }
      })
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
  moveCardsLocal: (positions) => {
    const positionById = new Map(positions.map((position) => [position.id, position]))
    set((state) => ({
      cards: state.cards.map((card) => {
        const position = positionById.get(card.id)
        return position ? { ...card, x: position.x, y: position.y } : card
      }),
    }))
  },
  openCreateEditor: (initialX, initialY, boardScope, projectId) =>
    set({ editor: { mode: 'create', boardScope, projectId, initialX, initialY } }),
  openEditEditor: (cardId) =>
    set({ editor: { mode: 'edit', cardId }, selectedCardId: cardId, selectedCardIds: [cardId] }),
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
  persistCardPositions: async (positions) => {
    set({ saveError: null })

    try {
      const updatedCards = await updateCardPositionsApi(positions)
      set((state) => ({
        cards: updatedCards.reduce((nextCards, card) => upsertCard(nextCards, card), state.cards),
      }))
    } catch (error) {
      set({ saveError: getMessage(error) })
      throw error
    }
  },
  persistCardGeometry: async (id, geometry) => {
    set({ saveError: null })

    try {
      const card = await updateCardApi(id, geometry)
      set((state) => ({ cards: upsertCard(state.cards, card) }))
    } catch (error) {
      set({ saveError: getMessage(error) })
      throw error
    }
  },
  persistCardsGeometry: async (updates) => {
    set({ saveError: null })

    try {
      const updatedCards = await updateCardGeometriesApi(
        updates.map((update) => ({ id: update.id, ...update.geometry })),
      )
      set((state) => ({
        cards: updatedCards.reduce((nextCards, card) => upsertCard(nextCards, card), state.cards),
      }))
    } catch (error) {
      set({ saveError: getMessage(error) })
      throw error
    }
  },
  resizeCardLocal: (id, geometry) => {
    set((state) => ({
      cards: state.cards.map((card) => (card.id === id ? { ...card, ...geometry } : card)),
    }))
  },
  resizeCardsLocal: (updates) => {
    const geometryById = new Map(updates.map((update) => [update.id, update.geometry]))
    set((state) => ({
      cards: state.cards.map((card) => {
        const geometry = geometryById.get(card.id)
        return geometry ? { ...card, ...geometry } : card
      }),
    }))
  },
  selectCard: (id) => set({ selectedCardId: id, selectedCardIds: id ? [id] : [] }),
  selectCards: (ids) => {
    const nextIds = uniqueIds(ids)
    set({ selectedCardId: nextIds.at(-1) ?? null, selectedCardIds: nextIds })
  },
  setGeometryInteracting: (isGeometryInteracting) => set({ isGeometryInteracting }),
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
            selectedCardIds: state.selectedCardIds.filter((cardId) => cardId !== event.id),
          }))
          return
        }

        set((state) => ({ cards: upsertCard(state.cards, event.card) }))
      },
      (realtimeStatus) => set({ realtimeStatus }),
    ),
  toggleCardActive: async (id, userId) => {
    const card = get().cards.find((item) => item.id === id)

    if (!card) {
      return
    }

    const patch = getActivityTogglePatch(card, userId)

    if (patch) {
      await get().updateCard(id, patch)
    }
  },
  updateCard: async (id, input) => {
    const previousCard = get().cards.find((card) => card.id === id) ?? null
    const optimisticCard = previousCard ? applyOptimisticCardPatch(previousCard, input) : null
    set((state) => ({
      cards: state.cards.map((card) => (card.id === id && optimisticCard ? optimisticCard : card)),
      saveError: null,
    }))

    try {
      const card = await updateCardApi(id, input)
      set((state) => ({ cards: upsertCard(state.cards, card), editor: null }))
    } catch (error) {
      if (previousCard && optimisticCard) {
        set((state) => {
          const currentCard = state.cards.find((card) => card.id === id)
          const cards =
            currentCard?.updatedAt === optimisticCard.updatedAt
              ? upsertCard(state.cards, previousCard)
              : state.cards

          return { cards, saveError: getMessage(error) }
        })
      } else {
        set({ saveError: getMessage(error) })
      }

      throw error
    }
  },
  toggleCardSelection: (id) =>
    set((state) => {
      const isSelected = state.selectedCardIds.includes(id)
      const selectedCardIds = isSelected
        ? state.selectedCardIds.filter((cardId) => cardId !== id)
        : [...state.selectedCardIds, id]

      return {
        selectedCardId: selectedCardIds.at(-1) ?? null,
        selectedCardIds,
      }
    }),
}))
