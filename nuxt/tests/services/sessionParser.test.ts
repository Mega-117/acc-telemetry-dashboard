import { describe, it, expect } from 'vitest'
import { generateSessionId, extractMetadata, BEST_RULES_VERSION } from '~/utils/sessionParser'

// ─────────────────────────────────────────────────────────────────────────────
// generateSessionId
// ─────────────────────────────────────────────────────────────────────────────
describe('generateSessionId', () => {
  it('genera un id normalizzando caratteri speciali', () => {
    const id = generateSessionId('2024-01-15T10:30:00.000Z', 'monza')
    expect(id).toMatch(/^[a-zA-Z0-9_]+$/)
    expect(id).toContain('monza')
  })

  it('tronca a max 100 caratteri', () => {
    const longTrack = 'a'.repeat(200)
    expect(generateSessionId('2024-01-01T00:00:00', longTrack).length).toBeLessThanOrEqual(100)
  })

  it('rimuove i millisecondi dal timestamp', () => {
    const id = generateSessionId('2024-01-15T10:30:00.999Z', 'kyalami')
    expect(id).not.toContain('999')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Helper: costruisce un rawObj con summary canonico
// ─────────────────────────────────────────────────────────────────────────────
function makeCanonicalRaw(overrides: Record<string, unknown> = {}) {
  return {
    session_info: {
      track: 'monza',
      date_start: '2024-05-01T10:00:00',
      car_model: 'ferrari_296_gt3',
      session_type: 1,
      laps_total: 20,
      laps_valid: 18,
    },
    stints: [],
    summary: {
      best_rules_version: BEST_RULES_VERSION,
      laps: 20,
      lapsValid: 18,
      bestLap: 105420,
      avgCleanLap: 106100,
      totalTime: 2100000,
      stintCount: 1,
      best_qualy_ms: 105420,
      best_qualy_conditions: { airTemp: 22, roadTemp: 35, grip: 'Optimum' },
      best_race_ms: null,
      best_race_conditions: null,
      best_session_race_ms: null,
      best_session_race_conditions: null,
      best_avg_race_ms: null,
      best_avg_race_conditions: null,
      best_by_grip: null,
    },
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// extractMetadata — sorgente canonical
// ─────────────────────────────────────────────────────────────────────────────
describe('extractMetadata — canonical', () => {
  it('restituisce summarySource canonical se best_rules_version corretta', () => {
    const raw = makeCanonicalRaw()
    const { summarySource } = extractMetadata(raw)
    expect(summarySource).toBe('canonical')
  })

  it('estrae meta correttamente', () => {
    const raw = makeCanonicalRaw()
    const { meta } = extractMetadata(raw)
    expect(meta.track).toBe('monza')
    expect(meta.car).toBe('ferrari_296_gt3')
    expect(meta.session_type).toBe(1)
  })

  it('estrae summary con bestLap canonico', () => {
    const raw = makeCanonicalRaw()
    const { summary } = extractMetadata(raw)
    expect(summary.bestLap).toBe(105420)
    expect(summary.laps).toBe(20)
    expect(summary.lapsValid).toBe(18)
  })

  it('restituisce missing_canonical se best_rules_version obsoleta', () => {
    const raw = makeCanonicalRaw()
    raw.summary.best_rules_version = 1
    const { summarySource } = extractMetadata(raw)
    expect(summarySource).toBe('missing_canonical')
  })

  it('restituisce missing_canonical se summary assente', () => {
    const raw = makeCanonicalRaw()
    delete (raw as any).summary
    const { summarySource } = extractMetadata(raw)
    expect(summarySource).toBe('missing_canonical')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// extractMetadata — legacy fallback
// ─────────────────────────────────────────────────────────────────────────────
describe('extractMetadata — legacy fallback', () => {
  it('usa legacy_fallback se allowLegacyFallback=true e summary obsoleto', () => {
    const raw = makeCanonicalRaw()
    raw.summary.best_rules_version = 1
    const { summarySource } = extractMetadata(raw, { allowLegacyFallback: true })
    expect(summarySource).toBe('legacy_fallback')
  })

  it('non usa legacy_fallback se allowLegacyFallback=false (default)', () => {
    const raw = makeCanonicalRaw()
    raw.summary.best_rules_version = 1
    const { summarySource } = extractMetadata(raw)
    expect(summarySource).toBe('missing_canonical')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// extractMetadata — meta fallback su payload vuoto
// ─────────────────────────────────────────────────────────────────────────────
describe('extractMetadata — fallback valori mancanti', () => {
  it('usa Unknown come track se manca', () => {
    const { meta } = extractMetadata({})
    expect(meta.track).toBe('Unknown')
  })

  it('session_type default 0', () => {
    const { meta } = extractMetadata({})
    expect(meta.session_type).toBe(0)
  })

  it('non crasha su payload completamente vuoto', () => {
    expect(() => extractMetadata({})).not.toThrow()
    expect(() => extractMetadata(null)).not.toThrow()
    expect(() => extractMetadata(undefined)).not.toThrow()
  })
})
