import { Flame, KeyRound, LogIn } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { EnvSetupPanel } from '../features/auth/EnvSetupPanel.tsx'
import { useAuthStore } from '../features/auth/auth.store.ts'
import { env } from '../lib/env.ts'

type LocationState = {
  from?: {
    pathname?: string
  }
}

export function LoginPage() {
  const location = useLocation()
  const state = location.state as LocationState | null
  const from = state?.from?.pathname ?? '/'
  const authError = useAuthStore((authState) => authState.error)
  const clearError = useAuthStore((authState) => authState.clearError)
  const isLoading = useAuthStore((authState) => authState.isLoading)
  const isSubmitting = useAuthStore((authState) => authState.isSubmitting)
  const login = useAuthStore((authState) => authState.login)
  const session = useAuthStore((authState) => authState.session)
  const [email, setEmail] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [password, setPassword] = useState('')

  if (!env.isSupabaseConfigured) {
    return <EnvSetupPanel />
  }

  if (!isLoading && session) {
    return <Navigate to={from} replace />
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearError()
    setFormError(null)

    if (!email.trim() || !password) {
      setFormError('Введите email и пароль.')
      return
    }

    await login(email.trim(), password).catch(() => undefined)
  }

  return (
    <main className="grid min-h-screen place-items-center overflow-hidden bg-[var(--background)] p-5 text-white">
      <div className="login-aurora" />
      <section className="relative z-10 grid w-full max-w-5xl overflow-hidden rounded-[32px] border border-white/10 bg-black/45 shadow-2xl backdrop-blur-xl lg:grid-cols-[1.08fr_0.92fr]">
        <div className="hidden min-h-[560px] flex-col justify-center gap-12 border-r border-white/10 bg-white/[0.025] p-9 lg:flex">
          <div className="flex items-center gap-3">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[var(--accent)]/12 text-[var(--accent)] shadow-glow">
              <Flame size={34} fill="currentColor" />
            </div>
            <div>
              <h1 className="text-4xl font-black">Fireboard</h1>
              <p className="mt-1 text-sm text-white/45">Приватный командный центр дедлайнов</p>
            </div>
          </div>

          <div>
            <div className="login-preview-card h-64 rounded-[28px] border border-red-400/20 p-5">
              <div className="mb-5 flex items-start justify-between">
                <div className="grid h-12 w-12 place-items-center rounded-2xl border border-red-300/50 bg-red-500/10 text-[var(--accent)] shadow-glow">
                  <Flame size={22} fill="currentColor" />
                </div>
                <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-red-100">
                  Горячо
                </div>
              </div>
              <div className="mb-3 text-2xl font-black leading-tight text-white">Релизный билд к пятнице</div>
              <div className="mb-5 flex items-end gap-3">
                <span className="text-5xl font-black text-red-200 drop-shadow-[0_0_24px_rgb(255_70_61_/_0.35)]">
                  1д 08ч
                </span>
                <span className="pb-2 text-sm font-bold uppercase tracking-[0.16em] text-red-200/70">
                  срочно
                </span>
              </div>
              <div className="mb-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-[82%] rounded-full bg-[var(--accent)] shadow-[0_0_20px_rgb(255_70_61_/_0.55)]" />
              </div>
              <div className="flex items-center justify-between text-sm text-white/45">
                <span>Синхронизировано</span>
                <span>2 участника</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center p-6 sm:p-8 lg:min-h-[560px] lg:p-10">
          <div className="mx-auto w-full max-w-[405px]">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--accent)]/12 text-[var(--accent)] shadow-glow">
                <Flame size={30} fill="currentColor" />
              </div>
              <h1 className="text-3xl font-black">Fireboard</h1>
            </div>

            <div className="mb-8">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
                <KeyRound size={17} />
                Вход
              </div>
              <h2 className="text-2xl font-black sm:text-3xl">Добро пожаловать</h2>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <label className="form-field">
                <span>Почта</span>
                <input
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@example.com"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>

              <label className="form-field">
                <span>Пароль</span>
                <input
                  autoComplete="current-password"
                  placeholder="Твой пароль"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>

              {formError || authError ? (
                <div className="rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {formError ?? authError}
                </div>
              ) : null}

              <button className="primary-button w-full justify-center py-4 text-base" disabled={isSubmitting} type="submit">
                <LogIn size={18} />
                {isSubmitting ? 'Входим...' : 'Войти'}
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  )
}
