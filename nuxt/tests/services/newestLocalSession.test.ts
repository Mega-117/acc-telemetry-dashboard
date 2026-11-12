// PIP-767: the newest own session with a lap on this computer, read at the Panoramica's click.
import { describe, expect, it, vi } from 'vitest'
import { findNewestLocalSession, RecentSessionsUnavailableError } from '~/repositories/telemetryLocalRepository'
import { pickLastSessionTarget } from '~/services/projections/overviewLastSession'
import { generateSessionId, extractMetadata } from '~/utils/sessionParser'

// A logger file as written after `laps` completed laps (laps 0: entered the track, no lap yet).
function accFile(dateStart: string, laps: number, ownerId = 'qa') {
  const lapRows = Array.from({ length: laps }, (_, index) => ({
    lap_number: index + 1, lap_time_ms: 91210 + index, is_valid: true, sector_times_ms: [30000, 30000, 31210 + index],
  }))
  return {
    ownerId,
    session_info: { track: 'brands_hatch', car: 'mercedes_amg_gt4', date_start: dateStart, session_type: 0, laps_total: laps },
    static_data: { sectorCount: 3 },
    stints: laps ? [{ stint_number: 1, laps: lapRows }] : [],
  }
}

// The program's description of each file (its own lap counter from session_info.laps_total).
function program(files: Record<string, unknown>, recent: Array<{ name: string; dateStart: string; game?: string; laps?: number | null }>) {
  return {
    getRecentSessionFiles: vi.fn(async () => ({ ok: true, files: recent.map(item => ({ game: 'acc', laps: 1, ...item })) })),
    readFile: vi.fn(async (name: string) => {
      const file = files[name]
      if (file instanceof Error) throw file
      return file
    }),
  }
}

describe('findNewestLocalSession (PIP-767)', () => {
  it('Marik 12/11: the running session with 9 laps wins, with the id the Sessioni list gives it', async () => {
    const running = accFile('2026-11-12T09:48:46.920', 9)
    const api = program({ 'session_20261112_094846_brands_hatch_Practice_x.json': running, 'session_20261111_214313_brands_hatch_Race_x.json': accFile('2026-11-11T21:43:13', 33) }, [
      { name: 'session_20261111_214313_brands_hatch_Race_x.json', dateStart: '2026-11-11T21:43:13' },
      { name: 'session_20261112_094846_brands_hatch_Practice_x.json', dateStart: '2026-11-12T09:48:46.920' },
    ])
    const found = await findNewestLocalSession({ electronAPI: api, ownerId: 'qa', gameId: 'acc' })
    const { meta } = extractMetadata(running)
    expect(found).toEqual({ session: { id: generateSessionId(meta.date_start, meta.track, meta.gameId, meta), date: '2026-11-12T09:48:46.920' }, newestStart: '2026-11-12T09:48:46.920', complete: true })
    expect(api.readFile).toHaveBeenCalledTimes(1)
  })

  it('a new session without laps yet leaves the previous one, without opening the new one', async () => {
    const api = program({ 'new.json': accFile('2026-11-12T09:48:46', 0), 'old.json': accFile('2026-11-11T21:43:13', 33) }, [
      { name: 'new.json', dateStart: '2026-11-12T09:48:46', laps: 0 }, { name: 'old.json', dateStart: '2026-11-11T21:43:13', laps: 33 },
    ])
    const found = await findNewestLocalSession({ electronAPI: api, ownerId: 'qa', gameId: 'acc' })
    expect(found.session?.date).toBe('2026-11-11T21:43:13')
    expect(found.newestStart).toBe('2026-11-11T21:43:13')
    expect(api.readFile).not.toHaveBeenCalledWith('new.json')
  })

  it('the newest one unreadable: the next one answers, and newestStart still names the newest (for the spy)', async () => {
    const api = program({ 'new.json': new Error('unreadable'), 'old.json': accFile('2026-11-11T21:43:13', 33) }, [
      { name: 'new.json', dateStart: '2026-11-12T09:48:46', laps: 9 }, { name: 'old.json', dateStart: '2026-11-11T21:43:13', laps: 33 },
    ])
    const found = await findNewestLocalSession({ electronAPI: api, ownerId: 'qa', gameId: 'acc' })
    expect(found.session?.date).toBe('2026-11-11T21:43:13')
    expect(found.newestStart).toBe('2026-11-12T09:48:46')
  })

  it('skips another game, another owner and an unreadable file; reads at most 3; an older program (no counter) is read', async () => {
    const api = program({
      'a.json': new Error('partial'), 'b.json': accFile('2026-11-12T09:00:00', 2, 'other'), 'c.json': accFile('2026-11-12T08:00:00', 0), 'd.json': accFile('2026-11-12T07:00:00', 4),
    }, [
      { name: 'evo.json', dateStart: '2026-11-12T11:00:00Z', game: 'evo' },
      { name: 'a.json', dateStart: '2026-11-12T10:00:00' }, { name: 'b.json', dateStart: '2026-11-12T09:00:00' },
      { name: 'c.json', dateStart: '2026-11-12T08:00:00', laps: null }, { name: 'd.json', dateStart: '2026-11-12T07:00:00' },
    ])
    expect((await findNewestLocalSession({ electronAPI: api, ownerId: 'qa', gameId: 'acc' })).session).toBeNull()
    expect(api.readFile).toHaveBeenCalledTimes(3)
    expect(api.readFile).toHaveBeenCalledWith('c.json')
    expect(api.readFile).not.toHaveBeenCalledWith('evo.json')
  })

  it('says "not available" when the program cannot answer (old program, file helper down)', async () => {
    await expect(findNewestLocalSession({ electronAPI: { readFile: vi.fn() }, ownerId: 'qa', gameId: 'acc' })).rejects.toBeInstanceOf(RecentSessionsUnavailableError)
    const down = { readFile: vi.fn(), getRecentSessionFiles: vi.fn(async () => ({ ok: false, files: [] })) }
    await expect(findNewestLocalSession({ electronAPI: down, ownerId: 'qa', gameId: 'acc' })).rejects.toBeInstanceOf(RecentSessionsUnavailableError)
  })
})

