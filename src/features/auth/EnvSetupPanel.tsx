import { ShieldAlert } from 'lucide-react'
import { getSupabaseEnvIssue } from '../../lib/env.ts'

export function EnvSetupPanel() {
  const issue = getSupabaseEnvIssue()

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] p-5 text-white">
      <section className="min-w-0 w-full max-w-2xl rounded-[28px] border border-white/10 bg-black/40 p-6 shadow-2xl backdrop-blur-xl">
        <div className="mb-5 flex items-center gap-3 text-[var(--accent)]">
          <ShieldAlert size={28} />
          <div>
            <h1 className="text-2xl font-black text-white">Не настроены переменные Supabase</h1>
            <p className="mt-1 text-sm text-white/50">{issue}</p>
          </div>
        </div>
        <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="mb-3 text-sm leading-6 text-white/60">
            Создай локальный файл <span className="font-semibold text-white">.env</span> в корне проекта:
          </p>
          <pre className="whitespace-pre-wrap break-all rounded-xl border border-white/10 bg-black/45 p-4 text-sm text-red-100">
{`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key`}
          </pre>
        </div>
        <p className="mt-4 text-sm leading-6 text-white/45">
          Приложение специально не показывает приватную доску, пока не настроен Supabase Auth.
        </p>
      </section>
    </main>
  )
}
