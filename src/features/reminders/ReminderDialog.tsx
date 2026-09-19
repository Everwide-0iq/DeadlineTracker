import { BellRing, Clock3, Loader2, Plus, Save, Trash2, X } from 'lucide-react'
import {
  isReminderOffset,
  MAX_CARD_REMINDERS,
  MAX_REMINDER_NOTE_LENGTH,
  offsetLabel,
} from '../../../shared/reminders.ts'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useDialogFocus } from '../../lib/useDialogFocus.ts'
import type { Card } from '../cards/card.types.ts'
import { useI18nStore } from '../i18n/i18n.store.ts'
import { useFeedbackStore } from '../feedback/feedback.store.ts'
import { reminderCopy } from './reminder.copy.ts'
import {
  fromLocalInput,
  reminderOffsets,
  reminderTime,
  toLocalInput,
  type ReminderState,
} from './reminder.model.ts'
import { useReminderStore } from './reminder.store.ts'
import { TelegramConnection } from './TelegramConnection.tsx'

export default function ReminderDialog({
  card,
  onClose,
}: {
  card: Card
  onClose: () => void
}) {
  const language = useI18nStore((s) => s.language)
  const t = reminderCopy[language]
  const data = useReminderStore((s) => s.data)
  const dialog = useDialogFocus<HTMLElement>({
    active: true,
    onEscape: onClose,
  })
  useEffect(() => {
    void useReminderStore.getState().refresh()
  }, [])
  return createPortal(
    <div
      className="reminder-backdrop"
      data-card-action="true"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <section
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reminder-title"
        className="reminder-dialog"
      >
        <header className="reminder-header">
          <BellRing size={23} />
          <div>
            <span>{t.subtitle}</span>
            <h2 id="reminder-title">{t.title}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            title={t.close}
            aria-label={t.close}
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </header>
        <div className="reminder-body">
          <h3>{card.title}</h3>
          <TelegramConnection />
          {data && (
            <ReminderForm
              key={`${card.id}:${card.deadlineAt}:${card.status}`}
              card={card}
              data={data}
              onClose={onClose}
            />
          )}
        </div>
      </section>
    </div>,
    document.body,
  )
}

