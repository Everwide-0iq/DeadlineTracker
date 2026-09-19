import { type PropsWithChildren, useEffect } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { useAuthStore } from '../../features/auth/auth.store.ts'
import { useCardStore } from '../../features/cards/card.store.ts'
import { useI18nStore } from '../../features/i18n/i18n.store.ts'

export function AppProviders({ children }: PropsWithChildren) {
  const initializeAuth = useAuthStore((state) => state.initialize)
  const setNow = useCardStore((state) => state.setNow)
  const language = useI18nStore((state) => state.language)

  useEffect(() => initializeAuth(), [initializeAuth])

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'hidden') setNow(Date.now())
    }
    refresh()
    const timerId = window.setInterval(refresh, 30_000)
    document.addEventListener('visibilitychange', refresh)

    return () => {
      window.clearInterval(timerId)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [setNow])

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  return <BrowserRouter>{children}</BrowserRouter>
}
