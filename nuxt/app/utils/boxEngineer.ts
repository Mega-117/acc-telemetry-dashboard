// PIP-616 Box: the few numbers the ACC Drive ENGINEER tab derives itself.
// Fuel, references and the pressure plan come from the logger; this only combines them.
import type { PressureRecommendationViewModel, TyreWheelId } from '~/services/overlay/tyreSetupViewModel'

/** Fuel per minute: consumption per lap over the reference lap. */
export function fuelPerMinute(perLapL: number | null | undefined, referenceLapMs: number | null | undefined): number | null {
  return perLapL && perLapL > 0 && referenceLapMs && referenceLapMs > 0 ? perLapL * 60000 / referenceLapMs : null
}

/** Whole laps still to start in the time left at the reference pace; ACC's lap limit otherwise. */
export function lapsLeft(timeLeftMs: number | null | undefined, referenceLapMs: number | null | undefined, lapLimit: number | null | undefined): number | null {
  if (typeof timeLeftMs === 'number' && timeLeftMs > 0 && referenceLapMs && referenceLapMs > 0) return Math.floor(timeLeftMs / referenceLapMs)
  return typeof lapLimit === 'number' ? lapLimit : null
}

export type CorrectionTone = 'none' | 'ok' | 'add' | 'remove'

/** One wheel of Correggi pressioni in psi: 0 ok, + add air, - remove air (one click = 0.1 psi). */
export function wheelCorrection(plan: PressureRecommendationViewModel | null | undefined, wheel: TyreWheelId): { text: string, tone: CorrectionTone } {
  const clicks = plan?.clicks?.[wheel]
  if (typeof clicks !== 'number') return { text: '--', tone: 'none' }
  if (clicks === 0) return { text: '0.0', tone: 'ok' }
  const psi = clicks / 10
  return { text: `${psi > 0 ? '+' : ''}${psi.toFixed(1)}`, tone: psi > 0 ? 'add' : 'remove' }
}

/** What the correction cell says under the four values. */
export function correctionNote(plan: PressureRecommendationViewModel | null | undefined): string {
  if (!plan) return 'In attesa del primo giro completo'
  const target = typeof plan.targetPsi === 'number' ? plan.targetPsi.toFixed(1) : '--'
  if (plan.completedLaps < plan.requiredCompletedLaps) return `Disponibile dopo ${plan.requiredCompletedLaps} giri dello stint (${plan.completedLaps}/${plan.requiredCompletedLaps})`
  if (plan.status === 'within_tolerance') return `Nella finestra: target ${target} psi`
  if (plan.status === 'ready') return `Da correggere verso ${target} psi`
  if (plan.status === 'click_limit_exceeded') return 'Correzione troppo grande: controlla il setup'
  return 'In attesa di due giri stabili'
}
