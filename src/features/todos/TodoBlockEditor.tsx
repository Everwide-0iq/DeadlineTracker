import { CalendarClock, CheckSquare2, Save, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useDialogFocus } from '../../lib/useDialogFocus.ts'
import { useAuthStore } from '../auth/auth.store.ts'
import { useI18nStore } from '../i18n/i18n.store.ts'
import { translations } from '../i18n/translations.ts'
import { fromDateTimeLocalValue, getDefaultDeadline, toDateTimeLocalValue } from '../cards/card.utils.ts'
import { useTodoStore } from './todo.store.ts'

export function TodoBlockEditor() {
  const editor = useTodoStore((state) => state.blockEditor)
  const blocks = useTodoStore((state) => state.blocks)
  const closeEditor = useTodoStore((state) => state.closeBlockEditor)
  const createBlock = useTodoStore((state) => state.createBlock)
  const updateBlock = useTodoStore((state) => state.updateBlock)
  const saveError = useTodoStore((state) => state.saveError)
  const userId = useAuthStore((state) => state.user?.id ?? null)
  const language = useI18nStore((state) => state.language)
  const t = translations[language]
  const block = useMemo(
    () => editor?.mode === 'edit' ? blocks.find((item) => item.id === editor.blockId) ?? null : null,
    [blocks, editor],
  )
  const [title, setTitle] = useState('')
  const [hasDeadline, setHasDeadline] = useState(false)
  const [deadlineLocal, setDeadlineLocal] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const dialogRef = useDialogFocus<HTMLElement>({ active: Boolean(editor), onEscape: closeEditor })

  useEffect(() => {
    if (!editor) return
    setTitle(block?.title ?? '')
    setHasDeadline(Boolean(block?.deadlineAt))
    setDeadlineLocal(toDateTimeLocalValue(block?.deadlineAt ?? getDefaultDeadline()))
    setError(null)
  }, [block, editor])

  if (!editor) return null

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const nextTitle = title.trim()
    if (!nextTitle) {
      setError(t.todo.titleRequired)
      return
    }

    let deadlineAt: string | null = null
    if (hasDeadline) {
      try {
        deadlineAt = fromDateTimeLocalValue(deadlineLocal)
      } catch {
        setError(t.cardEditor.deadlineInvalid)
        return
      }
    }

    setIsSaving(true)
    setError(null)
    try {
      if (editor.mode === 'edit') {
        await updateBlock(editor.blockId, { title: nextTitle, deadlineAt })
      } else {
        await createBlock({
          title: nextTitle,
          deadlineAt,
          boardScope: editor.boardScope,
          projectId: editor.projectId,
          x: editor.initialX,
          y: editor.initialY,
        }, userId)
      }
    } catch {
      // The store exposes an actionable Supabase error below the form.
    } finally {
      setIsSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/60 p-0 backdrop-blur-sm sm:place-items-center sm:p-4">
      <section
        aria-labelledby="todo-block-editor-title"
        aria-modal="true"
        className="todo-editor-shell w-full max-w-xl rounded-t-[28px] border border-white/10 bg-[#090b10]/98 p-5 shadow-2xl sm:rounded-[28px] sm:p-6"
        ref={dialogRef}
        role="dialog"
      >
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="todo-editor-kicker"><CheckSquare2 size={16} />{t.todo.block}</div>
            <h2 className="mt-2 text-2xl font-black text-white" id="todo-block-editor-title">
              {editor.mode === 'edit' ? t.todo.editTitle : t.todo.createTitle}
            </h2>
          </div>
          <button aria-label={t.common.close} className="icon-button" type="button" onClick={closeEditor}>
            <X size={19} />
          </button>
        </header>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="form-field">
            <span>{t.todo.title}</span>
            <input
              autoFocus
              maxLength={120}
              placeholder={t.todo.titlePlaceholder}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>

          <section className="todo-deadline-control">
            <button
              aria-pressed={hasDeadline}
              className="todo-deadline-toggle"
              data-active={hasDeadline ? 'true' : 'false'}
              type="button"
              onClick={() => setHasDeadline((current) => !current)}
            >
              <CalendarClock size={18} />
              <span>{hasDeadline ? t.todo.deadline : t.todo.noDeadline}</span>
              <span aria-hidden="true" className="todo-toggle-track"><span /></span>
            </button>
            {hasDeadline ? (
              <input
                aria-label={t.todo.deadline}
                className="todo-deadline-input"
                type="datetime-local"
                value={deadlineLocal}
                onChange={(event) => setDeadlineLocal(event.target.value)}
              />
            ) : null}
          </section>

          {error || saveError ? <p className="form-error">{error ?? saveError}</p> : null}

          <footer className="flex justify-end gap-3 pt-2">
            <button className="secondary-button" type="button" onClick={closeEditor}>{t.common.cancel}</button>
            <button className="primary-button" disabled={isSaving} type="submit">
              <Save size={17} />
              {isSaving ? t.cardEditor.saving : t.todo.save}
            </button>
          </footer>
        </form>
      </section>
    </div>,
    document.body,
  )
}

