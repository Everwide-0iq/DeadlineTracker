import { create } from 'zustand'
import { fetchActivityEvents, subscribeToActivityEvents } from './activity.api.ts'
import type { ActivityEvent } from './activity.types.ts'

type ActivityState = {
  error: string | null
  events: ActivityEvent[]
  hasLoaded: boolean
  isLoading: boolean
  isOpen: boolean
  latestRealtimeEvent: ActivityEvent | null
  pulseCardId: string | null
  unreadCount: number
  close: () => void
  loadActivity: () => Promise<void>
  markRead: () => void
  open: () => void
  subscribeRealtime: () => () => void
  toggle: () => void
}

const maxEvents = 40

const getMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>
    const message = typeof record.message === 'string' ? record.message : null

    if (message?.includes("Could not find the table 'public.activity_events'")) {
      return 'Таблица public.activity_events не найдена. Выполни свежую миграцию supabase/migrations/0001_initial_schema.sql.'
    }

    if (message) {
      return message
    }
  }

  return 'Не удалось загрузить журнал активности.'
}

const upsertEvent = (events: ActivityEvent[], event: ActivityEvent) => {
  const next = [event, ...events.filter((item) => item.id !== event.id)]
  return next.slice(0, maxEvents)
}

function schedulePulse(cardId: string | null) {
  if (!cardId) {
    return
  }

  window.setTimeout(() => {
    const state = useActivityStore.getState()

    if (state.pulseCardId === cardId) {
      useActivityStore.setState({ pulseCardId: null })
    }
  }, 1600)
}

export const useActivityStore = create<ActivityState>((set, get) => ({
  error: null,
  events: [],
  hasLoaded: false,
  isLoading: false,
  isOpen: false,
  latestRealtimeEvent: null,
  pulseCardId: null,
  unreadCount: 0,
  close: () => set({ isOpen: false }),
  loadActivity: async () => {
    set({ error: null, isLoading: true })

    try {
      const events = await fetchActivityEvents()
      set({ error: null, events, hasLoaded: true, isLoading: false })
    } catch (error) {
      set({ error: getMessage(error), hasLoaded: true, isLoading: false })
    }
  },
  markRead: () => set({ unreadCount: 0 }),
  open: () => set({ isOpen: true, unreadCount: 0 }),
  subscribeRealtime: () =>
    subscribeToActivityEvents(({ event }) => {
      const shouldCount = !get().isOpen

      set((state) => ({
        events: upsertEvent(state.events, event),
        latestRealtimeEvent: event,
        pulseCardId: event.cardId,
        unreadCount: shouldCount ? Math.min(state.unreadCount + 1, 99) : state.unreadCount,
      }))
      schedulePulse(event.cardId)
    }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen, unreadCount: state.isOpen ? state.unreadCount : 0 })),
}))
