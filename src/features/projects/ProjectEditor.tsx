import { FolderPlus, Save, X } from 'lucide-react'
import { useState, type CSSProperties, type FormEvent } from 'react'
import { cn } from '../../lib/cn.ts'
import { useDialogFocus } from '../../lib/useDialogFocus.ts'
import { useI18nStore } from '../i18n/i18n.store.ts'
import { translations } from '../i18n/translations.ts'
import type { Project } from './project.types.ts'

type ProjectEditorProps = {
  isOpen: boolean
  onClose: () => void
  onCreate: (input: { color: string; name: string }) => Promise<Project>
}

type ProjectStyle = CSSProperties & Record<`--${string}`, string>

const projectColors = [
  '#ff463d',
  '#f4d326',
  '#63d95f',
  '#29d3ff',
  '#8b5cf6',
  '#ff7a1a',
  '#ff4fa3',
  '#c7f464',
]

const colorPattern = /^#[0-9a-fA-F]{6}$/

export function ProjectEditor({ isOpen, onClose, onCreate }: ProjectEditorProps) {
  const language = useI18nStore((state) => state.language)
  const t = translations[language]
  const [color, setColor] = useState(projectColors[0])
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [name, setName] = useState('')

  const resetAndClose = () => {
    setError(null)
    setIsSaving(false)
    setName('')
    setColor(projectColors[0])
    onClose()
  }

  const dialogRef = useDialogFocus<HTMLElement>({
    active: isOpen,
    onEscape: resetAndClose,
  })

  if (!isOpen) {
    return null
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const trimmedName = name.trim()

    if (!trimmedName) {
      setError(t.project.nameRequired)
      return
    }

    if (!colorPattern.test(color)) {
      setError(t.project.validColor)
      return
    }

    setIsSaving(true)

    try {
      await onCreate({ color, name: trimmedName })
      resetAndClose()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : t.project.createError)
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/55 p-0 backdrop-blur-sm lg:place-items-center lg:p-6">
      <section
        aria-labelledby="project-editor-title"
        aria-modal="true"
        className="w-full max-w-lg rounded-t-[28px] border border-white/10 bg-[#090b10]/95 p-5 shadow-[0_0_70px_rgb(255_65_65_/_0.17)] lg:rounded-[28px] lg:p-6"
        ref={dialogRef}
        role="dialog"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
              <FolderPlus size={17} />
              {t.project.new}
            </div>
            <h2 className="text-2xl font-black text-white" id="project-editor-title">
              {t.project.projectSpace}
            </h2>
            <p className="mt-1 text-sm text-white/40">{t.project.teamVisible}</p>
          </div>
          <button aria-label={t.project.closeEditor} className="icon-button" type="button" onClick={resetAndClose}>
            <X size={19} />
          </button>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <label className="form-field">
            <span>{t.project.name}</span>
            <input
              autoFocus
              maxLength={64}
              placeholder={t.project.namePlaceholder}
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <div>
            <div className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-white/[0.42]">{t.project.color}</div>
            <div className="grid grid-cols-4 gap-2">
              {projectColors.map((projectColor) => (
                <button
                  aria-label={t.project.selectColor(projectColor)}
                  className={cn(
                    'project-color-swatch',
                    color === projectColor && 'project-color-swatch-active',
                  )}
                  key={projectColor}
                  style={{ '--project-color': projectColor } as ProjectStyle}
                  type="button"
                  onClick={() => setColor(projectColor)}
                >
                  <span className="h-7 w-7 rounded-full bg-[var(--project-color)] shadow-[0_0_18px_var(--project-color)]" />
                </button>
              ))}
            </div>
          </div>

          <div
            className="project-preview rounded-3xl border p-4"
            style={{ '--project-color': color } as ProjectStyle}
          >
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.04]">
                <span className="h-4 w-4 rounded-full bg-[var(--project-color)] shadow-[0_0_20px_var(--project-color)]" />
              </span>
              <div className="min-w-0">
                <div className="truncate text-lg font-black text-white">{name.trim() || t.project.previewFallback}</div>
                <div className="text-sm text-white/40">{t.project.teamProject}</div>
              </div>
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          <div className="flex justify-end gap-3 pt-1">
            <button className="secondary-button" disabled={isSaving} type="button" onClick={resetAndClose}>
              {t.common.cancel}
            </button>
            <button className="primary-button" disabled={isSaving} type="submit">
              <Save size={17} />
              {isSaving ? t.project.creating : t.project.createAction}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
