import { CalendarClock, CheckCircle2, Save, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuthStore } from '../auth/auth.store.ts'
import { useCardStore } from './card.store.ts'
import type { CardStatus } from './card.types.ts'
import {
  defaultCardSize,
  fromDateTimeLocalValue,
  getDefaultDeadline,
  toDateTimeLocalValue,
} from './card.utils.ts'

export function CardEditor() {
  const cards = useCardStore((state) => state.cards)
  const clearSaveError = useCardStore((state) => state.clearSaveError)
  const closeEditor = useCardStore((state) => state.closeEditor)
  const createCard = useCardStore((state) => state.createCard)
  const editor = useCardStore((state) => state.editor)
  const saveError = useCardStore((state) => state.saveError)
  const updateCard = useCardStore((state) => state.updateCard)
  const userId = useAuthStore((state) => state.user?.id ?? null)
  const card = useMemo(
    () => (editor?.mode === 'edit' ? cards.find((item) => item.id === editor.cardId) ?? null : null),
    [cards, editor],
  )
  const [deadlineLocal, setDeadlineLocal] = useState('')
  const [description, setDescription] = useState('')
  const [dirty, setDirty] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [status, setStatus] = useState<CardStatus>('todo')
  const [title, setTitle] = useState('')

  useEffect(() => {
    if (!editor) {
      return
    }

    clearSaveError()
    setFormError(null)
    setDirty(false)

    if (editor.mode === 'edit' && card) {
      setTitle(card.title)
      setDescription(card.description ?? '')
      setDeadlineLocal(toDateTimeLocalValue(card.deadlineAt))
      setStatus(card.status)
      return
    }

    setTitle('')
    setDescription('')
    setDeadlineLocal(toDateTimeLocalValue(getDefaultDeadline()))
    setStatus('todo')
  }, [card, clearSaveError, editor])

  if (!editor) {
    return null
  }

  if (editor.mode === 'edit' && !card) {
    return null
  }

  const isEditing = editor.mode === 'edit'
  const editorScope =
    isEditing && card ? card.boardScope : editor.mode === 'create' ? editor.boardScope : 'shared'

  const markDirty = () => {
    if (!dirty) {
      setDirty(true)
    }
  }

  const requestClose = () => {
    if (dirty && !window.confirm('Отменить несохранённые изменения карточки?')) {
      return
    }

    closeEditor()
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearSaveError()
    setFormError(null)

    const trimmedTitle = title.trim()

    if (!trimmedTitle) {
      setFormError('Название обязательно.')
      return
    }

    let deadlineAt: string

    try {
      deadlineAt = fromDateTimeLocalValue(deadlineLocal)
    } catch {
      setFormError('Дата дедлайна некорректна.')
      return
    }

    setIsSaving(true)

    try {
      if (isEditing && card) {
        await updateCard(card.id, {
          deadlineAt,
          description: description.trim() || null,
          status,
          title: trimmedTitle,
        })
      } else if (editor.mode === 'create') {
        await createCard(
          {
            boardScope: editor.boardScope,
            deadlineAt,
            description: description.trim() || null,
            h: defaultCardSize.h,
            status,
            title: trimmedTitle,
            w: defaultCardSize.w,
            x: editor.initialX,
            y: editor.initialY,
          },
          userId,
        )
      }

      setDirty(false)
    } catch {
      return
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!card || !window.confirm('Удалить эту карточку дедлайна?')) {
      return
    }

    setIsSaving(true)
    await useCardStore
      .getState()
      .deleteCard(card.id)
      .then(() => closeEditor())
      .catch(() => undefined)
      .finally(() => setIsSaving(false))
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/55 p-0 backdrop-blur-sm lg:place-items-center lg:p-6">
      <section className="w-full max-w-xl rounded-t-[28px] border border-white/10 bg-[#090b10]/95 p-5 shadow-[0_0_70px_rgb(255_65_65_/_0.17)] lg:rounded-[28px] lg:p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
              <CalendarClock size={17} />
              {isEditing ? 'Редактирование' : 'Новая карточка'}
            </div>
            <h2 className="text-2xl font-black text-white">{isEditing ? 'Настроить дедлайн' : 'Добавить дедлайн'}</h2>
            <p className="mt-1 text-sm text-white/40">
              {editorScope === 'personal' ? 'Личная доска, видишь только ты' : 'Командная доска, видно всем участникам'}
            </p>
          </div>
          <button aria-label="Закрыть редактор" className="icon-button" type="button" onClick={requestClose}>
            <X size={19} />
          </button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="form-field">
            <span>Название</span>
            <input
              autoFocus
              maxLength={120}
              placeholder="Билд игры к пятнице"
              type="text"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value)
                markDirty()
              }}
            />
          </label>

          <label className="form-field">
            <span>Описание</span>
            <textarea
              maxLength={360}
              placeholder="Необязательный контекст"
              rows={3}
              value={description}
              onChange={(event) => {
                setDescription(event.target.value)
                markDirty()
              }}
            />
          </label>

          <label className="form-field">
            <span>Дедлайн</span>
            <input
              type="datetime-local"
              value={deadlineLocal}
              onChange={(event) => {
                setDeadlineLocal(event.target.value)
                markDirty()
              }}
            />
          </label>

          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-1.5">
            <button
              className={status === 'todo' ? 'segment segment-active' : 'segment'}
              type="button"
              onClick={() => {
                setStatus('todo')
                markDirty()
              }}
            >
              В работе
            </button>
            <button
              className={status === 'done' ? 'segment segment-active' : 'segment'}
              type="button"
              onClick={() => {
                setStatus('done')
                markDirty()
              }}
            >
              <CheckCircle2 size={16} />
              Готово
            </button>
          </div>

          {formError || saveError ? (
            <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {formError ?? saveError}
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
            {isEditing ? (
              <button
                className="secondary-button text-red-200 hover:border-red-400/50 hover:text-red-100"
                disabled={isSaving}
                type="button"
                onClick={handleDelete}
              >
                <Trash2 size={17} />
                Удалить
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-3">
              <button className="secondary-button" disabled={isSaving} type="button" onClick={requestClose}>
                Отмена
              </button>
              <button className="primary-button" disabled={isSaving} type="submit">
                <Save size={17} />
                {isSaving ? 'Сохраняем...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  )
}
