import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  isSameDay,
  isSameMonth,
  set,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flame,
  Keyboard,
  Plus,
  Sparkles,
  X,
} from 'lucide-react'
import { useMemo, useState, type CSSProperties } from 'react'
import { cn } from '../../lib/cn.ts'
import { defaultProjectId } from '../projects/project.types.ts'
import type { BoardScope, Card, CardStatus } from './card.types.ts'
import { toDateTimeLocalValue } from './card.utils.ts'
import { formatCountdown } from './countdown.ts'
import { getDeadlineVisualState, type DeadlineZone } from './deadlineColor.ts'

type DeadlinePickerProps = {
  boardScope: BoardScope
  cards: Card[]
  currentCardId: string | null
  projectId: string | null
  status: CardStatus
  userId: string | null
  value: string
  onChange: (nextValue: string) => void
  onTouched: () => void
}

type DayHeat = {
  color: string
  count: number
  heat: number
  label: string
}

type ParsedQuickCommand = {
  date: Date
  label: string
}

type TimePreset = {
  custom?: boolean
  label: string
  value: string
}

const customTimePresetStorageKey = 'fireboard.customTimePresets.v1'
const maxCustomTimePresets = 6
const weekdayLabels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const defaultTimePresets: TimePreset[] = [
  { label: 'Утро', value: '09:00' },
  { label: 'День', value: '12:00' },
  { label: 'После обеда', value: '15:00' },
  { label: 'Вечер', value: '18:00' },
  { label: 'Ночь', value: '21:00' },
]
const defaultTimePresetValues = new Set(defaultTimePresets.map((preset) => preset.value))
const timeValuePattern = /^([01]\d|2[0-3]):[0-5]\d$/

const dayFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  weekday: 'short',
})

const monthFormatter = new Intl.DateTimeFormat('ru-RU', {
  month: 'long',
  year: 'numeric',
})

const fullDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  weekday: 'long',
})

const pad = (value: number) => value.toString().padStart(2, '0')

function isTimeValue(value: unknown): value is string {
  return typeof value === 'string' && timeValuePattern.test(value)
}

function getCleanCustomTimePresets(values: string[]) {
  const seen = new Set<string>()

  return values
    .filter((value) => isTimeValue(value) && !defaultTimePresetValues.has(value))
    .sort()
    .filter((value) => {
      if (seen.has(value)) {
        return false
      }

      seen.add(value)
      return true
    })
    .slice(0, maxCustomTimePresets)
}

function readCustomTimePresets() {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(customTimePresetStorageKey) ?? '[]')
    return Array.isArray(parsed) ? getCleanCustomTimePresets(parsed) : []
  } catch {
    return []
  }
}

function saveCustomTimePresets(values: string[]) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(customTimePresetStorageKey, JSON.stringify(values))
  } catch {
    // Local storage can be blocked by browser privacy settings; presets remain usable in memory.
  }
}

