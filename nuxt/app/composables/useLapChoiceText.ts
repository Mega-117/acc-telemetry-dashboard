// PIP-695: the words of a lap row or card (who, which lap, when, status, why), one place for cards and lists.
import { sessionDate, whenParts, type LapChoice, type LapRunConditions, type LapStatus, type RefReason } from '~/services/telemetry/lapChoice'
import { formatLapTime } from '~/utils/telemetryFormat'
import { useI18n, type TranslationKey } from '~/i18n'

const STATUS_ICON: Record<LapStatus, string> = { valid: '✓', invalid: '⚠', incomplete: '◐', unknown: '?' }
const SESSION_TYPES = ['practice', 'qualify', 'race'] as const

export function useLapChoiceText() {
  const { t, locale } = useI18n()
  const decimal = (n: number) => locale.value === 'it' ? String(n).replace('.', ',') : String(n)

  function when(choice: Pick<LapChoice, 'sessionToken' | 'recordedAt' | 'sessionType'>, now = new Date()): string {
    const parts = whenParts(sessionDate(choice.sessionToken, choice.recordedAt), now)
    const day = !parts ? '' : parts.day === 'today' ? t('telemetry.choice.today', { time: parts.hm })
      : parts.day === 'yesterday' ? t('telemetry.choice.yesterday', { time: parts.hm }) : t('telemetry.choice.date', { date: parts.dm, time: parts.hm })
    const type = (SESSION_TYPES as readonly string[]).includes(choice.sessionType ?? '') ? t(`sessions.type.${choice.sessionType}` as TranslationKey) : ''
    const typeWord = type ? type.charAt(0) + type.slice(1).toLowerCase() : ''
    return [day, typeWord].filter(Boolean).join(' · ')
  }
  const status = (s: LapStatus) => ({ icon: STATUS_ICON[s], text: t(`telemetry.choice.status.${s}`) })
  function lapLine(choice: Pick<LapChoice, 'ideal' | 'lapNumber' | 'lapTimeMs'>): string {
    const time = formatLapTime(choice.lapTimeMs)
    if (choice.ideal) return t('telemetry.choice.idealTitle', { time })
    return choice.lapNumber ? t('telemetry.choice.lapLine', { n: choice.lapNumber, time }) : time
  }
  const driver = (choice: Pick<LapChoice, 'driver'>) => choice.driver || t('telemetry.choice.driver')
  const idealNote = (scope: 'session' | 'history' | undefined) => t('telemetry.choice.ideal', { scope: t(scope === 'history' ? 'telemetry.choice.idealHistory' : 'telemetry.choice.idealSession') })
  function reason(r: RefReason | null | undefined, o: { pilotName?: string | null } = {}): string {
    if (!r) return ''
    const who = (name: string | null) => name || t('telemetry.choice.driver')
    const text = r.kind === 'myBest' && o.pilotName ? t('telemetry.choice.reason.pilotBest', { driver: o.pilotName })
      : r.kind === 'stepUp' ? t('telemetry.choice.reason.stepUp', { driver: who(r.driver), pct: decimal(r.pct) })
        : r.kind === 'fastest' || r.kind === 'link' ? t(`telemetry.choice.reason.${r.kind}`, { driver: who(r.driver) })
          : r.kind === 'compare' ? t('telemetry.choice.reason.compare', { label: r.label })
            : t(`telemetry.choice.reason.${r.kind}`)
    return t('telemetry.choice.reason.prefix', { text })
  }
  const side = (s: 'you' | 'ref') => t(s === 'you' ? 'telemetry.you' : 'telemetry.reference')
  /** 01/11: "Benzina 43,7 L · Gomme da asciutto · Aria 15° · Asfalto 18°", only the parts that are known. */
  function conditions(c: LapRunConditions | null | undefined): string {
    if (!c) return ''
    return [
      c.fuelL !== null ? t('telemetry.choice.cond.fuel', { n: decimal(Math.round(c.fuelL * 10) / 10) }) : '',
      c.tyre ? t(`telemetry.choice.cond.${c.tyre}`) : '',
      c.airC !== null ? t('telemetry.choice.cond.air', { n: Math.round(c.airC) }) : '',
      c.roadC !== null ? t('telemetry.choice.cond.road', { n: Math.round(c.roadC) }) : '',
    ].filter(Boolean).join(' · ')
  }
  /** 01/11 (Track Titan's pills): the same facts as short tags: "115 L", "DRY", "AIR 15°", "TRK 18°". */
  function conditionsShort(c: LapRunConditions | null | undefined): string[] {
    if (!c) return []
    return [
      c.fuelL !== null ? t('telemetry.choice.cond.fuelShort', { n: Math.round(c.fuelL) }) : '',
      c.tyre ? t(`telemetry.choice.cond.${c.tyre}Short`) : '',
      c.airC !== null ? t('telemetry.choice.cond.airShort', { n: Math.round(c.airC) }) : '',
      c.roadC !== null ? t('telemetry.choice.cond.roadShort', { n: Math.round(c.roadC) }) : '',
    ].filter(Boolean)
  }
  return { when, status, lapLine, driver, idealNote, reason, side, conditions, conditionsShort }
}
