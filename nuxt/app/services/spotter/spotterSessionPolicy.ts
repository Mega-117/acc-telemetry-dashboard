export const SPOTTER_SESSION_MODES = ['practice', 'qualify', 'race'] as const
export type SpotterSessionMode = typeof SPOTTER_SESSION_MODES[number]

export const DEFAULT_SPOTTER_SESSION_MODES: SpotterSessionMode[] = ['practice']
// PIP-533: with no global on/off left, "no session" is a real choice (= off).
export const NO_SPOTTER_SESSION_MODES = 'none'

export const SPOTTER_SESSION_LABELS: Record<SpotterSessionMode, string> = {
  practice: 'Prove libere', qualify: 'Qualifica', race: 'Gara',
}

function isKnownSessionType(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function resolveSpotterSessionMode(sessionType: unknown): SpotterSessionMode | null {
  // Canonical names come from each connector; numeric codes remain ACC legacy.
  if (sessionType === 'race' || sessionType === 'qualify' || sessionType === 'practice') return sessionType
  if (['hotlap', 'time_attack', 'hot_stint', 'cruise'].includes(String(sessionType))) return 'practice'
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
  // An explicit empty choice stays empty; only a missing or unreadable value gets the default.
  if (value === NO_SPOTTER_SESSION_MODES || (Array.isArray(value) && value.length === 0)) return []
  const raw = Array.isArray(value) ? value : String(value || '').split(',')
  const selected = SPOTTER_SESSION_MODES.filter(mode => raw.includes(mode))
  return selected.length ? selected : [...DEFAULT_SPOTTER_SESSION_MODES]
}

export function serializeSpotterSessionModes(value: unknown) {
  const modes = normalizeSpotterSessionModes(value)
  return modes.length ? modes.join(',') : NO_SPOTTER_SESSION_MODES
}

export function toggleSpotterSessionMode(current: unknown, mode: SpotterSessionMode) {
  const selected = normalizeSpotterSessionModes(current)
  if (selected.includes(mode)) return selected.filter(item => item !== mode)
  return SPOTTER_SESSION_MODES.filter(item => selected.includes(item) || item === mode)
}

/** PIP-533: Ctrl+K click on an alert: removes or adds the session being driven.
 * null when that session is unknown (menus, unsupported type). */
export function toggleCurrentSessionMode(modes: unknown, sessionType: unknown, currentlyOn: boolean): { modes: SpotterSessionMode[]; on: boolean } | null {
  const mode = resolveSpotterSessionMode(sessionType)
  if (!mode) return null
  const selected = normalizeSpotterSessionModes(modes)
  if (currentlyOn) return { modes: selected.filter(item => item !== mode), on: false }
  return { modes: SPOTTER_SESSION_MODES.filter(item => selected.includes(item) || item === mode), on: true }
}

/** PIP-533: the session type the voice alerts follow (ACC numeric, other sims by kind). */
export function voiceSessionType(fast: { sessionType?: unknown; commonLive?: { gameId?: unknown; sessionKind?: unknown } | null } | null | undefined) {
  const live = fast?.commonLive
  return live && live.gameId !== 'acc' ? live.sessionKind : fast?.sessionType
}

export function isSpotterFeatureAllowed(masterEnabled: boolean, selectedModes: unknown, sessionType: unknown) {
  if (!masterEnabled) return false
  const currentMode = resolveSpotterSessionMode(sessionType)
  return currentMode !== null && normalizeSpotterSessionModes(selectedModes).includes(currentMode)
}
