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

/** Room presence is readable by participants, including non-friends. */
export function socialMemberNicknames(occupancy: SocialOccupancy, now: number): Record<string, string> {
  return Object.fromEntries(Object.entries(occupancy).flatMap(([uid, connections]) => {
    const named = Object.values(connections)
      .filter(value => socialPresenceAlive(value, now) && value.nickname?.trim() && value.nickname.trim() !== uid)
      .sort((a, b) => Number(a.disconnectedAt != null) - Number(b.disconnectedAt != null) || b.connectedAt - a.connectedAt)
    return named[0] ? [[uid, named[0].nickname.trim()]] : []
  }))
}

export function socialReconnectingUids(occupancy: SocialOccupancy, now: number): string[] {
  return socialMemberUids(occupancy, now).filter(uid =>
    Object.values(occupancy[uid] ?? {}).every(value => value.disconnectedAt != null))
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

export type DriverReceiveState = 'ready' | 'menu' | 'not-connected' | 'offline' | 'applying' | 'none'
export interface RoomOrderInFlight { orderId: string, targetUid: string, senderUid: string, status: 'pending' | 'applying' }

/**
 * PIP-516: can the selected (or only) driver receive a strategy now, and if
 * not, why. "In guida" is the same signal as the HUDs: in the car with live
 * physics; menus, ESC and the setup screen are not driving. One order at a
 * time per room: an order already on its way blocks the next one.
 */
export function driverReceiveState<T extends { uid: string, nickname: string, kind: string, driving: boolean, inCar?: boolean, sourceValid?: boolean }>(
  freshMembers: T[], allMembers: T[], selectedUid: string | null, inFlight: RoomOrderInFlight | null,
): { state: DriverReceiveState, label: string, uid: string | null } {
  const name = (uid: string | null) => allMembers.find(member => member.uid === uid)?.nickname || 'il pilota'
  if (inFlight) return { state: 'applying', label: `Strategia in corso verso ${name(inFlight.targetUid)}`, uid: inFlight.targetUid }
  const drivers = (list: T[]) => list.filter(member => member.kind === 'driver' && (!selectedUid || member.uid === selectedUid))
  const fresh = drivers(freshMembers)
  const target = fresh.find(member => member.driving) ?? (fresh.length === 1 ? fresh[0] : null)
  if (target?.driving) return { state: 'ready', label: `${target.nickname}: può ricevere la strategia`, uid: target.uid }
  if (target && target.sourceValid === false) return { state: 'not-connected', label: `${target.nickname}: gioco non collegato`, uid: target.uid }
  if (target) return { state: 'menu', label: `${target.nickname} non è in guida: invio possibile quando torna in pista`, uid: target.uid }
  if (fresh.length > 1) return { state: 'none', label: 'Più piloti nella stanza: scegli il destinatario', uid: null }
  const known = drivers(allMembers)
  if (known.length) return { state: 'offline', label: `${known[0]!.nickname} è offline`, uid: known[0]!.uid }
  return { state: 'none', label: 'Nessun pilota nella stanza', uid: null }
}

/**
 * An explicit selection survives unavailability; only an untouched initial
 * selection auto-fills. PIP-515: an automatic selection follows the single
 * driver at the wheel (driver change in endurance) and is cleared when two or
 * more members drive, so the engineer chooses instead of the system guessing.
 */
export function resolveSocialTarget<T extends { uid: string }>(drivers: T[], selectedUid: string | null, touched: boolean, automatic = false): { selectedUid: string | null, target: T | null } {
  let uid = selectedUid ?? (!touched && drivers.length === 1 ? drivers[0]!.uid : null)
  if (automatic && selectedUid) {
    if (drivers.length === 1) uid = drivers[0]!.uid
    else if (drivers.length > 1) uid = null
  }
  return { selectedUid: uid, target: drivers.find(driver => driver.uid === uid) ?? null }
}
