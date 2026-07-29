import { describe, expect, it } from 'vitest'
import {
  OPTIMAL_SHIFT_RPM_BY_ACC_CAR_ID,
  resolveOptimalShiftRpm,
} from '~/config/optimalShiftRpm'

const EXPECTED = {
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
} as const

describe('optimalShiftRpm', () => {
  it('contiene esattamente la tabella approvata', () => {
    expect(OPTIMAL_SHIFT_RPM_BY_ACC_CAR_ID).toEqual(EXPECTED)
  })

  it.each(Object.entries(EXPECTED))('risolve %s a %i RPM', (car, rpm) => {
    expect(resolveOptimalShiftRpm(car)).toBe(rpm)
  })

  it.each([
    null,
    undefined,
    '',
    'Ferrari 296 GT3',
    'bentley_continental_gt3_2016',
    'mclaren_720s_gt3_evo',
    'porsche_718_cayman_gt4_mr',
    'future_car',
  ])('non applica fallback a %s', (car) => {
    expect(resolveOptimalShiftRpm(car)).toBeNull()
  })
})
