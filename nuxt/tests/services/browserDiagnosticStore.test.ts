import { describe, it, expect } from 'vitest'
import { diagnosticPolicy, newDiagnosticState, DIAGNOSTIC_DAY_MS as DAY } from '~/services/monitoring/browserDiagnosticStore'
import { diagnosticOccurrences } from '~/utils/diagnosticsPresentation'

describe('browser diagnostic policy', () => {
  it('collects all 15000 repetitions without publishing early and freezes the next window', () => {
    const state = newDiagnosticState()
    for (let i = 0; i < 15000; i++) diagnosticPolicy(state, 0).capture({ message: `failure ${i}` }, 'a')
    expect(state.reports).toHaveLength(1)
    expect(diagnosticPolicy(state, DAY - 1).list('a')).toEqual([])
    const [event] = diagnosticPolicy(state, DAY).list('a')
    expect(event!.context!._aggCount).toBe(15000)
    expect(diagnosticPolicy(state, DAY).reserve(event!.eventId!, 'a')).not.toBeNull()
    diagnosticPolicy(state, DAY).capture({ message: 'failure 77' }, 'a')
    expect(state.reports).toHaveLength(2)
    diagnosticPolicy(state, DAY).acknowledge(event!.eventId!, 'a')
    expect(state.reports[0]!.count).toBe(1)
  })
  it('bounds the rolling installation budget, keeps unknown owners local and survives JSON restart', () => {
    let state = newDiagnosticState()
    for (let i = 0; i < 25; i++) diagnosticPolicy(state, 0).capture({ code: `code-${i}`, message: 'failure' }, 'a')
    diagnosticPolicy(state, 0).capture({ message: 'unknown' }, null)
    const ready = diagnosticPolicy(state, DAY).list('a')
    for (const event of ready) {
      if (diagnosticPolicy(state, DAY).reserve(event.eventId!, 'a')) diagnosticPolicy(state, DAY).acknowledge(event.eventId!, 'a')
    }
    expect(Object.keys(state.deliveries)).toHaveLength(20)
    state = JSON.parse(JSON.stringify(state))
    expect(diagnosticPolicy(state, DAY).list('a')).toHaveLength(5)
    expect(diagnosticPolicy(state, DAY).list('b')).toEqual([])
    const id = diagnosticPolicy(state, DAY).list('a')[0]!.eventId!
    expect(diagnosticPolicy(state, DAY * 2 - 1).reserve(id, 'a')).toBeNull()
    expect(diagnosticPolicy(state, DAY * 2).reserve(id, 'a')).not.toBeNull()
  })
  it('persists backoff, serial reservations, quota suspension and owner guards', () => {
    const state = newDiagnosticState()
    diagnosticPolicy(state, 0).capture({ message: 'failure' }, 'a')
    const id = state.reports[0]!.event.eventId!
    expect(diagnosticPolicy(state, DAY).reserve(id, 'b')).toBeNull()
    expect(diagnosticPolicy(state, DAY).reserve(id, 'a')).not.toBeNull()
    expect(diagnosticPolicy(state, DAY).reserve(id, 'a')).toBeNull()
    expect(diagnosticPolicy(state, DAY).acknowledge(id, 'b')).toBe(0)
    diagnosticPolicy(state, DAY).failed(id, 'a', false)
    expect(diagnosticPolicy(state, DAY + 59999).list('a')).toEqual([])
    expect(diagnosticPolicy(state, DAY + 60000).reserve(id, 'a')).not.toBeNull()
    diagnosticPolicy(state, DAY + 60000).failed(id, 'a', true)
    expect(diagnosticPolicy(state, DAY * 2).list('a')).toEqual([])
    expect(diagnosticPolicy(state, DAY * 2 + 60000).list('a')).toHaveLength(1)
  })
  it('bounds retention, sanitizes samples, preserves severity and presents legacy events', () => {
    const state = newDiagnosticState()
    diagnosticPolicy(state, 0).capture({ message: 'failure', severity: 'warning', context: { token: 'private', _aggCount: 999 } }, 'a')
    diagnosticPolicy(state, 1).capture({ message: 'failure', severity: 'fatal' }, 'a')
    const [report] = diagnosticPolicy(state, DAY + 1).list('a')
    expect(report!.severity).toBe('fatal')
    expect(report!.context!.token).toBe('<redacted>')
    expect(report!.context!._aggCount).toBe(2)
    expect(diagnosticOccurrences({ occurredAt: '2026-01-01', context: report!.context })).toContain('2 occorrenze')
    expect(diagnosticOccurrences({ occurredAt: '2026-01-01' })).toBe('1 occorrenza')
    expect(diagnosticPolicy(state, DAY * 31).list('a')).toEqual([])
    expect(state.discarded).toBe(1)
  })
})
