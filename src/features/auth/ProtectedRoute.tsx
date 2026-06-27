import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { env } from '../../lib/env.ts'
import { EnvSetupPanel } from './EnvSetupPanel.tsx'
import { useAuth } from './useAuth.ts'

function AuthLoadingScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] text-[var(--text-primary)]">
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-5 shadow-glow">
        <div className="mb-3 h-2 w-40 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/2 animate-[scan_1.2s_ease-in-out_infinite] rounded-full bg-[var(--accent)]" />
        </div>
        <p className="text-sm text-[var(--text-muted)]">Восстанавливаем сессию Fireboard...</p>
      </div>
    </main>
  )
}

export function ProtectedRoute() {
  const location = useLocation()
  const { isLoading, session } = useAuth()

  if (!env.isSupabaseConfigured) {
    return <EnvSetupPanel />
  }

  if (isLoading) {
    return <AuthLoadingScreen />
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}
