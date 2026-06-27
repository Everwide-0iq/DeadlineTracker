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
  Plus,
  UsersRound,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { cn } from '../../lib/cn.ts'
import { boardFilters } from '../../features/cards/card.utils.ts'
import type { BoardFilter, BoardScope, FilterCounts } from '../../features/cards/card.types.ts'
import type { DesktopViewMode } from '../../features/board/board.types.ts'

type SidebarProps = {
  activeFilter: BoardFilter
  activeBoardScope: BoardScope
  counts: FilterCounts
  onBoardScopeChange: (scope: BoardScope) => void
  onCreate: () => void
  onFilterChange: (filter: BoardFilter) => void
  onLogout: () => void
  onViewModeChange: (mode: DesktopViewMode) => void
  userEmail: string | null
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
  counts,
  onBoardScopeChange,
  onCreate,
  onFilterChange,
  onLogout,
  onViewModeChange,
  userEmail,
  viewMode,
}: SidebarProps) {
  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col rounded-[28px] border border-white/10 bg-black/35 p-5 shadow-2xl backdrop-blur-xl">
      <div className="mb-8 flex items-center gap-3 px-2 pt-4">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--accent)]/12 text-[var(--accent)] shadow-glow">
          <Flame size={30} fill="currentColor" />
        </div>
        <div>
          <h1 className="text-3xl font-black tracking-normal text-white">Fireboard</h1>
          <p className="mt-1 max-w-40 truncate text-xs text-white/35">{userEmail ?? 'Общая доска'}</p>
        </div>
      </div>

      <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.035] p-1.5">
        <div className="grid grid-cols-2 gap-1.5">
          <button
            className={cn('view-toggle-button', activeBoardScope === 'shared' && 'view-toggle-button-active')}
            type="button"
            onClick={() => onBoardScopeChange('shared')}
          >
            <UsersRound size={17} />
            Команда
          </button>
          <button
            className={cn('view-toggle-button', activeBoardScope === 'personal' && 'view-toggle-button-active')}
            type="button"
            onClick={() => onBoardScopeChange('personal')}
          >
            <LockKeyhole size={17} />
            Личное
          </button>
        </div>
      </div>

      <button className="primary-button mb-5 w-full justify-center py-4 text-base" type="button" onClick={onCreate}>
        <Plus size={21} />
        {activeBoardScope === 'personal' ? 'Личная задача' : 'Новая карточка'}
      </button>

      <div className="mb-7 rounded-2xl border border-white/10 bg-white/[0.035] p-1.5">
        <div className="grid grid-cols-2 gap-1.5">
          <button
            className={cn('view-toggle-button', viewMode === 'board' && 'view-toggle-button-active')}
            type="button"
            onClick={() => onViewModeChange('board')}
          >
            <Grid2X2 size={17} />
            Доска
          </button>
          <button
            className={cn('view-toggle-button', viewMode === 'list' && 'view-toggle-button-active')}
            type="button"
            onClick={() => onViewModeChange('list')}
          >
            <List size={18} />
            Список
          </button>
        </div>
      </div>

      <div className="mb-4 px-2 text-xs font-bold uppercase tracking-[0.22em] text-white/35">Фильтры</div>
      <nav className="-mx-5 space-y-1">
        {boardFilters.map((filter) => {
          const Icon = filterIcons[filter.id]

          return (
            <button
              className={cn('sidebar-filter', activeFilter === filter.id && 'sidebar-filter-active')}
              key={filter.id}
              type="button"
              onClick={() => onFilterChange(filter.id)}
            >
              <span className="flex items-center gap-4">
                <Icon size={21} />
                {filter.label}
              </span>
              <span className="tabular-nums text-white/45">{counts[filter.id]}</span>
            </button>
          )
        })}
      </nav>

      <div className="mt-auto flex justify-end px-2">
        <button aria-label="Выйти" className="icon-button" type="button" onClick={onLogout}>
          <LogOut size={20} />
        </button>
      </div>
    </aside>
  )
}
