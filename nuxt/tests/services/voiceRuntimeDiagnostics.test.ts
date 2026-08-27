import { describe, expect, it } from 'vitest'
import {
  createVoiceRuntimeDiagnostics,
  VOICE_RUNTIME_DIAGNOSTICS_KEY,
} from '~/services/monitoring/voiceRuntimeDiagnostics'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    values,
  }
}

describe('voiceRuntimeDiagnostics', () => {
  it('persiste una traccia bounded, ordinata e priva di testo libero sensibile', () => {
    const storage = memoryStorage()
    const diagnostics = createVoiceRuntimeDiagnostics({
      storage,
      maxEvents: 16,
      now: () => new Date('2026-08-28T10:00:00.000Z'),
    })
    for (let index = 0; index < 20; index += 1) {
      diagnostics.record({
        kind: 'queued',
        cueId: `cue ${index}`,
        correlationId: 'pressure/lap/3',
        source: 'pressure-warning',
      })
    }
    const events = diagnostics.list()
    expect(events).toHaveLength(16)
    expect(events[0]?.sequence).toBe(5)
    expect(events.at(-1)).toMatchObject({
      sequence: 20,
      cueId: 'cue_19',
      correlationId: 'pressure_lap_3',
      occurredAt: '2026-08-28T10:00:00.000Z',
    })
    expect(storage.values.has(VOICE_RUNTIME_DIAGNOSTICS_KEY)).toBe(true)
  })

  it('continua in memoria quando lo storage persistente non e disponibile', () => {
    const diagnostics = createVoiceRuntimeDiagnostics({ storage: null })

    diagnostics.record({ kind: 'runtime_authorized' })

    expect(diagnostics.list()).toEqual([
      expect.objectContaining({ kind: 'runtime_authorized', sequence: 1 }),
    ])
  })

  it('degrada in memoria quando lo storage non e disponibile', () => {
    const diagnostics = createVoiceRuntimeDiagnostics({ storage: null })
    diagnostics.record({ kind: 'runtime_denied', reason: 'auth inactive' })
    expect(diagnostics.list()).toEqual([
      expect.objectContaining({ kind: 'runtime_denied', reason: 'auth_inactive' }),
    ])
    diagnostics.clear()
    expect(diagnostics.list()).toEqual([])
  })
})
