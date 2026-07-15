import { ImagePlus, Loader2, Save, Trash2, UploadCloud, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useDialogFocus } from '../../lib/useDialogFocus.ts'
import { useAuthStore } from '../auth/auth.store.ts'
import { useI18nStore } from '../i18n/i18n.store.ts'
import { translations } from '../i18n/translations.ts'
import { prepareCardImage, revokePreparedCardImage, type PreparedCardImage } from '../cards/cardImage.api.ts'
import { useTodoStore } from './todo.store.ts'
import { removeTodoImage, uploadTodoImage } from './todoImage.api.ts'
import { TodoImageView } from './TodoImageView.tsx'

const getImageError = (error: unknown, t: (typeof translations)['ru']) => {
  if (!(error instanceof Error)) return t.cardImage.prepareFailed
  if (error.message === 'unsupported') return t.cardImage.unsupported
  if (error.message === 'source-too-large') return t.cardImage.sourceTooLarge
  if (error.message === 'compressed-too-large') return t.cardImage.compressedTooLarge
  return t.cardImage.prepareFailed
}

export function TodoItemEditor() {
  const editor = useTodoStore((state) => state.itemEditor)
  const items = useTodoStore((state) => state.items)
  const closeEditor = useTodoStore((state) => state.closeItemEditor)
  const createItem = useTodoStore((state) => state.createItem)
  const updateItem = useTodoStore((state) => state.updateItem)
  const saveError = useTodoStore((state) => state.saveError)
  const userId = useAuthStore((state) => state.user?.id ?? null)
  const language = useI18nStore((state) => state.language)
  const t = translations[language]
  const item = useMemo(
    () => editor?.mode === 'edit' ? items.find((candidate) => candidate.id === editor.itemId) ?? null : null,
    [editor, items],
  )
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [pendingImage, setPendingImage] = useState<PreparedCardImage | null>(null)
  const [removeExistingImage, setRemoveExistingImage] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isPreparing, setIsPreparing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useDialogFocus<HTMLElement>({ active: Boolean(editor), onEscape: closeEditor })

  useEffect(() => {
    if (!editor) return
    setTitle(item?.title ?? '')
    setDescription(item?.description ?? '')
    setRemoveExistingImage(false)
    setImageError(null)
    setFormError(null)
    setPendingImage(null)
  }, [editor, item])

  useEffect(() => () => revokePreparedCardImage(pendingImage), [pendingImage])

  if (!editor) return null

  const prepareImage = async (file: File) => {
    setIsPreparing(true)
    setImageError(null)
    try {
      const prepared = await prepareCardImage(file)
      setPendingImage((current) => {
        revokePreparedCardImage(current)
        return prepared
      })
      setRemoveExistingImage(false)
    } catch (error) {
      setImageError(getImageError(error, t))
    } finally {
      setIsPreparing(false)
    }
  }

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) void prepareImage(file)
    event.target.value = ''
  }

  const handlePaste = (event: ClipboardEvent) => {
    const file = Array.from(event.clipboardData.files).find((candidate) => candidate.type.startsWith('image/'))
    if (!file) return
    event.preventDefault()
    void prepareImage(file)
  }

  const handleDrop = (event: DragEvent) => {
    event.preventDefault()
    const file = Array.from(event.dataTransfer.files).find((candidate) => candidate.type.startsWith('image/'))
    if (file) void prepareImage(file)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const nextTitle = title.trim()
    if (!nextTitle) {
      setFormError(t.todo.titleRequired)
      return
    }
    if (!userId) {
      setFormError(t.cardImage.authRequired)
      return
    }

    setIsSaving(true)
    setFormError(null)
    const id = item?.id ?? crypto.randomUUID()
    let uploaded: Awaited<ReturnType<typeof uploadTodoImage>> | null = null
    try {
      if (pendingImage) uploaded = await uploadTodoImage(id, userId, pendingImage)
      const imagePatch = uploaded ?? (removeExistingImage ? {
        imageHeight: null,
        imagePath: null,
        imageSize: null,
        imageWidth: null,
      } : {})

      if (editor.mode === 'edit') {
        await updateItem(editor.itemId, {
          title: nextTitle,
          description: description.trim() || null,
          ...imagePatch,
        })
      } else {
        await createItem({
          id,
          blockId: editor.blockId,
          title: nextTitle,
          description: description.trim() || null,
          ...imagePatch,
        }, userId)
      }
    } catch {
      if (uploaded) void removeTodoImage(uploaded.imagePath).catch(() => undefined)
      setFormError(pendingImage ? t.cardImage.saveFailed : saveError)
    } finally {
      setIsSaving(false)
    }
  }

  const hasExistingImage = Boolean(item?.imagePath && !removeExistingImage && !pendingImage)

  return createPortal(
    <div className="fixed inset-0 z-[55] grid place-items-end bg-black/60 p-0 backdrop-blur-sm sm:place-items-center sm:p-4" onPaste={handlePaste}>
      <section
        aria-labelledby="todo-item-editor-title"
        aria-modal="true"
        className="todo-editor-shell max-h-[calc(100dvh-1rem)] w-full max-w-2xl overflow-y-auto rounded-t-[28px] border border-white/10 bg-[#090b10]/98 p-5 shadow-2xl sm:rounded-[28px] sm:p-6"
        ref={dialogRef}
        role="dialog"
      >
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="todo-editor-kicker"><ImagePlus size={16} />{t.todo.item}</div>
            <h2 className="mt-2 text-2xl font-black text-white" id="todo-item-editor-title">
              {editor.mode === 'edit' ? t.todo.itemEditTitle : t.todo.itemCreateTitle}
            </h2>
          </div>
          <button aria-label={t.common.close} className="icon-button" type="button" onClick={closeEditor}><X size={19} /></button>
        </header>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="form-field">
            <span>{t.todo.title}</span>
            <input autoFocus maxLength={160} placeholder={t.todo.titlePlaceholder} value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="form-field">
            <span>{t.todo.description}</span>
            <textarea maxLength={1800} rows={5} value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>

          <div className="todo-image-drop" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
            <input accept="image/*" className="sr-only" ref={inputRef} type="file" onChange={handleFile} />
            {pendingImage ? <img alt="" className="todo-image-preview" src={pendingImage.objectUrl} /> : null}
            {hasExistingImage ? <TodoImageView alt={item?.title ?? ''} className="todo-image-preview" path={item?.imagePath ?? null} /> : null}
            {!pendingImage && !hasExistingImage ? (
              <button className="todo-image-empty" type="button" onClick={() => inputRef.current?.click()}>
                {isPreparing ? <Loader2 className="animate-spin" size={22} /> : <UploadCloud size={22} />}
                <strong>{t.todo.image}</strong>
                <span>{t.cardImage.hint}</span>
              </button>
            ) : (
              <div className="todo-image-actions">
                <button className="secondary-button" type="button" onClick={() => inputRef.current?.click()}><ImagePlus size={16} />{t.cardImage.replaceHint}</button>
                <button className="icon-button text-red-200" type="button" onClick={() => {
                  revokePreparedCardImage(pendingImage)
                  setPendingImage(null)
                  setRemoveExistingImage(true)
                }}><Trash2 size={17} /></button>
              </div>
            )}
          </div>

          {imageError || formError || saveError ? <p className="form-error">{imageError ?? formError ?? saveError}</p> : null}
          <footer className="flex justify-end gap-3 pt-2">
            <button className="secondary-button" type="button" onClick={closeEditor}>{t.common.cancel}</button>
            <button className="primary-button" disabled={isSaving || isPreparing} type="submit"><Save size={17} />{isSaving ? t.cardEditor.saving : t.common.save}</button>
          </footer>
        </form>
      </section>
    </div>,
    document.body,
  )
}

