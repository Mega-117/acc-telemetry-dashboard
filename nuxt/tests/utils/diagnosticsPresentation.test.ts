import { describe, expect, it } from 'vitest'
import {
  buildDiagnosticDateRange,
  diagnosticsViewState,
  formatItalianDiagnosticDate,
  paginationTokens,
  resolveDiagnosticNickname
} from '~/utils/diagnosticsPresentation'

describe('diagnosticsPresentation', () => {
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
