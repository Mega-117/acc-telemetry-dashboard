import { useI18n } from '~/i18n'

const DAY_MS = 86_400_000

export interface RaceCalendarCountdown {
  days: number
  value: string
  unit: string
  leadingLabel: string
  trailingLabel: string
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
  const { t } = useI18n()

  if (days === 0) {
    return {
      days,
      value: t('overview.countdown.today'),
      unit: '',
      leadingLabel: t('overview.countdown.todayLead'),
      trailingLabel: '',
      ariaLabel: t('overview.countdown.todayAria'),
    }
  }

  if (days === 1) {
    return {
      days,
      value: '1',
      unit: t('overview.countdown.day'),
      leadingLabel: t('overview.countdown.oneLead'),
      trailingLabel: t('overview.countdown.trailing'),
      ariaLabel: t('overview.countdown.oneAria'),
    }
  }

  return {
    days,
    value: String(days),
    unit: t('overview.countdown.days'),
    leadingLabel: t('overview.countdown.manyLead'),
    trailingLabel: t('overview.countdown.trailing'),
    ariaLabel: t('overview.countdown.manyAria', { days }),
  }
}
