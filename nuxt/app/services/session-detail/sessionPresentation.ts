import { useI18n } from '~/i18n'
import { getSessionTypeLabel } from '~/utils/telemetryFormat'

/** Display-only labels and markers. Never changes lap eligibility or timing. */
export function stintTypeLabel(type?: string): string {
  const { t } = useI18n()
  return type === 'R' ? t('overview.columns.race') : type === 'Q' ? t('overview.columns.qualify') : (type || '—')
}

/** "1 giro" / "4 giri": the one lap-count wording for menus and notes. */
export function lapCountLabel(count: number): string {
  const { t } = useI18n()
  return `${count} ${count === 1 ? t('sessions.list.lap') : t('sessions.list.lapsUnit')}`
}

/** ACC session type (0 libere, 1 qualifica, 2 gara) in the pilot's language, never the raw English word. */
export function sessionKindLabel(type: number): string {
  const { t } = useI18n()
  return t(`stats.types.${getSessionTypeLabel(type)}`)
}

export function gripAbbreviation(grip?: string): string {
  const labels: Record<string, string> = {
    optimum: 'OPT', opt: 'OPT', fast: 'FAST', green: 'GRN',
    greasy: 'GRS', damp: 'DAMP', wet: 'WET', flooded: 'FLD'
  }
  return grip ? labels[grip.toLowerCase()] || grip : '—'
}

export function lapPointAppearance(lap: { valid: boolean }) {
  return { shape: 'circle' as const, color: lap.valid ? '#10b981' : '#ef4444' }
}
