/**
 * Optimal shift points keyed by the raw ACC shared-memory `carModel` value.
 *
 * Add a car only after its identifier and RPM have been verified. Missing cars
 * intentionally resolve to null: there is no generic, estimated or manual fallback.
 */
export const OPTIMAL_SHIFT_RPM_BY_ACC_CAR_ID = Object.freeze({
  lamborghini_huracan_gt3_evo2: 8000,
  porsche_992_gt3_r: 9000,
  ferrari_296_gt3: 7300,
  audi_r8_lms_evo_ii: 8000,
  mercedes_amg_gt3_evo: 7150,
  bmw_m4_gt3: 7000,
  amr_v8_vantage_gt3: 6800,
  honda_nsx_gt3_evo: 11740,
  mclaren_720s_gt3: 7550,
  bentley_continental_gt3_2018: 7000,
  lexus_rc_f_gt3: 7700,
} as const)

export type OptimalShiftCarId = keyof typeof OPTIMAL_SHIFT_RPM_BY_ACC_CAR_ID

export function resolveOptimalShiftRpm(accCarIdentifier: unknown): number | null {
  if (typeof accCarIdentifier !== 'string') return null
  const carId = accCarIdentifier.trim() as OptimalShiftCarId
  if (!carId) return null
  const rpm = OPTIMAL_SHIFT_RPM_BY_ACC_CAR_ID[carId]
  return Number.isFinite(rpm) ? rpm : null
}
