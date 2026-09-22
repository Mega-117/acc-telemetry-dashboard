// PIP-437: in pista la sync cloud aspetta. PIP-443: si carica una volta sola per stint/sessione:
// a fine sessione (menu, uscita server, ACC chiuso, telemetria ferma) o dopo una sosta lunga ai box.
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  classifyLiveState,
  decideDrivingHold,
  INITIAL_DRIVING_HOLD_STATE,
  isCarOnTrack,
  LIVE_STATE_STALE_MS,
  mergeHeldFiles,
  PIT_STOP_RELEASE_MS
} from '~/services/sync/drivingSyncHoldPolicy'
import { createCloudOwnerLeaseController, setupAutoSyncController } from '~/services/sync/autoSyncController'
import { configureFirebaseOpsJournal, flushFirebaseOpsJournal } from '~/services/monitoring/firebaseOpsJournal'

const NOW = Date.parse('2026-09-21T22:52:50.000')
const MINUTE = 60_000

/** Il logger scrive ora locale senza fuso e con microsecondi. */
function loggerTimestamp(ms: number) {
  const local = new Date(ms - new Date(ms).getTimezoneOffset() * MINUTE)
  return local.toISOString().replace('Z', '') + '548'
}

function state(gate: Record<string, unknown>, freshAt = loggerTimestamp(NOW - 310)) {
  return { ts: freshAt, dryPressureLiveGate: { live: true, inPit: false, inPitLane: false, stationaryGarage: false, freshAt, ...gate } }
}

describe('classifyLiveState / isCarOnTrack', () => {
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

  it('distingue illeggibile, non live, stale, sosta e pista', () => {
    expect(classifyLiveState(undefined, NOW)).toBe('unreadable')
    expect(classifyLiveState(null, NOW)).toBe('unreadable')
    expect(classifyLiveState('{not json', NOW)).toBe('unreadable')
    expect(classifyLiveState(42, NOW)).toBe('unreadable')
    // File presente ma senza sessione: menu, replay, pausa o ACC chiuso.
    expect(classifyLiveState({ ts: 'bad' }, NOW)).toBe('not-live')
    expect(classifyLiveState(state({ live: false }), NOW)).toBe('not-live')
    expect(classifyLiveState(state({ live: false, inPitLane: true }), NOW)).toBe('not-live')
    expect(classifyLiveState(state({}), NOW + LIVE_STATE_STALE_MS + 1)).toBe('stale')
    expect(classifyLiveState(state({ inPitLane: true }), NOW + LIVE_STATE_STALE_MS + 1)).toBe('stale')
    expect(classifyLiveState(state({ freshAt: 'bad' }, 'bad'), NOW)).toBe('stale')
    expect(classifyLiveState(state({ inPitLane: true }), NOW)).toBe('stopped')
    expect(classifyLiveState(state({ inPit: true }), NOW)).toBe('stopped')
    expect(classifyLiveState(state({ stationaryGarage: true }), NOW)).toBe('stopped')
    expect(classifyLiveState(JSON.stringify(state({})), NOW)).toBe('on-track')
  })

  it('un solo descrittore per file, l\'ultimo', () => {
    const merged = mergeHeldFiles([{ name: 'a', mtime: 1 } as any], [{ name: 'a', mtime: 2 } as any, { name: 'b' } as any])
    expect(merged).toEqual([{ name: 'a', mtime: 2 }, { name: 'b' }])
  })
})

