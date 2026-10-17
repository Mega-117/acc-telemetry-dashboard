// PIP-555: cosa mostra la Panoramica prima che il cloud sia pronto.
import { describe, expect, it } from 'vitest'
import { OverviewNotReadyError, selectOfflineOverviewSessions, shouldWaitForCloud } from '~/services/gateway/offlineOverviewPolicy'
import type { SessionDocument } from '~/types/telemetry'

const session = (id: string, date: string, syncState: SessionDocument['syncState'] = 'synced') => ({
  sessionId: id, meta: { date_start: date, track: 'Monza', car: 'ferrari', gameId: 'acc' }, summary: {}, syncState,
} as unknown as SessionDocument)

describe('selectOfflineOverviewSessions', () => {
  it('con la lista in cache la usa e aggiunge solo le locali non sincronizzate', () => {
    const cached = [session('c1', '2026-10-15T10:00:00'), session('c2', '2026-10-14T10:00:00')]
    const local = [session('l1', '2026-10-17T10:00:00', 'pending_sync'), session('c1', '2026-10-15T10:00:00', 'synced')]
    expect(selectOfflineOverviewSessions(cached, local).map(s => s.sessionId)).toEqual(['l1', 'c1', 'c2'])
  })
  it('senza cache resta l\'archivio locale, anche vuoto', () => {
    const local = [session('l1', '2026-10-17T10:00:00', 'local_only')]
    expect(selectOfflineOverviewSessions(null, local)).toBe(local)
    expect(selectOfflineOverviewSessions(null, [])).toEqual([])
  })
})

describe('shouldWaitForCloud', () => {
  it('aspetta solo senza sessioni, cloud non pronto e browser online', () => {
    expect(shouldWaitForCloud({ sessions: 0, cloudReady: false, browserOnline: true })).toBe(true)
    expect(shouldWaitForCloud({ sessions: 3, cloudReady: false, browserOnline: true })).toBe(false)
    expect(shouldWaitForCloud({ sessions: 0, cloudReady: true, browserOnline: true })).toBe(false)
    // Davvero offline: il cloud non arriva, "vuoto" e' la risposta onesta.
    expect(shouldWaitForCloud({ sessions: 0, cloudReady: false, browserOnline: false })).toBe(false)
  })
  it('l\'errore di attesa e\' riconoscibile per nome', () => {
    const error = new OverviewNotReadyError()
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('OverviewNotReadyError')
  })
})
