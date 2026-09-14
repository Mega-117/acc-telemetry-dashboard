/**
 * Optimal shift points keyed by the raw ACC shared-memory `carModel` value.
 *
 * Existing 11 thresholds are preserved by user decision (PIP-414).
 * Additions use shiftRpm (flashing), not optRpm (color change).
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

  // Additional ACC cars: Armamentario Tools 1.0.10 shiftRpm (2026-09-15).
  alpine_a110_gt4: 6300,
  amr_v12_vantage_gt3: 7600,
  amr_v8_vantage_gt4: 6800,
  audi_r8_gt4: 8400,
  audi_r8_lms: 7900,
  audi_r8_lms_evo: 7900,
  audi_r8_lms_gt2: 8400,
  bentley_continental_gt3_2016: 7000,
  bmw_m2_cs_racing: 7000,
  bmw_m4_gt4: 7000,
  bmw_m6_gt3: 6300,
  chevrolet_camaro_gt4r: 7000,
  ferrari_488_challenge_evo: 7100,
  ferrari_488_gt3: 7100,
  ferrari_488_gt3_evo: 7100,
  ford_mustang_gt3: 8150,
  ginetta_g55_gt4: 7000,
  honda_nsx_gt3: 7100,
  jaguar_g3: 8100,
  ktm_xbow_gt2: 7250,
  ktm_xbow_gt4: 6300,
  lamborghini_gallardo_rex: 8200,
  lamborghini_huracan_gt3: 7900,
  lamborghini_huracan_gt3_evo: 7900,
  lamborghini_huracan_st: 7900,
  lamborghini_huracan_st_evo2: 7900,
  maserati_mc20_gt2: 7700,
  maserati_mc_gt4: 6800,
  mclaren_570s_gt4: 7400,
  mclaren_650s_gt3: 7000,
  mclaren_720s_gt3_evo: 7300,
  mercedes_amg_gt2: 7000,
  mercedes_amg_gt3: 7100,
  mercedes_amg_gt4: 6800,
  nissan_gt_r_gt3_2017: 7200,
  nissan_gt_r_gt3_2018: 7000,
  porsche_718_cayman_gt4_mr: 7600,
  porsche_935: 7100,
  porsche_991_gt2_rs_mr: 7100,
  porsche_991_gt3_r: 9000,
  porsche_991ii_gt3_cup: 8300,
  porsche_991ii_gt3_r: 9000,
  porsche_992_gt3_cup: 8300,
} as const)

export type OptimalShiftCarId = keyof typeof OPTIMAL_SHIFT_RPM_BY_ACC_CAR_ID

export function resolveOptimalShiftRpm(accCarIdentifier: unknown): number | null {
  if (typeof accCarIdentifier !== 'string') return null
  const carId = accCarIdentifier.trim() as OptimalShiftCarId
  if (!carId) return null
  const rpm = OPTIMAL_SHIFT_RPM_BY_ACC_CAR_ID[carId]
  return Number.isFinite(rpm) ? rpm : null
}
