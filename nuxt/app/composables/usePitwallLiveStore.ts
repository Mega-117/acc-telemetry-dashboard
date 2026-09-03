// ============================================
// La presa vera del Pit Wall: Firestore, la stanza, il PC del pilota.
//
// Traduce nei due sensi fra la forma che i componenti conoscono (persone,
// permessi in quattro parole, gare, avvisi) e i tre mattoncini che esistono
// gia': `usePitwallRoom` (la gara), `usePitwallLink` (i permessi) e
// `usePitwallController` (la correttezza dell'ordine). Non aggiunge regole di
// dominio: le riusa.
//
// E' un singleton, perche' la campanella deve accendersi anche fuori da
// /pitwall: gli ascolti partono con l'app, non con la pagina.
// ============================================

import { computed, effectScope, ref, watch, type Ref } from 'vue'
import { doc } from 'firebase/firestore'
import { db } from '~/config/firebase'
import { trackedGetDoc } from '~/composables/useFirebaseTracker'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { usePitwallRoom } from '~/composables/usePitwallRoom'
import { usePitwallLink } from '~/composables/usePitwallLink'
import { usePitwallController } from '~/composables/usePitwallController'
import type { PitwallDuration, PitwallStopHandle, PitwallStore } from '~/composables/usePitwallStore'
import { isPitwallRoomInvited, type PitwallRoom } from '~/services/pitwall/pitwallRoomContract'
import { pitwallClockFromExpiry, pitwallExpiryFromClock } from '~/services/pitwall/pitwallLink'
import type { PitwallIncomingRequest, PitwallOutgoingLink } from '~/services/pitwall/pitwallEngineerService'
import { searchPitwallConceptDirectory } from '~/utils/pitwallConcept'
import type {
  PitwallConceptDirection,
  PitwallConceptLink,
  PitwallConceptMember,
  PitwallConceptNotice,
  PitwallConceptPerson,
  PitwallConceptRace,
} from '~/utils/pitwallConcept'

const SEARCH_DEBOUNCE_MS = 300
const DISMISSED_INVITES_KEY = 'pitwall-dismissed-invites'
const SEEN_GRANTS_KEY = 'pitwall-seen-grants'

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

/** Un permesso vero nelle quattro parole della pagina. `null` = non si mostra. */
export function linkFromOutgoing(link: PitwallOutgoingLink): PitwallConceptLink | null {
  if (link.status === 'pending') return { personId: link.driverUid, access: 'pending' }
  if (link.status !== 'granted' || !link.usable) return null
  return link.scope === 'once' && link.expiresAtMs != null
    ? { personId: link.driverUid, access: 'today', until: pitwallClockFromExpiry(link.expiresAtMs) ?? undefined }
    : { personId: link.driverUid, access: 'always' }
}

export function linkFromIncoming(request: PitwallIncomingRequest, nowMs: number): PitwallConceptLink | null {
  if (request.status === 'pending') return { personId: request.engineerUid, access: 'incoming' }
  if (request.status !== 'granted') return null
  if (request.expiresAtMs != null && request.expiresAtMs <= nowMs) return null
  return request.scope === 'once' && request.expiresAtMs != null
    ? { personId: request.engineerUid, access: 'today', until: pitwallClockFromExpiry(request.expiresAtMs) ?? undefined }
    : { personId: request.engineerUid, access: 'always' }
}

export const NOTICE_PREFIX = { request: 'req:', invite: 'inv:', granted: 'grant:' } as const

