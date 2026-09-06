import type { PitwallRoom, PitwallRoomMember, PitwallRoomOrder } from './pitwallRoomContract'

export type RoomRole = 'manager' | 'member' | 'invited'
export interface RealtimeRoomMeta {
  roomId: string
  hostUid: string
  label: string
  vehicleFingerprint: string
  createdAt: string
  updatedAt: string
  track?: string | null
  raceNumber?: number | null
  teamName?: string | null
}
export interface RealtimeConnection {
  protocolVersion: 3
  uid: string
  connectionId: string
  runtimeSessionId: string
  roomId: string | null
  nickname: string
  kind: 'driver' | 'engineer'
  driving: boolean
  sourceValid: boolean
  updatedAt: number
  car?: string | null
  track?: string | null
}
export interface RealtimeMfd {
  uid: string
  connectionId: string
  strategy: unknown
  crew: unknown
  updatedAt: number
}
export interface RealtimeOrder extends PitwallRoomOrder {
  protocolVersion: 3
  targetUid: string
  targetConnectionId: string
  senderConnectionId: string
  leaseUntilMs?: number
}

export function roomFromRealtime(meta: RealtimeRoomMeta | null, access: Record<string, RoomRole> = {}): PitwallRoom | null {
  if (!meta) return null
  return { ...meta, schemaVersion: 2, managerUids: Object.keys(access).filter(uid => access[uid] === 'manager'),
    memberUids: Object.keys(access).filter(uid => access[uid] !== 'invited'),
    allowedUids: Object.keys(access).filter(uid => access[uid] === 'invited') }
}

export function memberFromRealtime(connection: RealtimeConnection, mfd: RealtimeMfd | null): PitwallRoomMember {
  const ownMfd = mfd?.uid === connection.uid && mfd.connectionId === connection.connectionId ? mfd : null
  return { uid: connection.uid, nickname: connection.nickname, kind: connection.kind,
    runtimeSessionId: connection.runtimeSessionId, driving: connection.driving && connection.sourceValid,
    updatedAtMs: connection.updatedAt, protocolVersion: 3, connected: true, connectionId: connection.connectionId,
    crew: ownMfd?.crew, strategy: ownMfd?.strategy }
}

export function activeDriver(connections: RealtimeConnection[]): RealtimeConnection | null {
  const driving = connections.filter(value => value.kind === 'driver' && value.driving && value.sourceValid)
  return driving.length === 1 ? driving[0]! : null
}

export function canClaimRealtimeOrder(order: RealtimeOrder | null, uid: string, connectionId: string, now: number) {
  return order?.status === 'pending' && order.protocolVersion === 3 && order.targetUid === uid
    && order.targetConnectionId === connectionId && order.expiresAtMs > now
}
