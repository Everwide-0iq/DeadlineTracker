import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Sidebar } from '../components/sidebar/Sidebar.tsx'
import { DesktopBoard } from '../features/board/DesktopBoard.tsx'
import { getBoardCenterPosition } from '../features/board/board.utils.ts'
import type { DesktopViewMode } from '../features/board/board.types.ts'
import { useBoardCamera } from '../features/board/useBoardCamera.ts'
import { useAuthStore } from '../features/auth/auth.store.ts'
import { useBoardTextStore } from '../features/boardTexts/boardText.store.ts'
import { useCardLinkStore } from '../features/cardLinks/cardLink.store.ts'
import { getLinkSource, getLinkTarget } from '../features/cardLinks/cardLink.types.ts'
import { useCardStore } from '../features/cards/card.store.ts'
import { DesktopCardList } from '../features/cards/DesktopCardList.tsx'
import { MobileCardList } from '../features/cards/MobileCardList.tsx'
import { cleanupPendingCardImages } from '../features/cards/cardImage.api.ts'
import type { BoardScope, Card } from '../features/cards/card.types.ts'
import {
  defaultCardSize,
  filterCards,
  getFilterCounts,
  sortCardsForMobile,
} from '../features/cards/card.utils.ts'
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
import { getProjectDisplayName } from '../features/projects/project.utils.ts'
import { useMediaQuery } from '../lib/useMediaQuery.ts'
import { readStorageValue, writeStorageValue } from '../lib/storage.ts'
import { useProfileStore } from '../features/profile/profile.store.ts'
import { useTodoStore } from '../features/todos/todo.store.ts'
import type { TodoBlock, TodoItem } from '../features/todos/todo.types.ts'
import {
  defaultTodoBlockWidth,
  getTodoBlockStatus,
  matchesTodoFilter,
} from '../features/todos/todo.utils.ts'
import { cleanupPendingTodoImages } from '../features/todos/todoImage.api.ts'

const CardEditor = lazy(() =>
  import('../features/cards/CardEditor.tsx').then((module) => ({ default: module.CardEditor })),
)
const ProjectEditor = lazy(() =>
  import('../features/projects/ProjectEditor.tsx').then((module) => ({ default: module.ProjectEditor })),
)
const BoardTextEditor = lazy(() =>
  import('../features/boardTexts/BoardTextEditor.tsx').then((module) => ({ default: module.BoardTextEditor })),
)
const ProfileSettings = lazy(() =>
  import('../features/profile/ProfileSettings.tsx').then((module) => ({ default: module.ProfileSettings })),
)
const TodoBlockEditor = lazy(() =>
  import('../features/todos/TodoBlockEditor.tsx').then((module) => ({ default: module.TodoBlockEditor })),
)
const TodoItemEditor = lazy(() =>
  import('../features/todos/TodoItemEditor.tsx').then((module) => ({ default: module.TodoItemEditor })),
)

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

