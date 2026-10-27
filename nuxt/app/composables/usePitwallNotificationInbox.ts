// ============================================
// The bell's Firestore inbox (decision 27/10), as the live store uses it.
//
// One sentence: while the account is signed in, one Firestore listener on `users/{me}/notifications`; a new
// friend-request pointer makes the bell reread the requests from the Realtime Database at once, an invite
// pointer becomes an invite notice by itself. Stale pointers are tidied up here, never trusted for more.
// ============================================

import { computed, ref } from 'vue'
import { db } from '~/config/firebase'
import {
  PITWALL_INVITE_POINTER_TTL_MS,
  pitwallNotificationId,
  removePitwallNotification,
  watchPitwallNotifications,
  type PitwallNotification,
} from '~/services/pitwall/pitwallNotificationInbox'

/** A request pointer younger than this is kept even if the last reading did not show the request yet. */
const REQUEST_POINTER_GRACE_MS = 2 * 60 * 1000

export interface PitwallNotificationInboxDeps {
  /** Rereads the incoming requests from the Realtime Database (the authority). */
  refreshRequests: () => Promise<void> | void
  /** Who has a request waiting for me, according to the last reading. */
  pendingRequestFrom: () => Set<string>
  now?: () => number
  watch?: typeof watchPitwallNotifications
  remove?: typeof removePitwallNotification
}

export function createPitwallNotificationInbox(deps: PitwallNotificationInboxDeps) {
  const now = deps.now ?? Date.now
  const watchInbox = deps.watch ?? watchPitwallNotifications
  const removeOne = deps.remove ?? removePitwallNotification
  const items = ref<PitwallNotification[]>([])
  let owner: string | null = null
  let unsubscribe: (() => void) | null = null
  let seen = new Map<string, number | null>()
  let first = true

  const isStaleInvite = (item: PitwallNotification) =>
    item.type === 'room-invite' && item.createdAtMs != null && now() - item.createdAtMs > PITWALL_INVITE_POINTER_TTL_MS
  /** Invite pointers still worth a notice. */
  const roomInvites = computed(() => items.value.filter(item => item.type === 'room-invite' && !isStaleInvite(item)))

  /** Deletes one of my pointers, also when this inbox has not shown it yet (beyond the read cap, say). */
  function remove(id: string): void {
    if (!owner) return
    items.value = items.value.filter(item => item.id !== id)
    void removeOne(db, owner, id)
  }

  /**
   * After a reading of the requests: pointers whose request is no longer waiting (answered elsewhere, or
   * withdrawn without tidying up) and expired invites go away.
   */
  function prune(): void {
    if (!owner) return
    const pending = deps.pendingRequestFrom()
    for (const item of items.value) {
      const oldRequest = item.type === 'friend-request' && item.createdAtMs != null && now() - item.createdAtMs > REQUEST_POINTER_GRACE_MS
      if ((oldRequest && !pending.has(item.fromUid)) || isStaleInvite(item)) remove(item.id)
    }
  }

  function start(uid: string): void {
    if (owner === uid && unsubscribe) return
    stop()
    owner = uid
    first = true
    const onChange = (list: PitwallNotification[]) => {
      if (owner !== uid) return
      items.value = list
      const fresh = list.some(item => item.type === 'friend-request' && (!seen.has(item.id) || seen.get(item.id) !== item.createdAtMs))
      seen = new Map(list.map(item => [item.id, item.createdAtMs]))
      // The first snapshot is what was already there: the reading made at start covers it.
      if (fresh && !first) void deps.refreshRequests()
      first = false
      for (const item of list) if (isStaleInvite(item)) remove(item.id)
    }
    // A listener that cannot start must not stop the rest of the Pitwall: the slow reading still runs.
    try {
      unsubscribe = watchInbox(db, uid, onChange, () => { /* the slow fallback reading keeps the bell right */ })
    } catch { unsubscribe = null }
  }

  function stop(): void {
    unsubscribe?.()
    unsubscribe = null
    owner = null
    items.value = []
    seen = new Map()
  }

  return {
    items,
    roomInvites,
    start,
    stop,
    prune,
    remove,
    /** The invite pointer of a room, when this inbox holds one (no write otherwise). */
    removeInvite: (roomId: string) => {
      const id = pitwallNotificationId('room-invite', '', roomId)
      if (items.value.some(item => item.id === id)) remove(id)
    },
  }
}
