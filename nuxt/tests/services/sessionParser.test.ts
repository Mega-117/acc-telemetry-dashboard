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

// ─────────────────────────────────────────────────────────────────────────────
// extractMetadata — forced raw rebuild
// ─────────────────────────────────────────────────────────────────────────────
describe('extractMetadata — forced raw rebuild', () => {
  function makeCurrentButStaleRaceRaw() {
    return {
      session_info: {
        track: 'watkins_glen',
        date_start: '2026-06-02T20:28:42',
        car_model: 'ferrari_296_gt3',
        session_type: 2,
        laps_total: 3,
        laps_valid: 3,
        session_best_lap: 105072,
        avg_clean_lap: 105523,
        total_drive_time_ms: 320000
      },
      stints: [
        {
          fuel_start: 44.8,
          avg_clean_lap: 105523,
          laps: [
            { lap_time_ms: 105862, is_valid: true, fuel_start: 41.99, air_temp: 29.8, road_temp: 32.5, track_grip_status: 'Optimum' },
            { lap_time_ms: 105637, is_valid: true, fuel_start: 39.25, air_temp: 29.8, road_temp: 32.5, track_grip_status: 'Optimum' },
            { lap_time_ms: 105072, is_valid: true, fuel_start: 25.13, air_temp: 29.8, road_temp: 32.5, track_grip_status: 'Optimum' }
          ]
        }
      ],
      summary: {
        best_rules_version: BEST_RULES_VERSION,
        laps: 3,
        lapsValid: 3,
        bestLap: 105072,
        avgCleanLap: 105523,
        totalTime: 320000,
        stintCount: 1,
        best_qualy_ms: null,
        best_qualy_conditions: null,
        best_session_race_ms: null,
        best_session_race_conditions: null,
        best_race_ms: null,
        best_race_conditions: null,
        best_avg_race_ms: null,
        best_avg_race_conditions: null,
        best_by_grip: null
      }
    }
  }

  it('per default conserva un summary V5 esistente', () => {
    const { summarySource, summary } = extractMetadata(makeCurrentButStaleRaceRaw())

    expect(summarySource).toBe('canonical')
    expect(summary.best_race_ms).toBeNull()
  })

  it('con forceRawRebuild ricostruisce il best race dai giri fuel > 40L', () => {
    const { summarySource, summary } = extractMetadata(makeCurrentButStaleRaceRaw(), {
      allowLegacyFallback: true,
      forceRawRebuild: true
    })

    expect(summarySource).toBe('legacy_fallback')
    expect(summary.best_race_ms).toBe(105862)
    expect((summary.best_by_grip as any).Optimum.raceBestByFuelBucket['40-60'].timeMs).toBe(105862)
    expect(summary.best_qualy_ms).toBeNull()
  })
})