function getProjectDeadlineSummaries(
  cards: Card[],
  todoBlocks: TodoBlock[],
  todoItems: TodoItem[],
  now: number,
  language: Language,
) {
  type DeadlineCandidate = Pick<Card, 'deadlineAt' | 'status' | 'title'>
  const nearestByProject = cards.reduce<Record<string, DeadlineCandidate>>((acc, card) => {
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

  const itemsByBlock = new Map<string, TodoItem[]>()
  for (const item of todoItems) {
    const current = itemsByBlock.get(item.blockId)
    if (current) current.push(item)
    else itemsByBlock.set(item.blockId, [item])
  }

  for (const block of todoBlocks) {
    if (!block.deadlineAt) continue
    const status = getTodoBlockStatus(itemsByBlock.get(block.id) ?? [], block.id)
    if (status.isDone) continue
    const deadlineTime = new Date(block.deadlineAt).getTime()
    if (Number.isNaN(deadlineTime)) continue
    const projectId = block.projectId ?? defaultProjectId
    const current = nearestByProject[projectId]
    if (!current || deadlineTime < new Date(current.deadlineAt).getTime()) {
      nearestByProject[projectId] = {
        deadlineAt: block.deadlineAt,
        status: 'todo',
        title: block.title,
      }
    }
  }

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
  const { camera, setCamera, zoomBy } = useBoardCamera()
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
  const [isProfileSettingsOpen, setIsProfileSettingsOpen] = useState(false)
  const cards = useCardStore((state) => state.cards)
  const error = useCardStore((state) => state.error)
  const filter = useCardStore((state) => state.filter)
  const isLoading = useCardStore((state) => state.isLoading)
  const loadCards = useCardStore((state) => state.loadCards)
  const now = useCardStore((state) => state.now)
  const openCreateEditor = useCardStore((state) => state.openCreateEditor)
  const editor = useCardStore((state) => state.editor)
  const setFilter = useCardStore((state) => state.setFilter)
  const subscribeRealtime = useCardStore((state) => state.subscribeRealtime)
  const linkError = useCardLinkStore((state) => state.error)
  const links = useCardLinkStore((state) => state.links)
  const loadLinks = useCardLinkStore((state) => state.loadLinks)
  const subscribeLinkRealtime = useCardLinkStore((state) => state.subscribeRealtime)
  const textEditor = useBoardTextStore((state) => state.editor)
  const textError = useBoardTextStore((state) => state.error)
  const texts = useBoardTextStore((state) => state.texts)
  const loadTexts = useBoardTextStore((state) => state.loadTexts)
  const openCreateTextEditor = useBoardTextStore((state) => state.openCreateEditor)
  const subscribeTextRealtime = useBoardTextStore((state) => state.subscribeRealtime)
  const todoBlocks = useTodoStore((state) => state.blocks)
  const todoItems = useTodoStore((state) => state.items)
  const todoBlockEditor = useTodoStore((state) => state.blockEditor)
  const todoItemEditor = useTodoStore((state) => state.itemEditor)
  const todoError = useTodoStore((state) => state.error)
  const isTodoLoading = useTodoStore((state) => state.isLoading)
  const loadTodos = useTodoStore((state) => state.loadTodos)
  const openCreateTodoEditor = useTodoStore((state) => state.openCreateBlockEditor)
  const subscribeTodoRealtime = useTodoStore((state) => state.subscribeRealtime)
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
  const clearProfiles = useProfileStore((state) => state.clear)
  const loadProfiles = useProfileStore((state) => state.loadProfiles)
  const profiles = useProfileStore((state) => state.profiles)
  const subscribeProfileRealtime = useProfileStore((state) => state.subscribeRealtime)
  const confirm = useFeedbackStore((state) => state.confirm)
  const language = useI18nStore((state) => state.language)
  const t = translations[language]
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  useEffect(() => {
    void loadCards()
    const unsubscribe = subscribeRealtime()

    return unsubscribe
  }, [loadCards, subscribeRealtime])

  useEffect(() => {
    void loadTodos()
    const unsubscribe = subscribeTodoRealtime()

    return unsubscribe
  }, [loadTodos, subscribeTodoRealtime])

  useEffect(() => {
    void loadProjects()
    const unsubscribe = subscribeProjectRealtime()

    return unsubscribe
  }, [loadProjects, subscribeProjectRealtime])

  useEffect(() => {
    if (!isDesktop) {
      return undefined
    }

    void loadLinks()
    const unsubscribe = subscribeLinkRealtime()

    return unsubscribe
  }, [isDesktop, loadLinks, subscribeLinkRealtime])

  useEffect(() => {
    if (!userId) {
      clearProfiles()
      return undefined
    }

    void loadProfiles(userId, userEmail)
    const unsubscribe = subscribeProfileRealtime()
    return unsubscribe
  }, [clearProfiles, loadProfiles, subscribeProfileRealtime, userEmail, userId])

  useEffect(() => {
    if (!userId) {
      return
    }

    void cleanupPendingCardImages().catch(() => undefined)
    void cleanupPendingTodoImages().catch(() => undefined)
  }, [userId])

  useEffect(() => {
    if (!isDesktop) {
      return undefined
    }

    void loadTexts()
    const unsubscribe = subscribeTextRealtime()

    return unsubscribe
  }, [isDesktop, loadTexts, subscribeTextRealtime])

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
  const sharedTodoBlocks = useMemo(
    () => todoBlocks.filter((block) => block.boardScope === 'shared'),
    [todoBlocks],
  )
  const todoItemsByBlock = useMemo(() => {
    const grouped = new Map<string, TodoItem[]>()
    for (const item of todoItems) {
      const current = grouped.get(item.blockId)
      if (current) current.push(item)
      else grouped.set(item.blockId, [item])
    }
    for (const items of grouped.values()) {
      items.sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt.localeCompare(right.createdAt))
    }
    return grouped
  }, [todoItems])
  const projectCardCounts = useMemo(
    () => {
      const counts = sharedCards.reduce<Record<string, number>>((acc, card) => {
        const projectId = card.projectId ?? defaultProjectId
        acc[projectId] = (acc[projectId] ?? 0) + 1
        return acc
      }, {})
      for (const block of sharedTodoBlocks) {
        const projectId = block.projectId ?? defaultProjectId
        counts[projectId] = (counts[projectId] ?? 0) + 1
      }
      return counts
    },
    [sharedCards, sharedTodoBlocks],
  )
  const projectDeadlines = useMemo(
    () => getProjectDeadlineSummaries(sharedCards, sharedTodoBlocks, todoItems, now, language),
    [language, now, sharedCards, sharedTodoBlocks, todoItems],
  )
  const boardError =
    activeBoardScope === 'shared'
      ? error ?? todoError ?? projectError ?? (isDesktop ? linkError ?? textError : null)
      : error ?? todoError ?? (isDesktop ? linkError ?? textError : null)
  const boardIsLoading = isLoading || isTodoLoading
  const scopedCards = useMemo(
    () =>
      cards.filter((card) =>
        activeBoardScope === 'personal'
          ? card.boardScope === 'personal' && card.createdBy === userId
          : card.boardScope === 'shared' && (card.projectId ?? defaultProjectId) === activeProjectId,
      ),
    [activeBoardScope, activeProjectId, cards, userId],
  )
  const scopedTodoBlocks = useMemo(
    () =>
      todoBlocks.filter((block) =>
        activeBoardScope === 'personal'
          ? block.boardScope === 'personal' && block.createdBy === userId
          : block.boardScope === 'shared' && (block.projectId ?? defaultProjectId) === activeProjectId,
      ),
    [activeBoardScope, activeProjectId, todoBlocks, userId],
  )
  const scopedTodoBlockIds = useMemo(
    () => new Set(scopedTodoBlocks.map((block) => block.id)),
    [scopedTodoBlocks],
  )
  const scopedTodoItems = useMemo(
    () => todoItems.filter((item) => scopedTodoBlockIds.has(item.blockId)),
    [scopedTodoBlockIds, todoItems],
  )
  const counts = useMemo(() => {
    const next = getFilterCounts(scopedCards, now)
    for (const block of scopedTodoBlocks) {
      const status = getTodoBlockStatus(todoItemsByBlock.get(block.id) ?? [], block.id)
      for (const currentFilter of ['all', 'today', 'week', 'overdue', 'done'] as const) {
        if (matchesTodoFilter(block, status, currentFilter, now)) {
          next[currentFilter] += 1
        }
      }
    }
    return next
  }, [now, scopedCards, scopedTodoBlocks, todoItemsByBlock])
  const visibleCards = useMemo(() => filterCards(scopedCards, filter, now), [filter, now, scopedCards])
  const visibleTodoBlocks = useMemo(
    () =>
      scopedTodoBlocks.filter((block) =>
        matchesTodoFilter(
          block,
          getTodoBlockStatus(todoItemsByBlock.get(block.id) ?? [], block.id),
          filter,
          now,
        ),
      ),
    [filter, now, scopedTodoBlocks, todoItemsByBlock],
  )
  const visibleCardIds = useMemo(() => new Set(visibleCards.map((card) => card.id)), [visibleCards])
  const visibleTodoBlockIds = useMemo(
    () => new Set(visibleTodoBlocks.map((block) => block.id)),
    [visibleTodoBlocks],
  )
  const visibleTodoItems = useMemo(
    () => scopedTodoItems.filter((item) => visibleTodoBlockIds.has(item.blockId)),
    [scopedTodoItems, visibleTodoBlockIds],
  )
  const visibleLinks = useMemo(
    () =>
      links.filter((link) => {
        const source = getLinkSource(link)
        const target = getLinkTarget(link)
        if (!source || !target) {
          return false
        }
        const sourceVisible = source.kind === 'card' ? visibleCardIds.has(source.id) : visibleTodoBlockIds.has(source.id)
        const targetVisible = target.kind === 'card' ? visibleCardIds.has(target.id) : visibleTodoBlockIds.has(target.id)
        if (!sourceVisible || !targetVisible) return false

        if (activeBoardScope === 'personal') {
          return link.boardScope === 'personal' && link.createdBy === userId
        }

        return link.boardScope === 'shared' && link.projectId === activeProjectId
      }),
    [activeBoardScope, activeProjectId, links, userId, visibleCardIds, visibleTodoBlockIds],
  )
  const visibleTexts = useMemo(
    () =>
      texts.filter((text) =>
        activeBoardScope === 'personal'
          ? text.boardScope === 'personal' && text.createdBy === userId
          : text.boardScope === 'shared' && text.projectId === activeProjectId,
      ),
    [activeBoardScope, activeProjectId, texts, userId],
  )
  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, projects],
  )
  const currentProfile = userId ? profiles[userId] ?? null : null
  const exportContext = useMemo(
    () => ({
      boardName:
        activeBoardScope === 'shared'
          ? getProjectDisplayName(activeProject, t) ?? t.project.general
          : t.sidebar.personal,
      filterName: t.filters[filter],
    }),
    [activeBoardScope, activeProject, filter, t],
  )
  const mobileCards = useMemo(() => sortCardsForMobile(visibleCards, now), [now, visibleCards])
  const mobileTodoBlocks = useMemo(
    () => [...visibleTodoBlocks].sort((left, right) => {
      const leftDone = getTodoBlockStatus(todoItemsByBlock.get(left.id) ?? [], left.id).isDone
      const rightDone = getTodoBlockStatus(todoItemsByBlock.get(right.id) ?? [], right.id).isDone
      if (leftDone !== rightDone) return leftDone ? 1 : -1
      if (!left.deadlineAt && !right.deadlineAt) return left.createdAt.localeCompare(right.createdAt)
      if (!left.deadlineAt) return 1
      if (!right.deadlineAt) return -1
      return new Date(left.deadlineAt).getTime() - new Date(right.deadlineAt).getTime()
    }),
    [todoItemsByBlock, visibleTodoBlocks],
  )
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

  const openCreateTextAtCenter = useCallback(() => {
    setDesktopViewMode('board')
    const position = getBoardCenterPosition(camera)
    openCreateTextEditor(
      Math.round(position.x),
      Math.round(position.y),
      activeBoardScope,
      activeBoardScope === 'shared' ? activeProjectId : null,
    )
  }, [activeBoardScope, activeProjectId, camera, openCreateTextEditor])

  const openCreateTodoAtCenter = useCallback(() => {
    if (isDesktop) setDesktopViewMode('board')
    const position = isDesktop ? getBoardCenterPosition(camera) : { x: 0, y: 0 }
    openCreateTodoEditor(
      Math.round(position.x - defaultTodoBlockWidth / 2),
      Math.round(position.y - 160),
      activeBoardScope,
      activeBoardScope === 'shared' ? activeProjectId : null,
    )
  }, [activeBoardScope, activeProjectId, camera, isDesktop, openCreateTodoEditor])

  const openCreateAtPosition = useCallback(
    (x: number, y: number) => {
      openCreateEditor(
        Math.round(x - defaultCardSize.w / 2),
        Math.round(y - defaultCardSize.h / 2),
        activeBoardScope,
        activeBoardScope === 'shared' ? activeProjectId : null,
      )
    },
    [activeBoardScope, activeProjectId, openCreateEditor],
  )

  const openCreateTextAtPosition = useCallback(
    (x: number, y: number) => {
      openCreateTextEditor(
        Math.round(x - 180),
        y,
        activeBoardScope,
        activeBoardScope === 'shared' ? activeProjectId : null,
      )
    },
    [activeBoardScope, activeProjectId, openCreateTextEditor],
  )

  const openCreateTodoAtPosition = useCallback(
    (x: number, y: number) => {
      openCreateTodoEditor(
        Math.round(x - defaultTodoBlockWidth / 2),
        Math.round(y - 160),
        activeBoardScope,
        activeBoardScope === 'shared' ? activeProjectId : null,
      )
    },
    [activeBoardScope, activeProjectId, openCreateTodoEditor],
  )

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

      try {
        await deleteProject(project.id)
      } catch {
        return
      }

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
    void loadCards()
    void loadTodos()
    void loadProjects()
    if (isDesktop) {
      void loadLinks()
      void loadTexts()
    }
  }, [isDesktop, loadCards, loadLinks, loadProjects, loadTexts, loadTodos])

  if (!isDesktop) {
    return (
      <>
        <MobileCardList
          activeProjectId={activeProjectId}
          cards={mobileCards}
          todoBlocks={mobileTodoBlocks}
          todoItems={visibleTodoItems}
          boardScope={activeBoardScope}
          counts={counts}
          error={boardError}
          filter={filter}
          isLoading={boardIsLoading}
          now={now}
          projects={projects}
          projectCardCounts={projectCardCounts}
          projectDeadlines={projectDeadlines}
          onCreateProject={() => setIsProjectEditorOpen(true)}
          onCreate={openCreateAtCenter}
          onCreateTodo={openCreateTodoAtCenter}
          onDeleteProject={handleDeleteProject}
          onBoardScopeChange={setActiveBoardScope}
          onFilterChange={setFilter}
          onMoveProject={handleMoveProject}
          onProjectChange={setActiveProjectId}
          onLogout={handleLogout}
          onOpenProfile={() => setIsProfileSettingsOpen(true)}
          onRetry={handleRetry}
          profile={currentProfile}
          userEmail={userEmail}
        />
        <Suspense fallback={<ModalFallback />}>
          {editor ? <CardEditor /> : null}
          {todoBlockEditor ? <TodoBlockEditor /> : null}
          {todoItemEditor ? <TodoItemEditor /> : null}
          {isProjectEditorOpen ? (
            <ProjectEditor
              isOpen={isProjectEditorOpen}
              onClose={() => setIsProjectEditorOpen(false)}
              onCreate={handleCreateProject}
            />
          ) : null}
          {isProfileSettingsOpen && userId ? (
            <ProfileSettings
              isOpen={isProfileSettingsOpen}
              userEmail={userEmail}
              userId={userId}
              onClose={() => setIsProfileSettingsOpen(false)}
            />
          ) : null}
        </Suspense>
      </>
    )
  }

  return (
    <>
      <div className="app-shell flex h-[100dvh] gap-3 overflow-hidden bg-[var(--background)] p-3 text-white">
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
          onCreateTodo={openCreateTodoAtCenter}
          onCreateProject={() => setIsProjectEditorOpen(true)}
          onCreateText={openCreateTextAtCenter}
          onDeleteProject={handleDeleteProject}
          onFilterChange={setFilter}
          onLogout={handleLogout}
          onOpenProfile={() => setIsProfileSettingsOpen(true)}
          onMoveProject={handleMoveProject}
          onProjectChange={setActiveProjectId}
          onViewModeChange={setDesktopViewMode}
          userEmail={userEmail}
          profile={currentProfile}
          viewMode={desktopViewMode}
        />
        {desktopViewMode === 'board' ? (
          <DesktopBoard
            camera={camera}
            boardScope={activeBoardScope}
            collaborationRoomId={activeProjectId}
            cards={visibleCards}
            todoBlocks={visibleTodoBlocks}
            todoItems={visibleTodoItems}
            exportContext={exportContext}
            links={visibleLinks}
            texts={visibleTexts}
            error={boardError}
            isLoading={boardIsLoading}
            now={now}
            onCreateAtCenter={openCreateAtCenter}
            onCreateAtPosition={openCreateAtPosition}
            onCreateTextAtPosition={openCreateTextAtPosition}
            onCreateTodoAtPosition={openCreateTodoAtPosition}
            onRetry={handleRetry}
            setCamera={setCamera}
            userEmail={userEmail}
            userId={userId}
            userProfile={currentProfile}
            viewKey={viewKey}
            zoomBy={zoomBy}
          />
        ) : (
          <DesktopCardList
            cards={mobileCards}
            todoBlocks={mobileTodoBlocks}
            todoItems={visibleTodoItems}
            boardScope={activeBoardScope}
            error={boardError}
            isLoading={boardIsLoading}
            now={now}
            onCreate={openCreateAtCenter}
            onCreateText={openCreateTextAtCenter}
            onCreateTodo={openCreateTodoAtCenter}
            onRetry={handleRetry}
            viewKey={viewKey}
          />
        )}
        <Suspense fallback={<ModalFallback />}>
          {editor ? <CardEditor /> : null}
          {textEditor ? <BoardTextEditor /> : null}
          {todoBlockEditor ? <TodoBlockEditor /> : null}
          {todoItemEditor ? <TodoItemEditor /> : null}
          {isProjectEditorOpen ? (
            <ProjectEditor
              isOpen={isProjectEditorOpen}
              onClose={() => setIsProjectEditorOpen(false)}
              onCreate={handleCreateProject}
            />
          ) : null}
          {isProfileSettingsOpen && userId ? (
            <ProfileSettings
              isOpen={isProfileSettingsOpen}
              userEmail={userEmail}
              userId={userId}
              onClose={() => setIsProfileSettingsOpen(false)}
            />
          ) : null}
        </Suspense>
      </div>
    </>
  )
}
