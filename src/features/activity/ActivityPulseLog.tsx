import { Activity, CheckCircle2, Clock3, GitBranch, PanelRightClose, Sparkles } from 'lucide-react'
import { cn } from '../../lib/cn.ts'
import type { BoardScope } from '../cards/card.types.ts'
import { useI18nStore } from '../i18n/i18n.store.ts'
import { translations } from '../i18n/translations.ts'
import { defaultProjectId } from '../projects/project.types.ts'
import { getActivitySentence, getActivityTone } from './activity.copy.ts'
import { useActivityStore } from './activity.store.ts'
import type { ActivityAction, ActivityEvent } from './activity.types.ts'

type ActivityPulseLogProps = {
  activeProjectId: string
  boardScope: BoardScope
  userId: string | null
}

const actionIcon: Partial<Record<ActivityAction, typeof Activity>> = {
  card_completed: CheckCircle2,
  card_created: Sparkles,
  card_reopened: Clock3,
  link_created: GitBranch,
}

function formatActivityTime(value: string, language: 'en' | 'ru') {
  const createdAt = new Date(value).getTime()

  if (Number.isNaN(createdAt)) {
    return language === 'ru' ? 'сейчас' : 'now'
  }

  const diffMinutes = Math.max(0, Math.floor((Date.now() - createdAt) / 60_000))

  if (diffMinutes < 1) {
    return language === 'ru' ? 'только что' : 'just now'
  }

  if (diffMinutes < 60) {
    return language === 'ru' ? `${diffMinutes} мин` : `${diffMinutes}m`
  }

  const diffHours = Math.floor(diffMinutes / 60)

  if (diffHours < 24) {
    return language === 'ru' ? `${diffHours} ч` : `${diffHours}h`
  }

  return language === 'ru' ? `${Math.floor(diffHours / 24)} д` : `${Math.floor(diffHours / 24)}d`
}

function isVisibleActivity(event: ActivityEvent, boardScope: BoardScope, activeProjectId: string) {
  if (event.action === 'card_moved') {
    return false
  }

  if (boardScope === 'personal') {
    return event.boardScope === 'personal'
  }

  return event.boardScope === 'shared' && (event.projectId ?? defaultProjectId) === activeProjectId
}

export function ActivityPulseLog({ activeProjectId, boardScope, userId }: ActivityPulseLogProps) {
  const language = useI18nStore((state) => state.language)
  const t = translations[language]
  const close = useActivityStore((state) => state.close)
  const error = useActivityStore((state) => state.error)
  const events = useActivityStore((state) => state.events)
  const isLoading = useActivityStore((state) => state.isLoading)
  const isOpen = useActivityStore((state) => state.isOpen)
  const toggle = useActivityStore((state) => state.toggle)
  const unreadCount = useActivityStore((state) => state.unreadCount)
  const visibleEvents = events
    .filter((event) => isVisibleActivity(event, boardScope, activeProjectId))
    .slice(0, 12)

  return (
    <aside className="activity-pulse-log hidden lg:block">
      <button
        aria-expanded={isOpen}
        className={cn('activity-log-trigger', unreadCount > 0 && 'activity-log-trigger-hot')}
        type="button"
        onClick={toggle}
      >
        <Activity size={18} />
        <span>{t.activity.journal}</span>
        {unreadCount > 0 ? <strong>{unreadCount}</strong> : null}
      </button>

      {isOpen ? (
        <section className="activity-log-panel">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
                Pulse Log
              </p>
              <h2 className="mt-1 text-lg font-black text-white">{t.activity.title}</h2>
            </div>
            <button aria-label={t.common.close} className="icon-button h-9 w-9" type="button" onClick={close}>
              <PanelRightClose size={17} />
            </button>
          </div>

          {isLoading ? <p className="activity-log-muted">{t.activity.loading}</p> : null}
          {!isLoading && error ? <p className="activity-log-muted text-red-100/75">{error}</p> : null}
          {!isLoading && !error && visibleEvents.length === 0 ? (
            <p className="activity-log-muted">{t.activity.empty}</p>
          ) : null}

          <div className="space-y-2">
            {visibleEvents.map((event) => {
              const Icon = actionIcon[event.action] ?? Activity
              const tone = getActivityTone(event)

              return (
                <article className="activity-event-row" data-tone={tone} key={event.id}>
                  <span className="activity-event-icon">
                    <Icon size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong>{getActivitySentence(event, userId, language)}</strong>
                    <small>{formatActivityTime(event.createdAt, language)}</small>
                  </span>
                </article>
              )
            })}
          </div>
        </section>
      ) : null}
    </aside>
  )
}
