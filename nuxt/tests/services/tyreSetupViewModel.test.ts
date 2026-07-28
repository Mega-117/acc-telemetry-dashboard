import { describe, expect, it } from 'vitest'
import {
  emptyTyreSetupViewModel,
  normalizeTyreSetupViewModel,
} from '~/services/overlay/tyreSetupViewModel'

const wheels = (base: number) => ({
  FL: base,
  FR: base + 0.1,
  RL: base + 0.2,
  RR: base + 0.3,
})

describe('tyreSetupViewModel', () => {
  it('normalizza lo snapshot centralizzato con finestre ultimo giro e run', () => {
    const model = normalizeTyreSetupViewModel({
      status: 'available',
      current_tyre_set: 3,
      compound: 'DRY',
      last_lap: {
        lap: 7,
        tyre_set: 3,
        compound: 'DRY',
        pressure: { high: wheels(27.1), avg: wheels(26.8) },
        tyre_temperature: {
          high: wheels(93),
          avg: wheels(90),
          low: wheels(87),
        },
        brake_temperature: {
          high: wheels(765),
          avg: wheels(554),
          low: wheels(336),
        },
        brake_compounds: { FL: 1, FR: 1, RL: 2, RR: 2 },
      },
      total_pressure_loss: wheels(0),
      starting_pressure: {
        status: 'available',
        source: 'mfd_applied',
        tyre_set: 3,
        values: wheels(26.1),
      },
    })

    expect(model.status).toBe('available')
    expect(model.lastLap?.pressure.avg.FL).toBe(26.8)
    expect(model.lastLap?.tyreTemperature?.low.RR).toBe(87.3)
    expect(model.lastLap?.brakeCompounds.RL).toBe(2)
    expect(model.totalPressureLoss.FR).toBe(0.1)
    expect(model.startingPressure).toMatchObject({
      status: 'available',
      source: 'mfd_applied',
      tyreSet: 3,
    })
  })

  it('rifiuta una pressione iniziale fisica o incompleta', () => {
    const physical = normalizeTyreSetupViewModel({
      starting_pressure: {
        status: 'available',
        source: 'physical_start',
        values: wheels(26),
      },
    })
    const incomplete = normalizeTyreSetupViewModel({
      starting_pressure: {
        status: 'available',
        source: 'mfd_applied',
        values: { FL: 26.1 },
      },
    })

    expect(physical.startingPressure.values).toBeNull()
    expect(incomplete.startingPressure.values).toBeNull()
  })

  it('degrada a valori vuoti senza inventare statistiche', () => {
    expect(normalizeTyreSetupViewModel(null)).toEqual(emptyTyreSetupViewModel())
    expect(normalizeTyreSetupViewModel({ status: 'available' }).lastLap).toBeNull()
    expect(normalizeTyreSetupViewModel({
      total_pressure_loss: { FL: null, FR: null, RL: null, RR: null },
    }).totalPressureLoss).toEqual({ FL: null, FR: null, RL: null, RR: null })
  })
})
