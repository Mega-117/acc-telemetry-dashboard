// PIP-641: date and time of a planned race, in the "YYYY-MM-DDTHH:mm" local form the calendar already stores
// (the old datetime-local input wrote the same string). Pure helpers for the site's own date picker.

export interface RaceDay { year: number, month: number, day: number }
export interface RaceDateTime extends RaceDay { hour: number, minute: number }
export interface RaceDayCell extends RaceDay { inMonth: boolean }

import { useI18n } from '~/i18n'

const pad = (value: number) => String(value).padStart(2, '0')

export function parseRaceDateTime(value: string | null | undefined): RaceDateTime | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value ?? '')
  if (!match) return null
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [number, number, number, number, number]
  const date = new Date(year, month - 1, day)
  if (date.getMonth() !== month - 1 || hour > 23 || minute > 59) return null
  return { year, month: month - 1, day, hour, minute }
}

export function formatRaceDateTime(value: RaceDateTime): string {
  return `${value.year}-${pad(value.month + 1)}-${pad(value.day)}T${pad(value.hour)}:${pad(value.minute)}`
}

export function sameDay(a: RaceDay | null, b: RaceDay | null): boolean {
  return !!a && !!b && a.year === b.year && a.month === b.month && a.day === b.day
}

export function addDays(value: RaceDay, days: number): RaceDay {
  const date = new Date(value.year, value.month, value.day + days)
  return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() }
}

// Six weeks from the Monday on or before the 1st: the grid never changes height between months.
export function monthCells(year: number, month: number): RaceDayCell[] {
  const first = new Date(year, month, 1)
  const start = addDays({ year, month, day: 1 }, -((first.getDay() + 6) % 7))
  return Array.from({ length: 42 }, (_, i) => {
    const day = addDays(start, i)
    return { ...day, inMonth: day.month === month }
  })
}

export const RACE_WEEKDAYS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'] as const
/** Monday-first initials in the interface language (Italian keeps RACE_WEEKDAYS). */
export function raceWeekdays(): readonly string[] {
  const { locale, t } = useI18n()
  return locale.value === 'it' ? RACE_WEEKDAYS : t('overview.picker.weekdays').split(',')
}

export function monthLabel(year: number, month: number): string {
  const label = new Intl.DateTimeFormat(useI18n().intlLocale.value, { month: 'long', year: 'numeric' }).format(new Date(year, month, 1))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

// "Mer 28 ott 2026 · 20:50"
export function displayRaceDateTime(value: RaceDateTime): string {
  const day = new Intl.DateTimeFormat(useI18n().intlLocale.value, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
    .format(new Date(value.year, value.month, value.day))
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${pad(value.hour)}:${pad(value.minute)}`
}

// Hours and minutes typed in the picker: digits only, inside the range, else null (the field keeps its value).
export function parseTimePart(text: string, max: number): number | null {
  if (!/^\d{1,2}$/.test(text.trim())) return null
  const value = Number(text)
  return value <= max ? value : null
}