function parseLocalDateTime(value: string) {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

function getDayKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function getTimeValue(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function setDateWithTime(date: Date, timeSource: Date) {
  return set(date, {
    hours: timeSource.getHours(),
    milliseconds: 0,
    minutes: timeSource.getMinutes(),
    seconds: 0,
  })
}

function setTimeValue(date: Date, timeValue: string) {
  const [hours, minutes] = timeValue.split(':').map(Number)

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return date
  }

  return set(date, {
    hours,
    milliseconds: 0,
    minutes,
    seconds: 0,
  })
}

function getNextWeekday(from: Date, targetDay: number) {
  const currentDay = from.getDay()
  const daysUntilTarget = (targetDay - currentDay + 7) % 7 || 7
  return addDays(from, daysUntilTarget)
}

function getPresetDate(kind: string, selectedDate: Date) {
  const now = new Date()

  switch (kind) {
    case 'today':
      return set(addDays(now, 0), { hours: 18, milliseconds: 0, minutes: 0, seconds: 0 })
    case 'tomorrow':
      return set(addDays(now, 1), { hours: 18, milliseconds: 0, minutes: 0, seconds: 0 })
    case 'friday':
      return set(getNextWeekday(now, 5), { hours: 18, milliseconds: 0, minutes: 0, seconds: 0 })
    case 'weekend':
      return set(getNextWeekday(now, 6), { hours: 12, milliseconds: 0, minutes: 0, seconds: 0 })
    case 'three-days':
      return setDateWithTime(addDays(now, 3), selectedDate)
    case 'week':
      return setDateWithTime(addDays(now, 7), selectedDate)
    case 'two-weeks':
      return setDateWithTime(addDays(now, 14), selectedDate)
    default:
      return selectedDate
  }
}

function getDeadlineDayHeat(cards: Card[], now: number): DayHeat {
  const states = cards.map((card) => getDeadlineVisualState(card.deadlineAt, card.status, now))
  const strongest = states.reduce(
    (best, state) => (getZoneHeat(state.zone) > getZoneHeat(best.zone) ? state : best),
    states[0],
  )

  return {
    color: strongest.borderColor,
    count: cards.length,
    heat: Math.min(cards.length + getZoneHeat(strongest.zone), 4),
    label: `${cards.length} дедлайн${cards.length === 1 ? '' : 'а'}`,
  }
}

function getZoneHeat(zone: DeadlineZone) {
  if (zone === 'overdue' || zone === 'critical') {
    return 4
  }

  if (zone === 'soon') {
    return 3
  }

  if (zone === 'important') {
    return 2
  }

  return 1
}

function parseQuickCommand(input: string, selectedDate: Date): ParsedQuickCommand | null {
  const text = input.trim().toLowerCase()

  if (!text) {
    return null
  }

  const now = new Date()
  const timeMatch = text.match(/(?:^|\s)(?:в\s*)?([01]?\d|2[0-3]):([0-5]\d)(?:\s|$)/)
  const hourOnlyMatch = text.match(/(?:^|\s)в\s+([01]?\d|2[0-3])(?:\s|$)/)
  const timeKeyword = text.includes('утром')
    ? '09:00'
    : text.includes('днем') || text.includes('днём')
      ? '12:00'
      : text.includes('вечером')
        ? '18:00'
        : text.includes('ночью')
          ? '21:00'
          : null
  const resolvedTime = timeMatch
    ? `${pad(Number(timeMatch[1]))}:${timeMatch[2]}`
    : hourOnlyMatch
      ? `${pad(Number(hourOnlyMatch[1]))}:00`
      : timeKeyword
        ? timeKeyword
        : null

  let date: Date | null = null
  let label = 'Команда распознана'

  const daysMatch = text.match(/через\s+(\d{1,2})\s+(?:день|дня|дней)/)
  const weeksMatch = text.match(/через\s+(\d{1,2})\s+(?:неделю|недели|недель)/)

  if (text.includes('послезавтра')) {
    date = addDays(now, 2)
    label = 'Послезавтра'
  } else if (text.includes('завтра')) {
    date = addDays(now, 1)
    label = 'Завтра'
  } else if (text.includes('сегодня')) {
    date = now
    label = 'Сегодня'
  } else if (daysMatch) {
    date = addDays(now, Number(daysMatch[1]))
    label = `Через ${daysMatch[1]} дн.`
  } else if (weeksMatch) {
    date = addDays(now, Number(weeksMatch[1]) * 7)
    label = `Через ${weeksMatch[1]} нед.`
  } else {
    const weekdays: Array<[RegExp, number, string]> = [
      [/понедельник|пн/, 1, 'Понедельник'],
      [/вторник|вт/, 2, 'Вторник'],
      [/среду|среда|ср/, 3, 'Среда'],
      [/четверг|чт/, 4, 'Четверг'],
      [/пятницу|пятница|пт/, 5, 'Пятница'],
      [/субботу|суббота|сб/, 6, 'Суббота'],
      [/воскресенье|вс/, 0, 'Воскресенье'],
    ]
    const weekday = weekdays.find(([pattern]) => pattern.test(text))

    if (weekday) {
      date = getNextWeekday(now, weekday[1])
      label = weekday[2]
    }
  }

  if (!date && resolvedTime) {
    date = selectedDate
    label = 'Время обновлено'
  }

  if (!date) {
    return null
  }

  return {
    date: setTimeValue(date, resolvedTime ?? '18:00'),
    label,
  }
}

function isRelevantCard(
  card: Card,
  boardScope: BoardScope,
  projectId: string | null,
  userId: string | null,
  currentCardId: string | null,
) {
  if (card.id === currentCardId || card.status === 'done') {
    return false
  }

  if (boardScope === 'personal') {
    return card.boardScope === 'personal' && card.createdBy === userId
  }

  return card.boardScope === 'shared' && (card.projectId ?? defaultProjectId) === projectId
}

export function DeadlinePicker({
  boardScope,
  cards,
  currentCardId,
  projectId,
  status,
  userId,
  value,
  onChange,
  onTouched,
}: DeadlinePickerProps) {
  const selectedDate = parseLocalDateTime(value)
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(selectedDate))
  const [quickCommand, setQuickCommand] = useState('')
  const [quickFeedback, setQuickFeedback] = useState<string | null>(null)
  const [customTimePresets, setCustomTimePresets] = useState(readCustomTimePresets)
  const now = Date.now()
  const visual = getDeadlineVisualState(selectedDate, status, now)
  const selectedTimeValue = getTimeValue(selectedDate)
  const timePresets = useMemo<TimePreset[]>(
    () => [
      ...defaultTimePresets,
      ...customTimePresets.map((value) => ({
        custom: true,
        label: 'Своё',
        value,
      })),
    ],
    [customTimePresets],
  )
  const canAddSelectedTime =
    !defaultTimePresetValues.has(selectedTimeValue) &&
    !customTimePresets.includes(selectedTimeValue) &&
    customTimePresets.length < maxCustomTimePresets
  const addTimePresetTitle =
    defaultTimePresetValues.has(selectedTimeValue) || customTimePresets.includes(selectedTimeValue)
      ? 'Это время уже есть в заготовках'
      : customTimePresets.length >= maxCustomTimePresets
        ? `Можно добавить до ${maxCustomTimePresets} своих заготовок`
        : 'Добавить время в заготовки'
  const scopedCards = useMemo(
    () =>
      cards.filter((card) =>
        isRelevantCard(card, boardScope, projectId, userId, currentCardId),
      ),
    [boardScope, cards, currentCardId, projectId, userId],
  )
  const heatByDay = useMemo(() => {
    const grouped = scopedCards.reduce<Record<string, Card[]>>((acc, card) => {
      const key = getDayKey(new Date(card.deadlineAt))
      acc[key] = [...(acc[key] ?? []), card]
      return acc
    }, {})

    return Object.fromEntries(
      Object.entries(grouped).map(([key, dayCards]) => [key, getDeadlineDayHeat(dayCards, now)]),
    )
  }, [now, scopedCards])
  const visibleDays = useMemo(
    () =>
      eachDayOfInterval({
        end: endOfWeek(endOfMonth(visibleMonth), { weekStartsOn: 1 }),
        start: startOfWeek(startOfMonth(visibleMonth), { weekStartsOn: 1 }),
      }),
    [visibleMonth],
  )
  const selectedDayKey = getDayKey(selectedDate)
  const selectedDayHeat = heatByDay[selectedDayKey]
  const selectedDayCards = scopedCards.filter((card) =>
    isSameDay(new Date(card.deadlineAt), selectedDate),
  )

  const commitDate = (date: Date) => {
    onChange(toDateTimeLocalValue(date))
    onTouched()
    setVisibleMonth(startOfMonth(date))
  }

  const applyPreset = (kind: string) => {
    commitDate(getPresetDate(kind, selectedDate))
    setQuickFeedback(null)
  }

  const applyQuickCommand = () => {
    const result = parseQuickCommand(quickCommand, selectedDate)

    if (!result) {
      setQuickFeedback('Не распознал команду. Попробуй: завтра 18:00, через 3 дня, в пятницу вечером.')
      return
    }

    commitDate(result.date)
    setQuickCommand('')
    setQuickFeedback(result.label)
  }

  const addCustomTimePreset = () => {
    if (!canAddSelectedTime) {
      return
    }

    const nextPresets = getCleanCustomTimePresets([...customTimePresets, selectedTimeValue])
    setCustomTimePresets(nextPresets)
    saveCustomTimePresets(nextPresets)
  }

  const removeCustomTimePreset = (timeValue: string) => {
    const nextPresets = customTimePresets.filter((presetValue) => presetValue !== timeValue)
    setCustomTimePresets(nextPresets)
    saveCustomTimePresets(nextPresets)
  }

  return (
    <section className="deadline-picker rounded-3xl border border-white/10 bg-white/[0.035] p-4">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--accent)]">
            <CalendarDays size={16} />
            Дедлайн
          </div>
          <h3 className="text-xl font-black text-white">
            {fullDateFormatter.format(selectedDate)} · {getTimeValue(selectedDate)}
          </h3>
          <p className="mt-1 text-sm text-white/45">
            {formatCountdown(selectedDate, status, now)} · {visual.label.toLowerCase()}
          </p>
        </div>
        <div
          className="deadline-picker-status rounded-2xl border px-3 py-2 text-right"
          style={
            {
              '--deadline-border': visual.borderColor,
              '--deadline-glow': visual.glowColor,
              '--deadline-text': visual.textColor,
            } as CSSProperties
          }
        >
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Статус</p>
          <p className="text-sm font-black text-[var(--deadline-text)]">{visual.label}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['today', 'Сегодня'],
              ['tomorrow', 'Завтра'],
              ['friday', 'Пятница'],
              ['weekend', 'Выходные'],
              ['three-days', '+3 дня'],
              ['week', '+Неделя'],
              ['two-weeks', '+2 недели'],
            ].map(([kind, label]) => (
              <button
                className="deadline-preset-button"
                key={kind}
                type="button"
                onClick={() => applyPreset(kind)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/20 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <button
                aria-label="Предыдущий месяц"
                className="icon-button h-9 w-9"
                type="button"
                onClick={() => setVisibleMonth((month) => subMonths(month, 1))}
              >
                <ChevronLeft size={17} />
              </button>
              <div className="text-center">
                <p className="text-base font-black capitalize text-white">
                  {monthFormatter.format(visibleMonth)}
                </p>
                <p className="text-xs text-white/35">
                  {selectedDayHeat ? selectedDayHeat.label : 'Свободный день'}
                </p>
              </div>
              <button
                aria-label="Следующий месяц"
                className="icon-button h-9 w-9"
                type="button"
                onClick={() => setVisibleMonth((month) => addMonths(month, 1))}
              >
                <ChevronRight size={17} />
              </button>
            </div>

            <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] font-black uppercase tracking-[0.12em] text-white/35">
              {weekdayLabels.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {visibleDays.map((day) => {
                const dayKey = getDayKey(day)
                const heat = heatByDay[dayKey]
                const isSelected = isSameDay(day, selectedDate)
                const isMuted = !isSameMonth(day, visibleMonth)

                return (
                  <button
                    aria-label={`${dayFormatter.format(day)}${heat ? `, ${heat.label}` : ''}`}
                    className={cn(
                      'deadline-picker-day',
                      isMuted && 'deadline-picker-day-muted',
                      isSelected && 'deadline-picker-day-selected',
                    )}
                    key={dayKey}
                    style={
                      heat
                        ? ({
                            '--day-color': heat.color,
                            '--day-heat': Math.min(heat.heat / 4, 1),
                          } as CSSProperties)
                        : undefined
                    }
                    type="button"
                    onClick={() => commitDate(setDateWithTime(day, selectedDate))}
                  >
                    <span>{day.getDate()}</span>
                    {heat ? <i>{heat.count}</i> : null}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <aside className="space-y-3">
          <div className="rounded-3xl border border-white/10 bg-black/20 p-3">
            <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-white/40">
              <Clock3 size={15} />
              Время
            </div>
            <div className="grid grid-cols-3 gap-2">
              {timePresets.map((preset) => (
                <div className="deadline-time-preset-shell" key={preset.value}>
                  <button
                    aria-label={`${preset.label} ${preset.value}`}
                    className={cn(
                      'deadline-time-button',
                      selectedTimeValue === preset.value && 'deadline-time-button-active',
                    )}
                    type="button"
                    onClick={() => commitDate(setTimeValue(selectedDate, preset.value))}
                  >
                    <span>{preset.label}</span>
                    <strong>{preset.value}</strong>
                  </button>
                  {preset.custom ? (
                    <button
                      aria-label={`Удалить заготовку ${preset.value}`}
                      className="deadline-time-remove"
                      type="button"
                      onClick={() => removeCustomTimePreset(preset.value)}
                    >
                      <X size={11} />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            <label className="mt-3 block">
              <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-white/35">
                Точно
              </span>
              <div className="flex gap-2">
                <input
                  className="deadline-time-input min-w-0"
                  type="time"
                  value={selectedTimeValue}
                  onChange={(event) => commitDate(setTimeValue(selectedDate, event.target.value))}
                />
                <button
                  aria-label="Добавить время в заготовки"
                  className="deadline-time-add-button"
                  disabled={!canAddSelectedTime}
                  title={addTimePresetTitle}
                  type="button"
                  onClick={addCustomTimePreset}
                >
                  <Plus size={17} />
                </button>
              </div>
            </label>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/20 p-3">
            <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-white/40">
              <Keyboard size={15} />
              Быстро
            </div>
            <div className="flex gap-2">
              <input
                className="deadline-quick-input"
                placeholder="завтра 18:00"
                value={quickCommand}
                onChange={(event) => {
                  setQuickCommand(event.target.value)
                  setQuickFeedback(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    applyQuickCommand()
                  }
                }}
              />
              <button className="icon-button h-11 w-11 shrink-0" type="button" onClick={applyQuickCommand}>
                <Sparkles size={17} />
              </button>
            </div>
            {quickFeedback ? <p className="mt-2 text-xs text-white/45">{quickFeedback}</p> : null}
          </div>

          <div
            className="deadline-picker-preview rounded-3xl border p-4"
            style={
              {
                '--deadline-border': visual.borderColor,
                '--deadline-glow': visual.glowColor,
                '--deadline-text': visual.textColor,
            } as CSSProperties
            }
          >
            <div className="mb-3 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--deadline-border)]/70 bg-black/30 text-[var(--deadline-text)]">
                <Flame size={18} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">
                  Превью
                </p>
                <p className="font-black text-white">{formatCountdown(selectedDate, status, now)}</p>
              </div>
            </div>
            <p className="text-sm leading-5 text-white/55">
              {selectedDayCards.length > 0
                ? `В этот день уже ${selectedDayCards.length} активн. дедлайн(а).`
                : 'В этот день пока нет активных дедлайнов.'}
            </p>
          </div>
        </aside>
      </div>
    </section>
  )
}
