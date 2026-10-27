import { describe, expect, it } from 'vitest'
import { deltaSeconds, liveWheels, recordedWheels, WHEEL_IDS } from '~/utils/datiWheels'
import type { LapTelemetry } from '~/types/telemetry'

const TEL: LapTelemetry = {
  pressure: { high: [27.4, 27.3, 27.2, 27.1], avg: [27.1, 27.0, 26.9, 26.8], loss: [0, 0.12, 0, 0] },
  tyre_temp: { high: [84, 80, 86, 82], avg: [78, 72, 83, 79], low: [70, 66, 76, 74] },
  brake_temp: { high: [649, 650, 606, 606], avg: [496, 494, 493, 492], low: [336, 334, 369, 367] },
  tyre: { wet: false, set: 4 },
  brakes: { front_pad: 'Standard', rear_pad: 'Standard', pad_life: [89.2, 89.3, 80, 80.1], disc_life: [98.7, 98.7, 96.9, 97] },
}

describe('recordedWheels', () => {
  it('groups the lap values wheel by wheel, in car order', () => {
    const wheels = recordedWheels(TEL)
    expect(wheels.map(w => w.id)).toEqual([...WHEEL_IDS])
    const [fl, fr] = wheels
    expect(fl!.metrics.map(m => m.label)).toEqual(['Pressione', 'Gomma', 'Freno', 'Usura'])
    expect(fl!.metrics[0]).toMatchObject({ value: '27.1 psi', detail: 'max 27.4' })
    // A drop shows only when the pressure fell in the lap.
    expect(fr!.metrics[0]!.detail).toBe('max 27.3 · calo 0.12')
    expect(fl!.metrics[1]).toMatchObject({ value: '78°', detail: '70–84°' })
    expect(fl!.metrics[2]).toMatchObject({ value: '496°', detail: '336–649°' })
    expect(fl!.metrics[3]).toMatchObject({ value: '89.2%', detail: 'disco 98.7%', color: null })
    // Pressure, tyre and brake carry the shared colour scale.
    expect(fl!.metrics.slice(0, 3).every(m => typeof m.color === 'string')).toBe(true)
  })

  it('shows "--" without colour for a lap recorded before the summary', () => {
    for (const wheel of recordedWheels(undefined)) {
      for (const metric of wheel.metrics) {
        expect(metric.value).toBe('--')
        expect(metric.color).toBeNull()
        expect(metric.detail).toBeUndefined()
      }
    }
  })
})

it('keeps each partial reading on its own', () => {
  const [fl] = recordedWheels({
    pressure: { high: [null, null, null, null], avg: [27, null, null, null], loss: [0.25, 0, 0, 0] },
    tyre_temp: { high: [95, null, null, null], avg: [80, null, null, null], low: [null, null, null, null] },
  })
  expect(fl!.metrics[0]!.detail).toBe('calo 0.25')
  expect(fl!.metrics[1]!.detail).toBe('--–95°')
})

describe('liveWheels', () => {
  it('reads the live tyre and the pressure correction for each wheel', () => {
    const wheels = liveWheels(id => id === 'FL'
      ? { pressurePsi: 27.05, pressureLossPsi: 0.2, coreTempC: 81.6, brakeTempC: 512, padLifePct: 88, discLifePct: 97.5, pad: 'standard', correction: { text: '+0.2', color: '#ffd43b' } }
      : undefined, false)
    const fl = wheels[0]!
    expect(fl.metrics.map(m => m.value)).toEqual(['27.1 psi', '+0.2', '82°', '512°', '88%'])
    expect(fl.metrics[0]!.detail).toBe('calo 0.20')
    expect(fl.metrics[1]!.color).toBe('#ffd43b')
    // A wheel without data (garage, sim closed) stays empty.
    expect(wheels[3]!.metrics.every(m => m.value === '--' && m.color === null)).toBe(true)
  })
})

describe('deltaSeconds', () => {
  it('signs the gap to the reference in seconds', () => {
    expect(deltaSeconds(105_095, 103_362)).toBe('+1.733')
    expect(deltaSeconds(36_855, 36_975)).toBe('−0.120')
    expect(deltaSeconds(36_975, 36_975)).toBe('±0.000')
    expect(deltaSeconds(null, 36_975)).toBe('')
    expect(deltaSeconds(36_975, 0)).toBe('')
  })
})
