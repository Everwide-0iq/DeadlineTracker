import { ShieldAlert } from 'lucide-react'
import { getSupabaseEnvIssue } from '../../lib/env.ts'
import { LanguageToggle } from '../i18n/LanguageToggle.tsx'
import { useI18nStore } from '../i18n/i18n.store.ts'
import { translations } from '../i18n/translations.ts'

export function EnvSetupPanel() {
  const language = useI18nStore((state) => state.language)
  const t = translations[language]
  const issue = getSupabaseEnvIssue(language)

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] p-5 text-white">
      <LanguageToggle variant="floating" />
      <section className="min-w-0 w-full max-w-2xl rounded-[28px] border border-white/10 bg-black/40 p-6 shadow-2xl backdrop-blur-xl">
        <div className="mb-5 flex items-center gap-3 text-[var(--accent)]">
          <ShieldAlert size={28} />
          <div>
            <h1 className="text-2xl font-black text-white">{t.app.envTitle}</h1>
            <p className="mt-1 text-sm text-white/50">{issue}</p>
          </div>
        </div>
        <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="mb-3 text-sm leading-6 text-white/60">
            {t.app.envCreateFilePrefix}
            <span className="font-semibold text-white">.env</span>
            {t.app.envCreateFileSuffix}
          </p>
          <pre className="whitespace-pre-wrap break-all rounded-xl border border-white/10 bg-black/45 p-4 text-sm text-red-100">
{`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key`}
          </pre>
        </div>
        <p className="mt-4 text-sm leading-6 text-white/45">
          {t.app.envDescription}
        </p>
      </section>
    </main>
  )
}
