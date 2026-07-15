import { CheckSquare2, ChevronDown, LayoutList, Plus, Type } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/cn.ts'
import { useI18nStore } from '../i18n/i18n.store.ts'
import { translations } from '../i18n/translations.ts'

type AddMenuItemsProps = {
  allowText?: boolean
  onAddCard: () => void
  onAddText?: () => void
  onAddTodo: () => void
  onChoose?: () => void
}

export function AddMenuItems({ allowText = true, onAddCard, onAddText, onAddTodo, onChoose }: AddMenuItemsProps) {
  const language = useI18nStore((state) => state.language)
  const t = translations[language]
  const choose = (callback: () => void) => {
    callback()
    onChoose?.()
  }

  return (
    <div className="add-menu-items" role="menu">
      <button className="add-menu-item" role="menuitem" type="button" onClick={() => choose(onAddCard)}>
        <span className="add-menu-icon add-menu-icon-card"><LayoutList size={18} /></span>
        <span><strong>{t.common.createCard}</strong><small>{t.cardEditor.descriptionLabel}</small></span>
      </button>
      <button className="add-menu-item" role="menuitem" type="button" onClick={() => choose(onAddTodo)}>
        <span className="add-menu-icon add-menu-icon-todo"><CheckSquare2 size={18} /></span>
        <span><strong>{t.todo.block}</strong><small>{t.todo.addItem}</small></span>
      </button>
      {allowText && onAddText ? (
        <button className="add-menu-item" role="menuitem" type="button" onClick={() => choose(onAddText)}>
          <span className="add-menu-icon add-menu-icon-text"><Type size={18} /></span>
          <span><strong>{t.boardText.newText}</strong><small>{t.boardText.label}</small></span>
        </button>
      ) : null}
    </div>
  )
}

type AddMenuProps = AddMenuItemsProps & {
  className?: string
  mobile?: boolean
}

export function AddMenu({ allowText = true, className, mobile = false, onAddCard, onAddText, onAddTodo }: AddMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const language = useI18nStore((state) => state.language)
  const t = translations[language]

  useEffect(() => {
    if (!open) return undefined
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('pointerdown', close, true)
      window.removeEventListener('keydown', escape)
    }
  }, [open])

  return (
    <div className={cn('add-menu-root', mobile ? 'add-menu-mobile-root' : 'relative', className)} ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(mobile ? 'mobile-create-button' : 'primary-button w-full justify-center py-3 text-base')}
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <span className={cn(mobile && 'grid h-9 w-9 place-items-center rounded-full bg-white text-[var(--accent)]')}>
          <Plus size={mobile ? 21 : 20} strokeWidth={2.7} />
        </span>
        <span>{mobile ? t.mobile.add : t.sidebar.add}</span>
        {!mobile ? <ChevronDown className={cn('add-menu-chevron', open && 'rotate-180')} size={16} /> : null}
      </button>
      {open ? (
        <div className={cn('add-menu-popover', mobile && 'add-menu-popover-mobile')}>
          <AddMenuItems
            allowText={allowText}
            onAddCard={onAddCard}
            onAddText={onAddText}
            onAddTodo={onAddTodo}
            onChoose={() => setOpen(false)}
          />
        </div>
      ) : null}
    </div>
  )
}
