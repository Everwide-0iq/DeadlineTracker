import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Flame,
  Grid2X2,
  List,
  LockKeyhole,
  LogOut,
  Settings2,
  UsersRound,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { cn } from '../../lib/cn.ts'
import { boardFilters } from '../../features/cards/card.utils.ts'
import type { BoardFilter, BoardScope, FilterCounts } from '../../features/cards/card.types.ts'
import { LanguageToggle } from '../../features/i18n/LanguageToggle.tsx'
import { useI18nStore } from '../../features/i18n/i18n.store.ts'
import { translations } from '../../features/i18n/translations.ts'
import type { DesktopViewMode } from '../../features/board/board.types.ts'
import { ProjectList } from '../../features/projects/ProjectList.tsx'
import type { Project, ProjectDeadlineSummary, ProjectMoveDirection } from '../../features/projects/project.types.ts'
import { ProfileAvatar } from '../../features/profile/ProfileAvatar.tsx'
import { defaultActiveColor, getFallbackNickname, type UserProfile } from '../../features/profile/profile.types.ts'
import { AddMenu } from '../../features/board/AddMenu.tsx'

type SidebarProps = {
  activeFilter: BoardFilter
  activeBoardScope: BoardScope
  activeProjectId: string
  counts: FilterCounts
  projectDeadlines: Record<string, ProjectDeadlineSummary | undefined>
  projects: Project[]
  projectCardCounts: Record<string, number>
  onBoardScopeChange: (scope: BoardScope) => void
  onCreate: () => void
  onCreateTodo: () => void
  onCreateProject: () => void
  onCreateText: () => void
  onDeleteProject: (project: Project) => void
  onFilterChange: (filter: BoardFilter) => void
  onLogout: () => void
  onOpenProfile: () => void
  onMoveProject: (project: Project, direction: ProjectMoveDirection) => void
  onProjectChange: (projectId: string) => void
  onViewModeChange: (mode: DesktopViewMode) => void
  userEmail: string | null
  profile: UserProfile | null
  viewMode: DesktopViewMode
}

const filterIcons: Record<BoardFilter, ComponentType<{ size?: number }>> = {
  all: Grid2X2,
  today: CalendarDays,
  week: Clock3,
  overdue: AlertCircle,
  done: CheckCircle2,
}

export function Sidebar({
  activeFilter,
  activeBoardScope,
  activeProjectId,
  counts,
  projectDeadlines,
  projects,
  projectCardCounts,
  onBoardScopeChange,
  onCreate,
  onCreateTodo,
  onCreateProject,
  onCreateText,
  onDeleteProject,
  onFilterChange,
  onLogout,
  onOpenProfile,
  onMoveProject,
  onProjectChange,
  onViewModeChange,
  userEmail,
  profile,
  viewMode,
}: SidebarProps) {
  const language = useI18nStore((state) => state.language)
  const t = translations[language]
  const profileName = profile?.nickname ?? getFallbackNickname(userEmail, t.profile.memberFallback)
  const profileColor = profile?.activeColor ?? defaultActiveColor

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col overflow-hidden rounded-[28px] border border-white/10 bg-black/35 p-5 shadow-2xl backdrop-blur-xl">
      <div className="mb-4 flex shrink-0 items-center gap-3 px-2 pt-2">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--accent)]/12 text-[var(--accent)] shadow-glow">
          <Flame size={30} fill="currentColor" />
        </div>
        <div className="min-w-0">
          <h1 className="text-3xl font-black tracking-normal text-white">Fireboard</h1>
          <button
            aria-label={t.profile.openSettings}
            className="sidebar-profile-trigger"
            title={userEmail ?? profileName}
            type="button"
            onClick={onOpenProfile}
          >
            <ProfileAvatar avatarPath={profile?.avatarPath} color={profileColor} name={profileName} size={22} />
            <span>{profileName}</span>
            <Settings2 size={12} />
          </button>
        </div>
      </div>

      <div className="mb-3 shrink-0 rounded-2xl border border-white/10 bg-white/[0.035] p-1.5">
        <div className="grid grid-cols-2 gap-1.5">
          <button
            className={cn('view-toggle-button', activeBoardScope === 'shared' && 'view-toggle-button-active')}
            type="button"
            onClick={() => onBoardScopeChange('shared')}
          >
            <UsersRound size={17} />
            {t.sidebar.team}
          </button>
          <button
            className={cn('view-toggle-button', activeBoardScope === 'personal' && 'view-toggle-button-active')}
            type="button"
            onClick={() => onBoardScopeChange('personal')}
          >
            <LockKeyhole size={17} />
            {t.sidebar.personal}
          </button>
        </div>
      </div>

      <AddMenu
        className="mb-3 shrink-0"
        onAddCard={onCreate}
        onAddText={onCreateText}
        onAddTodo={onCreateTodo}
      />

      {activeBoardScope === 'shared' ? (
        <ProjectList
          activeProjectId={activeProjectId}
          counts={projectCardCounts}
          deadlines={projectDeadlines}
          projects={projects}
          variant="desktop"
          onCreate={onCreateProject}
          onDelete={onDeleteProject}
          onMove={onMoveProject}
          onSelect={onProjectChange}
        />
      ) : null}

      <div className="mb-3 shrink-0 rounded-2xl border border-white/10 bg-white/[0.035] p-1.5">
        <div className="grid grid-cols-2 gap-1.5">
          <button
            className={cn('view-toggle-button', viewMode === 'board' && 'view-toggle-button-active')}
            type="button"
            onClick={() => onViewModeChange('board')}
          >
            <Grid2X2 size={17} />
            {t.sidebar.board}
          </button>
          <button
            className={cn('view-toggle-button', viewMode === 'list' && 'view-toggle-button-active')}
            type="button"
            onClick={() => onViewModeChange('list')}
          >
            <List size={18} />
            {t.sidebar.list}
          </button>
        </div>
      </div>

      <div className={cn('flex shrink-0 flex-col', activeBoardScope === 'personal' && 'mt-auto')}>
        <div className="mb-2 shrink-0 px-2 text-xs font-bold uppercase tracking-[0.22em] text-white/35">{t.sidebar.filters}</div>
        <nav className="-mx-5 space-y-0.5 pb-2">
          {boardFilters.map((filter) => {
            const Icon = filterIcons[filter.id]

            return (
              <button
                className={cn('sidebar-filter', activeFilter === filter.id && 'sidebar-filter-active')}
                key={filter.id}
                type="button"
                onClick={() => onFilterChange(filter.id)}
              >
                <span className="flex items-center gap-3">
                  <Icon size={18} />
                  {t.filters[filter.id]}
                </span>
                <span className="tabular-nums text-white/45">{counts[filter.id]}</span>
              </button>
            )
          })}
        </nav>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/[0.07] px-2 pt-3">
          <LanguageToggle className="h-10" />
          <button aria-label={t.sidebar.logout} className="icon-button" type="button" onClick={onLogout}>
            <LogOut size={20} />
          </button>
        </div>
      </div>
    </aside>
  )
}
