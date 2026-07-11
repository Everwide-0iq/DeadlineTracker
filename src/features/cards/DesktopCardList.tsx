import { AlertTriangle, CheckCircle2, Clock3, Flame, MoreHorizontal, Plus, Trash2, Zap } from 'lucide-react'
import { memo, type CSSProperties } from 'react'
import { cn } from '../../lib/cn.ts'
import { useFeedbackStore } from '../feedback/feedback.store.ts'
import { useI18nStore } from '../i18n/i18n.store.ts'
import { translations } from '../i18n/translations.ts'
import { useCardStore } from './card.store.ts'
import { CardImageView } from './CardImageView.tsx'
import type { BoardScope, Card } from './card.types.ts'
import { formatCountdown } from './countdown.ts'
import { getDeadlineVisualState } from './deadlineColor.ts'
import { useCompletionAnimation } from './useCompletionAnimation.ts'

type DesktopCardListProps = {
  boardScope: BoardScope
  cards: Card[]
  error: string | null
  isLoading: boolean
  now: number
  onCreate: () => void
  onRetry: () => void
  viewKey: string
}

type RowStyle = CSSProperties & Record<`--${string}`, string | number>

type DeadlineListRowProps = {
  card: Card
  now: number
}

const DeadlineListRow = memo(function DeadlineListRow({ card, now }: DeadlineListRowProps) {
  const deleteCard = useCardStore((state) => state.deleteCard)
  const openEditEditor = useCardStore((state) => state.openEditEditor)
  const updateCard = useCardStore((state) => state.updateCard)
  const confirm = useFeedbackStore((state) => state.confirm)
  const language = useI18nStore((state) => state.language)
  const t = translations[language]
  const visual = getDeadlineVisualState(card.deadlineAt, card.status, now, language)
  const countdown = formatCountdown(card.deadlineAt, card.status, now, language)
  const isCompleting = useCompletionAnimation(card.status === 'done')
  const style: RowStyle = {
    '--deadline-bg': visual.backgroundColor,
    '--deadline-border': visual.borderColor,
    '--deadline-glow': visual.glowColor,
    '--deadline-text': visual.textColor,
  }

  const handleDelete = async () => {
    const confirmed = await confirm({
      confirmLabel: t.card.delete,
      description: t.card.deleteDescription(card.title),
      title: t.card.deleteTitle,
      tone: 'danger',
    })

    if (!confirmed) {
      return
    }

    await deleteCard(card.id).catch(() => undefined)
  }

  return (
    <article
      className={cn(
        'deadline-list-row group grid grid-cols-[minmax(0,1fr)_160px_228px] items-center gap-5 rounded-2xl border px-5 py-4 transition duration-200 2xl:grid-cols-[minmax(0,1fr)_190px_350px]',
        card.status === 'done' && 'opacity-65 saturate-50',
        card.isActive && 'deadline-list-row-active',
        isCompleting && 'deadline-list-row-completed',
      )}
      style={style}
    >
      <div className="flex min-w-0 items-center gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-[var(--deadline-border)]/70 bg-black/30 text-[var(--deadline-text)] shadow-[0_0_18px_var(--deadline-glow)]">
          {card.status === 'done' ? <CheckCircle2 size={21} /> : <Flame size={21} />}
        </div>
        {card.imagePath ? (
          <CardImageView
            alt={t.cardImage.previewAlt(card.title)}
            className="deadline-list-image"
            height={card.imageHeight}
            path={card.imagePath}
            width={card.imageWidth}
          />
        ) : null}
        <div className="min-w-0">
          <h3
            className={cn(
              'break-words text-lg font-black leading-snug text-white',
              card.status === 'done' && 'line-through text-white/55',
            )}
          >
            {card.title}
          </h3>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-white/42">
            {card.description || t.card.noDescription}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 text-[var(--deadline-text)]">
        <Clock3 size={20} />
        <span className="text-2xl font-black">{countdown}</span>
      </div>

      <div className="flex items-center justify-end gap-3">
        <span className="mr-1 hidden items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--deadline-text)] 2xl:flex">
          <span className="h-2 w-2 rounded-full bg-[var(--deadline-border)] shadow-[0_0_12px_var(--deadline-glow)]" />
          {visual.label}
        </span>
        <button
          aria-label={card.isActive ? t.card.deactivate : t.card.activate}
          aria-pressed={card.isActive}
          className="list-action-button card-active-list-button"
          data-active={card.isActive ? 'true' : 'false'}
          title={card.isActive ? t.card.deactivate : t.card.activate}
          type="button"
          onClick={() => updateCard(card.id, { isActive: !card.isActive }).catch(() => undefined)}
        >
          <Zap fill={card.isActive ? 'currentColor' : 'none'} size={17} />
        </button>
        <button
          aria-label={card.status === 'done' ? t.card.backToWork : t.card.markDone}
          className="list-action-button"
          type="button"
          onClick={() =>
            updateCard(card.id, { status: card.status === 'done' ? 'todo' : 'done' }).catch(
              () => undefined,
            )
          }
        >
          <CheckCircle2 size={18} />
        </button>
        <button
          aria-label={t.card.edit}
          className="list-action-button"
          type="button"
          onClick={() => openEditEditor(card.id)}
        >
          <MoreHorizontal size={18} />
        </button>
        <button
          aria-label={t.card.delete}
          className="list-action-button text-red-200 hover:border-red-300/50 hover:bg-red-500/10"
          type="button"
          onClick={handleDelete}
        >
          <Trash2 size={17} />
        </button>
      </div>
    </article>
  )
})

