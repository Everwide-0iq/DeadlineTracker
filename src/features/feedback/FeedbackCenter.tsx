import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn.ts'
import { useDialogFocus } from '../../lib/useDialogFocus.ts'
import { useI18nStore } from '../i18n/i18n.store.ts'
import { translations } from '../i18n/translations.ts'
import { useFeedbackStore, type FeedbackTone } from './feedback.store.ts'

const toneIcon: Record<FeedbackTone, typeof Info> = {
  danger: AlertTriangle,
  info: Info,
  success: CheckCircle2,
}

export function FeedbackCenter() {
  const language = useI18nStore((state) => state.language)
  const t = translations[language]
  const confirmRequest = useFeedbackStore((state) => state.confirmRequest)
  const dismissToast = useFeedbackStore((state) => state.dismissToast)
  const resolveConfirm = useFeedbackStore((state) => state.resolveConfirm)
  const toasts = useFeedbackStore((state) => state.toasts)
  const confirmDialogRef = useDialogFocus<HTMLElement>({
    active: Boolean(confirmRequest),
    onEscape: () => resolveConfirm(false),
  })

  return createPortal(
    <>
      <div aria-atomic="false" aria-live="polite" className="feedback-toast-stack">
        {toasts.map((toast) => {
          const Icon = toneIcon[toast.tone]

          return (
            <article className="feedback-toast" data-tone={toast.tone} key={toast.id} role="status">
              <div className="feedback-toast-icon">
                <Icon size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <h3>{toast.title}</h3>
                {toast.description ? <p>{toast.description}</p> : null}
              </div>
              <button aria-label={t.feedback.closeToast} type="button" onClick={() => dismissToast(toast.id)}>
                <X size={15} />
              </button>
              <span className="feedback-toast-progress" />
            </article>
          )
        })}
      </div>

      {confirmRequest ? (
        <div className="feedback-confirm-backdrop" role="presentation">
          <section
            aria-describedby={confirmRequest.description ? `${confirmRequest.id}-description` : undefined}
            aria-labelledby={`${confirmRequest.id}-title`}
            aria-modal="true"
            className="feedback-confirm"
            data-tone={confirmRequest.tone}
            ref={confirmDialogRef}
            role="dialog"
          >
            <div className="feedback-confirm-mark">
              {(() => {
                const Icon = toneIcon[confirmRequest.tone]
                return <Icon size={22} />
              })()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="feedback-confirm-kicker">{t.feedback.confirmation}</p>
              <h2 id={`${confirmRequest.id}-title`}>{confirmRequest.title}</h2>
              {confirmRequest.description ? (
                <p id={`${confirmRequest.id}-description`}>{confirmRequest.description}</p>
              ) : null}
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button className="secondary-button justify-center" type="button" onClick={() => resolveConfirm(false)}>
                  {confirmRequest.cancelLabel}
                </button>
                <button
                  className={cn(
                    'primary-button justify-center',
                    confirmRequest.tone === 'success' && 'border-emerald-300/50 bg-emerald-500/15 hover:bg-emerald-500/22',
                  )}
                  type="button"
                  onClick={() => resolveConfirm(true)}
                >
                  {confirmRequest.confirmLabel}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>,
    document.body,
  )
}
