import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '../features/auth/ProtectedRoute.tsx'

const BoardPage = lazy(() =>
  import('../pages/BoardPage.tsx').then((module) => ({ default: module.BoardPage })),
)
const LoginPage = lazy(() =>
  import('../pages/LoginPage.tsx').then((module) => ({ default: module.LoginPage })),
)

function RouteFallback() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] text-white">
      <div className="mission-state-card rounded-3xl border border-white/10 bg-white/[0.04] px-6 py-5 text-sm font-semibold text-white/60">
        Загружаем Fireboard...
      </div>
    </main>
  )
}

export function AppRouter() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<BoardPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
