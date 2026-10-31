import { describe, expect, it, vi } from 'vitest'
import { createSteadyDriving } from '~/services/pitwall/pitwallSteadyDriving'

describe('PIP-701 steady driving', () => {
  it('publishes a change only after it held, and asks for one re-read', () => {
    let now = 0
    const settle = vi.fn()
    const timers: Array<() => void> = []
    const steady = createSteadyDriving({ holdMs: 2500, now: () => now, onSettle: settle, schedule: callback => timers.push(callback), cancel: vi.fn() })
    expect(steady.read(true)).toBe(true)
    now = 1000; expect(steady.read(false)).toBe(true) // force feedback dropped for a moment
    now = 1500; expect(steady.read(true)).toBe(true) // back: nothing changed for the room
    now = 2000; expect(steady.read(false)).toBe(true)
    now = 4600; expect(steady.read(false)).toBe(false) // held 2.6 s: now it counts
    expect(timers).toHaveLength(2)
    timers[1]!(); expect(settle).toHaveBeenCalledOnce()
  })

  it('a flickering signal never reaches the room', () => {
    let now = 0
    const steady = createSteadyDriving({ holdMs: 2500, now: () => now, schedule: () => 0, cancel: () => {} })
    const published = new Set<boolean>()
    for (let i = 0; i < 40; i++) { now = i * 300; published.add(steady.read(i % 2 === 0)) }
    expect([...published]).toEqual([true])
  })

  it('reset forgets the previous account or session', () => {
    const steady = createSteadyDriving({ schedule: () => 0, cancel: () => {} })
    steady.read(true); steady.reset()
    expect(steady.read(false)).toBe(false)
  })
})