export function DesktopCardList({
  boardScope,
  cards,
  error,
  isLoading,
  now,
  onCreate,
  onRetry,
  viewKey,
}: DesktopCardListProps) {
  const language = useI18nStore((state) => state.language)
  const t = translations[language]

  return (
    <main className="relative min-h-0 flex-1 overflow-hidden rounded-[28px] border border-white/10 bg-[#05070b]/95 shadow-2xl">
      <div className="relative z-10 flex h-full flex-col">
        <header className="flex items-center justify-between border-b border-white/10 px-7 py-5">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
              {boardScope === 'personal' ? t.board.personalList : t.board.deadlineList}
            </p>
            <h2 className="text-2xl font-black text-white">
              {boardScope === 'personal' ? t.board.personalOverview : t.board.quickOverview}
            </h2>
          </div>
          <button className="primary-button" type="button" onClick={onCreate}>
            <Plus size={18} />
            {t.common.createCard}
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="mission-state-card rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-white/60">
              {t.board.loading}
            </div>
          ) : null}

          {!isLoading && error ? (
            <div className="mission-state-card mx-auto mt-28 max-w-md rounded-3xl border border-red-400/30 bg-red-500/10 p-6 text-center text-red-50 shadow-glow">
              <AlertTriangle className="mx-auto mb-3 text-red-300" />
              <h2 className="mb-2 text-xl font-bold">{t.board.failedCards}</h2>
              <p className="mb-5 text-sm leading-6 text-red-100/75">{error}</p>
              <button className="primary-button mx-auto" type="button" onClick={onRetry}>
                {t.common.retry}
              </button>
            </div>
          ) : null}

          {!isLoading && !error && cards.length === 0 ? (
            <div className="mission-state-card mx-auto mt-28 max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-7 text-center text-white">
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)] shadow-glow">
                <Plus size={26} />
              </div>
              <h2 className="mb-2 text-2xl font-black">
                {boardScope === 'personal' ? t.board.addFirstPersonal : t.board.addFirstCard}
              </h2>
              <p className="mb-5 text-sm leading-6 text-white/50">
                {boardScope === 'personal'
                  ? t.board.personalListEmptyDescription
                  : t.board.listEmptyDescription}
              </p>
              <button className="primary-button mx-auto" type="button" onClick={onCreate}>
                <Plus size={18} />
                {t.common.createCard}
              </button>
            </div>
          ) : null}

          {!isLoading && !error && cards.length > 0 ? (
            <section className="deadline-list-transition space-y-3" key={viewKey}>
              {cards.map((card) => (
                <DeadlineListRow card={card} key={card.id} now={now} />
              ))}
            </section>
          ) : null}
        </div>
      </div>
    </main>
  )
}
