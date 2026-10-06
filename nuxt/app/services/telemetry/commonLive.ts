import { isGameId } from './gameIdentity'

export type CommonMeasurement = { value: number | null; availability: 'available' | 'unknown' | 'unsupported' | 'stale'; unit: string }
export type CommonLive = {
  gameId: string; sessionId: string | null; connected: boolean; fresh: boolean
  fields: Record<string, CommonMeasurement>; capabilities: Record<string, boolean>
  identity?: { track: string | null; variant: string | null; car: string | null }
  lifecycle?: 'off' | 'live' | 'paused' | 'replay'
  sessionKind?: string | null
  driver?: { firstName: string | null; lastName: string | null }
}

export function readCommonLive(raw: unknown, now = Date.now()): CommonLive | null {
  if (!raw || typeof raw !== 'object') return null
  const frame = raw as Record<string, unknown>
  if (frame.schema !== 'racercore.live' || frame.version !== 1 || !isGameId(frame.game_id)) return null
  if (typeof frame.observed_at_ms !== 'number' || !Number.isInteger(frame.observed_at_ms) || frame.observed_at_ms < 0 || typeof frame.ttl_ms !== 'number' || !Number.isInteger(frame.ttl_ms) || frame.ttl_ms <= 0) return null
  if (frame.session_id !== null && (typeof frame.session_id !== 'string' || !frame.session_id)) return null
  if (!frame.fields || typeof frame.fields !== 'object' || Array.isArray(frame.fields)) return null
  if (!frame.capabilities || typeof frame.capabilities !== 'object' || Array.isArray(frame.capabilities) || Object.values(frame.capabilities).some(v => typeof v !== 'boolean')) return null
  const fresh = now >= frame.observed_at_ms && now - frame.observed_at_ms <= frame.ttl_ms
  const connected = fresh && frame.connected === true
  const fields: Record<string, CommonMeasurement> = {}
  for (const [key, value] of Object.entries(frame.fields)) {
    if (!value || typeof value !== 'object') return null
    const measurement = value as CommonMeasurement
    if (!['available', 'unknown', 'unsupported', 'stale'].includes(measurement.availability) || typeof measurement.unit !== 'string' || !measurement.unit) return null
    if (measurement.availability === 'available' ? typeof measurement.value !== 'number' || !Number.isFinite(measurement.value) : measurement.value !== null) return null
    fields[key] = !connected && measurement.availability === 'available'
      ? { ...measurement, value: null, availability: 'stale' } : { ...measurement }
  }
  const identity = frame.identity && typeof frame.identity === 'object' && !Array.isArray(frame.identity)
    ? frame.identity as Record<string, unknown> : {}
  const label = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null
  const lifecycle = ['off', 'live', 'paused', 'replay'].includes(String(frame.lifecycle))
    ? frame.lifecycle as NonNullable<CommonLive['lifecycle']> : undefined
  const driver = frame.driver && typeof frame.driver === 'object' && !Array.isArray(frame.driver)
    ? frame.driver as Record<string, unknown> : {}
  return { gameId: frame.game_id, sessionId: frame.session_id, connected, fresh, fields, capabilities: { ...frame.capabilities } as Record<string, boolean>,
    identity: { track: label(identity.track), variant: label(identity.variant), car: label(identity.car) },
    lifecycle, sessionKind: label(frame.session_kind),
    driver: { firstName: label(driver.first_name)?.slice(0, 60) ?? null, lastName: label(driver.last_name)?.slice(0, 60) ?? null } }
}

export function commonValue(live: CommonLive, name: string, unit: string): number | null {
  const measurement = live.fields[name]
  return measurement?.availability === 'available' && measurement.unit === unit ? measurement.value : null
}

export function commonBoolean(live: CommonLive, name: string): boolean | null {
  const value = commonValue(live, name, 'boolean')
  return value === 1 ? true : value === 0 ? false : null
}

export function commonContextKey(live: CommonLive | null | undefined): string | null {
  return live ? JSON.stringify([live.gameId, live.sessionId, live.identity?.track, live.identity?.variant, live.identity?.car]) : null
}
