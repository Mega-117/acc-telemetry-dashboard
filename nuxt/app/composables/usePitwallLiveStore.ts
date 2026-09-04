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
import type { PitwallStopHandle, PitwallStore } from '~/composables/usePitwallStore'
import {
  describePitwallRoomOccupancy,
  isPitwallRoomInvited,
  type PitwallRoom,
} from '~/services/pitwall/pitwallRoomContract'
import { closeDormantPitwallRooms } from '~/services/pitwall/pitwallRoomLifecycle'
import { derivePitwallFriends, pitwallFriendActions, sortPitwallFriends } from '~/services/pitwall/pitwallFriends'
import { requestPitwallClose, requestPitwallOpen, usePitwallIntent, type PitwallIntentStatus } from '~/composables/usePitwallIntent'
import { searchPitwallConceptDirectory } from '~/utils/pitwallConcept'
import { formatCarName, formatTrackName } from '~/utils/telemetryFormat'
import type {
  PitwallConceptFriend,
  PitwallConceptMember,
  PitwallConceptMyRoom,
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

  // ---- Amici ----------------------------------------------------------------
  // L'amicizia e' la coppia dei due permessi, uno per verso: la logica che li
  // legge e' una e sta in `pitwallFriends`. Qui si aggiungono solo presenza e
  // Pitwall aperto, che vengono dagli altri due mattoncini.
  const friendViews = computed(() => derivePitwallFriends(trust.incoming.value, trust.outgoing.value, link.nowTick.value))
  const reachableIds = computed(() => new Set(trust.outgoing.value.filter(entry => entry.reachable).map(entry => entry.driverUid)))
  const friends = computed<PitwallConceptFriend[]>(() => sortPitwallFriends(
    friendViews.value.map((view) => {
      const racing = reachableIds.value.has(view.personId)
      // "Pitwall aperto" = la sua gara e' viva **e** lui e' in pista adesso: la
      // presenza muore in 90 s, il segno di vita della stanza in 20 minuti, e
      // dopo un crash e' la prima a dire la verita'.
      const room = view.state === 'friends' && racing ? roomOfDriver(view.personId) : null
      const open = room != null && describePitwallRoomOccupancy(room, link.nowTick.value) === 'live'
      return {
        personId: view.personId,
        state: view.state,
        racing,
        pitwallOpen: open,
        ...(open ? { raceId: room.roomId } : {}),
      }
    }),
    id => reachableIds.value.has(id),
  ))

  // "Ce l'hai gia'" per chiunque sia gia' in un rapporto con me, in qualunque
  // stato: una richiesta in sospeso non si rimanda dalla ricerca.
  const linkedIds = computed(() => friendViews.value.map(view => view.personId))

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

  /**
   * Le gare in cui non entra piu' nessuno si chiudono da sole.
   *
   * Le stanze non si cancellano - sono la memoria della corsa - ma finora non
   * finivano nemmeno: ogni sessione ACC ne lasciava una aperta per sempre, e
   * l'elenco diventava otto gare identiche di giorni diversi. La pulizia la fa
   * il client che apre la pagina, non un lavoro schedulato: nessun server da
   * tenere acceso, nessun costo fisso, e chi non ha gare vecchie non paga
   * niente. Quali chiudere lo decide una funzione pura; solo un manager puo',
   * e la gara in corso non si tocca mai.
   */
  const closeAttempted = new Set<string>()
  watch(() => link.rooms.value, (list) => {
    void closeDormantPitwallRooms(link.service(), list, link.room.value?.roomId ?? null, closeAttempted)
  })

  const dismissedInvites = ref(loadSet(DISMISSED_INVITES_KEY))

  /**
   * La gara aperta adesso da una persona, fra quelle che vedo.
   *
   * Le stanze non si chiudono mai: dello stesso pilota ne esistono tante,
   * una per ogni sessione di sempre. Quella buona e' l'ultima aperta e non
   * chiusa; le altre sono memoria, non un posto dove entrare.
   */
  function roomOfDriver(driverUid: string): PitwallRoom | null {
    return link.rooms.value
      .filter(room => !room.closedAt && (room.hostUid === driverUid || room.memberUids.includes(driverUid)))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null
  }

  /**
   * I Pitwall aperti adesso: una riga per amico che ha aperto il suo.
   *
   * Elencare le stanze rispondeva alla domanda sbagliata: non si chiudono
   * mai, quindi comparivano le sessioni di giorni prima. Elencare chi era in
   * pista rispondeva a meta': in pista si puo' stare anche senza voler
   * nessuno al muretto. La riga c'e' quando l'amico ha **aperto** il Pitwall
   * - la sua gara e' viva e lui e' in pista - e sparisce da sola quando lo
   * chiude o spegne.
   */
  const races = computed<PitwallConceptRace[]>(() => friends.value
    .filter(friend => friend.pitwallOpen && friend.raceId)
    .map((friend) => {
      const room = roomOfDriver(friend.personId)!
      const entry = trust.outgoing.value.find(candidate => candidate.driverUid === friend.personId)
      const selected = link.room.value?.roomId === room.roomId
      const car = entry?.session?.car ?? null
      // La pista viene dalla presenza, non dalla stanza: la stanza porta
      // quella del giorno in cui e' nata, la presenza quella di adesso.
      const track = entry?.session?.track ?? room.track ?? null
      return {
        id: room.roomId,
        carNumber: room.raceNumber ?? 0,
        carModel: car ? formatCarName(car) : room.label,
        track: track ? formatTrackName(track) : '',
        session: 'Pitwall aperto',
        hostId: friend.personId,
        members: membersOf(room, selected),
        reason: { kind: 'grant' as const, personId: friend.personId },
        closed: false,
        live: true,
        joinable: true,
      }
    })
    // Due amici che si dividono la stessa vettura sono una gara sola: la riga
    // resta una. Due righe che portano nello stesso pit stop sarebbero solo un
    // doppione da capire.
    .filter((race, index, all) => all.findIndex(other => other.id === race.id) === index))
  const selectedRace = computed<PitwallConceptRace | null>(() => (link.room.value ? toRace(link.room.value) : null))

  /**
   * La gara di chi sta guardando, quando e' lui a guidare.
   *
   * `races` nasce da "le persone che mi hanno autorizzato": per costruzione
   * non contiene me, ed e' il motivo per cui il pilota apriva questa pagina e
   * non vedeva la gara che il suo stesso PC aveva appena aperto. Qui si guarda
   * la stessa stanza dall'altro capo - non chi posso assistere, ma chi puo'
   * assistere me.
   *
   * Si legge da `link.rooms`, che gia' arriva in diretta: nessuna lettura in
   * piu' per una cosa che il PC del pilota sapeva gia'.
   */
  const myRoom = computed<PitwallConceptMyRoom | null>(() => {
    const me = uid()
    if (!me) return null
    // "La tua gara" e' quella della vettura che il **tuo** PC ha aperto: la
    // stanza di cui sei host. Esserne membro non basta - un ingegnere entrato
    // nella gara di un pilota se la vedeva presentata come sua, con tanto di
    // "il tuo PC l'ha gia' aggiunto" (visto da popo il 2026-09-04).
    const room = link.rooms.value
      .filter(candidate => !candidate.closedAt && candidate.hostUid === me)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null
    if (!room) return null
    const selected = link.room.value?.roomId === room.roomId
    return {
      id: room.roomId,
      label: room.label,
      track: room.track ?? null,
      carNumber: room.raceNumber ?? null,
      state: describePitwallRoomOccupancy(room, link.nowTick.value),
      // Chi guida lo si sa solo dalla stanza che si sta guardando in diretta:
      // altrove sarebbe una deduzione da un elenco di identificativi, e si
      // preferisce non dirlo che dirlo a caso.
      drivingId: selected && link.executor.value.reason === 'ready'
        ? link.executor.value.executor?.uid ?? null
        : null,
      members: membersOf(room, selected),
      invitedIds: room.allowedUids.filter(person => !room.memberUids.includes(person)),
    }
  })

  // ---- Avvisi ---------------------------------------------------------------
  const seenGrants = ref(loadSet(SEEN_GRANTS_KEY))
  const grantNotices = ref<PitwallConceptNotice[]>([])
  let grantsSeeded = false
  // "X ha accettato": e' una notizia solo quando l'amicizia si completa
  // durante la sessione. La prima lettura semina gli amici che c'erano gia'
  // senza avvisare - un'amicizia di due mesi fa non e' una notizia.
  watch(friendViews, (views) => {
    const complete = views.filter(view => view.state === 'friends')
    if (!grantsSeeded) {
      if (!views.length) return
      grantsSeeded = true
      for (const view of complete) seenGrants.value.add(view.personId)
      saveSet(SEEN_GRANTS_KEY, seenGrants.value)
      return
    }
    for (const view of complete) {
      if (seenGrants.value.has(view.personId)) continue
      seenGrants.value.add(view.personId)
      grantNotices.value = [...grantNotices.value, {
        id: `${NOTICE_PREFIX.granted}${view.personId}`, kind: 'granted', personId: view.personId,
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

  // ---- Amici: chiedere, accettare, togliere ---------------------------------
  /**
   * Chiedere e accettare sono la stessa scrittura: autorizzo io (`me__X`) e
   * chiedo a lui (`X__me`). Se lui aveva gia' autorizzato me, siamo amici
   * adesso; altrimenti la sua parte arriva quando accetta.
   */
  async function befriend(personId: string): Promise<void> {
    const before = friendViews.value.find(view => view.personId === personId) ?? null
    await trust.preAuthorise(personId, 'always', null)
    if (!before?.theyAllow) await trust.requestLink(personId, 'always')
    link.notice.value = before?.theyAllow
      ? 'Adesso siete amici.'
      : 'Richiesta inviata: quando accetta, siete amici.'
  }

  /**
   * Sciogliere la relazione tocca solo i documenti che esistono, e toglie la
   * persona anche dalle mie gare aperte: `syncInvites` aggiunge soltanto, e
   * senza questo un ex amico resterebbe al muretto fino alla chiusura.
   */
  async function unfriend(personId: string): Promise<void> {
    const actions = pitwallFriendActions(friendViews.value.find(view => view.personId === personId))
    if (actions.revokeMine) await trust.decide(personId, 'revoked')
    if (actions.withdrawTheirs) await trust.withdrawRequest(personId)
    const me = uid()
    const service = link.service()
    if (!me || !service) return
    for (const room of link.rooms.value) {
      if (room.closedAt || room.hostUid !== me) continue
      if (!room.allowedUids.includes(personId) && !room.memberUids.includes(personId)) continue
      await service.revoke(room.roomId, personId)
    }
  }

  // ---- Il mio Pitwall -------------------------------------------------------
  const { pitwallIntent } = usePitwallIntent()
  function startPitwall(): void {
    void requestPitwallOpen().then((result) => { if (!result.ok) link.notice.value = result.reason })
  }
  function closePitwall(): void {
    void requestPitwallClose().then((result) => { if (!result.ok) link.notice.value = result.reason })
  }

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
  function acceptNotice(id: string): void {
    if (id.startsWith(NOTICE_PREFIX.request)) void befriend(id.slice(NOTICE_PREFIX.request.length))
    else if (id.startsWith(NOTICE_PREFIX.invite)) enterRace(id.slice(NOTICE_PREFIX.invite.length))
    else dismissNotice(id)
  }
  function rejectNotice(id: string): void {
    if (id.startsWith(NOTICE_PREFIX.request)) void unfriend(id.slice(NOTICE_PREFIX.request.length))
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
    brakeFront: controller.brakeFront,
    brakeRear: controller.brakeRear,
    stepBrakeCompound: controller.stepBrakeCompound,
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
    lastOrder: controller.sentPlan,
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
    friends,
    pitwall: pitwallIntent as Ref<PitwallIntentStatus>,
    startPitwall,
    closePitwall,
    befriend: (personId: string) => { void befriend(personId) },
    unfriend: (personId: string) => { void unfriend(personId) },
    races,
    myRoom,
    notices,
    selectedRace,
    pendingNoticeCount,
    notice: computed(() => link.notice.value ?? trust.notice.value ?? null),
    error: computed(() => link.lastError.value ?? trust.lastError.value ?? null),
    demo: false,
    meId: computed(() => uid()),
    crowded: ref(false) as Ref<boolean>,
    toggleCrowded: () => {},
    searchQuery,
    found,
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
