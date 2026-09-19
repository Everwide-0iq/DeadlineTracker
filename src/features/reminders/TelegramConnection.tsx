import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  Send,
  Unplug,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { requireSupabase } from '../../lib/supabase.ts'
import { useFeedbackStore } from '../feedback/feedback.store.ts'
import { useI18nStore } from '../i18n/i18n.store.ts'
import { reminderCopy } from './reminder.copy.ts'
import { useReminderStore } from './reminder.store.ts'
import './reminder.css'
import { TelegramTest } from './TelegramTest.tsx'

export function TelegramConnection() {
  const data = useReminderStore((s) => s.data)
  const missing = useReminderStore((s) => s.missing)
  const loadError = useReminderStore((s) => s.error)
  const language = useI18nStore((s) => s.language)
  const t = reminderCopy[language]
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(
    null,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    if (!link || data?.connected) return
    const check = () => {
      if (Date.parse(link.expiresAt) <= Date.now()) {
        setLink(null)
        setError(t.linkExpired)
      } else if (!document.hidden) void useReminderStore.getState().refresh()
    }
    const timer = window.setInterval(check, 4000)
    return () => clearInterval(timer)
  }, [link, data?.connected, t.linkExpired])
  const connect = async () => {
    setBusy(true)
    setError('')
    try {
      const { data: result, error: failure } = await requireSupabase()
        .rpc('telegram_create_link')
        .abortSignal(AbortSignal.timeout(15_000))
      if (failure) throw failure
      if (
        !result ||
        typeof result !== 'object' ||
        Array.isArray(result) ||
        typeof result.url !== 'string' ||
        !/^https:\/\/t\.me\/[A-Za-z0-9_]+\?start=[a-f0-9]{64}$/.test(
          result.url,
        ) ||
        typeof result.expiresAt !== 'string'
      )
        throw Error('Invalid link')
      if (alive.current)
        setLink({ url: result.url, expiresAt: result.expiresAt })
    } catch (e) {
      if (alive.current)
        setError(
          typeof e === 'object' &&
            e !== null &&
            'code' in e &&
            e.code === 'P0001'
            ? t.wait
            : t.error,
        )
    } finally {
      if (alive.current) setBusy(false)
    }
  }
  const disconnect = async () => {
    if (
      !(await useFeedbackStore.getState().confirm({
        title: t.disconnect,
        description: t.disconnectConfirm,
        confirmLabel: t.disconnect,
        tone: 'danger',
      })) ||
      !alive.current
    )
      return
    setBusy(true)
    setError('')
    try {
      await useReminderStore.getState().disconnect()
      if (alive.current) setLink(null)
    } catch {
      if (alive.current) setError(t.error)
    } finally {
      if (alive.current) setBusy(false)
    }
  }
  return (
    <div className="telegram-connection">
      <div className="telegram-connection-heading">
        <Send size={19} />
        <strong>Telegram</strong>
        <button
          type="button"
          className="icon-button"
          aria-label={t.refresh}
          title={t.refresh}
          onClick={() => void useReminderStore.getState().refresh()}
        >
          <RefreshCw size={15} />
        </button>
      </div>
      {missing || data?.configured === false ? (
        <p className="reminder-notice" role="status">
          {t.setup}
        </p>
      ) : !data ? (
        <p role="status">
          {loadError ? t.error : <Loader2 className="animate-spin" size={18} />}
        </p>
      ) : data.connected ? (
        <div className="telegram-connected">
          <CheckCircle2 size={17} />
          <span>{t.connected}</span>
          <button
            className="icon-button"
            type="button"
            aria-label={t.disconnect}
            title={t.disconnect}
            disabled={busy}
            onClick={() => void disconnect()}
          >
            <Unplug size={16} />
          </button>
        </div>
      ) : link ? (
        <>
          <a
            className="secondary-button"
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={16} />
            {t.open}
          </a>
          <p>{t.linkHint}</p>
        </>
      ) : (
        <button
          className="secondary-button"
          type="button"
          disabled={busy}
          onClick={() => void connect()}
        >
          {busy ? (
            <Loader2 className="animate-spin" size={16} />
          ) : (
            <Send size={16} />
          )}{' '}
          {t.connect}
        </button>
      )}
      {data?.connected && <TelegramTest />}
      {data?.configured && !data.schedulerReady && (
        <p className="reminder-notice" role="status">
          {t.scheduler}
        </p>
      )}
      {error && (
        <p className="reminder-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
