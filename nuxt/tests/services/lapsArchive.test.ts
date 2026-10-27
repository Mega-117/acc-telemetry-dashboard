// PIP-623: link "Condividi giro", client dell'archivio giri, sorgenti dei giri e riepilogo admin.
import { describe, expect, it, vi } from 'vitest'
import { gzipSync } from 'node:zlib'
import { buildLapShareLink, lapShareErrorMessage, parseLapShareLink, LAP_SHARE_LINK_BASE } from '~/services/telemetry/lapShareLink'
import { fetchSharedLap, gunzipBounded, listPilotLaps, LapsArchiveError, readLapBody } from '~/services/telemetry/lapsArchiveClient'
import { electronLapSource, listOwnLaps, parseLocalLapId, pilotLapSource } from '~/services/telemetry/lapSources'
import { lapsArchiveModel, reasonLabel, type LapsSummary } from '~/repositories/lapsArchiveRepository'

const SHARE = 'a'.repeat(32), KEY = 'b'.repeat(32), LAP_ID_HEX = 'c'.repeat(24)
const lap = (channels: Record<string, number[]> = { time_s: [0, 1, 2], speed_kmh: [100, 110, 120], brake_pct: [0, 0, 5], throttle_pct: [100, 90, 0] }) => ({
  schema: 'acc.laptrace.v1', grid_step_m: 2,
  meta: { track: 'Hungaroring', car: 'ferrari_296_gt3', lap_time_s: 104.31, complete: true, valid: true, extra: { lap_number: 5 } }, channels,
})
const gz = (value: unknown) => new Uint8Array(gzipSync(Buffer.from(JSON.stringify(value))))
const binary = (body: Uint8Array, headers: Record<string, string> = {}) => new Response(body as unknown as BodyInit, { status: 200, headers })
const deps = (fetchImpl: typeof fetch) => ({ getToken: async () => 'token', fetchImpl, origin: 'https://w.example' })

describe('lap share link', () => {
  it('builds the link with the key in the fragment and parses every pasted form', () => {
    const link = buildLapShareLink(SHARE, KEY)
    expect(link).toBe(`${LAP_SHARE_LINK_BASE}#${SHARE}.${KEY}`)
    expect(parseLapShareLink(link)).toEqual({ shareId: SHARE, key: KEY })
    expect(parseLapShareLink(`  #${SHARE}.${KEY} `)).toEqual({ shareId: SHARE, key: KEY })
    expect(parseLapShareLink(`${SHARE}.${KEY}`.toUpperCase())).toEqual({ shareId: SHARE, key: KEY })
    expect(parseLapShareLink('https://example.com/giro#nope')).toBeNull()
    expect(parseLapShareLink(42)).toBeNull()
    expect(parseLapShareLink('x'.repeat(500))).toBeNull()
  })

  it('maps wrapped Electron errors to short Italian messages', () => {
    expect(lapShareErrorMessage(new Error("Error invoking remote method 'share-lap-trace': Error: archive-paused"))).toContain('in pausa')
    expect(lapShareErrorMessage('share-daily-cap')).toContain('condivisioni di oggi')
    expect(lapShareErrorMessage(new Error('owner-changed'))).toContain('Accedi')
    expect(lapShareErrorMessage(new Error('archive-disabled'))).toContain('non disponibile')
    expect(lapShareErrorMessage(new Error('boom'))).toContain('non riuscita')
  })
})

