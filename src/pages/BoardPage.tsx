import { useCallback, useEffect, useMemo, useState } from 'react'
import { Sidebar } from '../components/sidebar/Sidebar.tsx'
import { DesktopBoard } from '../features/board/DesktopBoard.tsx'
import { getBoardCenterPosition } from '../features/board/board.utils.ts'
import type { DesktopViewMode } from '../features/board/board.types.ts'
import { useBoardCamera } from '../features/board/useBoardCamera.ts'
import { useAuthStore } from '../features/auth/auth.store.ts'
import { useCardStore } from '../features/cards/card.store.ts'
import { CardEditor } from '../features/cards/CardEditor.tsx'
import { DesktopCardList } from '../features/cards/DesktopCardList.tsx'
import { MobileCardList } from '../features/cards/MobileCardList.tsx'
import type { BoardScope, Card } from '../features/cards/card.types.ts'
import { filterCards, getFilterCounts, sortCardsForMobile } from '../features/cards/card.utils.ts'
import { formatCountdown } from '../features/cards/countdown.ts'
import { getDeadlineVisualState } from '../features/cards/deadlineColor.ts'
import { ProjectEditor } from '../features/projects/ProjectEditor.tsx'
import { useProjectStore } from '../features/projects/project.store.ts'
import {
  defaultProjectId,
  type Project,
  type ProjectDeadlineSummary,
  type ProjectMoveDirection,
} from '../features/projects/project.types.ts'
import { useMediaQuery } from '../lib/useMediaQuery.ts'

function getProjectDeadlineSummaries(cards: Card[], now: number) {
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
      const visual = getDeadlineVisualState(card.deadlineAt, card.status, now)

      return [
        projectId,
        {
          color: visual.textColor,
          countdown: formatCountdown(card.deadlineAt, card.status, now),
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
    const stored = window.localStorage.getItem('fireboard.desktopViewMode')
    return stored === 'list' ? 'list' : 'board'
  })
  const [activeBoardScope, setActiveBoardScope] = useState<BoardScope>(() => {
    const stored = window.localStorage.getItem('fireboard.activeBoardScope')
    return stored === 'personal' ? 'personal' : 'shared'
  })
  const [activeProjectId, setActiveProjectId] = useState(() => {
    return window.localStorage.getItem('fireboard.activeProjectId') ?? defaultProjectId
  })
  const [isProjectEditorOpen, setIsProjectEditorOpen] = useState(false)
  const cards = useCardStore((state) => state.cards)
  const error = useCardStore((state) => state.error)
  const filter = useCardStore((state) => state.filter)
  const isLoading = useCardStore((state) => state.isLoading)
  const loadCards = useCardStore((state) => state.loadCards)
  const now = useCardStore((state) => state.now)
  const openCreateEditor = useCardStore((state) => state.openCreateEditor)
  const selectedCardId = useCardStore((state) => state.selectedCardId)
  const setFilter = useCardStore((state) => state.setFilter)
  const subscribeRealtime = useCardStore((state) => state.subscribeRealtime)
  const createProject = useProjectStore((state) => state.createProject)
  const deleteProject = useProjectStore((state) => state.deleteProject)
  const loadProjects = useProjectStore((state) => state.loadProjects)
  const moveProject = useProjectStore((state) => state.moveProject)
  const projectError = useProjectStore((state) => state.error)
  const projects = useProjectStore((state) => state.projects)
  const subscribeProjectRealtime = useProjectStore((state) => state.subscribeRealtime)
  const logout = useAuthStore((state) => state.logout)
  const userEmail = useAuthStore((state) => state.user?.email ?? null)
  const userId = useAuthStore((state) => state.user?.id ?? null)
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
    window.localStorage.setItem('fireboard.desktopViewMode', desktopViewMode)
  }, [desktopViewMode])

  useEffect(() => {
    window.localStorage.setItem('fireboard.activeBoardScope', activeBoardScope)
  }, [activeBoardScope])

  useEffect(() => {
    window.localStorage.setItem('fireboard.activeProjectId', activeProjectId)
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
    () => getProjectDeadlineSummaries(sharedCards, now),
    [now, sharedCards],
  )
  const boardError = activeBoardScope === 'shared' ? error ?? projectError : error
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
  const mobileCards = useMemo(() => sortCardsForMobile(visibleCards, now), [now, visibleCards])

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
      if (
        !window.confirm(
          `Удалить проект "${project.name}" и все карточки внутри? Это действие нельзя отменить.`,
        )
      ) {
        return
      }

      await deleteProject(project.id)

      if (activeProjectId === project.id) {
        setActiveProjectId(defaultProjectId)
      }
    },
    [activeProjectId, deleteProject],
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
    void loadCards()
    void loadProjects()
  }, [loadCards, loadProjects])

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
        <CardEditor />
        <ProjectEditor
          isOpen={isProjectEditorOpen}
          onClose={() => setIsProjectEditorOpen(false)}
          onCreate={handleCreateProject}
        />
      </>
    )
  }

  return (
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
          boardScope={activeBoardScope}
          cards={visibleCards}
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
        />
      )}
      <CardEditor />
      <ProjectEditor
        isOpen={isProjectEditorOpen}
        onClose={() => setIsProjectEditorOpen(false)}
        onCreate={handleCreateProject}
      />
    </div>
  )
}
