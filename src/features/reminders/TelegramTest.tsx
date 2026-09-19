import { Loader2, Send } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useI18nStore } from '../i18n/i18n.store.ts'
import { reminderCopy } from './reminder.copy.ts'
import { useReminderStore } from './reminder.store.ts'

export function TelegramTest() {
  const data = useReminderStore((s) => s.data)
  const language = useI18nStore((s) => s.language)
  const t = reminderCopy[language]
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now)
  const alive = useRef(true)
  const status = data?.testDelivery?.status
  const pending = !!status && ['pending', 'claimed', 'sending'].includes(status)
  const availableAt = Date.parse(data?.testAvailableAt ?? '')
  const remaining = Math.max(0, Math.ceil((availableAt - now) / 1000)) || 0
  const coolingDown = remaining > 0
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    if (!Number.isFinite(availableAt) || availableAt <= Date.now()) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [availableAt, coolingDown])
  useEffect(() => {
    if (!pending) return
    const timer = window.setInterval(() => {
      if (!document.hidden) void useReminderStore.getState().refresh()
    }, 5000)
    return () => clearInterval(timer)
  }, [pending])
  const send = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await useReminderStore.getState().sendTest(language)
    } catch (failure) {
      if (alive.current)
        setError(
          typeof failure === 'object' &&
            failure !== null &&
            'code' in failure &&
            failure.code === 'P0001'
            ? t.testWait
            : t.error,
        )
      await useReminderStore.getState().refresh()
    } finally {
      if (alive.current) setBusy(false)
    }
  }
  return (
    <div className="telegram-test">
      <button
        className="secondary-button"
        type="button"
        onClick={() => void send()}
        disabled={
          busy ||
          pending ||
          remaining > 0 ||
          !data?.connected ||
          !data.schedulerReady
        }
      >
        {busy || pending ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Send size={16} />
        )}
        <span>{t.test}</span>
        {remaining > 0 && (
          <span className="telegram-test-countdown">{remaining}s</span>
        )}
      </button>
      {status && (
        <p role="status" data-status={status}>
          {pending
            ? t.testQueued
            : `${t.testStatus}: ${t.statuses[status as keyof typeof t.statuses] ?? status}`}
        </p>
      )}
      {error && (
        <p role="alert" className="reminder-error">
          {error}
        </p>
      )}
    </div>
  )
}
