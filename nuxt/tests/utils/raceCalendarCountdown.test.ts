import { describe, expect, it } from 'vitest'
import { getRaceCalendarCountdown } from '~/utils/raceCalendarCountdown'

function localIso(
  year: number,
  month: number,
  day: number,
  hour: number,
): string {
  return new Date(year, month, day, hour).toISOString()
}

describe('getRaceCalendarCountdown', () => {
  it('shows today while the future event is on the same local date', () => {
    const now = new Date(2026, 6, 13, 9)

    expect(getRaceCalendarCountdown(localIso(2026, 6, 13, 20), now)).toEqual({
      days: 0,
      value: 'Oggi',
      unit: '',
      ariaLabel: 'La prossima gara è oggi',
    })
  })

  it('uses the singular label for tomorrow', () => {
    const now = new Date(2026, 6, 13, 23, 30)

    expect(getRaceCalendarCountdown(localIso(2026, 6, 14, 0), now)).toMatchObject({
      days: 1,
      value: '1',
      unit: 'giorno',
    })
  })

  it('counts local calendar days instead of 24-hour intervals', () => {
    const now = new Date(2026, 6, 13, 22)

    expect(getRaceCalendarCountdown(localIso(2026, 6, 18, 9), now)).toMatchObject({
      days: 5,
      value: '5',
      unit: 'giorni',
    })
  })

  it('returns null for invalid or past events', () => {
    const now = new Date(2026, 6, 13, 12)

    expect(getRaceCalendarCountdown('not-a-date', now)).toBeNull()
    expect(getRaceCalendarCountdown(localIso(2026, 6, 12, 20), now)).toBeNull()
  })
})
