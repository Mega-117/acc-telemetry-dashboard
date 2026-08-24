import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { FastStateTyre } from '~/composables/useFastStatePoller'
import {
  BRAKE_PAD_LIFE_WARNING_PCT,
  buildBrakeAxlePresentation,
} from '~/utils/brakeAxlePresentation'

function tyre(id: FastStateTyre['id'], brakeTempC: number | null, padLifePct: number | null): FastStateTyre {
  return {
    id,
    wheelSlip: null,
    wheelSlipScaled: null,
    slipBand: 'white',
    slipState: 'ok',
    slipRatio: null,
    pressurePsi: null,
    pressureLossPsi: null,
    coreTempC: null,
    brakeTempC,
    brakeCompound: 0,
    padLifePct,
    discLifePct: null,
  }
}

describe('brakeAxlePresentation', () => {
  it('calcola entrambe le medie soltanto con i due lati disponibili', () => {
    const complete = buildBrakeAxlePresentation(tyre('FL', 300, 90), tyre('FR', 320, 80))
    expect(complete.temperatureAverageC).toBe(310)
    expect(complete.padLifeAveragePct).toBe(85)
    expect(complete.hasMissingData).toBe(false)
    const missing = buildBrakeAxlePresentation(tyre('FL', 300, 90), tyre('FR', null, null))
    expect(missing.temperatureAverageC).toBeNull()
    expect(missing.padLifeAveragePct).toBeNull()
    expect(missing.hasMissingData).toBe(true)
  })

  it('propaga l anomalia individuale anche quando la media temperatura ricade nel verde', () => {
    const model = buildBrakeAxlePresentation(tyre('FL', 100, 90), tyre('FR', 600, 90))
    expect(model.temperatureAverageC).toBe(350)
    expect(model.temperatureAnomaly).toBe(true)
    expect(model.leftTemperatureColor).not.toBe(model.rightTemperatureColor)
  })

  it('colora il valore aggregato usando la temperatura media mostrata', () => {
    const model = buildBrakeAxlePresentation(tyre('FL', 181, 90), tyre('FR', 850, 90))
    expect(model.temperatureAverageC).toBe(515.5)
    expect(model.temperatureAverageColor).toBe('rgb(54, 255, 0)')
    expect(model.temperatureAverageColor).not.toBe(model.leftTemperatureColor)
  })

  it('valuta l usura sui lati e non sulla media apparentemente normale', () => {
    const model = buildBrakeAxlePresentation(
      tyre('RL', 300, BRAKE_PAD_LIFE_WARNING_PCT - 1),
      tyre('RR', 300, 99),
    )
    expect(model.padLifeAveragePct).toBe(74)
    expect(model.wearAnomaly).toBe(true)
  })

  it('rende esplicito il dato asse mancante e lascia Setup sui quattro lati', () => {
    const live = readFileSync(resolve(process.cwd(), 'app/components/overlay/TyreAdvancedHud.vue'), 'utf8')
    const setup = readFileSync(resolve(process.cwd(), 'app/components/overlay/TyreSetupHud.vue'), 'utf8')
    expect(live).toContain("return value === null ? '—'")
    expect(setup).toContain('v-for=\"id in TYRE_WHEEL_IDS\"')
    expect(setup).toContain('brakeMetric(stat)[id]')
  })
})
