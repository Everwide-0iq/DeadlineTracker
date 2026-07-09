import { CalendarClock, CheckCircle2, ImagePlus, Loader2, Save, Trash2, UploadCloud, X } from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { useAuthStore } from '../auth/auth.store.ts'
import { useFeedbackStore } from '../feedback/feedback.store.ts'
import { useI18nStore } from '../i18n/i18n.store.ts'
import { translations } from '../i18n/translations.ts'
import { useProjectStore } from '../projects/project.store.ts'
import { getProjectDisplayName } from '../projects/project.utils.ts'
import { useCardStore } from './card.store.ts'
import type { CardStatus } from './card.types.ts'
import { CardImageView } from './CardImageView.tsx'
import {
  prepareCardImage,
  removeCardImage,
  revokePreparedCardImage,
  uploadCardImage,
  type CardImageMetadata,
  type PreparedCardImage,
} from './cardImage.api.ts'
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
  const language = useI18nStore((state) => state.language)
  const t = translations[language]
  const userId = useAuthStore((state) => state.user?.id ?? null)
  const projects = useProjectStore((state) => state.projects)
  const card = useMemo(
    () => (editor?.mode === 'edit' ? cards.find((item) => item.id === editor.cardId) ?? null : null),
    [cards, editor],
  )
  const editorProjectId =
    editor?.mode === 'edit' ? card?.projectId ?? null : editor?.mode === 'create' ? editor.projectId : null
  const editorProjectName = useMemo(
    () => getProjectDisplayName(projects.find((project) => project.id === editorProjectId), t),
    [editorProjectId, projects, t],
  )
  const [deadlineLocal, setDeadlineLocal] = useState('')
  const [description, setDescription] = useState('')
  const [dirty, setDirty] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isPreparingImage, setIsPreparingImage] = useState(false)
  const [pendingImage, setPendingImage] = useState<PreparedCardImage | null>(null)
  const [removeExistingImage, setRemoveExistingImage] = useState(false)
  const [status, setStatus] = useState<CardStatus>('todo')
  const [title, setTitle] = useState('')
  const imageInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editor) {
      return
    }

    clearSaveError()
    setFormError(null)
    setImageError(null)
    setDirty(false)
    setPendingImage(null)
    setRemoveExistingImage(false)

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

  useEffect(() => () => revokePreparedCardImage(pendingImage), [pendingImage])

  if (!editor) {
    return null
  }

  if (editor.mode === 'edit' && !card) {
    return null
  }

  const isEditing = editor.mode === 'edit'
  const editorScope =
    isEditing && card ? card.boardScope : editor.mode === 'create' ? editor.boardScope : 'shared'
  const existingImagePath = card?.imagePath ?? null
  const visibleImagePath = pendingImage || removeExistingImage ? null : existingImagePath

  const markDirty = () => {
    if (!dirty) {
      setDirty(true)
    }
  }

  const requestClose = async () => {
    if (dirty) {
      const confirmed = await confirm({
        confirmLabel: t.common.close,
        description: t.cardEditor.cancelUnsavedDescription,
        title: t.cardEditor.cancelUnsavedTitle,
        tone: 'info',
      })

      if (!confirmed) {
        return
      }
    }

    closeEditor()
  }

  const getImageErrorMessage = (error: unknown) => {
    if (error instanceof Error) {
      if (error.message === 'unsupported') {
        return t.cardImage.unsupported
      }

      if (error.message === 'source-too-large') {
        return t.cardImage.sourceTooLarge
      }

      if (error.message === 'compressed-too-large') {
        return t.cardImage.compressedTooLarge
      }
    }

    return t.cardImage.prepareFailed
  }

  const handleImageFile = async (file: File | null) => {
    if (!file) {
      return
    }

    setImageError(null)
    setIsPreparingImage(true)

    try {
      const preparedImage = await prepareCardImage(file)
      setPendingImage(preparedImage)
      setRemoveExistingImage(false)
      markDirty()
    } catch (error) {
      setImageError(getImageErrorMessage(error))
    } finally {
      setIsPreparingImage(false)

      if (imageInputRef.current) {
        imageInputRef.current.value = ''
      }
    }
  }

  const handleImagePaste = (event: ClipboardEvent<HTMLFormElement>) => {
    const item = Array.from(event.clipboardData.items).find((clipboardItem) =>
      clipboardItem.type.startsWith('image/'),
    )
    const file = item?.getAsFile() ?? null

    if (!file) {
      return
    }

    event.preventDefault()
    void handleImageFile(file)
  }

  const handleImageDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    void handleImageFile(event.dataTransfer.files.item(0))
  }

  const handleRemoveImage = () => {
    setPendingImage(null)
    setImageError(null)
    setRemoveExistingImage(Boolean(existingImagePath))
    markDirty()
  }

  const handleDelete = async () => {
    if (!card) {
      return
    }

    const confirmed = await confirm({
      confirmLabel: t.card.delete,
      description: t.card.deleteDescription(card.title),
      title: t.card.deleteTitle,
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
      setFormError(t.cardEditor.titleRequired)
      return
    }

    let deadlineAt: string

    try {
      deadlineAt = fromDateTimeLocalValue(deadlineLocal)
    } catch {
      setFormError(t.cardEditor.deadlineInvalid)
      return
    }

    let uploadedImage: CardImageMetadata | null = null
    const isImageChanging = Boolean(pendingImage || removeExistingImage)

    setIsSaving(true)

    try {
      const trimmedDescription = description.trim() || null
      const nextCardId = isEditing && card ? card.id : crypto.randomUUID()

      if (pendingImage) {
        if (!userId) {
          setFormError(t.cardImage.authRequired)
          return
        }

        try {
          uploadedImage = await uploadCardImage(nextCardId, userId, pendingImage)
        } catch {
          setFormError(t.cardImage.uploadFailed)
          return
        }
      }

      const nextImagePatch = uploadedImage
        ? uploadedImage
        : removeExistingImage
          ? {
              imageHeight: null,
              imagePath: null,
              imageSize: null,
              imageWidth: null,
            }
          : {}
      const nextImagePath = uploadedImage?.imagePath ?? (removeExistingImage ? null : existingImagePath)
      const nextImageWidth = uploadedImage?.imageWidth ?? (removeExistingImage ? null : card?.imageWidth ?? null)
      const nextImageHeight =
        uploadedImage?.imageHeight ?? (removeExistingImage ? null : card?.imageHeight ?? null)
      const nextHeight = getCardContentHeight({
        description: trimmedDescription,
        imageHeight: nextImageHeight,
        imagePath: nextImagePath,
        imageWidth: nextImageWidth,
        title: trimmedTitle,
        w: card?.w ?? defaultCardSize.w,
      })

      if (isEditing && card) {
        await updateCard(card.id, {
          deadlineAt,
          description: trimmedDescription,
          h: nextHeight,
          ...nextImagePatch,
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
            id: nextCardId,
            ...nextImagePatch,
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

      if (existingImagePath && (uploadedImage || removeExistingImage)) {
        void removeCardImage(existingImagePath).catch(() => undefined)
      }

      setDirty(false)
    } catch {
      if (uploadedImage) {
        void removeCardImage(uploadedImage.imagePath).catch(() => undefined)
      }

      if (isImageChanging) {
        setFormError(t.cardImage.saveFailed)
      }

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
              {isEditing ? t.cardEditor.edit : t.sidebar.newCard}
            </div>
            <h2 className="text-2xl font-black text-white">{isEditing ? t.cardEditor.setupDeadline : t.cardEditor.addDeadline}</h2>
            <p className="mt-1 text-sm text-white/40 lg:hidden xl:block">
              {editorScope === 'personal'
                ? t.cardEditor.personalScope
                : t.cardEditor.projectScope(editorProjectName)}
            </p>
          </div>
          <button aria-label={t.cardEditor.close} className="icon-button" type="button" onClick={() => void requestClose()}>
            <X size={19} />
          </button>
        </div>

        <form
          className="grid gap-4 lg:grid-cols-[minmax(290px,360px)_minmax(0,1fr)] lg:items-start"
          onPaste={handleImagePaste}
          onSubmit={handleSubmit}
        >
          <div className="space-y-4">
            <label className="form-field">
              <span>{t.cardEditor.titleLabel}</span>
              <input
                autoFocus
                maxLength={120}
                placeholder={t.cardEditor.titlePlaceholder}
                type="text"
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value)
                  markDirty()
                }}
              />
            </label>

            <label className="form-field">
              <span>{t.cardEditor.descriptionLabel}</span>
              <textarea
                maxLength={360}
                placeholder={t.cardEditor.contextPlaceholder}
                rows={3}
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value)
                  markDirty()
                }}
            />
          </label>

            <div
              className="card-image-dropzone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleImageDrop}
            >
              <input
                accept="image/*"
                className="hidden"
                ref={imageInputRef}
                type="file"
                onChange={(event) => void handleImageFile(event.target.files?.item(0) ?? null)}
              />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="card-image-kicker">
                    <ImagePlus size={14} />
                    {t.cardImage.label}
                  </span>
                  <p>{t.cardImage.hint}</p>
                </div>
                <button
                  className="icon-button h-10 w-10 shrink-0"
                  disabled={isPreparingImage || isSaving}
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                >
                  {isPreparingImage ? <Loader2 className="animate-spin" size={18} /> : <UploadCloud size={18} />}
                </button>
              </div>

              {pendingImage ? (
                <div className="card-image-preview-shell">
                  <img alt={t.cardImage.previewAlt(title)} draggable={false} src={pendingImage.objectUrl} />
                  <div>
                    <strong>{t.cardImage.ready}</strong>
                    <span>{t.cardImage.compressed(Math.ceil(pendingImage.size / 1024))}</span>
                  </div>
                  <button
                    aria-label={t.cardImage.remove}
                    className="icon-button h-9 w-9"
                    disabled={isSaving}
                    type="button"
                    onClick={handleRemoveImage}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ) : visibleImagePath ? (
                <div className="card-image-preview-shell">
                  <CardImageView
                    alt={t.cardImage.previewAlt(title)}
                    height={card?.imageHeight ?? null}
                    path={visibleImagePath}
                    width={card?.imageWidth ?? null}
                  />
                  <div>
                    <strong>{t.cardImage.attached}</strong>
                    <span>{t.cardImage.replaceHint}</span>
                  </div>
                  <button
                    aria-label={t.cardImage.remove}
                    className="icon-button h-9 w-9"
                    disabled={isSaving}
                    type="button"
                    onClick={handleRemoveImage}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ) : null}

              {imageError ? <div className="mt-3 text-xs font-bold text-red-200">{imageError}</div> : null}
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-1.5">
              <button
                className={status === 'todo' ? 'segment segment-active' : 'segment'}
                type="button"
                onClick={() => {
                  setStatus('todo')
                  markDirty()
                }}
              >
                {t.card.statusTodo}
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
                {t.card.statusDone}
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
                  disabled={isSaving || isPreparingImage}
                  type="button"
                  onClick={handleDelete}
                >
                  <Trash2 size={17} />
                  {t.card.delete}
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-3 lg:flex-col">
                <button className="secondary-button justify-center" disabled={isSaving} type="button" onClick={() => void requestClose()}>
                  {t.common.cancel}
                </button>
                <button className="primary-button justify-center" disabled={isSaving || isPreparingImage} type="submit">
                  <Save size={17} />
                  {isSaving ? t.cardEditor.saving : t.cardEditor.save}
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
