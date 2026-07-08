import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Sidebar } from '../components/sidebar/Sidebar.tsx'
import { ActivityPulseLog } from '../features/activity/ActivityPulseLog.tsx'
import { getActivityToast, getActivityTone } from '../features/activity/activity.copy.ts'
import { useActivityStore } from '../features/activity/activity.store.ts'
import { DesktopBoard } from '../features/board/DesktopBoard.tsx'
import { getBoardCenterPosition } from '../features/board/board.utils.ts'
import type { DesktopViewMode } from '../features/board/board.types.ts'
import { useBoardCamera } from '../features/board/useBoardCamera.ts'
import { useAuthStore } from '../features/auth/auth.store.ts'
import { useCardLinkStore } from '../features/cardLinks/cardLink.store.ts'
import { useCardStore } from '../features/cards/card.store.ts'
import { DesktopCardList } from '../features/cards/DesktopCardList.tsx'
import { MobileCardList } from '../features/cards/MobileCardList.tsx'
import type { BoardScope, Card } from '../features/cards/card.types.ts'
import { filterCards, getFilterCounts, sortCardsForMobile } from '../features/cards/card.utils.ts'
import { formatCountdown } from '../features/cards/countdown.ts'
import { getDeadlineVisualState } from '../features/cards/deadlineColor.ts'
import { useFeedbackStore } from '../features/feedback/feedback.store.ts'
import type { Language } from '../features/i18n/i18n.types.ts'
import { useI18nStore } from '../features/i18n/i18n.store.ts'
import { translations } from '../features/i18n/translations.ts'
import { useProjectStore } from '../features/projects/project.store.ts'
import {
  defaultProjectId,
  type Project,
  type ProjectDeadlineSummary,
  type ProjectMoveDirection,
} from '../features/projects/project.types.ts'
import { useMediaQuery } from '../lib/useMediaQuery.ts'
import { readStorageValue, writeStorageValue } from '../lib/storage.ts'

const CardEditor = lazy(() =>
  import('../features/cards/CardEditor.tsx').then((module) => ({ default: module.CardEditor })),
)
const ProjectEditor = lazy(() =>
  import('../features/projects/ProjectEditor.tsx').then((module) => ({ default: module.ProjectEditor })),
)

const quietActivityActions = new Set(['card_moved', 'card_updated', 'project_updated'])

function ModalFallback() {
  const language = useI18nStore((state) => state.language)
  const t = translations[language]

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-5 text-white backdrop-blur-sm">
      <div className="mission-state-card rounded-3xl border border-white/10 bg-black/55 px-6 py-5 text-sm font-semibold text-white/60 shadow-glow">
        {t.app.loadingEditor}
      </div>
    </div>
  )
}

function getProjectDeadlineSummaries(cards: Card[], now: number, language: Language) {
  const nearestByProject = cards.reduce<Record<string, Card>>((acc, card) => {
    if (card.status === 'done') {
      return acc
    }

    const deadlineTime = new Date(card.deadlineAt).getTime()

    if (Number.isNaN(deadlineTime)) {
      return acc
    }

    const projectId = card.projectId ?? defaultProjectId
    const current = acc[projectId]

    if (!current || deadlineTime < new Date(current.deadlineAt).getTime()) {
      acc[projectId] = card
    }

    return acc
  }, {})

  return Object.fromEntries(
    Object.entries(nearestByProject).map<[string, ProjectDeadlineSummary]>(([projectId, card]) => {
      const visual = getDeadlineVisualState(card.deadlineAt, card.status, now, language)

      return [
        projectId,
        {
          color: visual.textColor,
          countdown: formatCountdown(card.deadlineAt, card.status, now, language),
          label: visual.label,
          title: card.title,
        },
      ]
    }),
  )
}

