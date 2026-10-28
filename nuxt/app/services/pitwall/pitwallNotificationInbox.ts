// ============================================
// Decision 27/10: instant notification bell, the standard Firebase pattern.
//
// One sentence: when someone sends me a friend request or a Pitwall invite, their app also writes a small
// pointer into my Firestore inbox `users/{me}/notifications`; my app listens to that inbox (a Firestore
// listener, not a Realtime Database connection: the Spark plan allows only 100 of those at once) and, when a
// pointer arrives, rereads the real request from the Realtime Database, which stays the only authority.
//
// The id is fixed by the content (firestore.rules validPitwallNotification): one pointer per sender for a
// request, one per room for an invite. Nothing is ever updated: a pointer is created, then deleted when the
// request is answered or cancelled, or the invite is used, revoked or closed. Every write is best effort:
// a missing pointer only means the bell waits for the slow fallback reading.
// ============================================

import {
  collection, doc, limit, orderBy, query, serverTimestamp,
  type Firestore, type Unsubscribe,
} from 'firebase/firestore'
import { trackedDeleteDoc, trackedOnSnapshot, trackedSetDoc } from '~/composables/useFirebaseTracker'

const CALLER = 'PitwallNotificationInbox'

export type PitwallNotificationType = 'friend-request' | 'room-invite'

export interface PitwallNotification {
  id: string
  type: PitwallNotificationType
  fromUid: string
  fromNickname: string
  roomId: string | null
  /** Server time of the pointer; null only for a write not yet confirmed. */
  createdAtMs: number | null
}

/** The listener reads at most this many pointers (newest first): reads stay capped. */
export const PITWALL_NOTIFICATION_LIMIT = 20
/** An invite pointer older than this is stale (the room is long gone or forgotten): it is removed. */
export const PITWALL_INVITE_POINTER_TTL_MS = 12 * 60 * 60 * 1000
const ROOM_ID = /^[A-Za-z0-9_-]{1,64}$/
const MAX_NICKNAME = 60

export function pitwallNotificationId(type: PitwallNotificationType, fromUid: string, roomId?: string | null): string {
  return type === 'friend-request' ? `friend-request-${fromUid}` : `room-invite-${roomId ?? ''}`
}

/** A pointer read from the inbox, or null when it is not one of ours (ignored, never trusted further). */
export function parsePitwallNotification(id: string, data: Record<string, unknown> | undefined): PitwallNotification | null {
  if (!data || (data.type !== 'friend-request' && data.type !== 'room-invite')) return null
  if (typeof data.fromUid !== 'string' || !data.fromUid) return null
  const roomId = typeof data.roomId === 'string' && ROOM_ID.test(data.roomId) ? data.roomId : null
  if (data.type === 'room-invite' && !roomId) return null
  const created = data.createdAt as { toMillis?: () => number } | null | undefined
  return {
    id, type: data.type, fromUid: data.fromUid,
    fromNickname: typeof data.fromNickname === 'string' && data.fromNickname ? data.fromNickname.slice(0, MAX_NICKNAME) : data.fromUid,
    roomId, createdAtMs: typeof created?.toMillis === 'function' ? created.toMillis() : null,
  }
}

export interface PitwallNotificationSend {
  toUid: string
  type: PitwallNotificationType
  fromUid: string
  fromNickname: string
  roomId?: string | null
}

/** Writes the pointer into the recipient's inbox. A pointer of mine already there is replaced (delete + create). Never throws. */
export async function sendPitwallNotification(db: Firestore, input: PitwallNotificationSend): Promise<boolean> {
  if (!input.toUid || !input.fromUid || input.toUid === input.fromUid) return false
  if (input.type === 'room-invite' && !(input.roomId && ROOM_ID.test(input.roomId))) return false
  const nickname = (input.fromNickname || '').trim().slice(0, MAX_NICKNAME) || input.fromUid
  try {
    const ref = doc(db, 'users', input.toUid, 'notifications', pitwallNotificationId(input.type, input.fromUid, input.roomId))
    // No updates are allowed: an older pointer of mine goes first. When there is none the rules refuse the
    // delete, which is expected.
    try { await trackedDeleteDoc(ref, CALLER) } catch { /* nothing of mine to replace */ }
    await trackedSetDoc(ref, {
      type: input.type, fromUid: input.fromUid, fromNickname: nickname,
      ...(input.type === 'room-invite' ? { roomId: input.roomId } : {}),
      createdAt: serverTimestamp(),
    }, CALLER)
    return true
  } catch { return false }
}

