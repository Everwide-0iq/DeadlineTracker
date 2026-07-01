import { CalendarClock, CheckCircle2, Save, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useAuthStore } from '../auth/auth.store.ts'
import { useFeedbackStore } from '../feedback/feedback.store.ts'
import { useProjectStore } from '../projects/project.store.ts'
import { useCardStore } from './card.store.ts'
import type { CardStatus } from './card.types.ts'
import { DeadlinePicker } from './DeadlinePicker.tsx'
import {
  defaultCardSize,
  fromDateTimeLocalValue,
  getCardContentHeight,
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
  const confirm = useFeedbackStore((state) => state.confirm)
  const userId = useAuthStore((state) => state.user?.id ?? null)
  const projects = useProjectStore((state) => state.projects)
  const card = useMemo(
    () => (editor?.mode === 'edit' ? cards.find((item) => item.id === editor.cardId) ?? null : null),
    [cards, editor],
  )
  const editorProjectId =
    editor?.mode === 'edit' ? card?.projectId ?? null : editor?.mode === 'create' ? editor.projectId : null
  const editorProjectName = useMemo(
    () => projects.find((project) => project.id === editorProjectId)?.name ?? null,
    [editorProjectId, projects],
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

  const requestClose = async () => {
    if (dirty) {
      const confirmed = await confirm({
        confirmLabel: 'Закрыть',
        description: 'Изменения в карточке не будут сохранены.',
        title: 'Отменить изменения?',
        tone: 'info',
      })

      if (!confirmed) {
        return
      }
    }

    closeEditor()
  }

  const handleDelete = async () => {
    if (!card) {
      return
    }

    const confirmed = await confirm({
      confirmLabel: 'Удалить',
      description: `Карточка "${card.title}" исчезнет с текущей доски.`,
      title: 'Удалить карточку?',
      tone: 'danger',
    })

    if (!confirmed) {
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
      const trimmedDescription = description.trim() || null
      const nextHeight = getCardContentHeight({
        description: trimmedDescription,
        title: trimmedTitle,
        w: card?.w ?? defaultCardSize.w,
      })

      if (isEditing && card) {
        await updateCard(card.id, {
          deadlineAt,
          description: trimmedDescription,
          h: nextHeight,
          status,
          title: trimmedTitle,
        })
      } else if (editor.mode === 'create') {
        await createCard(
          {
            boardScope: editor.boardScope,
            deadlineAt,
            description: trimmedDescription,
            h: nextHeight,
            projectId: editor.boardScope === 'shared' ? editor.projectId : null,
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

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/55 p-0 backdrop-blur-sm lg:place-items-center lg:p-3">
      <section className="max-h-[calc(100vh-1rem)] w-full max-w-6xl overflow-y-auto rounded-t-[28px] border border-white/10 bg-[#090b10]/95 p-5 shadow-[0_0_70px_rgb(255_65_65_/_0.17)] lg:max-h-[calc(100vh-1.5rem)] lg:rounded-[28px] lg:p-4">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
              <CalendarClock size={17} />
              {isEditing ? 'Редактирование' : 'Новая карточка'}
            </div>
            <h2 className="text-2xl font-black text-white">{isEditing ? 'Настроить дедлайн' : 'Добавить дедлайн'}</h2>
            <p className="mt-1 text-sm text-white/40 lg:hidden xl:block">
              {editorScope === 'personal'
                ? 'Личная доска, видишь только ты'
                : `Командный проект${editorProjectName ? `: ${editorProjectName}` : ', видно всем участникам'}`}
            </p>
          </div>
          <button aria-label="Закрыть редактор" className="icon-button" type="button" onClick={() => void requestClose()}>
            <X size={19} />
          </button>
        </div>

        <form
          className="grid gap-4 lg:grid-cols-[minmax(290px,360px)_minmax(0,1fr)] lg:items-start"
          onSubmit={handleSubmit}
        >
          <div className="space-y-4">
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

            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between lg:flex-col-reverse lg:items-stretch">
              {isEditing ? (
                <button
                  className="secondary-button justify-center text-red-200 hover:border-red-400/50 hover:text-red-100"
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
              <div className="flex gap-3 lg:flex-col">
                <button className="secondary-button justify-center" disabled={isSaving} type="button" onClick={() => void requestClose()}>
                  Отмена
                </button>
                <button className="primary-button justify-center" disabled={isSaving} type="submit">
                  <Save size={17} />
                  {isSaving ? 'Сохраняем...' : 'Сохранить'}
                </button>
              </div>
            </div>
          </div>

          <DeadlinePicker
            boardScope={editorScope}
            cards={cards}
            currentCardId={card?.id ?? null}
            projectId={editorProjectId}
            status={status}
            userId={userId}
            value={deadlineLocal}
            onChange={setDeadlineLocal}
            onTouched={markDirty}
          />
        </form>
      </section>
    </div>,
    document.body,
  )
}
