/** Social lifetime is independent of ACC availability and car identity. */
export const PITWALL_SOCIAL_ROOT = 'pitwallRoomsV1'
export const PITWALL_RECONNECT_GRACE_MS = 30_000
export const PITWALL_SOCIAL_CAPACITY = 16

export interface SocialPresence {
  nickname: string
  connectedAt: number
  disconnectedAt: number | null
}
export type SocialOccupancy = Record<string, Record<string, SocialPresence>>

export function socialPresenceAlive(presence: SocialPresence, now: number): boolean {
  return presence.disconnectedAt == null || presence.disconnectedAt + PITWALL_RECONNECT_GRACE_MS > now
}

export function socialMemberUids(occupancy: SocialOccupancy, now: number): string[] {
  return Object.keys(occupancy).filter(uid => Object.values(occupancy[uid] ?? {}).some(value => socialPresenceAlive(value, now)))
}

export function nextSocialExpiry(occupancy: SocialOccupancy, now: number): number | null {
  const deadlines = Object.values(occupancy).flatMap(connections => Object.values(connections))
    .flatMap(value => value.disconnectedAt == null ? [] : [value.disconnectedAt + PITWALL_RECONNECT_GRACE_MS])
    .filter(deadline => deadline > now)
  return deadlines.length ? Math.min(...deadlines) : null
}

/** One eligible runtime per account; duplicate runtimes must never be guessed. */
export function eligibleSocialDrivers<T extends { uid: string, connectionId?: string, kind: string, driving: boolean, connected?: boolean, sourceValid?: boolean }>(members: T[]): T[] {
  const drivers = members.filter(member => member.kind === 'driver' && member.driving && member.connected !== false && member.sourceValid !== false)
  const counts = new Map<string, number>()
  for (const member of drivers) counts.set(member.uid, (counts.get(member.uid) ?? 0) + 1)
  return drivers.filter(member => counts.get(member.uid) === 1)
}

/** Selection survives unavailability; only an untouched initial selection auto-fills. */
export function resolveSocialTarget<T extends { uid: string }>(drivers: T[], selectedUid: string | null, touched: boolean): { selectedUid: string | null, target: T | null } {
  const uid = selectedUid ?? (!touched && drivers.length === 1 ? drivers[0]!.uid : null)
  return { selectedUid: uid, target: drivers.find(driver => driver.uid === uid) ?? null }
}
