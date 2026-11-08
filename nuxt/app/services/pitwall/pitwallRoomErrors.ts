import { emitPitwallDiagnostic } from './pitwallDiagnostics'
import { pitwallIoErrorCode } from './pitwallIoMetrics'
import type { PitwallRoom } from './pitwallRoomContract'

import { roomErrorKey, type PitwallRoomErrorCode } from './pitwallRoomErrorKeys'

export { PITWALL_ROOM_ERROR_PREFIX, roomErrorKey, type PitwallRoomErrorCode } from './pitwallRoomErrorKeys'

export class PitwallRoomError extends Error {
  constructor(readonly code: PitwallRoomErrorCode, readonly detail?: unknown) {
    super(roomErrorKey(code))
    this.name = 'PitwallRoomError'
  }
}

const text = (error: unknown) => error instanceof Error ? error.message : String(error)
export const isDenied = (error: unknown) => pitwallIoErrorCode(error) === 'permission-denied' || /permission.?denied/i.test(text(error))
const NETWORK_CODES = new Set(['unavailable', 'network-error', 'disconnected', 'write-canceled'])
// Texts of pitwallRealtimeTransport when the connection is missing or changes mid-operation.
const NETWORK_TEXT = /network|offline|Collegamento Pitwall non disponibile|Connessione (interrotta|cambiata)|Tempo esaurito/i
export const isNetwork = (error: unknown) => NETWORK_CODES.has(pitwallIoErrorCode(error)) || NETWORK_TEXT.test(text(error))

export function roomErrorCode(error: unknown): PitwallRoomErrorCode {
  if (error instanceof PitwallRoomError) return error.code
  if (isDenied(error)) return 'permission-denied'
  if (isNetwork(error)) return 'network'
  return 'unknown'
}

export interface RoomFailure { ok: false, reason: string, code: PitwallRoomErrorCode, committed?: true, roomId?: string }
export type JoinResult = { ok: true, value: PitwallRoom } | RoomFailure

/** Every failed entry, open, exit or stale cleanup leaves one diagnostic with its code and the raw cause. */
export function roomFailure(operation: 'join' | 'open' | 'leave' | 'cleanup', context: { roomId?: string, uid: string, connectionId: string }, error: unknown): RoomFailure {
  const code = roomErrorCode(error)
  const cause = error instanceof PitwallRoomError ? error.detail ?? error : error
  emitPitwallDiagnostic(`room_${operation}_failed`, { ...context, roomId: context.roomId, code, reason: text(cause) })
  return { ok: false, reason: roomErrorKey(code), code }
}