describe('pickLastSessionTarget (PIP-767)', () => {
  const shown = { id: 'race-11-11', date: '2026-11-11T21:43:13' }
  it('a newer session on this computer wins; an older one or the same one does not', () => {
    expect(pickLastSessionTarget(shown, { id: 'practice-12-11', date: '2026-11-12T09:48:46.920' })?.id).toBe('practice-12-11')
    expect(pickLastSessionTarget(shown, { id: 'older', date: '2026-11-10T10:00:00' })?.id).toBe('race-11-11')
    expect(pickLastSessionTarget(shown, { ...shown })?.id).toBe('race-11-11')
  })
  it('naive logger time and a UTC cloud date of the same instant are compared as instants', () => {
    const naive = '2026-11-12T09:48:46'
    const utc = new Date(2026, 10, 12, 9, 48, 46).toISOString()
    expect(pickLastSessionTarget({ id: 'cloud', date: utc }, { id: 'local', date: naive })?.id).toBe('cloud')
  })
  it('nothing on this computer keeps the shown one; nothing shown takes the local one; bad dates never win', () => {
    expect(pickLastSessionTarget(shown, null)?.id).toBe('race-11-11')
    expect(pickLastSessionTarget(null, { id: 'first', date: '2026-11-12T09:00:00' })?.id).toBe('first')
    expect(pickLastSessionTarget(null, null)).toBeNull()
    expect(pickLastSessionTarget(shown, { id: 'bad', date: 'not a date' })?.id).toBe('race-11-11')
    expect(pickLastSessionTarget({ id: 'bad', date: '' }, { id: 'good', date: '2026-11-12T09:00:00' })?.id).toBe('good')
  })
})

describe('findNewestLocalSession, a file the program could not read (PIP-767, Codex round 2)', () => {
  it('still answers with the best found, but says the check is incomplete', async () => {
    const api = {
      getRecentSessionFiles: vi.fn(async () => ({ ok: true, retry: 1, files: [{ name: 'old.json', game: 'acc', laps: 33, dateStart: '2026-11-11T21:43:13' }] })),
      readFile: vi.fn(async () => ({ ownerId: 'qa', session_info: { track: 'brands_hatch', car: 'mercedes_amg_gt4', date_start: '2026-11-11T21:43:13', session_type: 0, laps_total: 1 },
        static_data: { sectorCount: 3 }, stints: [{ stint_number: 1, laps: [{ lap_number: 1, lap_time_ms: 91210, is_valid: true, sector_times_ms: [30000, 30000, 31210] }] }] })),
    }
    const found = await findNewestLocalSession({ electronAPI: api, ownerId: 'qa', gameId: 'acc' })
    expect(found.session?.date).toBe('2026-11-11T21:43:13')
    expect(found.complete).toBe(false)
  })
})
