import { useEffect, useRef, type RefObject } from 'react'

type UseDialogFocusOptions = {
  active: boolean
  onEscape?: () => void
}

const dialogStack: symbol[] = []
const focusableSelector = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function useDialogFocus<T extends HTMLElement>({
  active,
  onEscape,
}: UseDialogFocusOptions): RefObject<T | null> {
  const containerRef = useRef<T>(null)
  const dialogIdRef = useRef(Symbol('dialog'))
  const onEscapeRef = useRef(onEscape)

  onEscapeRef.current = onEscape

  useEffect(() => {
    if (!active) {
      return undefined
    }

    const dialogId = dialogIdRef.current
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogStack.push(dialogId)

    const focusFrame = window.requestAnimationFrame(() => {
      const focusable = containerRef.current?.querySelector<HTMLElement>(focusableSelector)
      focusable?.focus({ preventScroll: true })
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (dialogStack.at(-1) !== dialogId) {
        return
      }

      if (event.key === 'Escape' && onEscapeRef.current) {
        event.preventDefault()
        event.stopImmediatePropagation()
        onEscapeRef.current()
        return
      }

      if (event.key !== 'Tab') {
        return
      }

      const focusable = Array.from(
        containerRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
      ).filter((element) => element.offsetParent !== null)

      if (focusable.length === 0) {
        event.preventDefault()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', handleKeyDown)
      const stackIndex = dialogStack.lastIndexOf(dialogId)

      if (stackIndex !== -1) {
        dialogStack.splice(stackIndex, 1)
      }

      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus({ preventScroll: true })
      }
    }
  }, [active])

  return containerRef
}
