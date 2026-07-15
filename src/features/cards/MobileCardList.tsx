import { CalendarCheck2, CheckCircle2, Flame, LockKeyhole, LogOut, MoreHorizontal, Plus, Trash2, UsersRound, Zap } from 'lucide-react'
import { memo, useMemo, type CSSProperties } from 'react'
import { cn } from '../../lib/cn.ts'
import { useAuthStore } from '../auth/auth.store.ts'
import { useFeedbackStore } from '../feedback/feedback.store.ts'
import { LanguageToggle } from '../i18n/LanguageToggle.tsx'
import { useI18nStore } from '../i18n/i18n.store.ts'
import { translations } from '../i18n/translations.ts'
import { useCardStore } from './card.store.ts'
import { CardImageView } from './CardImageView.tsx'
import type { BoardFilter, BoardScope, Card, FilterCounts } from './card.types.ts'
import { boardFilters } from './card.utils.ts'
import { formatCountdown } from './countdown.ts'
import { formatCompletionDate } from './completion.ts'
import { getDeadlineVisualState } from './deadlineColor.ts'
import { useCompletionAnimation } from './useCompletionAnimation.ts'
import { ProjectList } from '../projects/ProjectList.tsx'
import type { Project, ProjectDeadlineSummary, ProjectMoveDirection } from '../projects/project.types.ts'
import { ProfileAvatar } from '../profile/ProfileAvatar.tsx'
import { useProfileStore } from '../profile/profile.store.ts'
import { defaultActiveColor, getFallbackNickname, type UserProfile } from '../profile/profile.types.ts'
import { AddMenu } from '../board/AddMenu.tsx'
import { TodoListBlock } from '../todos/TodoListBlock.tsx'
import type { TodoBlock, TodoItem } from '../todos/todo.types.ts'

type MobileCardListProps = {
  activeProjectId: string
  boardScope: BoardScope
  cards: Card[]
  todoBlocks: TodoBlock[]
  todoItems: TodoItem[]
  counts: FilterCounts
  error: string | null
  filter: BoardFilter
  isLoading: boolean
  now: number
  projects: Project[]
  projectCardCounts: Record<string, number>
  projectDeadlines: Record<string, ProjectDeadlineSummary | undefined>
  onCreate: () => void
  onCreateTodo: () => void
  onCreateProject: () => void
  onDeleteProject: (project: Project) => void
  onBoardScopeChange: (scope: BoardScope) => void
  onFilterChange: (filter: BoardFilter) => void
  onProjectChange: (projectId: string) => void
  onMoveProject: (project: Project, direction: ProjectMoveDirection) => void
  onLogout: () => void
  onOpenProfile: () => void
  onRetry: () => void
  profile: UserProfile | null
  userEmail: string | null
}

type CardStyle = CSSProperties & Record<`--${string}`, string | number>

type MobileDeadlineCardProps = {
  card: Card
  now: number
}