describe('decideDrivingHold (reducer puro)', () => {
  const stopped = (ms: number) => state({ inPitLane: true }, loggerTimestamp(ms))
  const onTrack = (ms: number) => state({}, loggerTimestamp(ms))

  it('in pista trattiene e azzera la sosta', () => {
    expect(decideDrivingHold(INITIAL_DRIVING_HOLD_STATE, onTrack(NOW), NOW)).toEqual({ action: 'hold', state: { stoppedSinceMs: null } })
    expect(decideDrivingHold({ stoppedSinceMs: NOW - MINUTE }, onTrack(NOW), NOW)).toEqual({ action: 'hold', state: { stoppedSinceMs: null } })
  })

  it('sosta breve trattiene e ricorda l\'inizio; oltre la soglia rilascia pit-timeout', () => {
    const first = decideDrivingHold(INITIAL_DRIVING_HOLD_STATE, stopped(NOW), NOW)
    expect(first).toEqual({ action: 'hold', state: { stoppedSinceMs: NOW } })
    const later = NOW + PIT_STOP_RELEASE_MS - 1
    expect(decideDrivingHold(first.state, stopped(later), later)).toEqual({ action: 'hold', state: { stoppedSinceMs: NOW } })
    const threshold = NOW + PIT_STOP_RELEASE_MS
    expect(decideDrivingHold(first.state, stopped(threshold), threshold))
      .toEqual({ action: 'release', reason: 'pit-timeout', state: { stoppedSinceMs: null } })
  })

  it('il timer della sosta riparte da zero dopo un rientro in pista', () => {
    let hold = decideDrivingHold(INITIAL_DRIVING_HOLD_STATE, stopped(NOW), NOW)
    let t = NOW + 2 * MINUTE
    hold = decideDrivingHold(hold.state, onTrack(t), t)
    expect(hold.state.stoppedSinceMs).toBeNull()
    t += 10 * MINUTE
    hold = decideDrivingHold(hold.state, stopped(t), t)
    expect(hold).toEqual({ action: 'hold', state: { stoppedSinceMs: t } })
    t += 2 * MINUTE
    expect(decideDrivingHold(hold.state, stopped(t), t).action).toBe('hold')
    t += MINUTE
    expect(decideDrivingHold(hold.state, stopped(t), t)).toMatchObject({ action: 'release', reason: 'pit-timeout' })
  })

  it('fine sessione, telemetria ferma e live state illeggibile rilasciano subito', () => {
    const during = { stoppedSinceMs: NOW - MINUTE }
    expect(decideDrivingHold(during, state({ live: false }, loggerTimestamp(NOW)), NOW))
      .toEqual({ action: 'release', reason: 'session-end', state: { stoppedSinceMs: null } })
    expect(decideDrivingHold(during, { ts: loggerTimestamp(NOW) }, NOW)).toMatchObject({ action: 'release', reason: 'session-end' })
    expect(decideDrivingHold(during, stopped(NOW - LIVE_STATE_STALE_MS - 1), NOW))
      .toEqual({ action: 'release', reason: 'telemetry-stale', state: { stoppedSinceMs: null } })
    expect(decideDrivingHold(during, undefined, NOW)).toEqual({ action: 'release', reason: 'live-unreadable', state: { stoppedSinceMs: null } })
    expect(decideDrivingHold(INITIAL_DRIVING_HOLD_STATE, '{broken', NOW)).toMatchObject({ action: 'release', reason: 'live-unreadable' })
  })
})

