import type { CardStatus } from './card.types.ts'

export type DeadlineZone = 'done' | 'overdue' | 'critical' | 'soon' | 'important' | 'calm'

export type DeadlineVisualState = {
  zone: DeadlineZone
  daysLeft: number
  urgency: 'done' | 'overdue' | 'urgent' | 'soon' | 'important' | 'calm'
  backgroundColor: string
  borderColor: string
  textColor: string
  glowColor: string
  progress: number
  label: string
  shouldPulse: boolean
}

const dayMs = 24 * 60 * 60 * 1000
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount

function colorSet(hue: number, heat: number, zone: DeadlineZone, label: string): DeadlineVisualState {
  const saturation = lerp(72, 96, heat)
  const borderLightness = lerp(48, 60, heat)
  const textLightness = lerp(58, 66, heat)
  const backgroundLightness = lerp(9, 14, heat)

  return {
    zone,
    daysLeft: 0,
    urgency:
      zone === 'critical'
        ? 'urgent'
        : zone === 'overdue'
          ? 'overdue'
          : zone === 'soon'
            ? 'soon'
            : zone === 'important'
              ? 'important'
              : 'calm',
    backgroundColor: `hsl(${hue} ${saturation}% ${backgroundLightness}% / ${lerp(0.38, 0.56, heat)})`,
    borderColor: `hsl(${hue} ${saturation}% ${borderLightness}%)`,
    textColor: `hsl(${hue} ${saturation}% ${textLightness}%)`,
    glowColor: `hsl(${hue} ${saturation}% ${borderLightness}% / ${lerp(0.24, 0.48, heat)})`,
    progress: heat,
    label,
    shouldPulse: zone === 'overdue' || zone === 'critical',
  }
}

export function getDeadlineVisualState(
  deadlineAt: string | Date,
  status: CardStatus,
  now = Date.now(),
): DeadlineVisualState {
  if (status === 'done') {
    return {
      zone: 'done',
      daysLeft: 0,
      urgency: 'done',
      backgroundColor: 'hsl(220 10% 12% / 0.42)',
      borderColor: 'hsl(220 10% 48%)',
      textColor: 'hsl(220 12% 70%)',
      glowColor: 'hsl(220 10% 45% / 0.16)',
      progress: 0,
      label: 'Готово',
      shouldPulse: false,
    }
  }

  const deadlineTime = new Date(deadlineAt).getTime()
  const daysLeft = (deadlineTime - now) / dayMs

  if (Number.isNaN(daysLeft)) {
    return colorSet(0, 0.5, 'overdue', 'Неверная дата')
  }

  if (daysLeft < 0) {
    const overdueHeat = clamp(0.82 + Math.abs(daysLeft) / 10, 0.82, 1)
    return { ...colorSet(0, overdueHeat, 'overdue', 'Просрочено'), daysLeft }
  }

  const heat = 1 - clamp(daysLeft / 14, 0, 1)
  const hue = daysLeft <= 7 ? lerp(3, 55, clamp(daysLeft / 7, 0, 1)) : lerp(72, 126, clamp((daysLeft - 7) / 14, 0, 1))

  if (daysLeft <= 2) {
    return { ...colorSet(hue, Math.max(heat, 0.78), 'critical', 'Срочно'), daysLeft }
  }

  if (daysLeft <= 4) {
    return { ...colorSet(hue, Math.max(heat, 0.62), 'soon', 'Скоро'), daysLeft }
  }

  if (daysLeft <= 7) {
    return { ...colorSet(hue, Math.max(heat, 0.48), 'important', 'Важно'), daysLeft }
  }

  return { ...colorSet(hue, Math.max(heat, 0.24), 'calm', 'Спокойно'), daysLeft }
}
