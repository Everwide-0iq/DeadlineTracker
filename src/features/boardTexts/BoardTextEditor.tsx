import { Palette, Save, SlidersHorizontal, Type, X } from 'lucide-react'
import { useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { cn } from '../../lib/cn.ts'
import { useDialogFocus } from '../../lib/useDialogFocus.ts'
import { useAuthStore } from '../auth/auth.store.ts'
import { useI18nStore } from '../i18n/i18n.store.ts'
import { translations } from '../i18n/translations.ts'
import { useBoardTextStore } from './boardText.store.ts'
import type { BoardTextFontFamily } from './boardText.types.ts'

type PreviewStyle = CSSProperties & Record<`--${string}`, string | number>

const colorOptions = ['#f7f7f8', '#ff5a52', '#f4d326', '#63d95f', '#45c8ff', '#9c7cff', '#ff5fb7']
const fontOptions: BoardTextFontFamily[] = ['display', 'mono', 'serif', 'system']

const fontFamilies: Record<BoardTextFontFamily, string> = {
  display: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  serif: 'Georgia, Cambria, "Times New Roman", Times, serif',
  system: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

export function BoardTextEditor() {
  const editor = useBoardTextStore((state) => state.editor)
  const texts = useBoardTextStore((state) => state.texts)
  const closeEditor = useBoardTextStore((state) => state.closeEditor)
  const createText = useBoardTextStore((state) => state.createText)
  const updateText = useBoardTextStore((state) => state.updateText)
  const saveError = useBoardTextStore((state) => state.saveError)
  const userId = useAuthStore((state) => state.user?.id ?? null)
  const language = useI18nStore((state) => state.language)
  const t = translations[language]
  const existingText = editor?.mode === 'edit' ? texts.find((text) => text.id === editor.textId) ?? null : null
  const [content, setContent] = useState(
    existingText?.content ?? (editor?.mode === 'create' ? t.boardText.defaultContent : ''),
  )
  const [fontSize, setFontSize] = useState(existingText?.fontSize ?? 36)
  const [fontFamily, setFontFamily] = useState<BoardTextFontFamily>(existingText?.fontFamily ?? 'display')
  const [color, setColor] = useState(existingText?.color ?? '#f7f7f8')
  const [localError, setLocalError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const title = editor?.mode === 'edit' ? t.boardText.editTitle : t.boardText.createTitle
  const previewStyle = useMemo<PreviewStyle>(
    () => ({
      '--board-text-color': color,
      color,
      fontFamily: fontFamilies[fontFamily],
      fontSize,
    }),
    [color, fontFamily, fontSize],
  )
  const dialogRef = useDialogFocus<HTMLFormElement>({
    active: Boolean(editor),
    onEscape: closeEditor,
  })

  if (!editor || (editor.mode === 'edit' && !existingText)) {
    return null
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const normalizedContent = content.trim()

    if (!normalizedContent) {
      setLocalError(t.boardText.contentRequired)
      return
    }

    setIsSaving(true)
    setLocalError(null)

    try {
      if (editor.mode === 'create') {
        await createText(
          {
            boardScope: editor.boardScope,
            color,
            content: normalizedContent,
            fontFamily,
            fontSize,
            w: 360,
            projectId: editor.projectId,
            x: editor.initialX,
            y: editor.initialY,
          },
          userId,
        )
      } else {
        await updateText(editor.textId, {
          color,
          content: normalizedContent,
          fontFamily,
          fontSize,
        })
      }
    } catch {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-5 text-white backdrop-blur-md">
      <form
        aria-labelledby="board-text-editor-title"
        aria-modal="true"
        className="board-text-editor w-[min(48rem,calc(100vw-2.5rem))] max-w-none rounded-[28px] border border-white/10 bg-[#06070c]/95 p-5 shadow-2xl"
        onSubmit={handleSubmit}
        ref={dialogRef}
        role="dialog"
      >
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-red-300/20 bg-red-500/10 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-red-100/80">
              <Type size={14} />
              {t.boardText.kicker}
            </div>
            <h2 className="text-3xl font-black leading-none tracking-normal" id="board-text-editor-title">
              {title}
            </h2>
          </div>
          <button aria-label={t.common.close} className="icon-button" type="button" onClick={closeEditor}>
            <X size={19} />
          </button>
        </header>

        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="min-w-0 space-y-4">
            <label className="form-field">
              <span>{t.boardText.content}</span>
              <textarea
                autoFocus
                className="min-h-36 resize-none"
                maxLength={520}
                placeholder={t.boardText.contentPlaceholder}
                value={content}
                onChange={(event) => {
                  setContent(event.target.value)
                  setLocalError(null)
                }}
              />
            </label>

            <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-white/42">
                <SlidersHorizontal size={15} />
                {t.boardText.size}
              </div>
              <div className="flex items-center gap-4">
                <input
                  aria-label={t.boardText.size}
                  className="board-text-size-slider"
                  max={86}
                  min={18}
                  type="range"
                  value={fontSize}
                  onChange={(event) => setFontSize(Number(event.target.value))}
                />
                <output className="grid h-12 min-w-20 place-items-center rounded-2xl border border-white/10 bg-black/20 text-lg font-black">
                  {fontSize}
                </output>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-white/42">
                <Type size={15} />
                {t.boardText.font}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {fontOptions.map((option) => (
                  <button
                    className={cn('board-text-font-button', fontFamily === option && 'board-text-font-button-active')}
                    key={option}
                    type="button"
                    onClick={() => setFontFamily(option)}
                  >
                    {t.boardText.fonts[option]}
                  </button>
                ))}
              </div>
            </section>
          </div>

          <div className="min-w-0 space-y-4">
            <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-white/42">
                <Palette size={15} />
                {t.boardText.color}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {colorOptions.map((option) => (
                  <button
                    aria-label={t.boardText.selectColor(option)}
                    className={cn('board-text-color-swatch', color === option && 'board-text-color-swatch-active')}
                    key={option}
                    style={{ backgroundColor: option, color: option }}
                    type="button"
                    onClick={() => setColor(option)}
                  />
                ))}
              </div>
              <input
                aria-label={t.boardText.color}
                className="mt-3 h-12 w-full cursor-pointer rounded-2xl border border-white/10 bg-white/[0.04] p-1"
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
              />
            </section>

            <section className="board-text-preview rounded-3xl border border-white/10 bg-black/25 p-5">
              <div className="mb-4 text-xs font-black uppercase tracking-[0.16em] text-white/36">
                {t.boardText.preview}
              </div>
              <div className="board-text-preview-content" style={previewStyle}>
                {content.trim() || t.boardText.contentPlaceholder}
              </div>
            </section>
          </div>
        </div>

        {localError || saveError ? (
          <p className="mt-4 rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-100">
            {localError ?? saveError}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-3">
          <button className="secondary-button" type="button" onClick={closeEditor}>
            {t.common.cancel}
          </button>
          <button className="primary-button" disabled={isSaving} type="submit">
            <Save size={18} />
            {isSaving ? t.boardText.saving : t.boardText.save}
          </button>
        </div>
      </form>
    </div>
  )
}
