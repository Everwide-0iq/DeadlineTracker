import { Bell, BellRing } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import type { Card } from '../cards/card.types.ts'
import { useI18nStore } from '../i18n/i18n.store.ts'
import { useReminderStore } from './reminder.store.ts'
import { reminderCopy } from './reminder.copy.ts'
import './reminder.css'

const ReminderDialog = lazy(() => import('./ReminderDialog.tsx'))
export function ReminderButton({
  card,
  className = 'icon-button h-9 w-9',
}: {
  card: Card
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const pending = useReminderStore(
    (s) =>
      s.data?.reminders.some(
        (r) =>
          r.cardId === card.id &&
          ['pending', 'claimed', 'sending'].includes(r.status),
      ) ?? false,
  )
  const language = useI18nStore((s) => s.language)
  const t = reminderCopy[language]
  return (
    <span
      className="reminder-trigger"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      data-card-action="true"
    >
      <button
        className={`${className} reminder-bell`}
        data-scheduled={pending}
        type="button"
        aria-label={t.bell}
        title={card.status === 'done' ? t.done : t.bell}
        aria-pressed={pending}
        disabled={card.status === 'done'}
        onClick={() => setOpen(true)}
      >
        {pending ? <BellRing size={17} /> : <Bell size={17} />}
      </button>
      {open && (
        <Suspense fallback={null}>
          <ReminderDialog card={card} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </span>
  )
}
