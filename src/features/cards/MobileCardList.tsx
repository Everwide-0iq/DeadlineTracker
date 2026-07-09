import { CheckCircle2, Flame, LockKeyhole, LogOut, MoreHorizontal, Plus, Trash2, UsersRound } from 'lucide-react'
import { memo, type CSSProperties } from 'react'
import { cn } from '../../lib/cn.ts'
import { useFeedbackStore } from '../feedback/feedback.store.ts'
import { LanguageToggle } from '../i18n/LanguageToggle.tsx'
import { useI18nStore } from '../i18n/i18n.store.ts'
import { translations } from '../i18n/translations.ts'
import { useCardStore } from './card.store.ts'
import { CardImageView } from './CardImageView.tsx'
import type { BoardFilter, BoardScope, Card, FilterCounts } from './card.types.ts'
import { boardFilters } from './card.utils.ts'
import { formatCountdown } from './countdown.ts'
import { getDeadlineVisualState } from './deadlineColor.ts'
import { useCompletionAnimation } from './useCompletionAnimation.ts'
import { ProjectList } from '../projects/ProjectList.tsx'
import type { Project, ProjectDeadlineSummary, ProjectMoveDirection } from '../projects/project.types.ts'

type MobileCardListProps = {
  activeProjectId: string
  boardScope: BoardScope
  cards: Card[]
  counts: FilterCounts
  error: string | null
  filter: BoardFilter
  isLoading: boolean
  now: number
  projects: Project[]
  projectCardCounts: Record<string, number>
  projectDeadlines: Record<string, ProjectDeadlineSummary | undefined>
  onCreate: () => void
  onCreateProject: () => void
  onDeleteProject: (project: Project) => void
  onBoardScopeChange: (scope: BoardScope) => void
  onFilterChange: (filter: BoardFilter) => void
  onProjectChange: (projectId: string) => void
  onMoveProject: (project: Project, direction: ProjectMoveDirection) => void
  onLogout: () => void
  onRetry: () => void
}

type CardStyle = CSSProperties & Record<`--${string}`, string | number>

type MobileDeadlineCardProps = {
  card: Card
  now: number
}

const MobileDeadlineCard = memo(function MobileDeadlineCard({ card, now }: MobileDeadlineCardProps) {
  const deleteCard = useCardStore((state) => state.deleteCard)
  const openEditEditor = useCardStore((state) => state.openEditEditor)
  const updateCard = useCardStore((state) => state.updateCard)
  const confirm = useFeedbackStore((state) => state.confirm)
  const language = useI18nStore((state) => state.language)
  const t = translations[language]
  const visual = getDeadlineVisualState(card.deadlineAt, card.status, now, language)
  const countdown = formatCountdown(card.deadlineAt, card.status, now, language)
  const isCompleting = useCompletionAnimation(card.status === 'done')
  const style: CardStyle = {
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
        'deadline-card relative rounded-[18px] border p-4',
        card.status === 'done' && 'deadline-card-done',
        isCompleting && 'deadline-card-completed',
      )}
      style={style}
    >
      <div className="relative z-10">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--deadline-border)]/70 bg-black/30 text-[var(--deadline-text)]">
            {card.status === 'done' ? <CheckCircle2 size={19} /> : <Flame size={19} />}
          </div>
          <button
            aria-label={t.card.edit}
            className="icon-button h-10 w-10"
            type="button"
            onClick={() => openEditEditor(card.id)}
          >
            <MoreHorizontal size={18} />
          </button>
        </div>

        <h3
          className={cn(
            'mb-2 whitespace-pre-wrap break-words text-xl font-black leading-tight text-white',
            card.status === 'done' && 'line-through text-white/55',
          )}
        >
          {card.title}
        </h3>
        {card.description ? (
          <p className="mb-4 whitespace-pre-wrap break-words text-sm leading-6 text-white/55">
            {card.description}
          </p>
        ) : null}

        {card.imagePath ? (
          <CardImageView
            alt={t.cardImage.previewAlt(card.title)}
            className="mobile-card-image mb-4"
            height={card.imageHeight}
            path={card.imagePath}
            width={card.imageWidth}
          />
        ) : null}

        <div className="mb-4 flex items-center gap-3 text-[var(--deadline-text)]">
          <span className="text-3xl font-black">{countdown}</span>
        </div>

        <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--deadline-text)]">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--deadline-border)] shadow-[0_0_12px_var(--deadline-glow)]" />
          {visual.label}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            className="secondary-button justify-center"
            type="button"
            onClick={() => updateCard(card.id, { status: card.status === 'done' ? 'todo' : 'done' }).catch(() => undefined)}
          >
            <CheckCircle2 size={17} />
            {card.status === 'done' ? t.card.statusTodo : t.card.done}
          </button>
          <button className="secondary-button justify-center text-red-100" type="button" onClick={handleDelete}>
            <Trash2 size={17} />
            {t.card.delete}
          </button>
        </div>
      </div>
    </article>
  )
})

