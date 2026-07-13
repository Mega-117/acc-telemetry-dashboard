const DAY_MS = 86_400_000

export interface RaceCalendarCountdown {
  days: number
  value: string
  unit: string
  ariaLabel: string
}

function localDateSerial(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
}

export function getRaceCalendarCountdown(
  startsAt: string,
  now: Date = new Date(),
): RaceCalendarCountdown | null {
  const eventDate = new Date(startsAt)
  if (Number.isNaN(eventDate.getTime()) || Number.isNaN(now.getTime())) return null
  if (eventDate.getTime() < now.getTime()) return null

  const days = Math.max(
    0,
    Math.round((localDateSerial(eventDate) - localDateSerial(now)) / DAY_MS),
  )

  if (days === 0) {
    return {
      days,
      value: 'Oggi',
      unit: '',
      ariaLabel: 'La prossima gara è oggi',
    }
  }

  if (days === 1) {
    return {
      days,
      value: '1',
      unit: 'giorno',
      ariaLabel: 'Manca 1 giorno alla prossima gara',
    }
  }

  return {
    days,
    value: String(days),
    unit: 'giorni',
    ariaLabel: `Mancano ${days} giorni alla prossima gara`,
  }
}
