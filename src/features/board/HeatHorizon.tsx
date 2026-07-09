import { Clock3 } from 'lucide-react'
import { memo, useMemo } from 'react'
import type { Card } from '../cards/card.types.ts'
import { formatCountdown } from '../cards/countdown.ts'
import { useI18nStore } from '../i18n/i18n.store.ts'
import { translations } from '../i18n/translations.ts'

type HeatHorizonProps = {
  cards: Card[]
  now: number
}

type Segment = {
  count: number
  maxDays: number
  minDays: number
  tone: 'calm' | 'hot' | 'overdue' | 'warm'
}

const dayMs = 24 * 60 * 60 * 1000

const segments: Array<Omit<Segment, 'count'>> = [
  { maxDays: 0, minDays: Number.NEGATIVE_INFINITY, tone: 'overdue' },
  { maxDays: 2, minDays: 0, tone: 'hot' },
  { maxDays: 7, minDays: 2, tone: 'warm' },
  { maxDays: 30, minDays: 7, tone: 'calm' },
]

const getDaysLeft = (card: Card, now: number) => (new Date(card.deadlineAt).getTime() - now) / dayMs

function HeatHorizonComponent({ cards, now }: HeatHorizonProps) {
  const language = useI18nStore((state) => state.language)
  const t = translations[language]
  const activeCards = useMemo(
    () =>
      cards
        .filter((card) => card.status !== 'done')
        .map((card) => ({ card, daysLeft: getDaysLeft(card, now) }))
        .filter((item) => !Number.isNaN(item.daysLeft))
        .sort((left, right) => left.daysLeft - right.daysLeft),
    [cards, now],
  )

  const nearest = activeCards[0]?.card ?? null
  const countedSegments = segments.map((segment) => ({
    ...segment,
    count: activeCards.filter(
      ({ daysLeft }) => daysLeft >= segment.minDays && daysLeft < segment.maxDays,
    ).length,
  }))
  const maxCount = Math.max(1, ...countedSegments.map((segment) => segment.count))

  return (
    <aside className="heat-horizon pointer-events-auto absolute bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-3xl border border-white/10 bg-black/35 px-4 py-3 text-white backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/36">Heat Horizon</p>
          <h3 className="text-sm font-black text-white/88">{t.heatHorizon.title}</h3>
        </div>
        {nearest ? (
          <div className="flex min-w-0 items-center gap-2 text-[var(--accent)]">
            <Clock3 size={16} />
            <span className="truncate text-sm font-black text-white">{nearest.title}</span>
            <span className="shrink-0 text-sm font-black">{formatCountdown(nearest.deadlineAt, nearest.status, now, language)}</span>
          </div>
        ) : (
          <span className="text-sm font-semibold text-white/40">{t.heatHorizon.quiet}</span>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {countedSegments.map((segment) => (
          <div className="heat-horizon-segment" data-tone={segment.tone} key={segment.tone}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="truncate text-[11px] font-bold uppercase tracking-[0.12em] text-white/48">
                {t.heatHorizon[segment.tone]}
              </span>
              <span className="text-xs font-black text-white/80">{segment.count}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="heat-horizon-fill h-full rounded-full"
                style={{ width: `${Math.max(7, (segment.count / maxCount) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}

export const HeatHorizon = memo(HeatHorizonComponent)
