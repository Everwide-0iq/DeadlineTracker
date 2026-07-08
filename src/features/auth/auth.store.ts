import type { Session, User } from '@supabase/supabase-js'
import { create } from 'zustand'
import { supabase } from '../../lib/supabase.ts'
import { getCurrentTranslation } from '../i18n/i18n.store.ts'
import { signInWithPassword, signOut } from './auth.api.ts'

type AuthCleanup = () => void

type AuthState = {
  error: string | null
  isLoading: boolean
  isSubmitting: boolean
  session: Session | null
  user: User | null
  clearError: () => void
  initialize: () => AuthCleanup
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const getMessage = (error: unknown) => {
  const t = getCurrentTranslation()

  if (error instanceof Error) {
    if (error.message === 'Invalid login credentials') {
      return t.errors.authInvalid
    }

    return error.message
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message

    if (typeof message === 'string') {
      if (message === 'Invalid login credentials') {
        return t.errors.authInvalid
      }

      return message
    }
  }

  return t.errors.authUnexpected
}

export const useAuthStore = create<AuthState>((set) => ({
  error: null,
  isLoading: true,
  isSubmitting: false,
  session: null,
  user: null,
  clearError: () => set({ error: null }),
  initialize: () => {
    if (!supabase) {
      set({ error: null, isLoading: false, session: null, user: null })
      return () => undefined
    }

    let active = true
    set({ isLoading: true })

    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) {
          return
        }

        if (error) {
          set({ error: error.message, isLoading: false, session: null, user: null })
          return
        }

        set({
          error: null,
          isLoading: false,
          session: data.session,
          user: data.session?.user ?? null,
        })
      })
      .catch((error: unknown) => {
        if (active) {
          set({ error: getMessage(error), isLoading: false, session: null, user: null })
        }
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      set({ error: null, isLoading: false, session, user: session?.user ?? null })
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  },
  login: async (email, password) => {
    set({ error: null, isSubmitting: true })

    try {
      const session = await signInWithPassword(email, password)
      set({ error: null, isSubmitting: false, session, user: session?.user ?? null })
    } catch (error) {
      set({ error: getMessage(error), isSubmitting: false, session: null, user: null })
      throw error
    }
  },
  logout: async () => {
    set({ error: null, isSubmitting: true })

    try {
      await signOut()
      set({ error: null, isSubmitting: false, session: null, user: null })
    } catch (error) {
      set({ error: getMessage(error), isSubmitting: false })
      throw error
    }
  },
}))
