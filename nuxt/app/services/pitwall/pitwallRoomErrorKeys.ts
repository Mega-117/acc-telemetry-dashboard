// PIP-750: pure module (no I/O): the overlay and pitwallLink translate these keys without loading Firebase.
/**
 * PIP-750: why an entry, an exit or an open did not happen. The diagnostic
 * carries the code; the screen shows the translated key, never an SDK text.
 */
export type PitwallRoomErrorCode = 'in-another-room' | 'another-device' | 'not-ready' | 'full' | 'not-allowed'
  | 'view-pending' | 'session-ended' | 'network' | 'permission-denied' | 'unknown'

const KEYS: Record<PitwallRoomErrorCode, string> = {
  'in-another-room': 'inAnotherRoom',
  'another-device': 'anotherDevice',
  'not-ready': 'notReady',
  'full': 'full',
  'not-allowed': 'notAllowed',
  'view-pending': 'viewPending',
  'session-ended': 'sessionEnded',
  'network': 'network',
  'permission-denied': 'permissionDenied',
  'unknown': 'unknown',
}
export const PITWALL_ROOM_ERROR_PREFIX = 'pitwall.roomErrors.'
export const roomErrorKey = (code: PitwallRoomErrorCode) => `${PITWALL_ROOM_ERROR_PREFIX}${KEYS[code]}`
