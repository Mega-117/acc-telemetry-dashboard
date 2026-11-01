// PIP-695: the comparison on open, a choice that is never replaced, a lap of another session as "Tu".
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { setLocale } from '~/i18n'

vi.mock('~/repositories/publicProfileRepository', () => ({ loadPublicNickname: vi.fn(async (uid: string) => uid === 'u2' ? 'RICO117' : 'Bob117') }))
vi.mock('~/services/telemetry/lapTraceChart', () => ({ normalizeLapTrace: (raw: unknown) => raw }))

import { useLapChoice } from '~/composables/useLapChoice'
import { useReferenceLibrary, type Entry } from '~/composables/useReferenceLibrary'
import type { LapTraceView } from '~/services/telemetry/lapTraceChart'
import { lapKey } from '~/services/telemetry/lapChoice'

setLocale('it')
const trace = (o: Partial<LapTraceView> = {}) => ({ gameId: 'acc', variant: null, track: 'spa', car: 'bmw', complete: true, valid: true, lapTimeS: 100, ...o }) as LapTraceView
const local = (n: number, ms: number, valid = true): Entry => ({ id: `L${n}`, lapNumber: n, lapTimeMs: ms, valid, complete: true, origin: 'local', sessionToken: '20261031_170000' })

function setup(o: { bridge?: Record<string, unknown>, readSession?: Parameters<typeof useLapChoice>[0]['readSession'], fetchImpl?: typeof fetch } = {}) {
  const entries = ref<Entry[]>([local(1, 101000), local(2, 100000), local(3, 100800)])
  const traces = ref<Record<string, LapTraceView>>({ L1: trace(), L2: trace(), L3: trace() })
  const lapId = ref('L3'), refId = ref('')
  const library = useReferenceLibrary({ entries, traces, refId, sessionToken: () => '20261031_170000', sectorTimesOf: () => null })
  const deps = { getToken: async () => 'token', fetchImpl: o.fetchImpl, origin: 'https://w.example' }
  const c = useLapChoice({ entries, traces, lapId, refId, library, sessionToken: () => '20261031_170000', pilotUid: () => null, myUid: () => 'me', sessionType: () => 'race',
    bridge: () => (o.bridge ?? null) as never, deps, readSession: o.readSession })
  return { entries, traces, lapId, refId, library, c }
}

