import { create } from 'zustand'
import { getCurrentTranslation } from '../i18n/i18n.store.ts'

export type FeedbackTone = 'danger' | 'info' | 'success'

export type ToastInput = {
  description?: string
  title: string
  tone?: FeedbackTone
}

export type ToastMessage = Required<Pick<ToastInput, 'title' | 'tone'>> &
  Pick<ToastInput, 'description'> & {
    id: string
  }

export type ConfirmInput = {
  cancelLabel?: string
  confirmLabel?: string
  description?: string
  title: string
  tone?: FeedbackTone
}

type ConfirmRequest = Required<Pick<ConfirmInput, 'confirmLabel' | 'tone'>> &
  Pick<ConfirmInput, 'cancelLabel' | 'description' | 'title'> & {
    id: string
    resolve: (confirmed: boolean) => void
  }

type FeedbackState = {
  confirmRequest: ConfirmRequest | null
  toasts: ToastMessage[]
  confirm: (input: ConfirmInput) => Promise<boolean>
  dismissToast: (id: string) => void
  pushToast: (input: ToastInput) => string
  resolveConfirm: (confirmed: boolean) => void
}

const toastDurationMs = 4200

function createId(prefix: string) {
  if (typeof window !== 'undefined' && 'crypto' in window && typeof window.crypto.randomUUID === 'function') {
    return `${prefix}-${window.crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export const useFeedbackStore = create<FeedbackState>((set, get) => ({
  confirmRequest: null,
  toasts: [],
  confirm: (input) =>
    new Promise((resolve) => {
      get().confirmRequest?.resolve(false)

      set({
        confirmRequest: {
          cancelLabel: input.cancelLabel ?? getCurrentTranslation().common.cancel,
          confirmLabel: input.confirmLabel ?? getCurrentTranslation().common.confirm,
          description: input.description,
          id: createId('confirm'),
          resolve,
          title: input.title,
          tone: input.tone ?? 'danger',
        },
      })
    }),
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
  pushToast: (input) => {
    const id = createId('toast')
    const toast: ToastMessage = {
      description: input.description,
      id,
      title: input.title,
      tone: input.tone ?? 'info',
    }

    set((state) => ({ toasts: [toast, ...state.toasts].slice(0, 4) }))
    window.setTimeout(() => {
      get().dismissToast(id)
    }, toastDurationMs)

    return id
  },
  resolveConfirm: (confirmed) => {
    const request = get().confirmRequest

    if (!request) {
      return
    }

    set({ confirmRequest: null })
    request.resolve(confirmed)
  },
}))
