import { KeyRound, Loader2, ShieldCheck, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useFeedbackStore } from '../feedback/feedback.store.ts'
import { field, isLockedError, ownerAccess, type OwnerRow } from './owner.api.ts'
import type { OwnerCopy } from './owner.copy.ts'

export function OwnerAccess({ t, refresh, onLocked }: { t: OwnerCopy; refresh: number; onLocked: () => void }) {
  const [rows, setRows] = useState<OwnerRow[]>([])
  const [email, setEmail] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const alive = useRef(true)
  const locked = useRef(onLocked)
  locked.current = onLocked
  const confirm = useFeedbackStore(s => s.confirm)
  const toast = useFeedbackStore(s => s.pushToast)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    let current = true
    setLoading(true); setError(false)
    void ownerAccess('list').then(result => { if (current) setRows(result) }).catch(reason => {
      if (current) { if (isLockedError(reason)) locked.current(); else setError(true) }
    }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [refresh])
  const change = async (action: 'grant' | 'revoke', target: string) => {
    if (busy) return
    const accepted = await confirm({ title: action === 'grant' ? t.grant : t.revokeAccess, description: `${target}\n\n${action === 'grant' ? t.accessWarning : t.revokeAccessConfirm}`, confirmLabel: action === 'grant' ? t.grant : t.revokeAccess, tone: 'danger' })
    if (!accepted || !alive.current) return
    const submittedPin = pin
    setBusy(true); setError(false); setPin('')
    try {
      const next = await ownerAccess(action, target, action === 'grant' ? submittedPin : undefined)
      if (alive.current) { setRows(next); toast({ title: t.accessSaved, tone: 'success' }) }
    } catch (reason) { if (alive.current) { if (isLockedError(reason)) locked.current(); else setError(true) } }
    finally { if (alive.current) setBusy(false) }
  }
  const submit = (event: FormEvent) => { event.preventDefault(); void change('grant', email.trim()) }
  return <div className="owner-access-layout">
    <form className="owner-access-form" onSubmit={submit}>
      <ShieldCheck size={26} /><h3>{t.grant}</h3>
      <label className="form-field"><span>{t.email}</span><input type="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label className="form-field"><span>{t.delegatePin}</span><input type="password" autoComplete="new-password" inputMode="numeric" pattern="[0-9]{6,12}" required minLength={6} maxLength={12} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} /></label>
      <p>{t.accessWarning}</p><button className="primary-button" disabled={busy || loading} type="submit"><KeyRound size={17} />{t.grant}</button>
    </form>
    <section className="owner-access-members"><h3>{t.access}</h3>{loading ? <Loader2 className="animate-spin" /> : rows.length ? rows.map(row => <div className="owner-record owner-identity" key={field(row, 'id')}><div><strong>{field(row, 'nickname') || field(row, 'email')}</strong><p>{field(row, 'email')}</p></div><button className="icon-button" disabled={busy} title={t.revokeAccess} aria-label={t.revokeAccess} onClick={() => void change('revoke', field(row, 'email'))}><Trash2 size={17} /></button></div>) : <p>{t.empty}</p>}
      {error && <div className="owner-error" role="alert">{t.accessError}</div>}
    </section>
  </div>
}
