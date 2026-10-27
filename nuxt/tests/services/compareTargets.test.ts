// PIP-652: the page's one "Confronta" seen from the Telemetria.
import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { useCompareTargets, type CompareTarget } from '~/composables/useCompareTargets'
import { useReferenceLibrary, CAR_MISMATCH_NOTE, type Entry } from '~/composables/useReferenceLibrary'
import type { LapTraceView } from '~/services/telemetry/lapTraceChart'

vi.mock('~/services/telemetry/sharedLapLoad', () => ({
  loadSharedLapLink: vi.fn(async (link: string) => link.includes('bad')
    ? { error: 'Questo giro è su Monza: si confronta solo con giri della stessa pista.' }
    : { lap: { id: 'shared:x', trace: { complete: true } as LapTraceView, label: 'Mike83 · Giro 4 · 1:43.100', lapNumber: 4, lapTimeMs: 103100, carMismatch: true } }),
}))

const flush = async () => { for (let i = 0; i < 6; i++) { await nextTick(); await new Promise(r => setTimeout(r, 0)) } }
const trace = { complete: true, valid: true } as unknown as LapTraceView

function setup(extra: Partial<Parameters<typeof useCompareTargets>[0]> = {}) {
  const entries = ref<Entry[]>([{ id: 'a', lapNumber: 1, lapTimeMs: 104000, valid: true, complete: true, origin: 'local', sessionToken: 't' }])
  const traces = ref<Record<string, LapTraceView>>({ a: trace }), refId = ref('a')
  const link = ref<string | null>(null), target = ref<CompareTarget | null>(null)
  const library = useReferenceLibrary({ entries, traces, sessionToken: () => 't', sectorTimesOf: () => null })
  const handled = vi.fn()
  const c = useCompareTargets({ pendingLapLink: () => link.value, compareWith: () => target.value, currentLap: () => trace, entries, traces, refId, library,
    deps: { getToken: async () => 'token' }, bridge: () => null, viewerUid: () => 'me', ownView: () => true, isCurrent: () => () => true, handled, ...extra })
  return { entries, traces, refId, link, target, library, handled, ...c }
}

describe('useCompareTargets (PIP-652)', () => {
  it('a lap link becomes the reference, with the other-car note; an error is shown, never a wrong lap', async () => {
    const s = setup()
    s.link.value = 'https://x/giro#ok'
    await flush()
    expect(s.handled).toHaveBeenCalled()
    expect(s.refId.value).toBe('shared:x')
    expect(s.entries.value.find(e => e.id === 'shared:x')?.note).toBe(CAR_MISMATCH_NOTE)
    s.link.value = 'https://x/giro#bad'
    await flush()
    expect(s.linkError.value).toContain('Monza')
  })
  it('a compared session brings its valid laps and proposes its best; clearing it takes them away', async () => {
    const s = setup()
    const loadCompareSession = vi.spyOn(s.library, 'loadCompareSession')
    const clear = vi.spyOn(s.library, 'clearCompareSession')
    loadCompareSession.mockResolvedValue('compare:best')
    s.target.value = { ownerUid: 'friend', sessionToken: '20261025_172328', sharedSessionId: '2026_10_25T17_23_28_Hungaroring', label: 'Mike83' }
    await flush()
    expect(loadCompareSession).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ list: expect.any(Function) }), s.target.value)
    expect(s.refId.value).toBe('compare:best')
    s.target.value = null
    await flush()
    expect(clear).toHaveBeenCalled()
  })
})