describe('archive client', () => {
  it('reads a shared lap with the key header and returns trace and owner metadata', async () => {
    const fetchImpl = vi.fn(async () => binary(gz(lap()), { 'X-Lap-Owner-Uid': 'uid-1', 'X-Lap-Number': '5', 'X-Lap-Time-Ms': '104310', 'X-Lap-Track': 'Hungaroring' }))
    const { trace, meta } = await fetchSharedLap({ shareId: SHARE, key: KEY }, deps(fetchImpl as unknown as typeof fetch))
    expect(fetchImpl).toHaveBeenCalledWith(`https://w.example/v1/laps/shared/${SHARE}`, expect.objectContaining({ headers: expect.objectContaining({ 'X-Share-Key': KEY, Authorization: 'Bearer token' }) }))
    expect((trace as ReturnType<typeof lap>).meta.track).toBe('Hungaroring')
    expect(meta).toMatchObject({ ownerUid: 'uid-1', lapNumber: 5, lapTimeMs: 104310 })
  })

  it('turns Worker refusals into readable Italian errors', async () => {
    const fail = (status: number) => fetchSharedLap({ shareId: SHARE, key: KEY }, deps((async () => new Response('{}', { status })) as unknown as typeof fetch))
    await expect(fail(404)).rejects.toThrow('Giro non trovato')
    await expect(fail(503)).rejects.toThrow('in pausa')
    await expect(fetchSharedLap({ shareId: SHARE, key: KEY }, { getToken: async () => null })).rejects.toThrow('Accedi')
    await expect(fetchSharedLap({ shareId: SHARE, key: KEY }, deps((async () => { throw new Error('net') }) as unknown as typeof fetch))).rejects.toBeInstanceOf(LapsArchiveError)
  })

  it('refuses oversized, bomb-like or malformed laps before using them', async () => {
    const bomb = new Uint8Array(gzipSync(Buffer.alloc(5 * 1024 * 1024, 0x20)))
    await expect(gunzipBounded(bomb, 1024 * 1024)).rejects.toThrow('troppo grande')
    await expect(readLapBody(binary(new Uint8Array(300 * 1024)))).rejects.toThrow('dimensione')
    await expect(readLapBody(binary(new Uint8Array([1, 2, 3])))).rejects.toThrow('Giro non valido')
    const many = Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`c${i}`, [0, 1]]))
    await expect(readLapBody(binary(gz(lap(many))))).rejects.toThrow('troppi canali')
    await expect(readLapBody(binary(gz({ schema: 'x' })))).rejects.toThrow('mancano i canali')
    await expect(readLapBody(binary(gz(lap({ time_s: Array.from({ length: 20001 }, (_, i) => i) }))))).rejects.toThrow('troppi canali o campioni')
  })

  it('PIP-648: decodes laps uploaded as integer deltas back to their values; unknown formats are refused', async () => {
    // time_s 0, 1.5, 3.25 (3 decimals) and steer 0.1234, -0.05 (4 decimals), as lapUploadPayload.js writes them.
    const { channels: _plain, ...base } = lap()
    const encoded = { ...base, encoding: 'qdelta1', channel_decimals: { time_s: 3, steer_deg: 4 }, channels_qd: { time_s: [0, 1500, 1750], steer_deg: [1234, -1734, 500] } }
    const out = await readLapBody(binary(gz(encoded))) as { channels: Record<string, number[]>, encoding?: string, channels_qd?: unknown }
    expect(out.channels.time_s).toEqual([0, 1.5, 3.25])
    expect(out.channels.steer_deg).toEqual([0.1234, -0.05, 0])
    expect(out.encoding).toBeUndefined()
    expect(out.channels_qd).toBeUndefined()
    await expect(readLapBody(binary(gz({ ...encoded, encoding: 'zstd' })))).rejects.toThrow('formato sconosciuto')
    await expect(readLapBody(binary(gz({ ...encoded, channel_decimals: { time_s: 3 } })))).rejects.toThrow('formato sconosciuto')
    await expect(readLapBody(binary(gz({ ...encoded, channels_qd: { time_s: [0, 1.5] }, channel_decimals: { time_s: 3 } })))).rejects.toThrow('illeggibile')
    // Review: integers beyond exact range, or running sums that leave it, are refused.
    await expect(readLapBody(binary(gz({ ...encoded, channels_qd: { time_s: [2 ** 41] }, channel_decimals: { time_s: 3 } })))).rejects.toThrow('illeggibile')
    await expect(readLapBody(binary(gz({ ...encoded, channels_qd: { time_s: [2 ** 40, 2 ** 40] }, channel_decimals: { time_s: 3 } })))).rejects.toThrow('illeggibile')
    // An encoded lap without channels_qd (or an older reader looking at `channels`) never misreads deltas as values.
    await expect(readLapBody(binary(gz({ ...base, encoding: 'qdelta1', channel_decimals: {}, channels: { time_s: [0, 1500] } })))).rejects.toThrow('mancano i canali')
    // Older plain laps keep working.
    expect(((await readLapBody(binary(gz(lap())))) as { channels: Record<string, number[]> }).channels.time_s).toEqual([0, 1, 2])
  })

  it('PIP-651: a shared session asks the Worker with its id, for the list and each lap', async () => {
    const urls: string[] = []
    const fetchImpl = (async (url: string) => { urls.push(url); return url.includes('/laps/of/') && !url.includes(LAP_ID_HEX)
      ? new Response(JSON.stringify({ laps: [{ lapId: LAP_ID_HEX, lapNumber: 5, lapTimeMs: 104310, valid: true }] })) : binary(gz(lap())) }) as unknown as typeof fetch
    const source = pilotLapSource('owner-1', deps(fetchImpl), '2026_10_25T17_23_28_Hungaroring')
    const [first] = await source.list('20261025_172328')
    await source.read(first!)
    expect(urls).toEqual([
      'https://w.example/v1/laps/of/owner-1/20261025_172328?shared=2026_10_25T17_23_28_Hungaroring',
      `https://w.example/v1/laps/of/owner-1/20261025_172328/${LAP_ID_HEX}?shared=2026_10_25T17_23_28_Hungaroring`,
    ])
  })

  it('stops reading a body that exceeds the compressed cap while it streams', async () => {
    let pulled = 0
    const stream = new ReadableStream<Uint8Array>({ pull(controller) { pulled += 1; controller.enqueue(new Uint8Array(64 * 1024)) } })
    await expect(readLapBody(new Response(stream))).rejects.toThrow('dimensione')
    expect(pulled).toBeLessThan(10)
  })

  it('never follows redirects and times out a stalled body', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.redirect).toBe('error')
      const stalled = new ReadableStream<Uint8Array>({ start() {} })
      init.signal?.addEventListener('abort', () => { /* body never resolves; the deadline aborts it */ })
      return new Response(stalled, { status: 200 })
    })
    await expect(fetchSharedLap({ shareId: SHARE, key: KEY }, { ...deps(fetchImpl as unknown as typeof fetch), timeoutMs: 50 })).rejects.toBeInstanceOf(LapsArchiveError)
  })

  it('follows the pilot list cursor', async () => {
    const pages = [
      { laps: [{ lapId: '1'.repeat(24), lapNumber: 1, lapTimeMs: 100000, valid: true }], truncated: true, cursor: 'c1' },
      { laps: [{ lapId: '2'.repeat(24), lapNumber: 2, lapTimeMs: 101000, valid: true }], truncated: false, cursor: null },
    ]
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(pages.shift()), { status: 200 }))
    const laps = await listPilotLaps('uid-1', '20261025_175240', deps(fetchImpl as unknown as typeof fetch))
    expect(laps.map(l => l.lapNumber)).toEqual([1, 2])
    expect(fetchImpl.mock.calls[1]![0]).toContain('?cursor=c1')
  })
})

