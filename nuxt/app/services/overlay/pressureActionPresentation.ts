import { resolveSpotterSessionMode, type SpotterSessionMode } from '../spotter/spotterSessionPolicy'
import { translate, useI18n, type TranslationKey } from '~/i18n'

const t = (key: TranslationKey, params?: Record<string, string | number>) => translate(useI18n().locale.value, key, params)
const SESSION_NAME: Record<SpotterSessionMode, TranslationKey> = {
  practice: 'controlK.session.practice', qualify: 'controlK.session.qualify', race: 'controlK.session.race',
}

/** PIP-552: where a retained correction was computed (logger `origin`). */
export interface PressureOrigin {
  session_type?: number | null
  stint_number?: number | null
  source_lap?: number | null
  air_temp_c?: number | null
}

export interface PressureActionInput {
  state?: string | null
  reason?: string | null
  actionReasonCode?: string | null
  testReady?: boolean | null
  consumed?: boolean | null
  retained?: boolean | null
  origin?: PressureOrigin | null
  recommendation?: {
    status?: string | null
    completed_laps?: number | null
    valid_laps?: number | null
    required_completed_laps?: number | null
    required_valid_laps?: number | null
  } | null
}

export interface PressureActionPresentation {
  stateLabel: string
  guidance: string
  ariaLabel: string
  buttonLabel?: string
  alert?: {
    title: string
    guidance: string
  }
}

function finiteCount(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback
}

function recommendationReason(input: PressureActionInput): string | null | undefined {
  return input.recommendation?.status || input.reason
}

function isLatestLapInvalid(input: PressureActionInput): boolean {
  if (recommendationReason(input) !== 'waiting_for_valid_lap') return false

  const recommendation = input.recommendation
  const completed = finiteCount(recommendation?.completed_laps, 0)
  const requiredCompleted = finiteCount(recommendation?.required_completed_laps, 3)
  const valid = finiteCount(recommendation?.valid_laps, 0)
  const requiredValid = finiteCount(recommendation?.required_valid_laps, 1)
  return completed >= requiredCompleted && requiredValid > 0 && valid >= requiredValid
}

function unavailableGuidance(input: PressureActionInput): string {
  const recommendation = input.recommendation
  const reason = recommendationReason(input)

  if (input.consumed === true) return t('quickPanel.pressure.consumed')
  if (reason === 'within_tolerance') return t('quickPanel.pressure.withinTolerance')
  if (reason === 'ready' && input.testReady !== true) return t('quickPanel.pressure.stopAndPause')
  if (reason === 'waiting_for_valid_lap') return t('quickPanel.pressure.waitingValidLap')
  if (reason === 'compound_unavailable') return t('quickPanel.pressure.compoundUnavailable')
  if (reason === 'source_unavailable') return t('quickPanel.pressure.sourceUnavailable')
  if (reason === 'click_limit_exceeded') return t('quickPanel.pressure.clickLimit')
  if (reason === 'telemetry_not_fresh') return t('quickPanel.pressure.telemetryStale')

  const completed = finiteCount(recommendation?.completed_laps, 0)
  const required = finiteCount(recommendation?.required_completed_laps, 3)
  const valid = finiteCount(recommendation?.valid_laps, 0)
  const requiredValid = finiteCount(recommendation?.required_valid_laps, 1)
  if (requiredValid === 0) return t('quickPanel.pressure.completeLaps', { required, completed })
  return t('quickPanel.pressure.completeLapsValid', { required, requiredValid, completed, valid })
}

/**
 * PIP-522: the lap progress lives on the Pressioni button (`1/3`) instead of a
 * permanent status line. Only while laps are still missing; null otherwise.
 */
export function pressureProgressBadge(input: PressureActionInput | null | undefined): string | null {
  const recommendation = input?.recommendation
  if (!recommendation || input?.state === 'ready' || input?.state === 'running' || input?.consumed === true) return null
  const completed = finiteCount(recommendation.completed_laps, 0)
  const required = finiteCount(recommendation.required_completed_laps, 3)
  return required > 0 && completed < required ? `${completed}/${required}` : null
}

/**
 * PIP-552: "Calcolata in Qualifica · stint 1 · giro 5 · aria 26 °C". Missing
 * parts are left out; null when nothing is known. Information only: the
 * clicks are never adapted to the temperature.
 */
export function pressureOriginLine(origin: PressureOrigin | null | undefined): string | null {
  if (!origin) return null
  const mode = resolveSpotterSessionMode(origin.session_type)
  const parts = [mode ? t('quickPanel.pressure.originIn', { session: t(SESSION_NAME[mode]) }) : t('quickPanel.pressure.origin')]
  const stint = Number(origin.stint_number)
  if (Number.isInteger(stint) && stint > 0) parts.push(t('quickPanel.pressure.originStint', { value: stint }))
  const lap = Number(origin.source_lap)
  if (Number.isInteger(lap) && lap > 0) parts.push(t('quickPanel.pressure.originLap', { value: lap }))
  const air = origin.air_temp_c === null || origin.air_temp_c === undefined ? Number.NaN : Number(origin.air_temp_c)
  if (Number.isFinite(air)) parts.push(t('quickPanel.pressure.originAir', { value: Math.round(air) }))
  return parts.length > 1 || mode ? parts.join(' · ') : null
}