/** Removes one pointer (mine from my inbox, or one I wrote into someone else's). Never throws. */
export async function removePitwallNotification(db: Firestore, ownerUid: string, id: string): Promise<boolean> {
  if (!ownerUid || !id) return false
  try { await trackedDeleteDoc(doc(db, 'users', ownerUid, 'notifications', id), CALLER); return true } catch { return false }
}

/** The friend-request pointers around one account's friend actions (usePitwallFriendActions). */
export interface PitwallRequestPointers {
  /** I asked `toUid` to be friends: a pointer goes into their inbox. */
  sent: (toUid: string) => Promise<boolean>
  /** I cancelled my request to `toUid`: my pointer leaves their inbox. */
  withdrawn: (toUid: string) => Promise<boolean>
  /** I answered (accepted or declined) the request of `fromUid`: their pointer leaves my inbox. */
  answered: (fromUid: string) => Promise<boolean>
}

/** The sender's name for a pointer; a name that cannot be read becomes the uid (sendPitwallNotification). */
function safeNickname(nickname: () => string): string {
  try { return nickname() || '' } catch { return '' }
}

export function createPitwallRequestPointers(db: Firestore, me: () => string | null, getNickname: () => string): PitwallRequestPointers {
  const nickname = () => safeNickname(getNickname)
  return {
    sent: async (toUid) => {
      const fromUid = me()
      return fromUid ? sendPitwallNotification(db, { toUid, type: 'friend-request', fromUid, fromNickname: nickname() }) : false
    },
    withdrawn: async (toUid) => {
      const fromUid = me()
      return fromUid ? removePitwallNotification(db, toUid, pitwallNotificationId('friend-request', fromUid)) : false
    },
    answered: async (fromUid) => {
      const owner = me()
      return owner ? removePitwallNotification(db, owner, pitwallNotificationId('friend-request', fromUid)) : false
    },
  }
}

/** The room-invite pointers around a manager's invite / revoke / close (usePitwallRoom). */
export function pitwallInvitePointers(db: Firestore, me: () => string | null, getNickname: () => string) {
  const nickname = () => safeNickname(getNickname)
  return {
    invited: async (toUid: string, roomId: string): Promise<boolean> => {
      const fromUid = me()
      return fromUid ? sendPitwallNotification(db, { toUid, type: 'room-invite', fromUid, fromNickname: nickname(), roomId }) : false
    },
    /** Only a pointer I wrote can go (the rules): one written by another manager expires by itself. */
    revoked: async (toUid: string, roomId: string): Promise<boolean> =>
      removePitwallNotification(db, toUid, pitwallNotificationId('room-invite', '', roomId)),
  }
}

/** Listens to my inbox, newest first, at most PITWALL_NOTIFICATION_LIMIT pointers. */
export function watchPitwallNotifications(
  db: Firestore,
  uid: string,
  onChange: (items: PitwallNotification[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const inbox = query(collection(db, 'users', uid, 'notifications'), orderBy('createdAt', 'desc'), limit(PITWALL_NOTIFICATION_LIMIT))
  return trackedOnSnapshot(inbox, CALLER, (snapshot) => {
    onChange(snapshot.docs.flatMap(entry => {
      const parsed = parsePitwallNotification(entry.id, entry.data())
      return parsed ? [parsed] : []
    }))
  }, error => onError?.(error))
}