describe('lap sources', () => {
  it('parses local lap ids and lists the session laps through the bridge', async () => {
    expect(parseLocalLapId('h__c/lap_20261025_175240_L005_104310ms.json.gz')).toEqual({ sessionToken: '20261025_175240', lapNumber: 5, lapTimeMs: 104310 })
    expect(parseLocalLapId('reference')).toBeNull()
    const bridge = { listLapTraces: vi.fn(async () => [{ id: 'h__c/lap_20261025_175240_L005_104310ms.json.gz' }, { id: 'reference' }]), readLapTrace: vi.fn(async () => lap()) }
    const list = await electronLapSource(bridge).list('20261025_175240')
    expect(bridge.listLapTraces).toHaveBeenCalledWith({ sessionToken: '20261025_175240' })
    expect(list).toEqual([expect.objectContaining({ lapNumber: 5, origin: 'local', valid: null })])
    const own = await listOwnLaps(bridge, 'Hungaroring', 'ferrari_296_gt3')
    expect(bridge.listLapTraces).toHaveBeenLastCalledWith({ track: 'Hungaroring', car: 'ferrari_296_gt3' })
    expect(own[0]!.id.startsWith('own:')).toBe(true)
    expect(await listOwnLaps({}, 'a', 'b')).toEqual([])
  })

  it('pilot source lists from the archive with explicit descriptors', async () => {
    const fetchImpl = vi.fn(async (url: string) => url.includes('/1111')
      ? binary(gz(lap()))
      : new Response(JSON.stringify({ laps: [{ lapId: '1'.repeat(24), lapNumber: 3, lapTimeMs: 103995, valid: true }, { lapId: null }] }), { status: 200 }))
    const source = pilotLapSource('uid-9', deps(fetchImpl as unknown as typeof fetch))
    const list = await source.list('20261025_162906')
    expect(list).toEqual([{ id: `pilot:${'1'.repeat(24)}`, lapNumber: 3, lapTimeMs: 103995, valid: true, sessionToken: '20261025_162906', ownerUid: 'uid-9', origin: 'pilot' }])
    expect((await source.read(list[0]!) as ReturnType<typeof lap>).meta.car).toBe('ferrari_296_gt3')
  })
})

