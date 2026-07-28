import { describe, expect, it } from 'vitest'
import {
  ACC_DRIVE_BRAKE_COLOR_RANGES,
  brakeTemperatureColor,
} from '../../app/utils/brakeTemperaturePresentation'

describe('brakeTemperaturePresentation', () => {
  it('uses the exact ACC Drive ranges for every brake compound and axle', () => {
    expect(ACC_DRIVE_BRAKE_COLOR_RANGES.standard.front).toEqual({
      lightBlue: [71, 180], green: [181, 490], yellow: [491, 580], orange: [581, 850],
    })
    expect(ACC_DRIVE_BRAKE_COLOR_RANGES.endurance.rear).toEqual({
      lightBlue: [61, 140], green: [141, 279], yellow: [280, 490], orange: [491, 850],
    })
    expect(ACC_DRIVE_BRAKE_COLOR_RANGES.wet.front).toEqual({
      lightBlue: [71, 72], green: [73, 490], yellow: [491, 700], orange: [701, 850],
    })
  })

  it('reproduces ACC Drive blue, cyan, green, yellow, orange and red endpoints', () => {
    expect(brakeTemperatureColor(70, 'FL', 0)).toBe('rgb(0, 0, 200)')
    expect(brakeTemperatureColor(180, 'FL', 0)).toBe('rgb(0, 200, 200)')
    expect(brakeTemperatureColor(490, 'FL', 0)).toBe('rgb(0, 200, 0)')
    expect(brakeTemperatureColor(580, 'FL', 0)).toBe('rgb(200, 255, 0)')
    expect(brakeTemperatureColor(850, 'FL', 0)).toBe('rgb(255, 55, 0)')
    expect(brakeTemperatureColor(851, 'FL', 0)).toBe('rgb(255, 0, 0)')
  })

  it('selects front/rear and compound-specific bands, with Qualy using Standard', () => {
    expect(brakeTemperatureColor(280, 'RL', 1)).toBe('rgb(0, 255, 0)')
    expect(brakeTemperatureColor(280, 'FL', 1)).toBe('rgb(0, 200, 120)')
    expect(brakeTemperatureColor(650, 'RR', 2)).toBe('rgb(200, 255, 0)')
    expect(brakeTemperatureColor(490, 'FL', 3)).toBe(brakeTemperatureColor(490, 'FL', 0))
  })

  it('degrades missing temperatures to the prior neutral brake blue', () => {
    expect(brakeTemperatureColor(null, 'FR', null)).toBe('rgb(20, 43, 208)')
  })
})
