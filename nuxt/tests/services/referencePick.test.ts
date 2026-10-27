import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { gzipSync } from 'node:zlib'
import { conditionDistance, pickReferences, type ReferenceConditions } from '~/services/telemetry/referencePick'
import { getLibraryPreference, listLibrary, setLibraryPreference, type LibraryEntry } from '~/services/telemetry/lapsArchiveClient'
import { useReferenceLibrary, type Entry } from '~/composables/useReferenceLibrary'
import type { LapTraceView } from '~/services/telemetry/lapTraceChart'

const mine: ReferenceConditions = { grip: 'Optimum', airC: 22, roadC: 30, fuelL: 40 }
const e = (libId: string, uid: string, lapTimeMs: number, c: Partial<ReferenceConditions> = {}): LibraryEntry =>
  ({ libId: libId.padEnd(24, '0'), uid, lapTimeMs, recordedAt: null, grip: 'Optimum', airC: 22, roadC: 30, fuelL: 40, ...c })

describe('pickReferences (PIP-650)', () => {
  it('suggests a step above your best (0.5-2% quicker) in the closest conditions, and keeps the fastest', () => {
    const entries = [e('a', 'u1', 101500, { grip: 'Green', airC: 10 }), e('b', 'u2', 101800), e('c', 'u3', 99000), e('d', 'me', 100000)]
    const { suggested, fastest } = pickReferences(entries, { myUid: 'me', myBestMs: 103000, mine })
    expect(suggested?.uid).toBe('u2')
    expect(fastest?.uid).toBe('u3')
  })
  it('without anyone in the step, the nearest quicker driver; quicker than everyone, no suggestion', () => {
    const entries = [e('a', 'u1', 95000), e('b', 'u2', 97000)]
    expect(pickReferences(entries, { myUid: 'me', myBestMs: 103000, mine }).suggested?.uid).toBe('u2')
    const top = pickReferences(entries, { myUid: 'me', myBestMs: 94000, mine })
    expect(top.suggested).toBeNull()
    expect(top.fastest?.uid).toBe('u1')
  })
  it('never suggests your own lap, and does not repeat the fastest when it is the suggestion', () => {
    expect(pickReferences([e('a', 'me', 100000)], { myUid: 'me', myBestMs: 101000, mine })).toEqual({ suggested: null, fastest: null })
    const one = pickReferences([e('a', 'u1', 100500)], { myUid: 'me', myBestMs: 101000, mine })
    expect(one.suggested?.uid).toBe('u1')
    expect(one.fastest).toBeNull()
  })
  it('measures conditions: same grip and temperatures are closest; unknown values cost a little', () => {
    expect(conditionDistance(mine, mine)).toBe(0)
    expect(conditionDistance({ ...mine, grip: 'Wet' }, mine)).toBe(1)
    expect(conditionDistance({ grip: null, airC: null, roadC: null, fuelL: null }, mine)).toBe(2)
    expect(conditionDistance({ ...mine, airC: 27 }, mine)).toBe(1)
  })
})

describe('library client and loading (PIP-650)', () => {
  const deps = (fetchImpl: typeof fetch) => ({ getToken: async () => 'token', fetchImpl, origin: 'https://w.example' })
  it('lists entries (dropping malformed ones) and reads / writes your preference', async () => {
    const calls: string[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      if (url.includes('/v1/library?')) return new Response(JSON.stringify({ entries: [e('a', 'u1', 100000), { libId: 'bad', uid: 'x', lapTimeMs: 1 }] }))
      return new Response(JSON.stringify({ share: init?.method === 'PUT' ? JSON.parse(String(init.body)).share : false }))
    }) as unknown as typeof fetch
    expect(await listLibrary({ game: 'acc', track: 'Hungaroring', car: 'ferrari_296_gt3', variant: null }, deps(fetchImpl))).toHaveLength(1)
    expect(calls[0]).toBe('GET https://w.example/v1/library?game=acc&track=Hungaroring&car=ferrari_296_gt3&variant=')
    expect(await getLibraryPreference(deps(fetchImpl))).toBe(false)
    expect(await setLibraryPreference(true, deps(fetchImpl))).toBe(true)
  })
  it('loads the suggested and the fastest lap with the driver nickname', async () => {
    // A 4.4 km lap on the 2 m grid; its declared time decides the speed check.
    const body = (seconds: number, meta: Record<string, unknown> = {}) => {
      const time = Array.from({ length: 2201 }, (_, i) => i * seconds / 2200)
      return gzipSync(Buffer.from(JSON.stringify({ schema: 'acc.laptrace.v1', grid_step_m: 2, meta: { track: 'Hungaroring', car: 'ferrari_296_gt3', lap_time_s: seconds, complete: true, valid: true, ...meta },
        channels: { time_s: time, speed_kmh: time, brake_pct: time.map(() => 0), throttle_pct: time.map(() => 100) } })))
    }
    const bodies: Record<string, Buffer> = { a: body(101.8), c: body(99), d: body(100.5, { track: 'Monza' }), f: body(20) }
    const fetchImpl = (async (url: string) => url.includes('/v1/library?')
      ? new Response(JSON.stringify({ entries: [e('a', 'u1', 101800), e('c', 'u3', 99000)] }))
      : new Response(bodies[url.split('/lap/')[1]![0]!], { headers: { 'X-Lap-Owner-Uid': 'u1' } })) as unknown as typeof fetch
    const entries = ref<Entry[]>([]), traces = ref<Record<string, LapTraceView>>({})
    const library = useReferenceLibrary({ entries, traces, sessionToken: () => 't', sectorTimesOf: () => null })
    const suggestedId = await library.loadOtherDrivers(() => true, { ...deps(fetchImpl), loadNickname: async uid => uid === 'u1' ? 'Mike83' : null },
      { game: 'acc', track: 'Hungaroring', car: 'ferrari_296_gt3', variant: null }, { myUid: 'me', myBestMs: 103000, mine })
    expect(entries.value.map(x => x.label)).toEqual(['Mike83 · 1:41.800 · consigliato', 'Pilota · 1:39.000 · il più veloce'])
    expect(entries.value.every(x => x.origin === 'library' && traces.value[x.id])).toBe(true)
    expect(suggestedId).toBe(`library:${'a'.padEnd(24, '0')}`)
    // Review: a lap that disagrees with what was declared (another track, an impossible speed) is never offered.
    const odd = ref<Entry[]>([])
    const oddFetch = (async (url: string) => url.includes('/v1/library?')
      ? new Response(JSON.stringify({ entries: [e('d', 'u4', 100500), e('f', 'u5', 20000)] }))
      : new Response(bodies[url.split('/lap/')[1]![0]!])) as unknown as typeof fetch
    expect(await useReferenceLibrary({ entries: odd, traces: ref({}), sessionToken: () => 't', sectorTimesOf: () => null })
      .loadOtherDrivers(() => true, deps(oddFetch), { game: 'acc', track: 'Hungaroring', car: 'ferrari_296_gt3', variant: null }, { myUid: 'me', myBestMs: 101500, mine })).toBeNull()
    expect(odd.value).toEqual([])
    // A stale load adds nothing.
    const stale = ref<Entry[]>([])
    await useReferenceLibrary({ entries: stale, traces: ref({}), sessionToken: () => 't', sectorTimesOf: () => null })
      .loadOtherDrivers(() => false, deps(fetchImpl), { game: 'acc', track: 'Hungaroring', car: 'ferrari_296_gt3', variant: null }, { myUid: 'me', myBestMs: 103000, mine })
    expect(stale.value).toEqual([])
  })
})