describe('admin archive model', () => {
  const NOW = Date.parse('2026-10-26T12:00:00Z')
  const summary: LapsSummary = {
    decision: { enabled: false, reason: 'class-a-60' },
    state: { checkedAt: '2026-10-26T04:23:00Z', storageBytes: 1024 ** 3, classAMonth: 100_000, classBMonth: 0 },
    override: null, lastSync: { at: '2026-10-25T08:00:00Z', downloaded: 12, total: 12, complete: true },
    days: { '2026-10-26': { a: { uploads: 10, shares: 1 }, b: { uploads: 4, shares: 0 } }, '2026-10-20': { a: { uploads: 14, shares: 0 } } },
    rejections: [{ day: '2026-10-26', reason: 'daily-cap', uid: 'a' }, { day: '2026-10-25', reason: 'daily-cap', uid: 'b' }, { day: '2026-10-25', reason: 'owner-mismatch', uid: 'a' }],
  }
  it('computes percentages on the free tier, days, pilots, rejections and a labelled forecast', () => {
    const model = lapsArchiveModel(summary, NOW)
    expect(model.enabled).toBe(false)
    expect(reasonLabel(model.reason)).toBe('Scritture oltre soglia')
    expect(model.usage.find(u => u.key === 'storage')!.percent).toBe(10)
    expect(model.usage.find(u => u.key === 'classA')!.percent).toBe(10)
    expect(model.days).toHaveLength(30)
    expect(model.days.at(-1)).toEqual({ day: '2026-10-26', uploads: 14, shares: 1 })
    expect(model.pilots[0]).toEqual({ uid: 'a', uploads: 24, shares: 1 })
    expect(model.rejections[0]).toEqual({ reason: 'daily-cap', count: 2 })
    expect(model.forecast!.uploadsPerDay).toBe(2)
    expect(lapsArchiveModel({ ...summary, days: {} }, NOW).forecast).toBeNull()
    expect(lapsArchiveModel({ ...summary, rejectionsTruncated: true }, NOW).rejectionsTruncated).toBe(true)
    expect(reasonLabel('something-new')).toBe('something-new')
  })
  it('PIP-648: warns from 45% of a cap (or when the Worker says so), before the laps stop at 60%', () => {
    expect(lapsArchiveModel(summary, NOW).warning).toBe(false)
    expect(lapsArchiveModel({ ...summary, state: { ...summary.state, storageBytes: 2.4 * 1024 ** 3 } }, NOW).warning).toBe(true)
    expect(lapsArchiveModel({ ...summary, state: { ...summary.state, warning: true } }, NOW).warning).toBe(true)
    expect(lapsArchiveModel({ ...summary, state: null }, NOW).warning).toBe(false)
    expect(reasonLabel('hard-90')).toContain('90%')
  })
})
