import { describe, expect, it } from 'vitest'
import { isReminderOffset, offsetLabel } from '../../../shared/reminders.ts'
import {
  fromLocalInput,
  parseReminderState,
  reminderTime,
  toLocalInput,
} from './reminder.model.ts'
describe('personal reminders', () => {
  it('supports bounded minute, hour and day offsets', () => {
    expect(isReminderOffset(-43200)).toBe(true)
    expect(isReminderOffset(4320)).toBe(true)
    for (const value of [-43201, 4321, 9999, 0.5, NaN, Infinity])
      expect(isReminderOffset(value)).toBe(false)
    expect(offsetLabel(-2880, 'ru')).toBe('За 2 дня')
    expect(offsetLabel(-1440, 'en')).toBe('1 day before')
    expect(reminderTime('2026-09-19T12:00:00+05:00', -2880)).toBe(
      '2026-09-17T07:00:00.000Z',
    )
  })
  it('computes deadline offsets without timezone drift', () => {
    expect(reminderTime('2026-09-19T12:00:00+05:00', -30)).toBe(
      '2026-09-19T06:30:00.000Z',
    )
    expect(reminderTime('2026-09-19T12:00:00+05:00', 30)).toBe(
      '2026-09-19T07:30:00.000Z',
    )
  })
  it('round trips a local minute', () => {
    expect(fromLocalInput(toLocalInput('2026-09-19T12:30:00Z'))).toBe(
      '2026-09-19T12:30:00.000Z',
    )
    expect(() => fromLocalInput('')).toThrow()
    expect(() => fromLocalInput('2026-02-31T12:00')).toThrow()
  })
  it('fails closed on invalid server responses', () => {
    expect(() => parseReminderState(null)).toThrow()
    expect(() => parseReminderState({ configured: 'true' })).toThrow()
    expect(
      parseReminderState({
        configured: false,
        schedulerReady: false,
        connected: false,
        reminders: [],
        botUsername: null,
      }).connected,
    ).toBe(false)
  })
})
