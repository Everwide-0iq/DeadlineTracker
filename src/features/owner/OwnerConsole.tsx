import { KeyRound, Loader2, LockKeyhole, Maximize2, ShieldCheck, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useDialogFocus } from '../../lib/useDialogFocus.ts'
import { useAuthStore } from '../auth/auth.store.ts'
import { useI18nStore } from '../i18n/i18n.store.ts'
import { useFeedbackStore } from '../feedback/feedback.store.ts'
import { lockOwner, ownerStatus, unlockOwner, type OwnerStatus } from './owner.api.ts'
import { ownerCopy } from './owner.copy.ts'
import { OwnerData } from './OwnerData.tsx'
import './owner.css'

export default function OwnerConsole({ onClose, userId }: { onClose: () => void; userId: string }) {
  const language = useI18nStore(s => s.language)
  const currentUser = useAuthStore(s => s.user?.id)
  const t = ownerCopy[language]
  const [status, setStatus] = useState<OwnerStatus | null>(null)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [wide, setWide] = useState(false)
  const [error, setError] = useState<'error' | 'incorrect' | 'lockError' | null>(null)
  const [now, setNow] = useState(Date.now)
  const generation = useRef(0)
  const mounted = useRef(true)
  const invalidate = useCallback(() => { generation.current++ }, [])
  const copy = useRef(t)
  copy.current = t
  const unlocked = Boolean(status?.isOwner && status.unlockedUntil && Date.parse(status.unlockedUntil) > now)
  const lease = useRef(false)
  lease.current = unlocked
  const blocked = Boolean(status?.blockedUntil && Date.parse(status.blockedUntil) > now)
  const lock = useCallback(async () => {
    invalidate()
    lease.current = false
    setStatus(null); setPin(''); setError(null); setBusy(true)
    try { await lockOwner() }
    catch {
      if (mounted.current) setError('lockError')
      else useFeedbackStore.getState().pushToast({ title: copy.current.lock, description: copy.current.lockError, tone: 'danger' })
    }
    finally { if (mounted.current) setBusy(false) }
  }, [invalidate])
  const handleLocked = useCallback(() => { void lock() }, [lock])
  const release = useCallback(() => {
    mounted.current = false
    invalidate()
    if (lease.current) {
      lease.current = false
      void lockOwner().catch(() => useFeedbackStore.getState().pushToast({ title: copy.current.lock, description: copy.current.lockError, tone: 'danger' }))
    }
  }, [invalidate])
  const close = () => { void lock(); onClose() }
  const dialogRef = useDialogFocus<HTMLElement>({ active: true, onEscape: close })
  useEffect(() => {
    mounted.current = true
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15_000)
    const version = generation.current
    void ownerStatus(controller.signal).then(value => {
      if (mounted.current && version === generation.current) setStatus(value)
    }).catch(() => { if (mounted.current && version === generation.current) setError('error') }).finally(() => window.clearTimeout(timeout))
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    const visibility = () => { if (document.hidden) void lock() }
    document.addEventListener('visibilitychange', visibility)
    return () => { release(); controller.abort(); window.clearTimeout(timeout); window.clearInterval(timer); document.removeEventListener('visibilitychange', visibility) }
  }, [lock, release])
  useEffect(() => { if (currentUser !== userId) { void lock(); onClose() } }, [currentUser, userId, lock, onClose])
  useEffect(() => {
    if (status?.unlockedUntil && Date.parse(status.unlockedUntil) <= now) void lock()
  }, [status, now, lock])
  // Revalidate the server lease, including revocation in another tab, without caching board data.
  useEffect(() => {
    if (!unlocked) return
    let active = true
    const timer = window.setInterval(() => {
      const version = generation.current
      void ownerStatus().then(value => { if (active && version === generation.current) setStatus(value) }).catch(() => { if (active && version === generation.current) void lock() })
    }, 15_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [unlocked, lock])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || blocked) return
    const version = generation.current
    setBusy(true); setError(null)
    const input = pin; setPin('')
    try {
      const value = await unlockOwner(input)
      if (!mounted.current || version !== generation.current) { await lockOwner(); return }
      setStatus(value); setNow(Date.now())
      if (!value.ok) setError('incorrect')
    } catch { if (mounted.current && version === generation.current) setError('error') }
    finally { if (mounted.current) setBusy(false) }
  }
  const remaining = Math.max(0, Math.ceil((Date.parse(status?.unlockedUntil ?? '') - now) / 1000))
  return createPortal(<div className="owner-backdrop"><section className={wide ? 'owner-dialog owner-dialog-wide' : 'owner-dialog'} role="dialog" aria-modal="true" aria-labelledby="owner-title" ref={dialogRef}>
    <header className="owner-header"><ShieldCheck size={24} /><div><span>FIREBOARD</span><h2 id="owner-title">{t.title}</h2></div>
      {unlocked && <><time>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</time><button className="icon-button" title={t.lock} aria-label={t.lock} onClick={() => void lock()}><LockKeyhole size={18} /></button></>}
      <button className="icon-button" title={t.maximize} aria-label={t.maximize} aria-pressed={wide} onClick={() => setWide(v => !v)}><Maximize2 size={18} /></button>
      <button className="icon-button" title={t.close} aria-label={t.close} onClick={close}><X size={20} /></button>
    </header>
    {unlocked ? <OwnerData t={t} onLocked={handleLocked} canManageAccess={status?.canManageAccess === true} /> : <form className="owner-gate" onSubmit={submit}>
      <LockKeyhole size={36} />
      <label className="form-field"><span>{t.pin}</span><input aria-label={t.pin} autoComplete="off" inputMode="numeric" type="password" pattern="[0-9]{4,12}" minLength={4} maxLength={12} required value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} /></label>
      {blocked && <p role="status">{t.blocked} {new Date(status!.blockedUntil!).toLocaleTimeString()}</p>}
      {error && <p className="owner-error" role="alert">{t[error]}</p>}
      <button className="primary-button" disabled={busy || blocked || pin.length < 4} type="submit">{busy ? <Loader2 size={17} className="animate-spin" /> : <KeyRound size={17} />}{t.unlock}</button>
      {error === 'lockError' && <button className="secondary-button" type="button" onClick={() => void lock()}>{t.retry}</button>}
    </form>}
  </section></div>, document.body)
}
