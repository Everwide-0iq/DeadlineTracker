import { CalendarOff, CheckCircle2, Clock3, Flame, Zap } from 'lucide-react'
import { memo, useMemo, type CSSProperties } from 'react'
import type { Card } from '../cards/card.types.ts'
import { CardTextContent } from '../cards/CardTextContent.tsx'
import { getCardContentScale, getCardRenderSize } from '../cards/card.utils.ts'
import { getDeadlineVisualState } from '../cards/deadlineColor.ts'
import { formatCountdown } from '../cards/countdown.ts'
import { useFittedCardScale } from '../cards/useFittedCardScale.ts'
import { useI18nStore } from '../i18n/i18n.store.ts'
import { field, type OwnerRow } from './owner.api.ts'
import type { OwnerCopy } from './owner.copy.ts'
import { OwnerImage } from './OwnerImage.tsx'

export const OwnerBoardCard = memo(function OwnerBoardCard({ card, activeProfile, now, images, selected, onSelect, t }: {
  card: Card; activeProfile?: OwnerRow; now: number; images: boolean; selected: boolean; onSelect: (id: string) => void; t: OwnerCopy
}) {
  const language = useI18nStore(s => s.language)
  const visual = getDeadlineVisualState(card.deadlineAt, card.status, now, language)
  const countdown = formatCountdown(card.deadlineAt, card.status, now, language)
  const size = getCardRenderSize(card)
  const proposed = getCardContentScale({ ...card, h: size.h })
  const layout = useMemo(() => ({ card, now, proposed }), [card, now, proposed])
  const { contentRef, scale } = useFittedCardScale(proposed, layout)
  const owner = activeProfile ? field(activeProfile, 'nickname') : card.activeBy
  const color = activeProfile ? field(activeProfile, 'active_color') : '#65e7ff'
  const style = {
    left: card.x, top: card.y, width: size.w, height: size.h, padding: 20 * scale,
    '--deadline-bg': visual.backgroundColor, '--deadline-border': visual.borderColor,
    '--deadline-glow': visual.glowColor, '--deadline-text': visual.textColor, '--active-color': color,
  } as CSSProperties
  return <article className="owner-canvas-card" data-selected={selected} data-active={card.isActive} style={style}
    role="button" tabIndex={0} aria-label={card.title} onClick={() => onSelect(card.id)}
    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(card.id) } }}>
    <div ref={contentRef} className="deadline-card-content owner-canvas-card-content" style={{ zoom: scale }}>
      <header><span className="owner-card-mark">{card.status === 'done' ? <CheckCircle2 size={21} /> : card.deadlineAt ? <Flame size={21} /> : <CalendarOff size={21} />}</span>
        {card.isActive && <span className="owner-active-label"><Zap size={14} />{owner || t.active}</span>}</header>
      <CardTextContent title={card.title} description={card.description} completed={card.status === 'done'} fill={!card.imagePath} />
      {card.imagePath && <div className="deadline-card-image-slot owner-card-image-slot">{images && <OwnerImage path={card.imagePath} todo={false} t={t} inline />}</div>}
      <footer><div className="owner-card-countdown"><Clock3 size={22} /><strong>{countdown}</strong></div>
        <div className="owner-card-progress"><i style={{ width: `${visual.progress * 100}%` }} /></div><small>{visual.label}</small></footer>
    </div>
  </article>
})