export function MobileCardList({
  activeProjectId,
  boardScope,
  cards,
  counts,
  error,
  filter,
  isLoading,
  now,
  projects,
  projectCardCounts,
  projectDeadlines,
  onCreate,
  onCreateProject,
  onDeleteProject,
  onBoardScopeChange,
  onFilterChange,
  onProjectChange,
  onMoveProject,
  onLogout,
  onRetry,
}: MobileCardListProps) {
  const language = useI18nStore((state) => state.language)
  const t = translations[language]

  return (
    <main className="app-shell min-h-screen bg-[var(--background)] px-4 pb-44 pt-4 text-white">
      <header className="sticky top-0 z-20 -mx-4 mb-4 border-b border-white/10 bg-[var(--background)]/90 px-4 pb-4 pt-2 backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--accent)]/12 text-[var(--accent)] shadow-glow">
              <Flame size={27} fill="currentColor" />
            </div>
            <div>
              <h1 className="text-2xl font-black">Fireboard</h1>
              <p className="text-xs text-white/40">
                {boardScope === 'personal' ? t.mobile.personalCards : t.mobile.cards}: {counts.all}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle className="h-11 px-2" />
            <button aria-label={t.sidebar.logout} className="icon-button h-11 w-11" type="button" onClick={onLogout}>
              <LogOut size={19} />
            </button>
          </div>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.035] p-1.5">
          <button
            className={cn('view-toggle-button', boardScope === 'shared' && 'view-toggle-button-active')}
            type="button"
            onClick={() => onBoardScopeChange('shared')}
          >
            <UsersRound size={17} />
            {t.sidebar.team}
          </button>
          <button
            className={cn('view-toggle-button', boardScope === 'personal' && 'view-toggle-button-active')}
            type="button"
            onClick={() => onBoardScopeChange('personal')}
          >
            <LockKeyhole size={17} />
            {t.sidebar.personal}
          </button>
        </div>

        {boardScope === 'shared' ? (
          <ProjectList
            activeProjectId={activeProjectId}
            counts={projectCardCounts}
            deadlines={projectDeadlines}
            projects={projects}
            variant="mobile"
            onCreate={onCreateProject}
            onDelete={onDeleteProject}
            onMove={onMoveProject}
            onSelect={onProjectChange}
          />
        ) : null}

        <div className="scrollbar-hidden -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {boardFilters.map((item) => (
            <button
              className={cn('mobile-filter-chip', filter === item.id && 'mobile-filter-chip-active')}
              key={item.id}
              type="button"
              onClick={() => onFilterChange(item.id)}
            >
              {t.filters[item.id]}
              <span>{counts[item.id]}</span>
            </button>
          ))}
        </div>
      </header>

      {isLoading ? (
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-white/60">
          {t.board.loading}
        </div>
      ) : null}

      {!isLoading && error ? (
        <div className="rounded-3xl border border-red-400/25 bg-red-500/10 p-5 text-red-50">
          <h2 className="mb-2 text-xl font-bold">{t.board.failedCards}</h2>
          <p className="mb-4 text-sm leading-6 text-red-100/75">{error}</p>
          <button className="primary-button" type="button" onClick={onRetry}>
            {t.common.retry}
          </button>
        </div>
      ) : null}

      {!isLoading && !error && cards.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-center">
          <h2 className="mb-2 text-2xl font-black">
            {boardScope === 'personal' ? t.board.addFirstPersonal : t.board.addFirstCard}
          </h2>
          <p className="mb-5 text-sm leading-6 text-white/50">
            {boardScope === 'personal'
              ? t.mobile.emptyPersonalDescription
              : t.mobile.emptySharedDescription}
          </p>
          <button className="primary-button mx-auto" type="button" onClick={onCreate}>
            <Plus size={18} />
            {t.common.createCard}
          </button>
        </div>
      ) : null}

      <section className="space-y-4">
        {cards.map((card) => (
          <MobileDeadlineCard card={card} key={card.id} now={now} />
        ))}
      </section>

      {!isLoading && !error && cards.length > 0 ? (
        <button
          aria-label={boardScope === 'personal' ? t.mobile.newTask : t.mobile.newCard}
          className="mobile-create-button fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-30 flex -translate-x-1/2 items-center gap-2.5 rounded-full px-4 py-3 text-sm font-black text-white"
          type="button"
          onClick={onCreate}
        >
          <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-[var(--accent)] shadow-[0_0_18px_rgb(255_255_255_/_0.16)]">
            <Plus size={21} strokeWidth={3} />
          </span>
          <span className="whitespace-nowrap">{boardScope === 'personal' ? t.mobile.newTask : t.mobile.newCard}</span>
        </button>
      ) : null}
    </main>
  )
}
