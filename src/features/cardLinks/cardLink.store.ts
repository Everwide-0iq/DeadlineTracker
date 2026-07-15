import { create } from 'zustand'
import { getCurrentTranslation } from '../i18n/i18n.store.ts'
import {
  createCardLink as createCardLinkApi,
  deleteCardLink as deleteCardLinkApi,
  deleteCardLinksForCard as deleteCardLinksForCardApi,
  deleteCardLinksForTodoBlock as deleteCardLinksForTodoBlockApi,
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
  deleteLinksForCard: (cardId: string) => Promise<void>
  deleteLinksForTodoBlock: (blockId: string) => Promise<void>
  loadLinks: () => Promise<void>
  selectLink: (id: string | null) => void
  subscribeRealtime: () => () => void
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

    if (code === 'PGRST205' || message?.includes("Could not find the table 'public.card_links'")) {
      return t.errors.linksMissingTable
    }

    if (message) {
      return message
    }
  }

  return t.errors.linksGeneric
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

const restoreMissingLinks = (links: CardLink[], removedLinks: CardLink[]) =>
  removedLinks.reduce(
    (current, link) =>
      current.some((item) => item.id === link.id) ? current : upsertLink(current, link),
    links,
  )

const findMatchingLink = (links: CardLink[], input: CreateCardLinkInput) =>
  links.find(
    (link) =>
      (input.from.kind === 'card' ? link.fromCardId : link.fromTodoBlockId) === input.from.id &&
      link.fromSide === input.from.side &&
      (input.to.kind === 'card' ? link.toCardId : link.toTodoBlockId) === input.to.id &&
      link.toSide === input.to.side,
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
    if (input.from.kind === input.to.kind && input.from.id === input.to.id) {
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
    const previousState = get()
    const removedLink = previousState.links.find((link) => link.id === id) ?? null
    const wasSelected = previousState.selectedLinkId === id
    set((state) => ({
      links: state.links.filter((link) => link.id !== id),
      saveError: null,
      selectedLinkId: state.selectedLinkId === id ? null : state.selectedLinkId,
    }))

    try {
      await deleteCardLinkApi(id)
    } catch (error) {
      set((state) => ({
        links: removedLink ? restoreMissingLinks(state.links, [removedLink]) : state.links,
        saveError: getMessage(error),
        selectedLinkId: wasSelected && state.selectedLinkId === null ? id : state.selectedLinkId,
      }))
      throw error
    }
  },
  deleteLinksForCard: async (cardId) => {
    const removedLinks = get().links.filter(
      (link) => link.fromCardId === cardId || link.toCardId === cardId,
    )

    if (removedLinks.length === 0) {
      return
    }

    const removedLinkIds = new Set(removedLinks.map((link) => link.id))
    set((state) => ({
      links: state.links.filter((link) => !removedLinkIds.has(link.id)),
      saveError: null,
      selectedLinkId:
        state.selectedLinkId && removedLinkIds.has(state.selectedLinkId)
          ? null
          : state.selectedLinkId,
    }))

    try {
      await deleteCardLinksForCardApi(cardId)
    } catch (error) {
      set((state) => ({
        links: restoreMissingLinks(state.links, removedLinks),
        saveError: getMessage(error),
      }))
      throw error
    }
  },
  deleteLinksForTodoBlock: async (blockId) => {
    const removedLinks = get().links.filter(
      (link) => link.fromTodoBlockId === blockId || link.toTodoBlockId === blockId,
    )
    if (removedLinks.length === 0) return
    const removedIds = new Set(removedLinks.map((link) => link.id))
    set((state) => ({
      links: state.links.filter((link) => !removedIds.has(link.id)),
      saveError: null,
      selectedLinkId: state.selectedLinkId && removedIds.has(state.selectedLinkId) ? null : state.selectedLinkId,
    }))
    try {
      await deleteCardLinksForTodoBlockApi(blockId)
    } catch (error) {
      set((state) => ({ links: restoreMissingLinks(state.links, removedLinks), saveError: getMessage(error) }))
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
