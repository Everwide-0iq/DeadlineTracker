import { Expand, Hand, Minus, MousePointer2, Plus, RotateCcw } from 'lucide-react'
import { cn } from '../../lib/cn.ts'
import { useI18nStore } from '../i18n/i18n.store.ts'
import { translations } from '../i18n/translations.ts'
import type { BoardCamera } from './useBoardCamera.ts'

export type BoardMode = 'select' | 'pan'

type BoardControlsProps = {
  camera: BoardCamera
  mode: BoardMode
  onModeChange: (mode: BoardMode) => void
  onReset: () => void
  onZoomIn: () => void
  onZoomOut: () => void
}

export function BoardControls({
  camera,
  mode,
  onModeChange,
  onReset,
  onZoomIn,
  onZoomOut,
}: BoardControlsProps) {
  const language = useI18nStore((state) => state.language)
  const t = translations[language]

  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/10 bg-black/35 p-2 text-sm text-white/70 shadow-2xl backdrop-blur-xl">
      <button
        aria-label={t.board.controls.select}
        className={cn('icon-button', mode === 'select' && 'icon-button-active')}
        type="button"
        onClick={() => onModeChange('select')}
      >
        <MousePointer2 size={18} />
      </button>
      <button
        aria-label={t.board.controls.pan}
        className={cn('icon-button', mode === 'pan' && 'icon-button-active')}
        type="button"
        onClick={() => onModeChange('pan')}
      >
        <Hand size={18} />
      </button>
      <div className="h-7 w-px bg-white/10" />
      <button aria-label={t.board.controls.zoomOut} className="icon-button" type="button" onClick={onZoomOut}>
        <Minus size={17} />
      </button>
      <div className="min-w-16 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center font-medium text-white/80">
        {Math.round(camera.zoom * 100)}%
      </div>
      <button aria-label={t.board.controls.zoomIn} className="icon-button" type="button" onClick={onZoomIn}>
        <Plus size={17} />
      </button>
      <button aria-label={t.board.controls.reset} className="icon-button" type="button" onClick={onReset}>
        <RotateCcw size={17} />
      </button>
      <button aria-label={t.board.controls.fit} className="icon-button" type="button" onClick={onReset}>
        <Expand size={17} />
      </button>
    </div>
  )
}