function ReminderForm({
  card,
  data,
  onClose,
}: {
  card: Card
  data: ReminderState
  onClose: () => void
}) {
  const language = useI18nStore((s) => s.language)
  const t = reminderCopy[language]
  const rows = data.reminders.filter((r) => r.cardId === card.id)
  const [absoluteMode, setAbsoluteMode] = useState(() =>
    rows.some((r) => r.slot === 9999),
  )
  const isCustom = !card.deadlineAt || absoluteMode
  const [amount, setAmount] = useState('2')
  const [unit, setUnit] = useState(1440)
  const [direction, setDirection] = useState(-1)
  const [note, setNote] = useState(() => rows[0]?.note ?? '')
  const [offsets, setOffsets] = useState<number[]>(() =>
    rows.filter((r) => r.slot !== 9999).map((r) => r.slot),
  )
  const [custom, setCustom] = useState(() =>
    rows.find((r) => r.slot === 9999)?.dueAt
      ? toLocalInput(rows.find((r) => r.slot === 9999)!.dueAt)
      : '',
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
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const format = (value: string) =>
    new Date(value).toLocaleString(language === 'ru' ? 'ru-RU' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  const save = async (remove = false) => {
    setError('')
    let customAt: string | null = null
    try {
      if (!remove) {
        if (isCustom) customAt = fromLocalInput(custom)
        const times = !isCustom
          ? offsets.map((n) => reminderTime(card.deadlineAt!, n))
          : [customAt!]
        if (
          !times.length ||
          times.some(
            (time) =>
              (Date.parse(time) <= Date.now() &&
                !rows.some(
                  (row) =>
                    Date.parse(row.dueAt) === Date.parse(time) &&
                    (isCustom ? row.slot === 9999 : offsets.includes(row.slot)),
                )) ||
              Date.parse(time) > Date.now() + 366 * 2 * 86400000,
          )
        )
          throw Error('time')
      }
    } catch {
      setError(t.invalid)
      return
    }
    setBusy(true)
    try {
      await useReminderStore
        .getState()
        .save(
          card.id,
          remove || isCustom ? [] : offsets,
          customAt,
          language,
          note,
        )
      if (alive.current) {
        useFeedbackStore
          .getState()
          .pushToast({ title: remove ? t.deleted : t.saved, tone: 'success' })
        onClose()
      }
    } catch {
      if (alive.current) setError(t.changed + ' ' + t.error)
    } finally {
      if (alive.current) setBusy(false)
    }
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void save()
  }
  const addOffset = () => {
    const value = Number(amount)
    const offset = value * unit * direction
    if (!Number.isInteger(value) || value <= 0 || !isReminderOffset(offset)) {
      setError(t.intervalInvalid)
      return
    }
    if (!offsets.includes(offset) && offsets.length >= MAX_CARD_REMINDERS) {
      setError(t.offsetLimit)
      return
    }
    if (Date.parse(reminderTime(card.deadlineAt!, offset)) <= Date.now()) {
      setError(t.invalid)
      return
    }
    setOffsets((current) =>
      [...new Set([...current, offset])].sort((a, b) => a - b),
    )
    setError('')
  }
  const displayedOffsets = [
    ...new Set<number>([...reminderOffsets, ...offsets]),
  ].sort((a, b) => a - b)
  return (
    <form onSubmit={submit} className="reminder-form">
      <fieldset
        disabled={
          busy ||
          !data.connected ||
          !data.schedulerReady ||
          card.status === 'done'
        }
      >
        {card.deadlineAt && (
          <div className="reminder-mode" role="group" aria-label={t.custom}>
            <button
              type="button"
              aria-pressed={!isCustom}
              onClick={() => setAbsoluteMode(false)}
            >
              {t.relativeMode}
            </button>
            <button
              type="button"
              aria-pressed={isCustom}
              onClick={() => setAbsoluteMode(true)}
            >
              {t.custom}
            </button>
          </div>
        )}
        {!isCustom ? (
          <>
            <div className="reminder-presets">
              {displayedOffsets.map((n) => {
                const at = reminderTime(card.deadlineAt!, n),
                  past = Date.parse(at) <= Date.now()
                return (
                  <label
                    key={n}
                    data-selected={offsets.includes(n)}
                    data-past={past}
                  >
                    <input
                      type="checkbox"
                      checked={offsets.includes(n)}
                      disabled={
                        !offsets.includes(n) &&
                        (past || offsets.length >= MAX_CARD_REMINDERS)
                      }
                      onChange={(e) =>
                        setOffsets((current) =>
                          e.target.checked
                            ? [...current, n]
                            : current.filter((v) => v !== n),
                        )
                      }
                    />
                    <span>
                      <strong>{offsetLabel(n, language)}</strong>
                      <small>{past ? t.past : format(at)}</small>
                    </span>
                    <Clock3 size={17} />
                  </label>
                )
              })}
            </div>
            <div className="reminder-offset-editor">
              <span>{t.ownInterval}</span>
              <div>
                <input
                  type="number"
                  aria-label={t.amount}
                  min="1"
                  max="43200"
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <select
                  aria-label={t.ownInterval}
                  value={unit}
                  onChange={(e) => setUnit(Number(e.target.value))}
                >
                  <option value={1}>{t.minutes}</option>
                  <option value={60}>{t.hours}</option>
                  <option value={1440}>{t.days}</option>
                </select>
                <button
                  className="icon-button"
                  type="button"
                  title={t.add}
                  aria-label={t.add}
                  onClick={addOffset}
                >
                  <Plus size={18} />
                </button>
              </div>
              <select
                aria-label={t.relativeMode}
                value={direction}
                onChange={(e) => setDirection(Number(e.target.value))}
              >
                <option value={-1}>{t.beforeDeadline}</option>
                <option value={1}>{t.afterDeadline}</option>
              </select>
              <p className="reminder-hint">{t.offsetLimit}</p>
            </div>
          </>
        ) : (
          <label className="form-field">
            <span>{t.custom}</span>
            <input
              type="datetime-local"
              required
              value={custom}
              min={toLocalInput(new Date().toISOString())}
              onChange={(e) => setCustom(e.target.value)}
            />
          </label>
        )}
        <label className="reminder-note">
          <span>
            <strong>{t.note}</strong>
            <small>
              {note.length}/{MAX_REMINDER_NOTE_LENGTH}
            </small>
          </span>
          <textarea
            rows={4}
            maxLength={MAX_REMINDER_NOTE_LENGTH}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t.notePlaceholder}
          />
        </label>
      </fieldset>
      <p className="reminder-zone">
        {t.timezone}: {zone}
      </p>
      {rows.length > 0 && (
        <div className="reminder-history">
          <h4>{t.schedule}</h4>
          {rows.map((r) => (
            <div key={r.id} data-status={r.status}>
              <span>{format(r.dueAt)}</span>
              <span>
                {t.statuses[r.status as keyof typeof t.statuses] ?? r.status}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="reminder-hint">{t.privacy}</p>
      <p className="reminder-hint">{t.precision}</p>
      {error && (
        <p role="alert" className="reminder-error">
          {error}
        </p>
      )}
      <footer>
        {rows.length > 0 && (
          <button
            className="icon-button"
            type="button"
            disabled={busy}
            aria-label={t.remove}
            title={t.remove}
            onClick={() => void save(true)}
          >
            <Trash2 size={17} />
          </button>
        )}
        <button type="button" className="secondary-button" onClick={onClose}>
          {t.cancel}
        </button>
        <button
          type="submit"
          className="primary-button"
          disabled={
            busy ||
            !data.connected ||
            !data.schedulerReady ||
            card.status === 'done' ||
            (!isCustom ? offsets.length === 0 : !custom)
          }
        >
          {busy ? (
            <Loader2 size={17} className="animate-spin" />
          ) : (
            <Save size={17} />
          )}{' '}
          {t.save}
        </button>
      </footer>
    </form>
  )
}
