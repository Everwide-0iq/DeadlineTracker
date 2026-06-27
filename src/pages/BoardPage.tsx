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
import type { BoardScope } from '../features/cards/card.types.ts'
import { filterCards, getFilterCounts, sortCardsForMobile } from '../features/cards/card.utils.ts'
import { useMediaQuery } from '../lib/useMediaQuery.ts'

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
    window.localStorage.setItem('fireboard.desktopViewMode', desktopViewMode)
  }, [desktopViewMode])

  useEffect(() => {
    window.localStorage.setItem('fireboard.activeBoardScope', activeBoardScope)
  }, [activeBoardScope])

  const scopedCards = useMemo(
    () =>
      cards.filter((card) =>
        activeBoardScope === 'personal'
          ? card.boardScope === 'personal' && card.createdBy === userId
          : card.boardScope === 'shared',
      ),
    [activeBoardScope, cards, userId],
  )
  const counts = useMemo(() => getFilterCounts(scopedCards, now), [now, scopedCards])
  const visibleCards = useMemo(() => filterCards(scopedCards, filter, now), [filter, now, scopedCards])
  const mobileCards = useMemo(() => sortCardsForMobile(visibleCards, now), [now, visibleCards])

  const openCreateAtCenter = useCallback(() => {
    if (isDesktop) {
      const position = getBoardCenterPosition(camera)
      openCreateEditor(Math.round(position.x), Math.round(position.y), activeBoardScope)
      return
    }

    openCreateEditor(0, 0, activeBoardScope)
  }, [activeBoardScope, camera, isDesktop, openCreateEditor])

  const handleLogout = useCallback(() => {
    void logout().catch(() => undefined)
  }, [logout])

  if (!isDesktop) {
    return (
      <>
        <MobileCardList
          cards={mobileCards}
          boardScope={activeBoardScope}
          counts={counts}
          error={error}
          filter={filter}
          isLoading={isLoading}
          now={now}
          onCreate={openCreateAtCenter}
          onBoardScopeChange={setActiveBoardScope}
          onFilterChange={setFilter}
          onLogout={handleLogout}
          onRetry={loadCards}
        />
        <CardEditor />
      </>
    )
  }

  return (
    <div className="app-shell flex h-screen gap-3 overflow-hidden bg-[var(--background)] p-3 text-white">
      <Sidebar
        activeFilter={filter}
        activeBoardScope={activeBoardScope}
        counts={counts}
        onBoardScopeChange={setActiveBoardScope}
        onCreate={openCreateAtCenter}
        onFilterChange={setFilter}
        onLogout={handleLogout}
        onViewModeChange={setDesktopViewMode}
        userEmail={userEmail}
        viewMode={desktopViewMode}
      />
      {desktopViewMode === 'board' ? (
        <DesktopBoard
          camera={camera}
          boardScope={activeBoardScope}
          cards={visibleCards}
          error={error}
          isLoading={isLoading}
          now={now}
          onCreateAtCenter={openCreateAtCenter}
          onRetry={loadCards}
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
          error={error}
          isLoading={isLoading}
          now={now}
          onCreate={openCreateAtCenter}
          onRetry={loadCards}
        />
      )}
      <CardEditor />
    </div>
  )
}