export function BoardPage() {
  const { camera, resetCamera, setCamera, zoomBy } = useBoardCamera()
  const [desktopViewMode, setDesktopViewMode] = useState<DesktopViewMode>(() => {
    const stored = readStorageValue('fireboard.desktopViewMode')
    return stored === 'list' ? 'list' : 'board'
  })
  const [activeBoardScope, setActiveBoardScope] = useState<BoardScope>(() => {
    const stored = readStorageValue('fireboard.activeBoardScope')
    return stored === 'personal' ? 'personal' : 'shared'
  })
  const [activeProjectId, setActiveProjectId] = useState(() => {
    return readStorageValue('fireboard.activeProjectId') ?? defaultProjectId
  })
  const [isProjectEditorOpen, setIsProjectEditorOpen] = useState(false)
  const cards = useCardStore((state) => state.cards)
  const error = useCardStore((state) => state.error)
  const filter = useCardStore((state) => state.filter)
  const isLoading = useCardStore((state) => state.isLoading)
  const loadCards = useCardStore((state) => state.loadCards)
  const now = useCardStore((state) => state.now)
  const openCreateEditor = useCardStore((state) => state.openCreateEditor)
  const editor = useCardStore((state) => state.editor)
  const selectedCardId = useCardStore((state) => state.selectedCardId)
  const setFilter = useCardStore((state) => state.setFilter)
  const subscribeRealtime = useCardStore((state) => state.subscribeRealtime)
  const linkError = useCardLinkStore((state) => state.error)
  const links = useCardLinkStore((state) => state.links)
  const loadLinks = useCardLinkStore((state) => state.loadLinks)
  const subscribeLinkRealtime = useCardLinkStore((state) => state.subscribeRealtime)
  const createProject = useProjectStore((state) => state.createProject)
  const deleteProject = useProjectStore((state) => state.deleteProject)
  const loadProjects = useProjectStore((state) => state.loadProjects)
  const moveProject = useProjectStore((state) => state.moveProject)
  const projectError = useProjectStore((state) => state.error)
  const projects = useProjectStore((state) => state.projects)
  const subscribeProjectRealtime = useProjectStore((state) => state.subscribeRealtime)
  const activityPulseCardId = useActivityStore((state) => state.pulseCardId)
  const latestActivityEvent = useActivityStore((state) => state.latestRealtimeEvent)
  const loadActivity = useActivityStore((state) => state.loadActivity)
  const subscribeActivityRealtime = useActivityStore((state) => state.subscribeRealtime)
  const logout = useAuthStore((state) => state.logout)
  const userEmail = useAuthStore((state) => state.user?.email ?? null)
  const userId = useAuthStore((state) => state.user?.id ?? null)
  const confirm = useFeedbackStore((state) => state.confirm)
  const pushToast = useFeedbackStore((state) => state.pushToast)
  const language = useI18nStore((state) => state.language)
  const t = translations[language]
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  useEffect(() => {
    void loadCards()
    const unsubscribe = subscribeRealtime()

    return unsubscribe
  }, [loadCards, subscribeRealtime])

  useEffect(() => {
    void loadProjects()
    const unsubscribe = subscribeProjectRealtime()

    return unsubscribe
  }, [loadProjects, subscribeProjectRealtime])

  useEffect(() => {
    void loadLinks()
    const unsubscribe = subscribeLinkRealtime()

    return unsubscribe
  }, [loadLinks, subscribeLinkRealtime])

  useEffect(() => {
    void loadActivity()
    const unsubscribe = subscribeActivityRealtime()

    return unsubscribe
  }, [loadActivity, subscribeActivityRealtime])

  useEffect(() => {
    if (!latestActivityEvent) {
      return
    }

    if (quietActivityActions.has(latestActivityEvent.action)) {
      return
    }

    const toast = getActivityToast(latestActivityEvent, userId, language)
    pushToast({
      description: toast.description,
      title: toast.title,
      tone: getActivityTone(latestActivityEvent),
    })
  }, [language, latestActivityEvent, pushToast, userId])

  useEffect(() => {
    writeStorageValue('fireboard.desktopViewMode', desktopViewMode)
  }, [desktopViewMode])

  useEffect(() => {
    writeStorageValue('fireboard.activeBoardScope', activeBoardScope)
  }, [activeBoardScope])

  useEffect(() => {
    writeStorageValue('fireboard.activeProjectId', activeProjectId)
  }, [activeProjectId])

  useEffect(() => {
    if (activeBoardScope !== 'shared' || projects.length === 0) {
      return
    }

    if (!projects.some((project) => project.id === activeProjectId)) {
      setActiveProjectId(defaultProjectId)
    }
  }, [activeBoardScope, activeProjectId, projects])

  const sharedCards = useMemo(() => cards.filter((card) => card.boardScope === 'shared'), [cards])
  const projectCardCounts = useMemo(
    () =>
      sharedCards.reduce<Record<string, number>>((acc, card) => {
        const projectId = card.projectId ?? defaultProjectId
        acc[projectId] = (acc[projectId] ?? 0) + 1
        return acc
      }, {}),
    [sharedCards],
  )
  const projectDeadlines = useMemo(
    () => getProjectDeadlineSummaries(sharedCards, now, language),
    [language, now, sharedCards],
  )
  const boardError = activeBoardScope === 'shared' ? error ?? projectError ?? linkError : error ?? linkError
  const scopedCards = useMemo(
    () =>
      cards.filter((card) =>
        activeBoardScope === 'personal'
          ? card.boardScope === 'personal' && card.createdBy === userId
          : card.boardScope === 'shared' && (card.projectId ?? defaultProjectId) === activeProjectId,
      ),
    [activeBoardScope, activeProjectId, cards, userId],
  )
  const counts = useMemo(() => getFilterCounts(scopedCards, now), [now, scopedCards])
  const visibleCards = useMemo(() => filterCards(scopedCards, filter, now), [filter, now, scopedCards])
  const visibleCardIds = useMemo(() => new Set(visibleCards.map((card) => card.id)), [visibleCards])
  const visibleLinks = useMemo(
    () =>
      links.filter((link) => {
        if (!visibleCardIds.has(link.fromCardId) || !visibleCardIds.has(link.toCardId)) {
          return false
        }

        if (activeBoardScope === 'personal') {
          return link.boardScope === 'personal' && link.createdBy === userId
        }

        return link.boardScope === 'shared' && link.projectId === activeProjectId
      }),
    [activeBoardScope, activeProjectId, links, userId, visibleCardIds],
  )
  const mobileCards = useMemo(() => sortCardsForMobile(visibleCards, now), [now, visibleCards])
  const viewKey = `${activeBoardScope}:${activeBoardScope === 'shared' ? activeProjectId : 'personal'}:${filter}`

  const openCreateAtCenter = useCallback(() => {
    if (isDesktop) {
      const position = getBoardCenterPosition(camera)
      openCreateEditor(
        Math.round(position.x),
        Math.round(position.y),
        activeBoardScope,
        activeBoardScope === 'shared' ? activeProjectId : null,
      )
      return
    }

    openCreateEditor(0, 0, activeBoardScope, activeBoardScope === 'shared' ? activeProjectId : null)
  }, [activeBoardScope, activeProjectId, camera, isDesktop, openCreateEditor])

  const handleCreateProject = useCallback(
    async (input: { color: string; name: string }) => {
      const project = await createProject(input, userId)
      setActiveBoardScope('shared')
      setActiveProjectId(project.id)
      return project
    },
    [createProject, userId],
  )

  const handleDeleteProject = useCallback(
    async (project: Project) => {
      const confirmed = await confirm({
        confirmLabel: t.card.delete,
        description: t.project.deleteDescription(project.name),
        title: t.project.deleteTitle,
        tone: 'danger',
      })

      if (!confirmed) {
        return
      }

      await deleteProject(project.id)

      if (activeProjectId === project.id) {
        setActiveProjectId(defaultProjectId)
      }
    },
    [activeProjectId, confirm, deleteProject, t.card.delete, t.project],
  )

  const handleMoveProject = useCallback(
    (project: Project, direction: ProjectMoveDirection) => {
      void moveProject(project.id, direction).catch(() => undefined)
    },
    [moveProject],
  )

  const handleLogout = useCallback(() => {
    void logout().catch(() => undefined)
  }, [logout])

  const handleRetry = useCallback(() => {
    void loadActivity()
    void loadCards()
    void loadLinks()
    void loadProjects()
  }, [loadActivity, loadCards, loadLinks, loadProjects])

  if (!isDesktop) {
    return (
      <>
        <MobileCardList
          activeProjectId={activeProjectId}
          cards={mobileCards}
          boardScope={activeBoardScope}
          counts={counts}
          error={boardError}
          filter={filter}
          isLoading={isLoading}
          now={now}
          projects={projects}
          projectCardCounts={projectCardCounts}
          projectDeadlines={projectDeadlines}
          onCreateProject={() => setIsProjectEditorOpen(true)}
          onCreate={openCreateAtCenter}
          onDeleteProject={handleDeleteProject}
          onBoardScopeChange={setActiveBoardScope}
          onFilterChange={setFilter}
          onMoveProject={handleMoveProject}
          onProjectChange={setActiveProjectId}
          onLogout={handleLogout}
          onRetry={handleRetry}
        />
        <Suspense fallback={<ModalFallback />}>
          {editor ? <CardEditor /> : null}
          {isProjectEditorOpen ? (
            <ProjectEditor
              isOpen={isProjectEditorOpen}
              onClose={() => setIsProjectEditorOpen(false)}
              onCreate={handleCreateProject}
            />
          ) : null}
        </Suspense>
      </>
    )
  }

  return (
    <>
      <div className="app-shell flex h-screen gap-3 overflow-hidden bg-[var(--background)] p-3 text-white">
        <Sidebar
          activeFilter={filter}
          activeBoardScope={activeBoardScope}
          activeProjectId={activeProjectId}
          counts={counts}
          projects={projects}
          projectCardCounts={projectCardCounts}
          projectDeadlines={projectDeadlines}
          onBoardScopeChange={setActiveBoardScope}
          onCreate={openCreateAtCenter}
          onCreateProject={() => setIsProjectEditorOpen(true)}
          onDeleteProject={handleDeleteProject}
          onFilterChange={setFilter}
          onLogout={handleLogout}
          onMoveProject={handleMoveProject}
          onProjectChange={setActiveProjectId}
          onViewModeChange={setDesktopViewMode}
          userEmail={userEmail}
          viewMode={desktopViewMode}
        />
        {desktopViewMode === 'board' ? (
          <DesktopBoard
            camera={camera}
            activityPulseCardId={activityPulseCardId}
            boardScope={activeBoardScope}
            cards={visibleCards}
            links={visibleLinks}
            error={boardError}
            isLoading={isLoading}
            now={now}
            onCreateAtCenter={openCreateAtCenter}
            onRetry={handleRetry}
            resetCamera={resetCamera}
            selectedCardId={selectedCardId}
            setCamera={setCamera}
            userEmail={userEmail}
            userId={userId}
            viewKey={viewKey}
            zoomBy={zoomBy}
          />
        ) : (
          <DesktopCardList
            cards={mobileCards}
            boardScope={activeBoardScope}
            error={boardError}
            isLoading={isLoading}
            now={now}
            onCreate={openCreateAtCenter}
            onRetry={handleRetry}
            viewKey={viewKey}
          />
        )}
        <Suspense fallback={<ModalFallback />}>
          {editor ? <CardEditor /> : null}
          {isProjectEditorOpen ? (
            <ProjectEditor
              isOpen={isProjectEditorOpen}
              onClose={() => setIsProjectEditorOpen(false)}
              onCreate={handleCreateProject}
            />
          ) : null}
        </Suspense>
      </div>
      <ActivityPulseLog activeProjectId={activeProjectId} boardScope={activeBoardScope} userId={userId} />
    </>
  )
}
