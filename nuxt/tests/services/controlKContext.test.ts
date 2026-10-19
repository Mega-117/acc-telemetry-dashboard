import { describe, expect, it } from 'vitest'
import { resolveControlKContext, type ControlKContextInput } from '~/services/overlay/controlKContext'

const base: ControlKContextInput = {
  isLive: true, speedKmh: 0, isInPitBox: false, isInPitLane: false, isSetupMenuVisible: false,
  isEngineRunning: true, sessionType: 0, lapsCompleted: 4,
}
const at = (patch: Partial<ControlKContextInput>, previous: 'pause' | 'drive' | null = null) =>
  resolveControlKContext({ ...base, ...patch }, previous)

describe('Control K context (PIP-556)', () => {
  it('expands only when stopped in the box, pit lane, setup screen or grid', () => {
    expect(at({ isInPitBox: true, isEngineRunning: false })).toBe('pause')
    expect(at({ isInPitLane: true })).toBe('pause')
    expect(at({ isSetupMenuVisible: true })).toBe('pause')
    expect(at({ sessionType: 2, lapsCompleted: 0, isEngineRunning: false })).toBe('pause')
  })

  it('stays compact when the car stops on track', () => {
    expect(at({ speedKmh: 0 })).toBe('drive')
    expect(at({ speedKmh: 0, isEngineRunning: false })).toBe('drive')
    // A race already under way is not the grid, even with the engine off.
    expect(at({ sessionType: 2, lapsCompleted: 3, isEngineRunning: false })).toBe('drive')
    // The grid with the engine running (formation about to start) is driving.
    expect(at({ sessionType: 2, lapsCompleted: 0, isEngineRunning: true })).toBe('drive')
  })

  it('is compact while moving, even in the pit lane', () => {
    expect(at({ isInPitLane: true, speedKmh: 60 })).toBe('drive')
    expect(at({ isInPitBox: true, speedKmh: 12 })).toBe('drive')
  })

  it('keeps pause for small creeping and leaves it when really moving', () => {
    expect(at({ isInPitBox: true, speedKmh: 2 }, 'pause')).toBe('pause')
    expect(at({ isInPitBox: true, speedKmh: 2 }, 'drive')).toBe('drive')
    expect(at({ isInPitBox: true, speedKmh: 4 }, 'pause')).toBe('drive')
  })

  it('treats menus without live telemetry as pause and keeps the last context without speed', () => {
    expect(at({ isLive: false, speedKmh: null })).toBe('pause')
    expect(at({ speedKmh: null }, 'drive')).toBe('drive')
    expect(at({ speedKmh: null }, 'pause')).toBe('pause')
    expect(at({ speedKmh: Number.NaN })).toBe('drive')
  })
})
