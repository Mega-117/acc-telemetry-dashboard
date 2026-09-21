// PIP-437: in pista la sync cloud aspetta; si carica una volta ai box, in pausa o a telemetria ferma.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isCarOnTrack, LIVE_STATE_STALE_MS, mergeHeldFiles } from '~/services/sync/drivingSyncHoldPolicy'
import { createCloudOwnerLeaseController, setupAutoSyncController } from '~/services/sync/autoSyncController'

const NOW = Date.parse('2026-09-21T22:52:50.000')
function state(gate: Record<string, unknown>, freshAt = '2026-09-21T22:52:49.690548') {
  return { ts: freshAt, dryPressureLiveGate: { live: true, inPit: false, inPitLane: false, stationaryGarage: false, freshAt, ...gate } }
}

describe('isCarOnTrack', () => {
  it('in pista solo con sessione live, fuori pit lane e telemetria fresca', () => {
    expect(isCarOnTrack(state({}), NOW)).toBe(true)
    expect(isCarOnTrack(state({ inPitLane: true }), NOW)).toBe(false)
    expect(isCarOnTrack(state({ inPit: true }), NOW)).toBe(false)
    expect(isCarOnTrack(state({ stationaryGarage: true }), NOW)).toBe(false)
    expect(isCarOnTrack(state({ live: false }), NOW)).toBe(false)
    expect(isCarOnTrack(state({}), NOW + LIVE_STATE_STALE_MS + 1_000)).toBe(false)
    expect(isCarOnTrack(null, NOW)).toBe(false)
    // get-live-state restituisce il contenuto del file come testo JSON.
    expect(isCarOnTrack(JSON.stringify(state({})), NOW)).toBe(true)
    expect(isCarOnTrack('{not json', NOW)).toBe(false)
    expect(isCarOnTrack({ ts: 'bad' }, NOW)).toBe(false)
  })

  it('un solo descrittore per file, l\'ultimo', () => {
    const merged = mergeHeldFiles([{ name: 'a', mtime: 1 } as any], [{ name: 'a', mtime: 2 } as any, { name: 'b' } as any])
    expect(merged).toEqual([{ name: 'a', mtime: 2 }, { name: 'b' }])
  })
})

describe('autoSyncController: trattenuta in pista', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function setup(getLiveState: () => Promise<unknown>) {
    vi.useFakeTimers()
    vi.stubGlobal('window', { setTimeout, clearTimeout, addEventListener: () => {}, removeEventListener: () => {} })
    let onFiles: (data: any) => void = () => {}
    const leases = createCloudOwnerLeaseController()
    const handleTrigger = vi.fn(async () => {})
    const dispose = setupAutoSyncController({
      isElectron: true,
      electronAPI: { onFilesChanged: (callback) => { onFiles = callback }, getLiveState },
      lease: leases.start('uid-1'),
      isLeaseCurrent: leases.isCurrent,
      handleTrigger,
      drivingHoldPollMs: 1_000,
      nowFn: () => NOW
    })
    return { handleTrigger, files: (names: string[]) => onFiles({ modified: names.map((name) => ({ name })) }), dispose }
  }
  const filesChangedCalls = (mock: ReturnType<typeof vi.fn>) => mock.mock.calls.filter(([trigger]) => trigger === 'filesChanged')

  it('also holds changes received before authReady completes', async () => {
    const { handleTrigger, files, dispose } = setup(async () => state({}))
    files(['during-auth.json'])
    await vi.advanceTimersByTimeAsync(0)
    expect(filesChangedCalls(handleTrigger)).toHaveLength(0)
    dispose()
  })

  it('retries a failed release without requiring another file event', async () => {
    let live: unknown = state({})
    const { handleTrigger, files, dispose } = setup(async () => live)
    await vi.advanceTimersByTimeAsync(0)
    files(['a.json'])
    await vi.advanceTimersByTimeAsync(0)
    handleTrigger.mockRejectedValueOnce(new Error('offline'))
    live = state({ inPitLane: true })
    await vi.advanceTimersByTimeAsync(2_000)
    expect(filesChangedCalls(handleTrigger)).toHaveLength(2)
    dispose()
  })

  it('trattiene i giri in pista e carica una volta sola rientrando ai box', async () => {
    let live: unknown = state({})
    const { handleTrigger, files } = setup(async () => live)
    await vi.advanceTimersByTimeAsync(0)

    files(['session-1.json'])
    await vi.advanceTimersByTimeAsync(0)
    files(['session-1.json'])
    await vi.advanceTimersByTimeAsync(3_000)
    expect(filesChangedCalls(handleTrigger)).toHaveLength(0)

    live = state({ inPitLane: true })
    await vi.advanceTimersByTimeAsync(1_000)
    const calls = filesChangedCalls(handleTrigger)
    expect(calls).toHaveLength(1)
    expect((calls[0] as any)[1].files).toEqual([{ name: 'session-1.json' }])
  })

  it('senza segnale live leggibile carica subito come prima', async () => {
    const { handleTrigger, files } = setup(async () => { throw new Error('no live state') })
    await vi.advanceTimersByTimeAsync(0)
    files(['a.json'])
    await vi.advanceTimersByTimeAsync(0)
    expect(filesChangedCalls(handleTrigger)).toHaveLength(1)
  })

  it('telemetria ferma (uscita dal server) rilascia i file trattenuti', async () => {
    let now = NOW
    vi.useFakeTimers()
    vi.stubGlobal('window', { setTimeout, clearTimeout, addEventListener: () => {}, removeEventListener: () => {} })
    let onFiles: (data: any) => void = () => {}
    const leases = createCloudOwnerLeaseController()
    const handleTrigger = vi.fn(async () => {})
    setupAutoSyncController({
      isElectron: true,
      electronAPI: { onFilesChanged: (callback) => { onFiles = callback }, getLiveState: async () => state({}) },
      lease: leases.start('uid-1'), isLeaseCurrent: leases.isCurrent, handleTrigger,
      drivingHoldPollMs: 1_000, nowFn: () => now
    })
    await vi.advanceTimersByTimeAsync(0)
    onFiles({ modified: [{ name: 'a.json' }] })
    await vi.advanceTimersByTimeAsync(0)
    expect(filesChangedCalls(handleTrigger)).toHaveLength(0)
    now += LIVE_STATE_STALE_MS + 5_000
    await vi.advanceTimersByTimeAsync(1_000)
    expect(filesChangedCalls(handleTrigger)).toHaveLength(1)
  })

  it('dispose ferma il controllo periodico', async () => {
    const { handleTrigger, files, dispose } = setup(async () => state({}))
    await vi.advanceTimersByTimeAsync(0)
    files(['a.json'])
    await vi.advanceTimersByTimeAsync(0)
    dispose()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(filesChangedCalls(handleTrigger)).toHaveLength(0)
  })
})
