import { create } from 'zustand'
import {
  createCardLink as createCardLinkApi,
  deleteCardLink as deleteCardLinkApi,
  fetchCardLinks,
  subscribeToCardLinkChanges,
} from './cardLink.api.ts'
import type { CardLink, CreateCardLinkInput } from './cardLink.types.ts'

type CardLinkState = {
  error: string | null
  hasLoaded: boolean
  isLoading: boolean
  links: CardLink[]
  saveError: string | null
  selectedLinkId: string | null
  clearSaveError: () => void
  createLink: (input: CreateCardLinkInput, userId: string | null) => Promise<CardLink | null>
  deleteLink: (id: string) => Promise<void>
  loadLinks: () => Promise<void>
  selectLink: (id: string | null) => void
  subscribeRealtime: () => () => void
}

const getMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>
    const code = typeof record.code === 'string' ? record.code : null
    const message = typeof record.message === 'string' ? record.message : null

    if (code === 'PGRST205' || message?.includes("Could not find the table 'public.card_links'")) {
      return 'Таблица public.card_links не найдена. Выполни свежую миграцию supabase/migrations/0001_initial_schema.sql в Supabase SQL Editor.'
    }

    if (message) {
      return message
    }
  }

  return 'Не удалось выполнить операцию со связями карточек.'
}

const upsertLink = (links: CardLink[], link: CardLink) => {
  const index = links.findIndex((item) => item.id === link.id)

  if (index === -1) {
    return [...links, link]
  }

  const next = [...links]
  next[index] = link
  return next
}

const findMatchingLink = (links: CardLink[], input: CreateCardLinkInput) =>
  links.find(
    (link) =>
      link.fromCardId === input.fromCardId &&
      link.fromSide === input.fromSide &&
      link.toCardId === input.toCardId &&
      link.toSide === input.toSide,
  ) ?? null

export const useCardLinkStore = create<CardLinkState>((set, get) => ({
  error: null,
  hasLoaded: false,
  isLoading: false,
  links: [],
  saveError: null,
  selectedLinkId: null,
  clearSaveError: () => set({ saveError: null }),
  createLink: async (input, userId) => {
    if (input.fromCardId === input.toCardId) {
      return null
    }

    const existingLink = findMatchingLink(get().links, input)

    if (existingLink) {
      set({ saveError: null, selectedLinkId: existingLink.id })
      return existingLink
    }

    set({ saveError: null })

    try {
      const link = await createCardLinkApi(input, userId)
      set((state) => ({
        links: upsertLink(state.links, link),
        selectedLinkId: link.id,
      }))
      return link
    } catch (error) {
      set({ saveError: getMessage(error) })
      throw error
    }
  },
  deleteLink: async (id) => {
    const previousLinks = get().links
    set((state) => ({
      links: state.links.filter((link) => link.id !== id),
      saveError: null,
      selectedLinkId: state.selectedLinkId === id ? null : state.selectedLinkId,
    }))

    try {
      await deleteCardLinkApi(id)
    } catch (error) {
      set({ links: previousLinks, saveError: getMessage(error) })
      throw error
    }
  },
  loadLinks: async () => {
    set({ error: null, isLoading: true })

    try {
      const links = await fetchCardLinks()
      set({ error: null, hasLoaded: true, isLoading: false, links })
    } catch (error) {
      set({ error: getMessage(error), hasLoaded: true, isLoading: false })
    }
  },
  selectLink: (id) => set({ selectedLinkId: id }),
  subscribeRealtime: () =>
    subscribeToCardLinkChanges((event) => {
      if (event.type === 'DELETE') {
        set((state) => ({
          links: state.links.filter((link) => link.id !== event.id),
          selectedLinkId: state.selectedLinkId === event.id ? null : state.selectedLinkId,
        }))
        return
      }

      set((state) => ({ links: upsertLink(state.links, event.link) }))
    }),
}))
