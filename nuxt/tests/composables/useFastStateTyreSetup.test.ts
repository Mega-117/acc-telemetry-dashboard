import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFastStatePoller } from '~/composables/useFastStatePoller'

const wheels = (base: number) => ({
  FL: base,
  FR: base + 0.1,
  RL: base + 0.2,
  RR: base + 0.3,
})

describe('useFastStatePoller tyre setup contract', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('espone il view model centralizzato senza ricalcolare le statistiche', async () => {
    const api = {
      getFastState: vi.fn(async () => ({
        ts: Date.now() / 1000,
        is_live: true,
        tyre_setup: {
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
            total_pressure_loss: wheels(0.4),
            starting_pressure: {
              status: 'available',
              source: 'mfd_applied',
              tyre_set: 3,
              values: wheels(26.1),
            },
          },
          total_pressure_loss: wheels(0),
          starting_pressure: {
            status: 'available',
            source: 'mfd_applied',
            tyre_set: 4,
            values: wheels(25.1),
          },
        },
      })),
    }
    const { fastState, startFastStatePolling, stopFastStatePolling } = useFastStatePoller(() => api)

    startFastStatePolling()
    await Promise.resolve()
    await Promise.resolve()

    expect(fastState.value.tyreSetup.lastLap?.pressure.high.FL).toBe(27.1)
    expect(fastState.value.tyreSetup.lastLap?.brakeTemperature?.low.RR).toBe(336.3)
    expect(fastState.value.tyreSetup.totalPressureLoss.FL).toBe(0.4)
    expect(fastState.value.tyreSetup.startingPressure.values?.FL).toBe(26.1)

    stopFastStatePolling()
  })
})