describe('useLapChoice', () => {
  it('opens on my best with its reason; a step-up arriving later moves it only until I choose', () => {
    const s = setup()
    s.c.applyDefault()
    expect(s.refId.value).toBe('L2')
    expect(s.c.reason.value).toEqual({ kind: 'myBest' })
    expect(s.c.refCard.value?.mine).toBe(true)
    expect(s.c.youCard.value?.sessionType).toBe('race')
    // Tu is my best: the library's suggestion a step ahead takes over…
    s.lapId.value = 'L2'
    s.library.addLoaded({ id: 'library:x', lapNumber: 0, lapTimeMs: 99000, valid: true, complete: true, origin: 'library', sessionToken: '', driver: 'RICO117', ownerUid: 'u2' }, trace())
    s.library.suggestedId.value = 'library:x'
    s.c.applyDefault()
    expect(s.refId.value).toBe('library:x')
    expect(s.c.reason.value).toEqual({ kind: 'stepUp', driver: 'RICO117', pct: 1 })
    // …but never after a choice of mine.
    s.c.propose('L1', { kind: 'picked' })
    s.library.suggestedId.value = null
    s.c.applyDefault()
    expect(s.refId.value).toBe('L1')
    expect(s.c.userChose.value).toBe(true)
  })

  it('the PC lists the 40 newest laps; older ones come from the online archive, without duplicates', async () => {
    const items = Array.from({ length: 40 }, (_, i) => ({ id: `spa__bmw/lap_20261030_1000${String(i).padStart(2, '0')}_L001_99${String(i).padStart(3, '0')}ms.json.gz` }))
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ truncated: false, laps: [
      { lapId: 'a'.repeat(24), sessionToken: '20261001_090000', lapNumber: 3, lapTimeMs: 98000, valid: true, complete: true },
      { lapId: 'b'.repeat(24), sessionToken: '20261030_100000', lapNumber: 1, lapTimeMs: 99000, valid: true, complete: true },
    ] }))) as unknown as typeof fetch
    const s = setup({ bridge: { listLapTraces: vi.fn(async () => items), readLapTrace: vi.fn() }, fetchImpl })
    const { laps, truncated } = await s.c.source.listMine()
    expect(truncated).toBe(false)
    expect(laps.some(l => l.sessionToken === '20261001_090000')).toBe(true)
    expect(laps.filter(l => l.key === lapKey('me', '20261030_100000', 1))).toHaveLength(1)
  })

  it('a lap of another session on this PC becomes Tu, read once, with unknown validity said as such', async () => {
    const readLapTrace = vi.fn(async () => trace({ valid: null }))
    const bridge = { listLapTraces: vi.fn(async () => [{ id: 'spa__bmw/lap_20261030_100000_L004_99500ms.json.gz' }]), readLapTrace }
    const s = setup({ bridge })
    const { laps } = await s.c.source.listMine()
    const other = laps.find(l => l.sessionToken === '20261030_100000')!
    expect(other).toMatchObject({ key: lapKey('me', '20261030_100000', 4), status: 'unknown', mine: true })
    // The laps of this session are listed with their status from the session.
    expect(laps.filter(l => l.sessionToken === '20261031_170000')).toHaveLength(3)
    expect(await s.c.apply('you', other)).toBeNull()
    expect(s.lapId.value).toBe('history:spa__bmw/lap_20261030_100000_L004_99500ms.json.gz')
    expect(s.c.youCard.value?.status).toBe('unknown')
    expect(await s.c.apply('you', other)).toBeNull()
    expect(readLapTrace).toHaveBeenCalledTimes(1)
  })

  it('a lap of another track or an incomplete one is refused with a sentence, the comparison unchanged', async () => {
    const s = setup({ bridge: { readLapTrace: vi.fn(async () => trace({ track: 'monza' })) } })
    s.c.applyDefault()
    const choice = { key: 'k', ref: { kind: 'local' as const, id: 'x' }, ownerUid: 'me', driver: null, mine: true, lapNumber: 9, lapTimeMs: 1, sessionToken: '20261001_100000', status: 'valid' as const }
    expect(await s.c.apply('ref', choice)).toContain('monza')
    expect(s.refId.value).toBe('L2')
    const t2 = setup({ bridge: { readLapTrace: vi.fn(async () => trace({ complete: false })) } })
    expect(await t2.c.apply('you', choice)).toContain('incompleto')
  })

  it('a session link lists its laps by number and proposes its fastest valid one', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ laps: [
      { lapId: 'a'.repeat(24), lapNumber: 2, lapTimeMs: 99000, valid: false },
      { lapId: 'b'.repeat(24), lapNumber: 1, lapTimeMs: 99500, valid: true },
    ] }), { status: 200 })) as unknown as typeof fetch
    const s = setup({ fetchImpl, readSession: async () => ({ sessionToken: '20261029_200000', track: 'Spa' }) })
    const result = await s.c.source.resolveLink('https://app.racercore.app/sessioni/abc?userId=u2')
    expect(result?.state).toBe('session')
    if (result?.state !== 'session') return
    expect(result.choices.map(c => c.lapNumber)).toEqual([1, 2])
    expect(result.proposedKey).toBe(lapKey('u2', '20261029_200000', 1))
    expect(result.choices[0]!.ref).toMatchObject({ kind: 'archive', uid: 'u2', shared: 'abc' })
    const other = setup({ readSession: async () => ({ sessionToken: '20261029_200000', track: 'Monza' }) })
    expect(await other.c.source.resolveLink('https://x/sessioni/abc?userId=u2')).toMatchObject({ state: 'error' })
    expect(await setup().c.source.resolveLink('https://x/sessioni/abc?userId=u2')).toMatchObject({ state: 'error' })
    expect(await setup().c.source.resolveLink('ciao')).toMatchObject({ state: 'error' })
  })

  it('the leaderboard comes from the library with my best as the gap', async () => {
    const s = setup()
    s.library.libraryList.value = [{ libId: 'c'.repeat(24), uid: 'u2', lapTimeMs: 99000, recordedAt: null, grip: null, airC: null, roadC: null, fuelL: null }]
    s.library.libraryState.value = 'ready'
    await s.c.source.loadDriverNames()
    expect(s.c.source.driversState()).toBe('ready')
    expect(s.c.source.drivers()[0]).toMatchObject({ uid: 'u2', nickname: 'RICO117', gapMs: -1000, rank: 1 })
    // A driver with no archived laps still has the library lap.
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ laps: [] }), { status: 200 })) as unknown as typeof fetch
    const t2 = setup({ fetchImpl })
    t2.library.libraryList.value = s.library.libraryList.value
    expect((await t2.c.source.listDriverLaps('u2'))[0]).toMatchObject({ ref: { kind: 'library' }, lapTimeMs: 99000 })
  })

  // Codex 01/11: a lap still loading never lands on a pair changed meanwhile (swap, ✕).
  it('a lap that finishes loading after a swap is dropped, the swapped pair stays', async () => {
    let release!: (v: LapTraceView) => void
    const readLapTrace = vi.fn(() => new Promise<LapTraceView>(r => { release = r }))
    const bridge = { listLapTraces: vi.fn(async () => [{ id: 'spa__bmw/lap_20261030_100000_L004_99500ms.json.gz' }]), readLapTrace }
    const s = setup({ bridge })
    s.c.applyDefault()
    const { laps } = await s.c.source.listMine()
    const other = laps.find(l => l.sessionToken === '20261030_100000')!
    const pending = s.c.apply('ref', other)
    await Promise.resolve()
    s.c.swap()
    const pair = [s.lapId.value, s.refId.value]
    release(trace({ valid: null }))
    expect(await pending).toBeNull()
    expect([s.lapId.value, s.refId.value]).toEqual(pair)
  })

  // Codex 01/11: Annulla / Esc while a lap loads drops it; a new choice drops the one before.
  it('closing the chooser while a lap loads drops that lap', async () => {
    let release!: (v: LapTraceView) => void
    const readLapTrace = vi.fn(() => new Promise<LapTraceView>(r => { release = r }))
    const bridge = { listLapTraces: vi.fn(async () => [{ id: 'spa__bmw/lap_20261030_100000_L004_99500ms.json.gz' }]), readLapTrace }
    const s = setup({ bridge })
    s.c.applyDefault()
    const { laps } = await s.c.source.listMine()
    const other = laps.find(l => l.sessionToken === '20261030_100000')!
    const before = [s.lapId.value, s.refId.value]
    const pending = s.c.apply('ref', other)
    await Promise.resolve()
    s.c.cancelPending()
    release(trace({ valid: null }))
    expect(await pending).toBeNull()
    expect([s.lapId.value, s.refId.value]).toEqual(before)
  })

  it('a reason measured against Tu (next best) becomes "picked" when Tu changes', async () => {
    const s = setup()
    s.c.applyDefault()
    s.c.propose('L1', { kind: 'nextBest' })
    expect(s.c.reason.value?.kind).toBe('nextBest')
    const { laps } = { laps: s.c.source.sessionLaps() }
    await s.c.apply('you', laps.find(l => l.lapNumber === 2)!)
    expect(s.c.reason.value?.kind).toBe('picked')
  })

  it('the laps of a compared session are offered in Suggeriti and can be swapped when yours', () => {
    const s = setup()
    s.library.addLoaded({ id: 'compare:x', lapNumber: 9, lapTimeMs: 99000, valid: true, complete: true, origin: 'compare', sessionToken: '20261029_100000', label: 'Sessione 29/10 · Giro 9' }, trace())
    s.c.applyDefault()
    expect(s.c.source.suggested().some(c => c.ref.kind === 'entry' && c.ref.id === 'compare:x')).toBe(true)
    s.c.propose('compare:x', { kind: 'compare', label: 'x' })
    expect(s.c.canSwap.value).toBe(true)
  })

  it('swaps only two laps of mine', () => {
    const s = setup()
    s.c.applyDefault()
    expect(s.c.canSwap.value).toBe(true)
    s.c.swap()
    expect([s.lapId.value, s.refId.value]).toEqual(['L2', 'L3'])
    s.library.addLoaded({ id: 'library:y', lapNumber: 0, lapTimeMs: 1, valid: true, complete: true, origin: 'library', sessionToken: '' }, trace())
    s.c.propose('library:y', { kind: 'picked' })
    expect(s.c.canSwap.value).toBe(false)
  })
})
