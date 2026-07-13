export const SPOTTER_SESSION_MODES = ['practice', 'qualify', 'race'] as const
export type SpotterSessionMode = typeof SPOTTER_SESSION_MODES[number]

export const DEFAULT_SPOTTER_SESSION_MODES: SpotterSessionMode[] = ['practice']

function isKnownSessionType(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function resolveSpotterSessionMode(sessionType: unknown): SpotterSessionMode | null {
  if (!isKnownSessionType(sessionType)) return null
  switch (sessionType) {
    case 0: // Practice
    case 3: // Hotlap
    case 4: // Time Attack
    case 7: // Hotstint
      return 'practice'
    case 1: // Qualifying
    case 8: // Hotstint Superpole
      return 'qualify'
    case 2: // Race
      return 'race'
    default:
      return null
  }
}

export function isSpotterSessionChange(previousSessionType: unknown, currentSessionType: unknown) {
  return isKnownSessionType(previousSessionType)
    && isKnownSessionType(currentSessionType)
    && previousSessionType !== currentSessionType
}

export function normalizeSpotterSessionModes(value: unknown): SpotterSessionMode[] {
  const raw = Array.isArray(value) ? value : String(value || '').split(',')
  const selected = SPOTTER_SESSION_MODES.filter(mode => raw.includes(mode))
  return selected.length ? selected : [...DEFAULT_SPOTTER_SESSION_MODES]
}

export function serializeSpotterSessionModes(value: unknown) {
  return normalizeSpotterSessionModes(value).join(',')
}

export function toggleSpotterSessionMode(current: unknown, mode: SpotterSessionMode) {
  const selected = normalizeSpotterSessionModes(current)
  if (selected.includes(mode)) {
    return selected.length === 1 ? selected : selected.filter(item => item !== mode)
  }
  return SPOTTER_SESSION_MODES.filter(item => selected.includes(item) || item === mode)
}

export function isSpotterFeatureAllowed(masterEnabled: boolean, selectedModes: unknown, sessionType: unknown) {
  if (!masterEnabled) return false
  const currentMode = resolveSpotterSessionMode(sessionType)
  return currentMode !== null && normalizeSpotterSessionModes(selectedModes).includes(currentMode)
}
