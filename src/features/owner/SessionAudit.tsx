import { useEffect } from 'react'
import { supabase } from '../../lib/supabase.ts'
import { useAuthStore } from '../auth/auth.store.ts'

export function SessionAudit() {
  const userId = useAuthStore(s => s.user?.id)
  useEffect(() => {
    if (!userId || !supabase) return
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15_000)
    void Promise.resolve(supabase.rpc('record_app_session_audit').abortSignal(controller.signal)).then(({ error }) => {
      if (error && !controller.signal.aborted && error.code !== 'PGRST202' && error.code !== '42883') {
        // No response payloads, identities or session credentials in client logs.
        console.warn('Optional session audit unavailable.')
      }
    }).catch(() => {
      if (!controller.signal.aborted) console.warn('Optional session audit unavailable.')
    }).finally(() => window.clearTimeout(timeout))
    return () => { controller.abort(); window.clearTimeout(timeout) }
  }, [userId])
  return null
}
