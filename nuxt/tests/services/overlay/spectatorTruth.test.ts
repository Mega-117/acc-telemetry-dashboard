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
    const since = useCameraSince(() => roster.value as never, () => null)
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

describe('the reporter retries when a view has nothing to judge yet (Codex 03/11)', () => {
  it('a null reading keeps the check due', () => {
    const sent: unknown[] = []
    const reporter = createHudValuesReporter(inputs => sent.push(inputs), 60_000)
    const frame = (now: number, laps: number) => ({ now, laps, fresh: false, live: true, focused: true })
    let ready = false
    const other = () => (ready ? { inputs: { other: 1 }, shown: {} } : null)
    expect(reporter.feed(frame(0, 3), () => null, other)).toBe(false)
    ready = true
    expect(reporter.feed(frame(200, 3), () => null, other)).toBe(true)        // stale view still read
    ready = false
    expect(reporter.feed(frame(1000, 4), () => null, other)).toBe(false)      // lap done, nothing yet
    ready = true
    expect(reporter.feed(frame(1200, 4), () => null, other)).toBe(true)       // retried on the next frame
    expect(sent).toHaveLength(2)
  })
})

describe('useSpectatorCheck', () => {
  it('judges the car once settled, a frozen view only while the game runs, else nothing', async () => {
    const { ref } = await import('vue')
    const { useSpectatorCheck } = await import('~/services/overlay/spectatorTruth')
    const fastState = ref({ dataSource: 'focused', isFresh: true, isLive: true } as never)
    const focusedCar = ref(car(7, 2000) as never)
    const localFastState = ref({ isFresh: true, isLive: true } as never)
    const rosterState = ref({ snapshot: snapshot(7, [car(7, 2000, { race_number: 88 })]) })
    const check = useSpectatorCheck(() => null, { fastState, focusedCar, localFastState } as never,
      { state: rosterState, start: () => {}, stop: () => {} } as never)
    const now = Date.now()
    expect(check.read(now)).toMatchObject({ samePacket: true, settled: false, shown: { specLive: 'live' } })
    expect(check.read(now + 4000)).toMatchObject({ settled: true, inputs: { specCar: 7 }, shown: { specCar: '7' } })
    focusedCar.value = car(7, 1500) as never                                   // a poll behind: nothing yet
    expect(check.read(now + 100)).toBeNull()
  })
})

describe('useSpectatorCheck - frozen view', () => {
  it('a view kept on old data is frozen only while the game runs', async () => {
    const { nextTick, ref } = await import('vue')
    const { useSpectatorCheck } = await import('~/services/overlay/spectatorTruth')
    const fastState = ref({ dataSource: 'focused', isFresh: true, isLive: true } as never)
    const localFastState = ref({ isFresh: true, isLive: true } as never)
    const rosterState = ref({ snapshot: snapshot(7, [car(7, 2000)]) })
    const check = useSpectatorCheck(() => null, { fastState, focusedCar: ref(null), localFastState } as never,
      { state: rosterState, start: () => {}, stop: () => {} } as never)
    fastState.value = { dataSource: 'focused', isFresh: false, isLive: true } as never
    await nextTick()
    const at = Date.now() + 7000
    expect(check.read(at)).toMatchObject({ inputs: { specGameRunning: true }, shown: { specLive: 'stale' } })
    localFastState.value = { isFresh: true, isLive: false } as never                   // paused
    expect(check.read(at)).toBeNull()
  })
})
