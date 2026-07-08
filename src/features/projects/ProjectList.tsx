import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, FolderKanban, Plus, Trash2 } from 'lucide-react'
import type { CSSProperties } from 'react'
import { cn } from '../../lib/cn.ts'
import { useI18nStore } from '../i18n/i18n.store.ts'
import { translations } from '../i18n/translations.ts'
import { defaultProjectId, type Project, type ProjectDeadlineSummary, type ProjectMoveDirection } from './project.types.ts'
import { getProjectDisplayName } from './project.utils.ts'

type ProjectListProps = {
  activeProjectId: string
  counts: Record<string, number>
  deadlines: Record<string, ProjectDeadlineSummary | undefined>
  onCreate: () => void
  onDelete: (project: Project) => void
  onMove: (project: Project, direction: ProjectMoveDirection) => void
  onSelect: (projectId: string) => void
  projects: Project[]
  variant: 'desktop' | 'mobile'
}

type ProjectStyle = CSSProperties & Record<`--${string}`, string | number>

function getProjectStyle(project: Project): ProjectStyle {
  return {
    '--project-color': project.color,
  }
}

export function ProjectList({
  activeProjectId,
  counts,
  deadlines,
  onCreate,
  onDelete,
  onMove,
  onSelect,
  projects,
  variant,
}: ProjectListProps) {
  const language = useI18nStore((state) => state.language)
  const t = translations[language]
  const movableProjects = projects.filter((project) => project.id !== defaultProjectId)

  if (variant === 'mobile') {
    return (
      <section className="mb-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-xs font-black uppercase tracking-[0.18em] text-white/35">{t.project.projects}</span>
          <button aria-label={t.project.create} className="icon-button h-9 w-9 rounded-full" type="button" onClick={onCreate}>
            <Plus size={17} />
          </button>
        </div>
        <div className="scrollbar-hidden -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {projects.map((project) => {
            const isActive = activeProjectId === project.id
            const canDelete = project.id !== defaultProjectId
            const deadline = deadlines[project.id]
            const movableIndex = movableProjects.findIndex((item) => item.id === project.id)
            const canMoveUp = movableIndex > 0
            const canMoveDown = movableIndex !== -1 && movableIndex < movableProjects.length - 1
            const displayName = getProjectDisplayName(project, t) ?? project.name

            return (
              <div
                className={cn('mobile-project-chip', isActive && 'mobile-project-chip-active')}
                key={project.id}
                style={getProjectStyle(project)}
              >
                <button className="flex min-w-0 items-center gap-2 px-3 py-2.5" type="button" onClick={() => onSelect(project.id)}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--project-color)] shadow-[0_0_12px_var(--project-color)]" />
                  <span className="max-w-32 truncate">{displayName}</span>
                  <span
                    className={cn('rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/55', deadline && 'text-[var(--deadline-color)]')}
                    style={deadline ? ({ '--deadline-color': deadline.color } as ProjectStyle) : undefined}
                  >
                    {deadline ? deadline.countdown : counts[project.id] ?? 0}
                  </span>
                </button>
                {isActive && canDelete ? (
                  <div className="mr-1 flex shrink-0 items-center gap-1">
                    <button
                      aria-label={t.project.moveUp(displayName)}
                      className="project-order-button h-8 w-8 rounded-full"
                      disabled={!canMoveUp}
                      type="button"
                      onClick={() => onMove(project, 'up')}
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <button
                      aria-label={t.project.moveDown(displayName)}
                      className="project-order-button h-8 w-8 rounded-full"
                      disabled={!canMoveDown}
                      type="button"
                      onClick={() => onMove(project, 'down')}
                    >
                      <ChevronRight size={15} />
                    </button>
                    <button
                      aria-label={t.project.delete(displayName)}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/45 transition hover:bg-red-500/15 hover:text-red-100"
                      type="button"
                      onClick={() => onDelete(project)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>
    )
  }

  return (
    <section className="mb-4 flex min-h-[132px] flex-1 flex-col">
      <div className="mb-2 flex items-center justify-between px-2">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-white/35">
          <FolderKanban size={15} />
          {t.project.projects}
        </div>
        <button aria-label={t.project.create} className="icon-button h-9 w-9 rounded-full" type="button" onClick={onCreate}>
          <Plus size={17} />
        </button>
      </div>

      <div className="sidebar-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto pr-1.5">
        {projects.map((project) => {
          const isActive = activeProjectId === project.id
          const canDelete = project.id !== defaultProjectId
          const deadline = deadlines[project.id]
          const movableIndex = movableProjects.findIndex((item) => item.id === project.id)
          const canMoveUp = movableIndex > 0
          const canMoveDown = movableIndex !== -1 && movableIndex < movableProjects.length - 1
          const displayName = getProjectDisplayName(project, t) ?? project.name

          return (
            <div
              className={cn('project-row group', isActive && 'project-row-active')}
              key={project.id}
              style={getProjectStyle(project)}
            >
              <button
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-3 px-2.5 py-2.5 pr-3 text-left transition-[padding] duration-200',
                  canDelete && 'group-hover:pr-24 group-focus-within:pr-24',
                )}
                type="button"
                onClick={() => onSelect(project.id)}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.035]">
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--project-color)] shadow-[0_0_16px_var(--project-color)]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="mb-1 flex min-w-0 items-center justify-between gap-2">
                    <span className="truncate text-sm font-black text-white">{displayName}</span>
                    {deadline ? (
                      <span
                        className="project-deadline-pill shrink-0"
                        style={{ '--deadline-color': deadline.color } as ProjectStyle}
                        title={deadline.label}
                      >
                        {deadline.countdown}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-white/35">
                    {deadline ? (
                      <>
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--deadline-color)] shadow-[0_0_10px_var(--deadline-color)]" style={{ '--deadline-color': deadline.color } as ProjectStyle} />
                        <span className="truncate">{deadline.title}</span>
                      </>
                    ) : (
                      <span>{t.project.cardsCount(counts[project.id] ?? 0)}</span>
                    )}
                  </span>
                </span>
              </button>
              {canDelete ? (
                <div className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5 opacity-0 transition duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                  <div className="flex flex-col gap-1">
                    <button
                      aria-label={t.project.moveUp(displayName)}
                      className="project-order-button"
                      disabled={!canMoveUp}
                      title={t.project.moveUp(displayName)}
                      type="button"
                      onClick={() => onMove(project, 'up')}
                    >
                      <ChevronUp size={13} />
                    </button>
                    <button
                      aria-label={t.project.moveDown(displayName)}
                      className="project-order-button"
                      disabled={!canMoveDown}
                      title={t.project.moveDown(displayName)}
                      type="button"
                      onClick={() => onMove(project, 'down')}
                    >
                      <ChevronDown size={13} />
                    </button>
                  </div>
                  <button
                    aria-label={t.project.delete(displayName)}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-white/10 bg-black/35 text-white/38 backdrop-blur-md transition hover:border-red-300/25 hover:bg-red-500/15 hover:text-red-100"
                    type="button"
                    onClick={() => onDelete(project)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
