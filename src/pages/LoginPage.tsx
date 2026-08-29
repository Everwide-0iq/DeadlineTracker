import { Flame, KeyRound, LogIn, UserRoundPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { EnvSetupPanel } from '../features/auth/EnvSetupPanel.tsx'
import { useAuthStore } from '../features/auth/auth.store.ts'
import { LanguageToggle } from '../features/i18n/LanguageToggle.tsx'
import { useI18nStore } from '../features/i18n/i18n.store.ts'
import { translations } from '../features/i18n/translations.ts'
import { env } from '../lib/env.ts'

type LocationState = {
  from?: {
    pathname?: string
    search?: string
  }
}

export function LoginPage() {
  const location = useLocation()
  const state = location.state as LocationState | null
  const invitationSearch = state?.from?.search ?? location.search
  const from = `${state?.from?.pathname ?? '/'}${invitationSearch}`
  const authError = useAuthStore((authState) => authState.error)
  const clearError = useAuthStore((authState) => authState.clearError)
  const isLoading = useAuthStore((authState) => authState.isLoading)
  const isSubmitting = useAuthStore((authState) => authState.isSubmitting)
  const login = useAuthStore((authState) => authState.login)
  const register = useAuthStore((authState) => authState.register)
  const session = useAuthStore((authState) => authState.session)
  const language = useI18nStore((i18nState) => i18nState.language)
  const t = translations[language]
  const [email, setEmail] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [mode, setMode] = useState<'login' | 'register'>(() => (new URLSearchParams(invitationSearch).has('invite') ? 'register' : 'login'))
  const [password, setPassword] = useState('')
  const [registrationNotice, setRegistrationNotice] = useState<string | null>(null)

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
    setRegistrationNotice(null)

    if (!email.trim() || !password) {
      setFormError(t.login.emptyCredentials)
      return
    }

    if (mode === 'login') {
      await login(email.trim(), password).catch(() => undefined)
      return
    }

    const authenticated = await register(email.trim(), password, `${window.location.origin}${from}`).catch(() => false)
    if (!authenticated && !useAuthStore.getState().error) {
      setRegistrationNotice(t.login.registrationNotice)
    }
  }

  const switchMode = (nextMode: 'login' | 'register') => {
    setMode(nextMode)
    setFormError(null)
    setRegistrationNotice(null)
    clearError()
  }

  return (
    <main className="grid min-h-screen place-items-center overflow-hidden bg-[var(--background)] p-5 text-white">
      <div className="login-aurora" />
      <LanguageToggle variant="floating" />
      <section className="relative z-10 grid w-full max-w-5xl overflow-hidden rounded-[32px] border border-white/10 bg-black/45 shadow-2xl backdrop-blur-xl lg:grid-cols-[1.08fr_0.92fr]">
        <div className="hidden min-h-[560px] flex-col justify-center gap-12 border-r border-white/10 bg-white/[0.025] p-9 lg:flex">
          <div className="flex items-center gap-3">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[var(--accent)]/12 text-[var(--accent)] shadow-glow">
              <Flame size={34} fill="currentColor" />
            </div>
            <div>
              <h1 className="text-4xl font-black">Fireboard</h1>
              <p className="mt-1 text-sm text-white/45">{t.login.privateHub}</p>
            </div>
          </div>

          <div>
            <div className="login-preview-card h-64 rounded-[28px] border border-red-400/20 p-5">
              <div className="mb-5 flex items-start justify-between">
                <div className="grid h-12 w-12 place-items-center rounded-2xl border border-red-300/50 bg-red-500/10 text-[var(--accent)] shadow-glow">
                  <Flame size={22} fill="currentColor" />
                </div>
                <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-red-100">
                  {t.login.hot}
                </div>
              </div>
              <div className="mb-3 text-2xl font-black leading-tight text-white">{t.login.previewTitle}</div>
              <div className="mb-5 flex items-end gap-3">
                <span className="text-5xl font-black text-red-200 drop-shadow-[0_0_24px_rgb(255_70_61_/_0.35)]">
                  {t.login.previewCountdown}
                </span>
                <span className="pb-2 text-sm font-bold uppercase tracking-[0.16em] text-red-200/70">
                  {t.login.previewStatus}
                </span>
              </div>
              <div className="mb-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-[82%] rounded-full bg-[var(--accent)] shadow-[0_0_20px_rgb(255_70_61_/_0.55)]" />
              </div>
              <div className="flex items-center justify-between text-sm text-white/45">
                <span>{t.login.previewSync}</span>
                <span>{t.login.previewUsers}</span>
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
              <div aria-label={t.login.accessMode} className="mb-5 grid grid-cols-2 rounded-xl border border-white/10 bg-white/[0.025] p-1" role="tablist">
                <button
                  aria-selected={mode === 'login'}
                  className={mode === 'login' ? 'rounded-lg bg-[var(--accent)]/15 px-3 py-2 text-sm font-bold text-white shadow-[inset_0_0_0_1px_rgb(255_110_105_/_0.35)]' : 'rounded-lg px-3 py-2 text-sm font-bold text-white/45 transition hover:text-white/75'}
                  role="tab"
                  type="button"
                  onClick={() => switchMode('login')}
                >
                  {t.login.login}
                </button>
                <button
                  aria-selected={mode === 'register'}
                  className={mode === 'register' ? 'rounded-lg bg-[var(--accent)]/15 px-3 py-2 text-sm font-bold text-white shadow-[inset_0_0_0_1px_rgb(255_110_105_/_0.35)]' : 'rounded-lg px-3 py-2 text-sm font-bold text-white/45 transition hover:text-white/75'}
                  role="tab"
                  type="button"
                  onClick={() => switchMode('register')}
                >
                  {t.login.register}
                </button>
              </div>
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
                {mode === 'login' ? <KeyRound size={17} /> : <UserRoundPlus size={17} />}
                {mode === 'login' ? t.login.login : t.login.register}
              </div>
              <h2 className="text-2xl font-black sm:text-3xl">{mode === 'login' ? t.login.headline : t.login.registerHeadline}</h2>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <label className="form-field">
                <span>{t.login.email}</span>
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
                <span>{t.login.password}</span>
                <input
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder={t.login.passwordPlaceholder}
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

              {registrationNotice ? (
                <div className="rounded-2xl border border-emerald-300/25 bg-emerald-400/[0.08] px-4 py-3 text-sm leading-6 text-emerald-50/90">
                  {registrationNotice}
                </div>
              ) : null}

              <button className="primary-button w-full justify-center py-4 text-base" disabled={isSubmitting} type="submit">
                {mode === 'login' ? <LogIn size={18} /> : <UserRoundPlus size={18} />}
                {isSubmitting ? t.login.submitting : mode === 'login' ? t.login.submit : t.login.registerSubmit}
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  )
}