function createLiveStore(): PitwallStore & { start: () => void, halt: () => void } {
  const { currentUser } = useFirebaseAuth()
  const uid = () => currentUser.value?.uid ?? null
  const link = usePitwallRoom({ uid })
  const trust = usePitwallLink({ engineerUid: uid })
  const controller = usePitwallController(link, trust)

  // ---- Persone: chi conosciamo per nome --------------------------------------
  const ownNickname = ref<string | null>(null)
  async function loadOwnNickname(): Promise<void> {
    const me = uid()
    if (!me || ownNickname.value) return
    try {
      const profile = await trackedGetDoc(doc(db, 'publicProfiles', me), 'pitwall.selfProfile')
      ownNickname.value = profile.exists() ? String((profile.data() as { nickname?: string }).nickname ?? '') || me : me
    } catch {
      ownNickname.value = me
    }
  }

  const people = computed<PitwallConceptPerson[]>(() => {
    const known = new Map<string, string>()
    const me = uid()
    if (me) known.set(me, ownNickname.value || me)
    for (const row of link.crew.value) known.set(row.uid, row.nickname)
    for (const request of trust.incoming.value) known.set(request.engineerUid, request.nickname || request.engineerUid)
    for (const outgoing of trust.outgoing.value) known.set(outgoing.driverUid, outgoing.nickname || outgoing.driverUid)
    for (const found of trust.searchResults.value) known.set(found.uid, found.nickname)
    for (const room of link.rooms.value) {
      for (const member of [...room.memberUids, ...room.allowedUids]) if (!known.has(member)) known.set(member, member)
    }
    return [...known.entries()].map(([id, nickname]) => ({ id, handle: `@${nickname}` }))
  })

  // ---- Permessi -------------------------------------------------------------
  const links = computed<Record<PitwallConceptDirection, PitwallConceptLink[]>>(() => ({
    assist: trust.outgoing.value.map(linkFromOutgoing).filter((entry): entry is PitwallConceptLink => entry != null),
    assisted: trust.incoming.value
      .map(request => linkFromIncoming(request, link.nowTick.value))
      .filter((entry): entry is PitwallConceptLink => entry != null),
  }))

  const linkedIds = computed(() => [
    ...links.value.assist.map(entry => entry.personId),
    ...links.value.assisted.map(entry => entry.personId),
  ])

  // ---- Gare -----------------------------------------------------------------
  function membersOf(room: PitwallRoom, selected: boolean): PitwallConceptMember[] {
    if (selected) {
      return link.crew.value.map(row => ({
        personId: row.uid,
        role: row.invited ? 'invited' : row.role,
        driving: row.driving,
        online: row.online || row.connecting,
      }))
    }
    return [
      ...room.memberUids.map(member => ({
        personId: member,
        role: (room.managerUids.includes(member) ? 'manager' : 'member') as PitwallConceptMember['role'],
        driving: false,
        online: false,
      })),
      ...room.allowedUids.filter(member => !room.memberUids.includes(member)).map(member => ({
        personId: member,
        role: 'invited' as const,
        driving: false,
        online: false,
      })),
    ]
  }

  function sessionLabel(room: PitwallRoom, selected: boolean): string {
    if (room.closedAt) return 'Gara chiusa'
    if (!selected) return 'Entra per vedere chi guida'
    return link.executor.value.reason === 'ready' ? 'In pista' : 'In attesa'
  }

  function toRace(room: PitwallRoom): PitwallConceptRace {
    const selected = link.room.value?.roomId === room.roomId
    return {
      id: room.roomId,
      carNumber: room.raceNumber ?? 0,
      carModel: room.label,
      track: room.track ?? '',
      session: sessionLabel(room, selected),
      hostId: room.hostUid,
      members: membersOf(room, selected),
      reason: { kind: isPitwallRoomInvited(room, uid()) ? 'invite' : 'grant', personId: room.hostUid },
      closed: Boolean(room.closedAt),
      live: selected,
    }
  }

  const dismissedInvites = ref(loadSet(DISMISSED_INVITES_KEY))
  const races = computed<PitwallConceptRace[]>(() => link.rooms.value
    .filter(room => !dismissedInvites.value.has(room.roomId) || !isPitwallRoomInvited(room, uid()))
    .map(toRace))
  const selectedRace = computed<PitwallConceptRace | null>(() => (link.room.value ? toRace(link.room.value) : null))

  // ---- Avvisi ---------------------------------------------------------------
  const seenGrants = ref(loadSet(SEEN_GRANTS_KEY))
  const grantNotices = ref<PitwallConceptNotice[]>([])
  let grantsSeeded = false
  // La prima lettura semina cio' che c'e' gia' senza avvisare: "X ti ha
  // autorizzato" per un permesso di due mesi fa non e' una notizia.
  watch(() => trust.outgoing.value, (list) => {
    const granted = list.filter(entry => entry.status === 'granted' && entry.usable)
    if (!grantsSeeded) {
      if (!list.length) return
      grantsSeeded = true
      for (const entry of granted) seenGrants.value.add(entry.driverUid)
      saveSet(SEEN_GRANTS_KEY, seenGrants.value)
      return
    }
    for (const entry of granted) {
      if (seenGrants.value.has(entry.driverUid)) continue
      seenGrants.value.add(entry.driverUid)
      grantNotices.value = [...grantNotices.value, {
        id: `${NOTICE_PREFIX.granted}${entry.driverUid}`, kind: 'granted', personId: entry.driverUid,
      }]
    }
    saveSet(SEEN_GRANTS_KEY, seenGrants.value)
  })

  const notices = computed<PitwallConceptNotice[]>(() => [
    ...trust.pendingIncoming.value.map(request => ({
      id: `${NOTICE_PREFIX.request}${request.engineerUid}`, kind: 'request' as const, personId: request.engineerUid,
    })),
    ...link.rooms.value
      .filter(room => isPitwallRoomInvited(room, uid()) && !room.closedAt && !dismissedInvites.value.has(room.roomId))
      .map(room => ({
        id: `${NOTICE_PREFIX.invite}${room.roomId}`, kind: 'invite' as const, personId: room.hostUid, raceId: room.roomId,
      })),
    ...grantNotices.value,
  ])
  const pendingNoticeCount = computed(() => notices.value.length)

  // ---- Ricerca --------------------------------------------------------------
  const searchQuery = ref('')
  let searchTimer: ReturnType<typeof setTimeout> | null = null
  watch(searchQuery, (query) => {
    if (searchTimer) clearTimeout(searchTimer)
    trust.searchTerm.value = query
    if (query.trim().length < 2) {
      trust.searchResults.value = []
      return
    }
    searchTimer = setTimeout(() => { void trust.search() }, SEARCH_DEBOUNCE_MS)
  })
  const found = computed(() => searchPitwallConceptDirectory(
    searchQuery.value,
    linkedIds.value,
    trust.searchResults.value.map(entry => ({ id: entry.uid, handle: `@${entry.nickname}` })),
  ))

  // ---- Azioni sui permessi --------------------------------------------------
  const expiryOf = (until?: string) => (until ? pitwallExpiryFromClock(until, Date.now()) : null)

  function askToAssist(personId: string): void { void trust.requestLink(personId, 'always') }
  function cancelRequest(personId: string): void { void trust.withdrawRequest(personId) }
  function allowToAssistMe(personId: string, duration: PitwallDuration, until?: string): void {
    void trust.preAuthorise(personId, duration === 'today' ? 'once' : 'always', expiryOf(until))
  }
  function decideRequest(personId: string, decision: PitwallDuration | 'reject', until?: string): void {
    if (decision === 'reject') { void trust.decide(personId, 'revoked'); return }
    void trust.decide(personId, 'granted', decision === 'today' ? 'once' : 'always', expiryOf(until))
  }
  function removeLink(direction: PitwallConceptDirection, personId: string): void {
    if (direction === 'assisted') void trust.decide(personId, 'revoked')
    else void trust.withdrawRequest(personId)
  }
  function setExpiry(direction: PitwallConceptDirection, personId: string, until: string): void {
    if (direction !== 'assisted') return
    const expiresAtMs = expiryOf(until)
    if (expiresAtMs != null) void trust.setExpiry(personId, expiresAtMs)
  }
  const canEditExpiry = (direction: PitwallConceptDirection) => direction === 'assisted'

  // ---- Azioni sulla gara ----------------------------------------------------
  async function inRoom(raceId: string, action: () => Promise<void>): Promise<void> {
    if (link.selectedRoomId.value !== raceId) await link.selectRoom(raceId)
    await action()
  }
  function selectRace(raceId: string): void { void link.selectRoom(raceId) }
  function enterRace(raceId: string): void {
    dismissedInvites.value.delete(raceId)
    saveSet(DISMISSED_INVITES_KEY, dismissedInvites.value)
    void link.selectRoom(raceId)
  }
  function leaveRace(raceId: string): void { void inRoom(raceId, () => link.leave()) }
  function inviteToRace(raceId: string, personId: string): void { void inRoom(raceId, () => link.invite(personId)) }
  function promoteInRace(raceId: string, personId: string): void { void inRoom(raceId, () => link.promote(personId)) }
  function removeFromRace(raceId: string, personId: string): void { void inRoom(raceId, () => link.revoke(personId)) }
  function closeRace(raceId: string): void { void inRoom(raceId, () => link.closeRoom()) }

  // ---- Avvisi: decidere -----------------------------------------------------
  function dismissNotice(id: string): void {
    if (id.startsWith(NOTICE_PREFIX.granted)) {
      grantNotices.value = grantNotices.value.filter(entry => entry.id !== id)
    } else if (id.startsWith(NOTICE_PREFIX.invite)) {
      // Le regole non permettono a un invitato di togliersi dagli invitati:
      // rifiutare e' una memoria di questo browser, e la gara resta aperta.
      dismissedInvites.value.add(id.slice(NOTICE_PREFIX.invite.length))
      saveSet(DISMISSED_INVITES_KEY, dismissedInvites.value)
    }
  }
  function acceptNotice(id: string, duration: PitwallDuration = 'always', until?: string): void {
    if (id.startsWith(NOTICE_PREFIX.request)) decideRequest(id.slice(NOTICE_PREFIX.request.length), duration, until)
    else if (id.startsWith(NOTICE_PREFIX.invite)) enterRace(id.slice(NOTICE_PREFIX.invite.length))
    else dismissNotice(id)
  }
  function rejectNotice(id: string): void {
    if (id.startsWith(NOTICE_PREFIX.request)) decideRequest(id.slice(NOTICE_PREFIX.request.length), 'reject')
    else dismissNotice(id)
  }

  // ---- Pit stop -------------------------------------------------------------
  const stop: PitwallStopHandle = {
    pressures: controller.pressures,
    fuelLiters: controller.fuelLiters,
    compound: controller.compound,
    tyreSet: controller.tyreSet,
    changeTyres: controller.changeTyres,
    brakes: controller.brakes,
    repairBodywork: controller.repairBodywork,
    repairSuspension: controller.repairSuspension,
    driverId: controller.driverId,
    pitStrategy: controller.pitStrategy,
    drivers: controller.drivers,
    car: controller.car,
    hasCarSnapshot: computed(() => link.carSnapshot.value != null),
    carFresh: controller.carFresh,
    presenceAgeSeconds: controller.presenceAgeSeconds,
    stopEstimate: controller.stopEstimate,
    blockedReason: controller.blockedReason,
    orderStatus: link.orderStatus,
    orderReason: link.orderReason,
    fieldOutcomes: controller.fieldOutcomes,
    adjustPressure: controller.adjustPressure,
    setPressure: controller.setPressure,
    stepPitStrategy: controller.stepPitStrategy,
    setCompound: controller.setCompound,
    resetToCar: controller.resetToCar,
    sendToCar: controller.sendToCar,
  }

  // ---- Ciclo di vita --------------------------------------------------------
  let started = false
  function start(): void {
    if (started || !uid()) return
    started = true
    void loadOwnNickname()
    link.start()
    void trust.refreshIncoming()
    void trust.refreshPilots()
    trust.watchLive()
  }
  function halt(): void {
    if (!started) return
    started = false
    link.stop()
    trust.stop()
    if (searchTimer) clearTimeout(searchTimer)
  }

  return {
    people,
    links,
    races,
    notices,
    selectedRace,
    pendingNoticeCount,
    notice: computed(() => link.notice.value ?? trust.notice.value ?? null),
    error: computed(() => link.lastError.value ?? trust.lastError.value ?? null),
    demo: false,
    meId: computed(() => uid()),
    crowded: ref(false) as Ref<boolean>,
    toggleCrowded: () => {},
    canEditExpiry,
    searchQuery,
    found,
    askToAssist,
    cancelRequest,
    allowToAssistMe,
    decideRequest,
    removeLink,
    setExpiry,
    selectRace,
    enterRace,
    leaveRace,
    inviteToRace,
    promoteInRace,
    removeFromRace,
    closeRace,
    acceptNotice,
    rejectNotice,
    dismissNotice,
    stop,
    start,
    halt,
  }
}

let instance: ReturnType<typeof createLiveStore> | null = null

/**
 * Lo store vero, uno per app.
 *
 * Nasce in uno scope proprio, cosi' gli ascolti non muoiono con il componente
 * che l'ha chiesto per primo: la campanella vive nel TopBar, la pagina no.
 */
export function usePitwallLiveStore() {
  if (!instance) {
    const scope = effectScope(true)
    instance = scope.run(createLiveStore)!
  }
  return instance
}