const MobileDeadlineCard = memo(function MobileDeadlineCard({ card, now }: MobileDeadlineCardProps) {
  const deleteCard = useCardStore((state) => state.deleteCard)
  const openEditEditor = useCardStore((state) => state.openEditEditor)
  const toggleCardActive = useCardStore((state) => state.toggleCardActive)
  const updateCard = useCardStore((state) => state.updateCard)
  const userId = useAuthStore((state) => state.user?.id ?? null)
  const confirm = useFeedbackStore((state) => state.confirm)
  const language = useI18nStore((state) => state.language)
  const t = translations[language]
  const activeProfile = useProfileStore((state) =>
    card.activeBy ? state.profiles[card.activeBy] ?? null : null,
  )
  const completedProfile = useProfileStore((state) =>
    card.completedBy ? state.profiles[card.completedBy] ?? null : null,
  )
  const visual = getDeadlineVisualState(card.deadlineAt, card.status, now, language)
  const countdown = formatCountdown(card.deadlineAt, card.status, now, language)
  const isCompleting = useCompletionAnimation(card.status === 'done')
  const activeColor = activeProfile?.activeColor ?? defaultActiveColor
  const activeOwnerName = activeProfile?.nickname ?? t.card.activeOwnerUnknown
  const activeActionLabel =
    card.isActive && card.activeBy === userId
      ? t.card.deactivate
      : card.isActive
        ? t.card.takeActivity
        : t.card.activate
  const completionDate = formatCompletionDate(card.completedAt, language)
  const completedOwnerName = completedProfile?.nickname ?? t.card.activeOwnerUnknown
  const completedOwnerColor = completedProfile?.activeColor ?? defaultActiveColor
  const style: CardStyle = {
    '--active-color': activeColor,
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
        card.isActive && 'deadline-card-active',
        isCompleting && 'deadline-card-completed',
      )}
      style={style}
    >
      {card.isActive ? <span aria-hidden="true" className="deadline-card-active-rim" /> : null}
      <div className="deadline-card-content relative z-10">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--deadline-border)]/70 bg-black/30 text-[var(--deadline-text)]">
            {card.status === 'done' ? <CheckCircle2 size={19} /> : <Flame size={19} />}
          </div>
          <div className="flex items-center gap-2">
            <button
              aria-label={activeActionLabel}
              aria-pressed={card.isActive}
              className="icon-button mobile-active-toggle h-10 w-10"
              data-active={card.isActive ? 'true' : 'false'}
              title={activeActionLabel}
              type="button"
              disabled={card.status === 'done'}
              onClick={() => toggleCardActive(card.id, userId).catch(() => undefined)}
            >
              <Zap fill={card.isActive ? 'currentColor' : 'none'} size={18} />
            </button>
            <button
              aria-label={t.card.edit}
              className="icon-button h-10 w-10"
              type="button"
              onClick={() => openEditEditor(card.id)}
            >
              <MoreHorizontal size={18} />
            </button>
          </div>
        </div>

        {card.isActive ? (
          <div className="deadline-card-active-owner mobile-active-owner">
            <ProfileAvatar avatarPath={activeProfile?.avatarPath} color={activeColor} name={activeOwnerName} size={22} />
            <Zap fill="currentColor" size={13} />
            <span>{t.card.activeBy(activeOwnerName)}</span>
          </div>
        ) : null}

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

        {card.status === 'done' ? (
          <div className="mobile-completion-date">
            <ProfileAvatar
              avatarPath={completedProfile?.avatarPath}
              className={cn(isCompleting && 'completion-avatar-pulse')}
              color={completedOwnerColor}
              name={completedOwnerName}
              size={21}
            />
            <CalendarCheck2 size={14} />
            <span>
              {completionDate
                ? t.card.completedBy(completedOwnerName, completionDate)
                : t.card.completionUnknown}
            </span>
          </div>
        ) : null}

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
  todoBlocks,
  todoItems,
  counts,
  error,
  filter,
  isLoading,
  now,
  projects,
  projectCardCounts,
  projectDeadlines,
  onCreate,
  onCreateTodo,
  onCreateProject,
  onDeleteProject,
  onBoardScopeChange,
  onFilterChange,
  onProjectChange,
  onMoveProject,
  onLogout,
  onOpenProfile,
  onRetry,
  profile,
  userEmail,
}: MobileCardListProps) {
  const language = useI18nStore((state) => state.language)
  const t = translations[language]
  const profileName = profile?.nickname ?? getFallbackNickname(userEmail, t.profile.memberFallback)
  const profileColor = profile?.activeColor ?? defaultActiveColor
  const itemsByBlock = useMemo(() => {
    const grouped = new Map<string, TodoItem[]>()
    for (const item of todoItems) {
      const current = grouped.get(item.blockId)
      if (current) current.push(item)
      else grouped.set(item.blockId, [item])
    }
    return grouped
  }, [todoItems])
  const hasEntries = cards.length > 0 || todoBlocks.length > 0

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
              <button
                aria-label={t.profile.openSettings}
                className="mobile-profile-trigger"
                title={userEmail ?? profileName}
                type="button"
                onClick={onOpenProfile}
              >
                <ProfileAvatar avatarPath={profile?.avatarPath} color={profileColor} name={profileName} size={20} />
                <span>{profileName}</span>
              </button>
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

      {!isLoading && !error && !hasEntries ? (
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
        {todoBlocks.map((block) => (
          <TodoListBlock
            block={block}
            items={itemsByBlock.get(block.id) ?? []}
            key={`todo:${block.id}`}
            now={now}
          />
        ))}
        {cards.map((card) => (
          <MobileDeadlineCard card={card} key={card.id} now={now} />
        ))}
      </section>

      {!isLoading && !error && hasEntries ? (
        <AddMenu
          allowText={false}
          className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-30"
          mobile
          onAddCard={onCreate}
          onAddTodo={onCreateTodo}
        />
      ) : null}
    </main>
  )
}
