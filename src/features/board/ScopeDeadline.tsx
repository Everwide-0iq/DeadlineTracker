import { useMemo } from 'react'
import type { BoardScope } from '../cards/card.types.ts'
import { useCardStore } from '../cards/card.store.ts'
import { useTodoStore } from '../todos/todo.store.ts'
import { useI18nStore } from '../i18n/i18n.store.ts'
import { formatCountdown } from '../cards/countdown.ts'
import { getDeadlineVisualState } from '../cards/deadlineColor.ts'
import { getScopeDeadline } from './scopeDeadline.ts'

export function ScopeDeadline({ scope }: { scope: BoardScope }) {
  const cards = useCardStore((s) => s.cards)
  const blocks = useTodoStore((s) => s.blocks)
  const items = useTodoStore((s) => s.items)
  const now = useCardStore((s) => s.now)
  const language = useI18nStore((s) => s.language)
  const deadline = useMemo(() => getScopeDeadline(scope, cards, blocks, items), [scope, cards, blocks, items])
  const visual = deadline ? getDeadlineVisualState(deadline.deadlineAt, 'todo', now, language) : null
  return (
    <span
      className="scope-deadline"
      style={{ color: visual?.textColor }}
      title={deadline ? `${deadline.title} · ${visual?.label}` : undefined}
    >
      {deadline ? formatCountdown(deadline.deadlineAt, 'todo', now, language) : '\u2014'}
    </span>
  )
}
