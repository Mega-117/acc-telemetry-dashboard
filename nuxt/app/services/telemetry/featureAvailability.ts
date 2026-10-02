import type { CommonLive } from './commonLive'

export type FeatureRequirement = { capabilities?: readonly string[]; fields?: Readonly<Record<string, string>> }
export type FeatureAvailability = { available: boolean; reason: 'available' | 'disconnected' | 'unsupported' | 'unknown' | 'stale' | 'unit-mismatch'; missing: string[] }

// A capability is a protocol promise, not proof that the current sample exists.
// Keep requirements small so missing fuel cannot turn off speed or voice controls.
export const TELEMETRY_FEATURES = {
  speed: { fields: { speed: 'km/h' } },
  dashboardInputs: { capabilities: ['vehicle_inputs'], fields: { throttle: 'ratio', brake: 'ratio' } },
  engine: { fields: { rpm: 'rpm', gear: 'gear' } },
  lapTiming: { capabilities: ['lap_timing'], fields: { current_lap_time: 'ms' } },
  lapAnnouncement: { capabilities: ['lap_timing', 'lap_validity'], fields: { last_lap_time: 'ms', lap_count: 'count', last_lap_valid: 'boolean' } },
  fuel: { capabilities: ['fuel'], fields: { fuel: 'L' } },
  fuelPlanning: { capabilities: ['fuel'], fields: { fuel: 'L', fuel_per_lap: 'L/lap' } },
  sectors: { capabilities: ['sector_timing'] },
  tyrePressure: { capabilities: ['tyre_pressure'], fields: { 'tyre.FL.pressure': 'psi', 'tyre.FR.pressure': 'psi', 'tyre.RL.pressure': 'psi', 'tyre.RR.pressure': 'psi' } },
  pressureRecommendation: { capabilities: ['acc_pressure_rules'] },
  pitPrediction: { capabilities: ['pit_prediction'] },
  standings: { capabilities: ['standings'] },
  trackMap: { capabilities: ['track_map', 'track_position'], fields: { normalized_position: 'ratio' } },
  trackReferences: { capabilities: ['track_position'], fields: { normalized_position: 'ratio' } },
  adaptiveCoach: { capabilities: ['laptrace_coach'] },
  setupFuel: { capabilities: ['setup_fuel_command', 'fuel'], fields: { speed: 'km/h' } },
  setupPressure: { capabilities: ['setup_pressure_command'], fields: { speed: 'km/h' } },
  pitStrategy: { capabilities: ['pit_strategy_command'] },
} satisfies Record<string, FeatureRequirement>

export function featureAvailability(live: CommonLive | null | undefined, requirement: FeatureRequirement): FeatureAvailability {
  const unavailable = (reason: FeatureAvailability['reason'], missing: string[] = []): FeatureAvailability => ({ available: false, reason, missing })
  if (!live) return unavailable('disconnected')
  if (!live.fresh) return unavailable('stale')
  if (!live.connected) return unavailable('disconnected')
  const missing = (requirement.capabilities ?? []).filter(key => live.capabilities[key] !== true)
  if (missing.length) return unavailable('unsupported', [...missing])
  for (const [name, unit] of Object.entries(requirement.fields ?? {})) {
    const field = live.fields[name]
    if (!field) return unavailable('unknown', [name])
    if (field.availability !== 'available') return unavailable(field.availability, [name])
    if (field.unit !== unit) return unavailable('unit-mismatch', [name])
  }
  return { available: true, reason: 'available', missing: [] }
}

export function availabilityLabel(reason: FeatureAvailability['reason']): string {
  return { available: 'Disponibile', disconnected: 'Nessun gioco connesso', unsupported: 'Non supportato dal gioco connesso',
    unknown: 'Dati non disponibili', stale: 'In attesa di dati aggiornati', 'unit-mismatch': 'Formato dati non compatibile' }[reason]
}