describe('autoSyncController: trattenuta in pista e rilascio per stint', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    configureFirebaseOpsJournal(null)
  })

  const POLL_MS = 1_000
  const filesChangedCalls = (mock: ReturnType<typeof vi.fn>) => mock.mock.calls.filter(([trigger]) => trigger === 'filesChanged')

  function setup(getLiveState: (nowMs: number) => Promise<unknown>) {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    vi.stubGlobal('window', { setTimeout, clearTimeout, addEventListener: () => {}, removeEventListener: () => {} })
    const journal = vi.fn()
    configureFirebaseOpsJournal({ enabled: true, send: journal })
    let onFiles: (data: any) => void = () => {}
    const leases = createCloudOwnerLeaseController()
    const handleTrigger = vi.fn(async () => {})
    const dispose = setupAutoSyncController({
      isElectron: true,
      electronAPI: { onFilesChanged: (callback) => { onFiles = callback }, getLiveState: () => getLiveState(Date.now()) },
      lease: leases.start('uid-1'),
      isLeaseCurrent: leases.isCurrent,
      handleTrigger,
      drivingHoldPollMs: POLL_MS,
      nowFn: Date.now
    })
    const releases = () => {
      flushFirebaseOpsJournal()
      return journal.mock.calls.flatMap(([batch]: any[]) => batch)
        .filter((event: any) => event.kind === 'session' && event.reason === 'sync-release')
        .map((event: any) => event.type)
    }
    return { handleTrigger, files: (names: string[]) => onFiles({ modified: names.map((name) => ({ name })) }), dispose, releases }
  }

  /** Scenario guidato dal test: il gate live riflette la fase corrente con dato sempre fresco. */
  function scenario() {
    let phase: 'track' | 'pit' | 'menu' | 'frozen' = 'track'
    let frozenAt = NOW
    const live = async (nowMs: number) => {
      if (phase === 'menu') return state({ live: false }, loggerTimestamp(nowMs))
      if (phase === 'frozen') return state({}, loggerTimestamp(frozenAt))
      return state({ inPitLane: phase === 'pit', inPit: phase === 'pit' }, loggerTimestamp(nowMs))
    }
    return {
      live,
      set: (next: typeof phase) => { if (next === 'frozen') frozenAt = Date.now(); phase = next }
    }
  }

  it('also holds changes received before authReady completes', async () => {
    const { handleTrigger, files, dispose } = setup(async (now) => state({}, loggerTimestamp(now)))
    files(['during-auth.json'])
    await vi.advanceTimersByTimeAsync(0)
    expect(filesChangedCalls(handleTrigger)).toHaveLength(0)
    dispose()
  })

  it('stint con due soste brevi e uscita dal server: un solo rilascio a fine sessione', async () => {
    const run = scenario()
    const { handleTrigger, files, releases, dispose } = setup(run.live)
    await vi.advanceTimersByTimeAsync(0)

    files(['session-1.json'])
    await vi.advanceTimersByTimeAsync(2 * MINUTE)
    files(['session-1.json'])
    run.set('pit')
    await vi.advanceTimersByTimeAsync(PIT_STOP_RELEASE_MS - 30_000)
    run.set('track')
    await vi.advanceTimersByTimeAsync(5 * MINUTE)
    files(['session-1.json', 'session-1.laps.json'])
    run.set('pit')
    await vi.advanceTimersByTimeAsync(PIT_STOP_RELEASE_MS - 30_000)
    run.set('track')
    await vi.advanceTimersByTimeAsync(3 * MINUTE)
    expect(filesChangedCalls(handleTrigger)).toHaveLength(0)
    expect(releases()).toEqual([])

    run.set('menu')
    await vi.advanceTimersByTimeAsync(POLL_MS)
    const calls = filesChangedCalls(handleTrigger)
    expect(calls).toHaveLength(1)
    expect((calls[0] as any)[1].files).toEqual([{ name: 'session-1.json' }, { name: 'session-1.laps.json' }])
    expect(releases()).toEqual(['session-end'])
    dispose()
  })

  it('sosta lunga ai box: rilascio pit-timeout, poi un secondo rilascio a fine sessione', async () => {
    const run = scenario()
    const { handleTrigger, files, releases, dispose } = setup(run.live)
    await vi.advanceTimersByTimeAsync(0)

    files(['session-1.json'])
    await vi.advanceTimersByTimeAsync(MINUTE)
    run.set('pit')
    await vi.advanceTimersByTimeAsync(PIT_STOP_RELEASE_MS - POLL_MS)
    // Un evento arrivato durante la sosta si unisce al gruppo trattenuto.
    files(['session-1.json'])
    expect(filesChangedCalls(handleTrigger)).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(2 * POLL_MS)
    expect(filesChangedCalls(handleTrigger)).toHaveLength(1)
    expect(releases()).toEqual(['pit-timeout'])

    // Ancora fermo ai box: nessun altro ciclo senza nuovi file.
    await vi.advanceTimersByTimeAsync(10 * MINUTE)
    expect(filesChangedCalls(handleTrigger)).toHaveLength(1)

    run.set('track')
    await vi.advanceTimersByTimeAsync(MINUTE)
    files(['session-1.json'])
    await vi.advanceTimersByTimeAsync(4 * MINUTE)
    expect(filesChangedCalls(handleTrigger)).toHaveLength(1)
    run.set('menu')
    await vi.advanceTimersByTimeAsync(POLL_MS)
    expect(filesChangedCalls(handleTrigger)).toHaveLength(2)
    expect(releases()).toEqual(['pit-timeout', 'session-end'])
    dispose()
  })

  it('un rientro in pista prima della soglia azzera il timer della sosta', async () => {
    const run = scenario()
    const { handleTrigger, files, dispose } = setup(run.live)
    await vi.advanceTimersByTimeAsync(0)
    files(['a.json'])
    run.set('pit')
    await vi.advanceTimersByTimeAsync(2 * MINUTE)
    run.set('track')
    await vi.advanceTimersByTimeAsync(POLL_MS)
    run.set('pit')
    await vi.advanceTimersByTimeAsync(2 * MINUTE)
    expect(filesChangedCalls(handleTrigger)).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(MINUTE + POLL_MS)
    expect(filesChangedCalls(handleTrigger)).toHaveLength(1)
    dispose()
  })

  it('menu o ACC chiuso rilasciano subito', async () => {
    const run = scenario()
    const { handleTrigger, files, releases, dispose } = setup(run.live)
    await vi.advanceTimersByTimeAsync(0)
    files(['a.json'])
    await vi.advanceTimersByTimeAsync(POLL_MS)
    expect(filesChangedCalls(handleTrigger)).toHaveLength(0)
    run.set('menu')
    await vi.advanceTimersByTimeAsync(POLL_MS)
    expect(filesChangedCalls(handleTrigger)).toHaveLength(1)
    expect(releases()).toEqual(['session-end'])
    dispose()
  })

  it('telemetria ferma (uscita dal server) rilascia con telemetry-stale', async () => {
    const run = scenario()
    const { handleTrigger, files, releases, dispose } = setup(run.live)
    await vi.advanceTimersByTimeAsync(0)
    files(['a.json'])
    await vi.advanceTimersByTimeAsync(POLL_MS)
    run.set('frozen')
    await vi.advanceTimersByTimeAsync(LIVE_STATE_STALE_MS - POLL_MS)
    expect(filesChangedCalls(handleTrigger)).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(2 * POLL_MS)
    expect(filesChangedCalls(handleTrigger)).toHaveLength(1)
    expect(releases()).toEqual(['telemetry-stale'])
    dispose()
  })

  it('senza segnale live leggibile carica subito come prima', async () => {
    const { handleTrigger, files, releases, dispose } = setup(async () => { throw new Error('no live state') })
    await vi.advanceTimersByTimeAsync(0)
    files(['a.json'])
    await vi.advanceTimersByTimeAsync(0)
    expect(filesChangedCalls(handleTrigger)).toHaveLength(1)
    expect(releases()).toEqual(['live-unreadable'])
    dispose()
  })

  it('senza bridge getLiveState carica subito', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('window', { setTimeout, clearTimeout, addEventListener: () => {}, removeEventListener: () => {} })
    let onFiles: (data: any) => void = () => {}
    const leases = createCloudOwnerLeaseController()
    const handleTrigger = vi.fn(async () => {})
    const dispose = setupAutoSyncController({
      isElectron: true,
      electronAPI: { onFilesChanged: (callback) => { onFiles = callback } },
      lease: leases.start('uid-1'), isLeaseCurrent: leases.isCurrent, handleTrigger
    })
    await vi.advanceTimersByTimeAsync(0)
    onFiles({ modified: [{ name: 'a.json' }] })
    await vi.advanceTimersByTimeAsync(0)
    expect(filesChangedCalls(handleTrigger)).toHaveLength(1)
    dispose()
  })

  it('retries a failed release without requiring another file event', async () => {
    const run = scenario()
    const { handleTrigger, files, releases, dispose } = setup(run.live)
    await vi.advanceTimersByTimeAsync(0)
    files(['a.json'])
    await vi.advanceTimersByTimeAsync(0)
    handleTrigger.mockRejectedValueOnce(new Error('offline'))
    run.set('menu')
    await vi.advanceTimersByTimeAsync(2 * POLL_MS)
    expect(filesChangedCalls(handleTrigger)).toHaveLength(2)
    expect(releases()).toEqual(['session-end'])
    dispose()
  })

  it('un rilascio pit-timeout fallito viene ritentato al controllo successivo, senza riaspettare', async () => {
    const run = scenario()
    const { handleTrigger, files, dispose } = setup(run.live)
    await vi.advanceTimersByTimeAsync(0)
    files(['a.json'])
    run.set('pit')
    handleTrigger.mockRejectedValueOnce(new Error('offline'))
    await vi.advanceTimersByTimeAsync(PIT_STOP_RELEASE_MS + POLL_MS)
    expect(filesChangedCalls(handleTrigger)).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(POLL_MS)
    expect(filesChangedCalls(handleTrigger)).toHaveLength(2)
    dispose()
  })

  it('dispose ferma il controllo periodico', async () => {
    const { handleTrigger, files, dispose } = setup(async (now) => state({}, loggerTimestamp(now)))
    await vi.advanceTimersByTimeAsync(0)
    files(['a.json'])
    await vi.advanceTimersByTimeAsync(0)
    dispose()
    await vi.advanceTimersByTimeAsync(10 * MINUTE)
    expect(filesChangedCalls(handleTrigger)).toHaveLength(0)
  })
})
