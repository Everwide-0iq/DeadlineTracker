import { type PropsWithChildren, useEffect } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { useAuthStore } from '../../features/auth/auth.store.ts'
import { useCardStore } from '../../features/cards/card.store.ts'

export function AppProviders({ children }: PropsWithChildren) {
  const initializeAuth = useAuthStore((state) => state.initialize)
  const setNow = useCardStore((state) => state.setNow)

  useEffect(() => initializeAuth(), [initializeAuth])

  useEffect(() => {
    setNow(Date.now())
    const timerId = window.setInterval(() => setNow(Date.now()), 30_000)

    return () => window.clearInterval(timerId)
  }, [setNow])

  return <BrowserRouter>{children}</BrowserRouter>
}
