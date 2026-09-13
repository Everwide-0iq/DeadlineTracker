import { Gamepad2, LoaderCircle } from 'lucide-react'
import { useEffect, useRef, useState, type ComponentType, type RefObject } from 'react'
import { useI18nStore } from '../i18n/i18n.store.ts'
import { useFeedbackStore } from '../feedback/feedback.store.ts'
import { snapshotBoard, type ArcadeSnapshot } from './arcade.model.ts'
import type { ArcadeDialogProps } from './ArcadeDialog.tsx'
import './arcade-launcher.css'

export function ArcadeLauncher({ getSnapshot, userId, reduced, anchorRef }: { getSnapshot: () => ArcadeSnapshot; userId: string; reduced: boolean; anchorRef: RefObject<HTMLElement | null> }) {
  const [Dialog, setDialog] = useState<ComponentType<ArcadeDialogProps> | null>(null)
  const [snapshot, setSnapshot] = useState<ArcadeSnapshot | null>(null)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [loading, setLoading] = useState(false)
  const alive = useRef(true)
  const launchButton = useRef<HTMLButtonElement>(null)
  const language = useI18nStore(s => s.language)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const launch = async () => {
    setLoading(true)
    const next = snapshotBoard(getSnapshot())
    const boardElement = anchorRef.current
    try {
      const module = await import('./ArcadeDialog.tsx')
      if (!alive.current) return
      setDialog(() => module.default)
      setAnchor(boardElement)
      setSnapshot(next)
    } catch {
      if (alive.current) useFeedbackStore.getState().pushToast({ tone: 'danger', title: language === 'ru' ? 'Arcade не загрузился. Проверьте соединение и попробуйте снова.' : 'Could not load Arcade. Check your connection and try again.' })
    } finally { if (alive.current) setLoading(false) }
  }

  return <>
    <button ref={launchButton} className="board-top-action arcade-launcher" type="button" disabled={loading}
      title={language === 'ru' ? 'Открыть Arcade' : 'Open Arcade'} aria-label={language === 'ru' ? 'Открыть Arcade' : 'Open Arcade'}
      onClick={() => void launch()}>
      {loading ? <LoaderCircle size={17} className="animate-spin" /> : <Gamepad2 size={17} />}
      <span>ARCADE</span>
    </button>
    {Dialog && snapshot ? <Dialog anchor={anchor} snapshot={snapshot} userId={userId} reduced={reduced} language={language} onClose={() => {
      setSnapshot(null)
      requestAnimationFrame(() => launchButton.current?.focus({ preventScroll: true }))
    }} /> : null}
  </>
}
