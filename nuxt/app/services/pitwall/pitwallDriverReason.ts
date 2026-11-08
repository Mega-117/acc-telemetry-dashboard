import { useI18n, type TranslationKey } from '~/i18n'
/**
 * PIP-747: why a driver cannot receive a strategy, as one small stable code.
 *
 * Produced once by the desktop (desktop-app/runtime/pitStrategyGate.js
 * DRIVER_REASON), published with the RTDB connection presence (`reasonCode`,
 * string of at most 40 characters in the rules) and translated only here, at
 * the edges. Diagnostic only: it never authorizes anything. An unknown string
 * from a newer client becomes `unknown`; an older client simply omits it.
 */
export const PITWALL_DRIVER_REASON_CODES = [
  'profile-missing',
  'broadcasting-unavailable',
  'identity-ambiguous',
  'other-driver',
  'menu-open',
  'telemetry-stale',
  'game-not-live',
  'replay',
  'human-control-unconfirmed',
  'unknown',
] as const

export type PitwallDriverReasonCode = typeof PITWALL_DRIVER_REASON_CODES[number]

/** Same bound as the RTDB rule on `connections/$uid/$connection/reasonCode`. */
export const PITWALL_DRIVER_REASON_MAX_LENGTH = 40

/** `null` when absent; any other non-empty string outside the list is `unknown`. */
export function normalizePitwallDriverReason(value: unknown): PitwallDriverReasonCode | null {
  if (typeof value !== 'string' || !value) return null
  return (PITWALL_DRIVER_REASON_CODES as readonly string[]).includes(value) ? value as PitwallDriverReasonCode : 'unknown'
}

/** Localized text of one code: `short` for a chip, `help` says what to do. */
export function describePitwallDriverReason(code: PitwallDriverReasonCode, kind: 'short' | 'help' = 'help'): string {
  const { t } = useI18n()
  return t(pitwallDriverReasonKeys(code)[kind] as TranslationKey)
}

/** The i18n keys of one code: a short label and what to do. */
export function pitwallDriverReasonKeys(code: PitwallDriverReasonCode) {
  return { short: `pitwall.driverReason.${code}.short`, help: `pitwall.driverReason.${code}.help` }
}
