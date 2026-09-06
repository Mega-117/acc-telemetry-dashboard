import { describe, expect, it } from 'vitest'
import {
  buildDiagnosticDateRange,
  diagnosticsViewState,
  diagnosticUsers,
  diagnosticErrorGroups,
  diagnosticOccurrenceCount,
  diagnosticOccurrences,
  formatItalianDiagnosticDate,
  paginationTokens,
  resolveDiagnosticNickname
} from '~/utils/diagnosticsPresentation'

describe('diagnosticsPresentation', () => {
  it('conta identita distinte, conserva omonimi ed esclude eventi senza utente', () => {
    expect(diagnosticUsers([
      { userId: 'a', pilotNickname: 'Nico' },
      { userId: 'a', pilotNickname: 'Nico' },
      { userId: 'b', pilotNickname: 'Nico' },
      { userId: 'c', pilotNickname: '' },
      { userId: '', pilotNickname: 'Sistema' },
      { userId: undefined, pilotNickname: 'Ignorato' }
    ])).toEqual([
      { id: 'a', nickname: 'Nico', count: 2 },
      { id: 'b', nickname: 'Nico', count: 1 },
      { id: 'c', nickname: 'Utente non disponibile', count: 1 }
    ])
    expect(diagnosticUsers([])).toEqual([])
  })
  it.each([undefined, {}, { _aggVersion: 2, _aggCount: 1 }, { _aggVersion: 1, _aggCount: 0 },
    { _aggVersion: 1, _aggCount: -1 }, { _aggVersion: 1, _aggCount: 1.5 },
    { _aggVersion: 1, _aggCount: '4' }, { _aggVersion: 1, _aggCount: Infinity }])('treats invalid or legacy aggregation as one: %j', (context) => {
    expect(diagnosticOccurrenceCount({ context })).toBe(1)
    expect(diagnosticOccurrences({ context, occurredAt: '2026-09-06T09:00:00Z' })).toBe('1 occorrenza')
  })
  it('groups error types across users and sums aggregates plus legacy reports without mutating inputs', () => {
    const common = { component: 'electron', code: 'HUD', message: 'HUD failed', stack: 'at hud()', suiteVersion: '1' }
    const rows = [
      { ...common, userId: 'a', pilotNickname: 'Nico', context: { _aggVersion: 1, _aggCount: 15000 } },
      { ...common, userId: 'a', pilotNickname: 'Nico' },
      { ...common, userId: 'b', pilotNickname: 'Nico' },
      { ...common, userId: '' },
      { ...common, userId: 'a', message: 'Connection failed' },
      { ...common, userId: 'a', stack: 'at other()' },
      { ...common, userId: 'a', suiteVersion: '2' },
      { ...common, userId: 'a', code: 'OTHER' },
      { ...common, userId: 'a', component: 'frontend' }
    ]
    const snapshot = JSON.stringify(rows)
    const groups = diagnosticErrorGroups(rows)
    expect(groups).toHaveLength(6)
    expect(groups[0]).toMatchObject({ count: 15003, unknownCount: 1, users: [
      { id: 'a', nickname: 'Nico', count: 15001 }, { id: 'b', nickname: 'Nico', count: 1 }
    ] })
    expect(groups[0]!.sample).toBe(rows[0])
    expect(diagnosticUsers(rows).find(user => user.id === 'a')!.count).toBe(15006)
    expect(JSON.stringify(rows)).toBe(snapshot)
    expect(diagnosticErrorGroups([])).toEqual([])
  })
  it('unifies old sanitized path variants without merging different function call sites', () => {
    const base = { userId: 'a', component: 'electron', code: 'HUD', message: 'HUD failed' }
    const groups = diagnosticErrorGroups([
      { ...base, stack: 'TypeError: HUD failed\n    at evaluateDrivingState (<path>)\n    at Timeout._onTimeout (<path>)' },
      { ...base, stack: 'TypeError: HUD failed\n    at evaluateDrivingState (<path>)\\desktop-app\\main.js:2357:33)\n    at Timeout._onTimeout (<path>)\\desktop-app\\main.js:2401:46)' },
      { ...base, stack: 'TypeError: HUD failed\n    at otherFunction (<path>)' }
    ])
    expect(groups).toHaveLength(2)
    expect(groups[0]!.count).toBe(2)
  })
  it('costruisce il default 7 giorni inclusivo in ora italiana', () => {
    const range = buildDiagnosticDateRange('7d', '', '', new Date('2026-08-02T12:00:00.000Z'))
    expect(range).toEqual({
      startIso: '2026-07-26T22:00:00.000Z',
      endExclusiveIso: '2026-08-02T22:00:00.000Z'
    })
  })

  it('include tutto il giorno finale anche attraverso il cambio ora legale', () => {
    const range = buildDiagnosticDateRange('custom', '2026-03-28', '2026-03-29')
    expect(range).toEqual({
      startIso: '2026-03-27T23:00:00.000Z',
      endExclusiveIso: '2026-03-29T22:00:00.000Z'
    })
  })

  it('rifiuta intervalli personalizzati incompleti o invertiti', () => {
    expect(buildDiagnosticDateRange('custom', '2026-08-02', '')).toBeNull()
    expect(buildDiagnosticDateRange('custom', '2026-08-03', '2026-08-02')).toBeNull()
  })

  it('usa nickname corrente e fallback senza esporre identificativi', () => {
    expect(resolveDiagnosticNickname('', '')).toBe('Sistema')
    expect(resolveDiagnosticNickname(undefined, 'Ignorato')).toBe('Sistema')
    expect(resolveDiagnosticNickname('pilot-1', '  Mario  ')).toBe('Mario')
    expect(resolveDiagnosticNickname('pilot-1', '')).toBe('Utente non disponibile')
  })

  it('modella loading, refresh, errore, empty e lista pronta', () => {
    expect(diagnosticsViewState({ pending: true, hasEvents: false, hasError: false })).toBe('loading')
    expect(diagnosticsViewState({ pending: true, hasEvents: true, hasError: false })).toBe('refreshing')
    expect(diagnosticsViewState({ pending: false, hasEvents: false, hasError: true })).toBe('error')
    expect(diagnosticsViewState({ pending: false, hasEvents: false, hasError: false })).toBe('empty')
    expect(diagnosticsViewState({ pending: false, hasEvents: true, hasError: false })).toBe('ready')
  })

  it('produce pagine complete e compatte con estremi sempre raggiungibili', () => {
    expect(paginationTokens(2, 4)).toEqual([1, 2, 3, 4])
    expect(paginationTokens(6, 12)).toEqual([1, 'ellipsis', 5, 6, 7, 'ellipsis', 12])
  })

  it('formatta data e ora esplicitamente in Italia', () => {
    expect(formatItalianDiagnosticDate('2026-08-02T12:34:56.000Z')).toContain('14:34:56')
  })

})
