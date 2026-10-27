// ============================================
// The bell's notices for the live store (extracted to keep it under the line budget).
//
// Who asked to be my friend (from the Realtime Database, the authority), which race invites me, what this
// browser dismissed, and since 27/10 the Firestore inbox that makes the bell instant: a new request pointer
// rereads the requests at once, an invite pointer is a notice even before the rooms are loaded (outside the
// Pitwall they never are).
// ============================================

import { computed, ref, watch } from 'vue'
import { isPitwallRoomInvited, type PitwallRoom } from '~/services/pitwall/pitwallRoomContract'
import type { PitwallFriendView } from '~/services/pitwall/pitwallFriends'
import type { PitwallConceptNotice } from '~/utils/pitwallConcept'
import { createPitwallNotificationInbox } from '~/composables/usePitwallNotificationInbox'

export const NOTICE_PREFIX = { request: 'req:', invite: 'inv:', granted: 'grant:' } as const
const DISMISSED_INVITES_KEY = 'pitwall-dismissed-invites'

/** Un insieme di id ricordato dal browser: sopravvive al ricaricamento, non ad altri. */
function loadSet(key: string): Set<string> {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(key)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function saveSet(key: string, value: Set<string>): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify([...value]))
  } catch {
    // Senza memoria locale l'avviso ricompare al prossimo avvio: fastidioso, non falso.
  }
}

export interface PitwallBellDeps {
  uid: () => string | null
  rooms: () => PitwallRoom[]
  openRaceIds: () => Set<string>
  friendViews: () => PitwallFriendView[]
  /** The incoming requests as last read: each new reading tidies up the inbox. */
  incoming: () => unknown
  /** Rereads the incoming requests from the Realtime Database. */
  refreshRequests: () => Promise<void> | void
}

export function createPitwallBellNotices(deps: PitwallBellDeps) {
  const requestNotices = computed<PitwallConceptNotice[]>(() =>
    // PIP-561: only a live request on my node notifies. Its own one-way grant is
    // the sender's to toggle freely; it stays in the list but never rings the bell.
    deps.friendViews().filter(view => view.state === 'received' && view.mineStatus === 'pending').map(view => ({
      id: `${NOTICE_PREFIX.request}${view.personId}`, kind: 'request' as const, personId: view.personId,
    })))
  const inbox = createPitwallNotificationInbox({
    refreshRequests: deps.refreshRequests,
    pendingRequestFrom: () => new Set(requestNotices.value.map(notice => notice.personId)),
  })
  const dismissedInvites = ref(loadSet(`${DISMISSED_INVITES_KEY}:${deps.uid()}`))
  watch(deps.uid, () => { dismissedInvites.value = loadSet(`${DISMISSED_INVITES_KEY}:${deps.uid()}`) })
  watch(deps.incoming, () => inbox.prune())
  // The room data, once loaded, wins: a closed room takes its invite pointer away.
  watch(deps.rooms, (list) => {
    for (const invite of inbox.roomInvites.value) {
      if (invite.roomId && list.some(room => room.roomId === invite.roomId && room.closedAt)) inbox.removeInvite(invite.roomId)
    }
  })

  /**
   * Un invito e' un avviso solo se porta da qualche parte: il Pitwall aperto
   * di un amico, oppure la gara di chi non e' mio amico e mi ha invitato a
   * mano (+ Ospite). Gli inviti di un amico alle sue gare di ieri - le stanze
   * non si chiudono da sole, e il suo PC mi semina in ognuna - non sono una
   * notizia: visto dal vivo, sei campanelle "Gara non piu' disponibile".
   */
  const notices = computed<PitwallConceptNotice[]>(() => {
    const me = deps.uid()
    const rooms = deps.rooms()
    const friendIds = new Set(deps.friendViews().filter(view => view.state === 'friends').map(view => view.personId))
    const openRaceIds = deps.openRaceIds()
    const fromRooms = rooms
      .filter(room => room.membershipModel !== 'social' && room.hostUid !== me && isPitwallRoomInvited(room, me) && !room.closedAt && !dismissedInvites.value.has(room.roomId))
      .filter(room => openRaceIds.has(room.roomId) || !friendIds.has(room.hostUid))
      .map(room => ({ id: `${NOTICE_PREFIX.invite}${room.roomId}`, kind: 'invite' as const, personId: room.hostUid, raceId: room.roomId }))
    // Decision 27/10: invites known only from the inbox (rooms not loaded, i.e. outside the Pitwall).
    const fromInbox = inbox.roomInvites.value
      .filter(item => item.roomId && !dismissedInvites.value.has(item.roomId) && !rooms.some(room => room.roomId === item.roomId))
      .map(item => ({ id: `${NOTICE_PREFIX.invite}${item.roomId}`, kind: 'invite' as const, personId: item.fromUid, raceId: item.roomId ?? '' }))
    return [...requestNotices.value, ...fromRooms, ...fromInbox]
  })

  /** Le regole non permettono a un invitato di togliersi dagli invitati: rifiutare e' una memoria di questo browser. */
  function dismissInvite(raceId: string): void {
    dismissedInvites.value.add(raceId)
    saveSet(`${DISMISSED_INVITES_KEY}:${deps.uid()}`, dismissedInvites.value)
    inbox.removeInvite(raceId)
  }
  /** Entering a race: it is no longer dismissed, and its invite pointer has done its job. */
  function enteredRace(raceId: string): void {
    dismissedInvites.value.delete(raceId)
    saveSet(`${DISMISSED_INVITES_KEY}:${deps.uid()}`, dismissedInvites.value)
    inbox.removeInvite(raceId)
  }

  return { inbox, notices, pendingNoticeCount: computed(() => notices.value.length), dismissInvite, enteredRace }
}
