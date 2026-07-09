import { Minus, Plus } from 'lucide-react'
import { memo } from 'react'
import { useI18nStore } from '../i18n/i18n.store.ts'
import { translations } from '../i18n/translations.ts'

type BoardControlsProps = {
  onZoomIn: () => void
  onZoomOut: () => void
  zoom: number
}

function BoardControlsComponent({
  onZoomIn,
  onZoomOut,
  zoom,
}: BoardControlsProps) {
  const language = useI18nStore((state) => state.language)
  const t = translations[language]

  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/10 bg-black/35 p-2 text-sm text-white/70 shadow-2xl backdrop-blur-xl">
      <button aria-label={t.board.controls.zoomOut} className="icon-button" type="button" onClick={onZoomOut}>
        <Minus size={17} />
      </button>
      <div className="min-w-16 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center font-medium text-white/80">
        {Math.round(zoom * 100)}%
      </div>
      <button aria-label={t.board.controls.zoomIn} className="icon-button" type="button" onClick={onZoomIn}>
        <Plus size={17} />
      </button>
    </div>
  )
}

export const BoardControls = memo(BoardControlsComponent)
