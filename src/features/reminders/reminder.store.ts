import { useEffect } from 'react'
import { create } from 'zustand'
import { requireSupabase } from '../../lib/supabase.ts'
import { parseReminderState, type ReminderState } from './reminder.model.ts'

type Store = {
  ownerId: string | null
  data: ReminderState | null
  error: boolean
  missing: boolean
  refresh: () => Promise<void>
  save: (
    cardId: string,
    offsets: number[],
    custom: string | null,
    language: string,
    note: string,
  ) => Promise<void>
  disconnect: () => Promise<void>
  sendTest: (language: string) => Promise<void>
}
let generation = 0
let request: Promise<void> | null = null
let controller: AbortController | null = null
export const useReminderStore = create<Store>((set, get) => ({
  ownerId: null,
  data: null,
  error: false,
  missing: false,
  refresh: () => {
    if (request) return request
    if (!get().ownerId) return Promise.resolve()
    const version = generation
    const activeController = new AbortController()
    controller = activeController
    const signal = activeController.signal
    const timeout = window.setTimeout(() => activeController.abort(), 15_000)
    request = (async () => {
      try {
        const { data, error } = await requireSupabase()
          .rpc('telegram_reminder_state')
          .abortSignal(signal)
        if (error) throw error
        const next = parseReminderState(data)
        if (version === generation)
          set((current) => ({
            data:
              JSON.stringify(current.data) === JSON.stringify(next)
                ? current.data
                : next,
            error: false,
            missing: false,
          }))
      } catch (error) {
        if (version === generation)
          set({
            error: true,
            missing:
              typeof error === 'object' &&
              error !== null &&
              'code' in error &&
              ['PGRST202', '42883'].includes(String(error.code)),
          })
      } finally {
        clearTimeout(timeout)
        if (version === generation) {
          request = null
          controller = null
        }
      }
    })()
    return request
  },
  save: async (cardId, offsets, custom, language, note) => {
    const version = generation
    const { data, error } = await requireSupabase()
      .rpc('set_card_reminders', {
        target_card: cardId,
        selected_offsets: offsets,
        custom_time: custom,
        time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        reminder_language: language,
        reminder_note: note,
      })
      .abortSignal(AbortSignal.timeout(15_000))
    if (error) throw error
    if (version === generation) {
      controller?.abort()
      generation++
      request = null
      controller = null
      set({ data: parseReminderState(data), error: false })
    }
  },
  sendTest: async (language) => {
    const version = generation
    const { data, error } = await requireSupabase()
      .rpc('telegram_send_test', { reminder_language: language })
      .abortSignal(AbortSignal.timeout(15_000))
    if (error) throw error
    if (version === generation) {
      controller?.abort()
      generation++
      request = null
      controller = null
      set({ data: parseReminderState(data), error: false })
    }
  },
  disconnect: async () => {
    const version = generation
    const { error } = await requireSupabase()
      .rpc('telegram_disconnect')
      .abortSignal(AbortSignal.timeout(15_000))
    if (error) throw error
    if (version === generation) {
      controller?.abort()
      generation++
      request = null
      controller = null
      set((current) => ({
        data: current.data
          ? {
              ...current.data,
              connected: false,
              reminders: [],
              testDelivery: null,
              testAvailableAt: null,
            }
          : null,
      }))
      await get().refresh()
    }
  },
}))

export function useReminderSession(userId: string | null) {
  useEffect(() => {
    generation++
    controller?.abort()
    controller = null
    request = null
    useReminderStore.setState({
      ownerId: userId,
      data: null,
      error: false,
      missing: false,
    })
    const refresh = () => {
      if (!document.hidden) void useReminderStore.getState().refresh()
    }
    refresh()
    const timer = window.setInterval(refresh, 60_000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      generation++
      controller?.abort()
      controller = null
      request = null
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
      useReminderStore.setState({
        ownerId: null,
        data: null,
        error: false,
        missing: false,
      })
    }
  }, [userId])
}
