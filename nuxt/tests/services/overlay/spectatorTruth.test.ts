import { describe, expect, it } from 'vitest'
import { rosterLapMs, spectatorTruth } from '~/services/overlay/spectatorTruth'
import { createHudValuesReporter } from '~/services/overlay/hudValuesReport'

const car = (index: number, at: number, extra: Record<string, unknown> = {}) =>
  ({ car_index: index, realtime_updated_at_ms: at, ...extra }) as never
const snapshot = (focused: number, cars: unknown[]) => ({ session: { focused_car_index: focused }, cars }) as never

describe('PIP-713: the truth for the view on another car', () => {
  it('the roster car the camera is on; values only on the same UDP packet', () => {
    const roster = snapshot(7, [car(3, 1000), car(7, 2000, { race_number: 88 })])
    expect(spectatorTruth(roster, car(7, 2000), 0, 5000)).toMatchObject({ samePacket: true, settled: true })
    expect(spectatorTruth(roster, car(7, 1750), 0, 5000).samePacket).toBe(false)          // a feed a poll behind
    expect(spectatorTruth(roster, car(3, 1000), 0, 5000)).toMatchObject({ samePacket: false })  // the view is on another car
    expect(spectatorTruth(roster, car(7, 2000), 4000, 5000).settled).toBe(false)          // camera just moved
    expect(spectatorTruth(snapshot(9, []), car(7, 2000), 0, 5000)).toMatchObject({ car: null, settled: false })
  })

  it('lap times as the standings choose them', () => {
    expect([rosterLapMs(107_792, 1), rosterLapMs(2147483647, 107_000), rosterLapMs(null, null)]).toEqual([107_792, 107_000, null])
  })

  it('the reporter reads the view on another car with its own reader, a few seconds after the switch', () => {
    const sent: Array<Record<string, unknown>> = []
    const reporter = createHudValuesReporter(inputs => sent.push(inputs), 60_000)
    const frame = (now: number, focused: boolean, laps = 3) => ({ now, laps, fresh: true, live: true, focused })
    const own = () => ({ inputs: { own: 1 }, shown: {} })
    const other = () => ({ inputs: { other: 1 }, shown: {} })
    expect(reporter.feed(frame(0, false), own, other)).toBe(true)
    expect(reporter.feed(frame(1000, true, 20), own, other)).toBe(false)      // just switched: not yet
    expect(reporter.feed(frame(6500, true, 20), own, other)).toBe(true)       // settled
    expect(reporter.feed(frame(7000, true, 21), own, other)).toBe(true)       // that car's lap done
    expect(sent).toEqual([{ own: 1 }, { other: 1 }, { other: 1 }])
    const plain = createHudValuesReporter(() => {}, 60_000)
    expect(plain.feed(frame(0, true), own)).toBe(false)                       // no reader: not reported
  })
})

describe('useCameraSince', () => {
  it('moves only when the camera goes to another car', async () => {
    const { nextTick, ref } = await import('vue')
    const { useCameraSince } = await import('~/services/overlay/spectatorTruth')
    const roster = ref<{ session: { focused_car_index: number } } | null>({ session: { focused_car_index: 1 } })
    const since = useCameraSince(() => roster.value as never)
    const first = since.value
    await new Promise(resolve => setTimeout(resolve, 5))
    roster.value = { session: { focused_car_index: 1 } }
    await nextTick()
    expect(since.value).toBe(first)
    roster.value = { session: { focused_car_index: 2 } }
    await nextTick()
    expect(since.value).toBeGreaterThan(first)
  })
})