/** PIP-522: outcomes of a pressure command are messages; idle states are not. */
export function pressureOutcomeMessage(input: PressureActionInput | null | undefined): { text: string; tone: 'ok' | 'error' | 'progress' } | null {
  const presentation = pressureActionPresentation(input)
  if (input?.state === 'running') return { text: presentation.guidance, tone: 'progress' }
  if (input?.state === 'completed') return { text: presentation.guidance, tone: 'ok' }
  if (input?.state === 'blocked' || (input?.state === 'ready' && input?.actionReasonCode)) return { text: presentation.guidance, tone: 'error' }
  return null
}

export function pressureActionPresentation(input: PressureActionInput | null | undefined): PressureActionPresentation {
  const state = input?.state || 'unavailable'

  if (state === 'ready') {
    if (input?.actionReasonCode === 'pressure_precondition_failed') {
      return {
        stateLabel: t('quickPanel.pressure.retry'),
        guidance: input.reason || t('quickPanel.pressure.checkAcc'),
        ariaLabel: t('quickPanel.pressure.retryAria'),
      }
    }
    if (input?.actionReasonCode === 'pit_pause_required') {
      return {
        stateLabel: t('quickPanel.pressure.ready'),
        guidance: t('quickPanel.pressure.stopAndPause'),
        ariaLabel: t('quickPanel.pressure.stopAndPauseAria'),
      }
    }
    if (input?.actionReasonCode === 'pause_menu_required') {
      return {
        stateLabel: t('quickPanel.pressure.ready'),
        guidance: t('quickPanel.pressure.goToPause'),
        ariaLabel: t('quickPanel.pressure.goToPauseAria'),
      }
    }
    return {
      stateLabel: t('quickPanel.pressure.ready'),
      guidance: t('quickPanel.pressure.readyGuidance'),
      ariaLabel: t('quickPanel.pressure.readyAria'),
    }
  }
  if (state === 'running') {
    return {
      stateLabel: t('quickPanel.pressure.running'),
      guidance: t('quickPanel.pressure.runningGuidance'),
      ariaLabel: t('quickPanel.pressure.runningAria'),
    }
  }
  if (state === 'completed') {
    return {
      stateLabel: t('quickPanel.pressure.completed'),
      guidance: t('quickPanel.pressure.completedGuidance'),
      ariaLabel: t('quickPanel.pressure.completedAria'),
    }
  }
  if (state === 'blocked') {
    return {
      stateLabel: t('quickPanel.pressure.blocked'),
      guidance: input?.reason || t('quickPanel.pressure.blockedGuidance'),
      ariaLabel: t('quickPanel.pressure.blockedAria'),
    }
  }

  if (input?.reason === 'setup_menu_open') {
    return {
      stateLabel: t('quickPanel.pressure.suspended'),
      guidance: t('quickPanel.pressure.setupOpen'),
      ariaLabel: t('quickPanel.pressure.setupOpenAria'),
      buttonLabel: t('quickPanel.pressure.setupOpenButton'),
    }
  }

  if (input?.reason === 'pit_pause_required') {
    // PIP-552: the correction also applies from the race grid, stopped.
    const guidance = t('quickPanel.pressure.pitPause')
    return {
      stateLabel: t('quickPanel.pressure.stopCar'),
      guidance,
      ariaLabel: guidance,
      buttonLabel: t('quickPanel.pressure.pitPauseButton'),
      alert: { title: t('quickPanel.pressure.pitPauseAlert'), guidance },
    }
  }

  if (input?.reason === 'tyre_set_changed') {
    return {
      stateLabel: t('quickPanel.pressure.unavailable'),
      guidance: t('quickPanel.pressure.tyreSetChanged'),
      ariaLabel: t('quickPanel.pressure.tyreSetChangedAria'),
      buttonLabel: t('quickPanel.pressure.tyreSetChangedButton'),
    }
  }

  if (isLatestLapInvalid(input || {})) {
    const guidance = t('quickPanel.pressure.newValidLap')
    return {
      stateLabel: t('quickPanel.pressure.unavailable'),
      guidance: t('quickPanel.pressure.lastLapInvalid'),
      ariaLabel: t('quickPanel.pressure.unavailableAria', { guidance }),
      buttonLabel: t('quickPanel.pressure.validLapButton'),
      alert: {
        title: t('quickPanel.pressure.lastLapInvalidAlert'),
        guidance,
      },
    }
  }

  // Not a fault: the tyres are still warming, so say so instead of "Non disponibile".
  if (recommendationReason(input || {}) === 'waiting_for_stable_pressure' && input?.consumed !== true) {
    const guidance = t('quickPanel.pressure.settlingGuidance')
    return {
      stateLabel: t('quickPanel.pressure.settling'),
      guidance,
      ariaLabel: t('quickPanel.pressure.setupAria', { guidance }),
    }
  }

  const guidance = unavailableGuidance(input || {})
  return {
    stateLabel: t('quickPanel.pressure.unavailable'),
    guidance,
    ariaLabel: t('quickPanel.pressure.setupAria', { guidance }),
  }
}
