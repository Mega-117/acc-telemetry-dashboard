// ============================================
// La Race Room per il pannello dell'ingegnere.
//
// Tiene lo stato di cio' che serve alla pagina: a quali gare ho accesso, chi
// c'e' dentro, chi e' al volante adesso, e com'e' andato l'ultimo ordine.
//
// Non applica nulla: l'autorita' e' il PC di chi guida. Qui si invia e si
// osserva, e si dice sempre la verita' su cosa e' successo - `READY` significa
// solo "applicata e riletta", mai "inviata".
// ============================================

import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import { db } from '~/config/firebase'
import { trackedGetDoc } from '~/composables/useFirebaseTracker'
import { doc } from 'firebase/firestore'
import {
  createPitwallRoomService,
  type PitwallRoomService,
} from '~/services/pitwall/pitwallRoomService'
import {
  PITWALL_MEMBER_HEARTBEAT_MS,
  describePitwallRoomExecutor,
  isPitwallMemberFresh,
  isPitwallRoomInvited,
  isPitwallRoomMember,
  pitwallRoomRoleOf,
  resolvePitwallRoomExecutor,
  type PitwallRoom,
  type PitwallRoomMember,
  type PitwallRoomOrder,
} from '~/services/pitwall/pitwallRoomContract'
import {
  describePitwallLinkError,
  describePitwallOrderStatus,
  isPitwallOrderSettled,
  type PitwallOrderStatus,
} from '~/services/pitwall/pitwallLink'

/** Esito per campo dichiarato dal PC che ha applicato: mai appiattito in un "fatto". */
export interface PitwallFieldOutcome {
  outcome: 'verified' | 'selected' | 'not-verifiable' | null
  requested: unknown
  observed: unknown
  reason: string | null
  /** Da dove viene l'esito: l'occhio sullo schermo, la shared memory, o un tasto alla cieca. */
  via?: 'screen' | 'memory' | 'blind' | null
  /** Non chiesta: ACC l'ha cambiata insieme a un'altra riparazione. */
  dragged?: boolean
}

/** Una riga dell'equipaggio, come la legge l'ingegnere. */
export interface PitwallCrewRow {
  uid: string
  nickname: string
  role: 'manager' | 'member'
  kind: 'driver' | 'engineer'
  /** Ha un battito recente: e' raggiungibile adesso. */
  online: boolean
  /**
   * Si e' annunciato ma il server non ha ancora datato il suo battito.
   *
   * Dura un istante e non e' "offline": mostrarlo come tale faceva sembrare
   * scollegato proprio chi stava aprendo la pagina in quel momento.
   */
  connecting: boolean
  /** E' al volante adesso. */
  driving: boolean
  /** Invitato ma non ancora entrato. */
  invited: boolean
  isSelf: boolean
}

export interface PitwallRoomOptions {
  /** Uid dell'utente collegato. Null finche' non e' autenticato. */
  uid: () => string | null
}

export function usePitwallRoom(options: PitwallRoomOptions) {
  const rooms = ref<PitwallRoom[]>([])
  const selectedRoomId = ref<string | null>(null)
  const room = ref<PitwallRoom | null>(null)
  const members = ref<PitwallRoomMember[]>([])
  const loading = ref(false)
  const sending = ref(false)
  const rawError = ref<string | null>(null)
  const notice = ref<string | null>(null)
  /** Batte ogni 5 s: freschezza e conflitti devono invecchiare da soli a schermo. */
  const nowTick = ref(Date.now())

  const orderId = ref<string | null>(null)
  const orderStatus = ref<PitwallOrderStatus | null>(null)
  const orderReason = ref<string | null>(null)
  const orderFields = ref<Record<string, PitwallFieldOutcome>>({})

  const serviceRef = shallowRef<PitwallRoomService | null>(null)
  const nicknames = ref<Record<string, string>>({})
  let stopRoomWatch: (() => void) | null = null
  let stopMembersWatch: (() => void) | null = null
  let stopOrderWatch: (() => void) | null = null
  let tickTimer: ReturnType<typeof setInterval> | null = null
  let presenceTimer: ReturnType<typeof setInterval> | null = null
  /** Identifica questa scheda: due schede aperte sono due presenze diverse. */
  const runtimeSessionId = `pw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  // Cio' che legge l'ingegnere e' la frase tradotta, non il gergo del servizio.
  const lastError = computed(() => describePitwallLinkError(rawError.value))

  function service(): PitwallRoomService | null {
    const uid = options.uid()
    if (!uid) return null
    if (!serviceRef.value || serviceRef.value.uid !== uid) {
      serviceRef.value = createPitwallRoomService({ db, uid })
    }
    return serviceRef.value
  }

  /**
   * Numero d'ordine crescente, ricavato dal tempo.
   *
   * Il PC che applica scarta un ordine con revisione non successiva all'ultima
   * vista. Un contatore che riparte da zero a ogni ricarica farebbe sembrare
   * vecchio il primo invio successivo; i secondi dall'epoca crescono sempre,
   * anche fra sessioni, dispositivi e ingegneri diversi.
   *
   * I secondi pero' non bastano da soli: due invii nello stesso secondo -
   * facilissimo con due clic - avrebbero la stessa revisione, e il secondo
   * verrebbe rifiutato come "superato", che e' un motivo falso e incomprensibile
   * per chi lo legge. Qui la revisione non torna mai indietro e non si ripete.
   */
  let lastRevision = 0
  function nextRevision(): number {
    lastRevision = Math.max(lastRevision + 1, Math.floor(Date.now() / 1000))
    return lastRevision
  }

  const myUid = computed(() => options.uid())
  const myRole = computed(() => pitwallRoomRoleOf(room.value, myUid.value))
  const isManager = computed(() => myRole.value === 'manager')
  const amMember = computed(() => isPitwallRoomMember(room.value, myUid.value))
  const amInvited = computed(() => isPitwallRoomInvited(room.value, myUid.value))
  const roomClosed = computed(() => Boolean(room.value?.closedAt))

  /** Chi applichera' l'ordine, adesso. Null quando non si puo' dire con certezza. */
  const executor = computed(() => resolvePitwallRoomExecutor(members.value, nowTick.value))
  const executorLabel = computed(() => describePitwallRoomExecutor(executor.value))

  /**
   * L'equipaggio completo: chi e' entrato e chi e' solo invitato.
   *
   * Gli invitati si mostrano apposta. Un manager che ha invitato qualcuno deve
   * poter vedere che non e' ancora entrato, invece di chiedersi se l'invito sia
   * partito.
   */
  const crew = computed<PitwallCrewRow[]>(() => {
    const current = room.value
    if (!current) return []
    const byUid = new Map(members.value.map(member => [member.uid, member]))
    const rows: PitwallCrewRow[] = current.memberUids.map((uid) => {
      const presence = byUid.get(uid)
      return {
        uid,
        nickname: presence?.nickname || nicknames.value[uid] || uid,
        role: current.managerUids.includes(uid) ? 'manager' : 'member',
        kind: presence?.kind ?? 'engineer',
        online: isPitwallMemberFresh(presence, nowTick.value),
        connecting: presence != null && !isPitwallMemberFresh(presence, nowTick.value) && presence.updatedAtMs === 0,
        driving: executor.value.executor?.uid === uid
          || executor.value.conflicting.some(member => member.uid === uid),
        invited: false,
        isSelf: uid === myUid.value,
      }
    })
    for (const uid of current.allowedUids) {
      if (current.memberUids.includes(uid)) continue
      rows.push({
        uid,
        nickname: nicknames.value[uid] || uid,
        role: 'member',
        kind: 'engineer',
        online: false,
        connecting: false,
        driving: false,
        invited: true,
        isSelf: uid === myUid.value,
      })
    }
    // Chi guida in cima, poi chi e' presente, poi il resto: e' l'ordine in cui
    // servono durante una gara.
    return rows.sort((left, right) => (
      Number(right.driving) - Number(left.driving)
      || Number(right.online) - Number(left.online)
      || left.nickname.localeCompare(right.nickname)
    ))
  })

  /** La fotografia della vettura arriva da chi e' al volante: e' l'unico che la vede. */
  const carSnapshot = computed(() => {
    const at = executor.value.executor
    if (!at) return null
    return {
      crew: (at.crew ?? null) as { driverIndex: number, name: string, current: boolean }[] | null,
      strategy: (at.strategy ?? null) as Record<string, unknown> | null,
      updatedAtMs: at.updatedAtMs,
      nickname: at.nickname,
    }
  })

  /**
   * Si puo' inviare adesso.
   *
   * Non basta essere autorizzati: serve esattamente un pilota fresco al
   * volante. Con nessuno o due, il bottone resta spento e la pagina dice
   * perche' - invece di accettare un ordine che poi scadrebbe da solo.
   */
  const canSend = computed(() => (
    amMember.value
    && !roomClosed.value
    && executor.value.reason === 'ready'
    && !sending.value
  ))

  const orderProgress = computed(() => describePitwallOrderStatus(orderStatus.value))

  /** Il soprannome di chi e' invitato ma non ha ancora un battito nella stanza. */
  async function loadNickname(uid: string): Promise<void> {
    if (nicknames.value[uid]) return
    try {
      const profile = await trackedGetDoc(doc(db, 'publicProfiles', uid), 'pitwallRoom.memberProfile')
      nicknames.value = {
        ...nicknames.value,
        [uid]: profile.exists() ? String((profile.data() as { nickname?: string }).nickname ?? '') || uid : uid,
      }
    } catch {
      // Profilo non leggibile: resta l'identificativo, brutto ma vero.
    }
  }

  /**
   * Annuncia chi c'e' al muretto.
   *
   * Senza, l'ingegnere che sta guardando la pagina si vedeva elencato
   * `OFFLINE` fra i membri - vero alla lettera, perche' non batteva, e
   * comunque il modo piu' rapido di far sembrare rotto un collegamento che
   * funziona. Serve anche al pilota, che cosi' sa chi lo sta seguendo.
   *
   * `driving` resta falso e `kind` resta `engineer`: chi guarda dal browser non
   * potra' mai essere eletto esecutore, e questo battito non lo rende
   * candidato.
   */
  async function heartbeat(): Promise<void> {
    const service_ = service()
    const roomId = selectedRoomId.value
    const uid = myUid.value
    if (!service_ || !roomId || !uid || !amMember.value) return
    // Il proprio nome si carica prima di annunciarsi: un battito scritto col
    // solo identificativo lo fisserebbe li' per tutti gli altri, perche' il
    // battito ha la precedenza sul profilo quando si compone l equipaggio.
    await loadNickname(uid)
    await service_.publishPresence(roomId, {
      nickname: nicknames.value[uid] || uid,
      kind: 'engineer',
      driving: false,
      runtimeSessionId,
    })
  }

  /**
   * Un elenco nuovo di gare, da una lettura o dall'ascolto.
   *
   * Una sola gara accessibile: entrarci a mano sarebbe un clic che non decide
   * niente. Il caso normale del pilota e' esattamente questo.
   */
  function applyRooms(list: PitwallRoom[]): void {
    rooms.value = list
    if (!selectedRoomId.value && list.length === 1) void selectRoom(list[0]!.roomId)
  }

  async function refreshRooms(): Promise<void> {
    const service_ = service()
    if (!service_) { rooms.value = []; return }
    loading.value = true
    rawError.value = null
    try { applyRooms(await service_.listRooms()) }
    catch (error) { rawError.value = (error as Error)?.message || 'Gare non disponibili.'; rooms.value = [] }
    finally { loading.value = false }
  }

  let stopRoomsWatch: (() => void) | null = null

  /**
   * Le gare in diretta: un invito arrivato mentre si guarda altrove compare da
   * solo. E' cio' che rende la campanella un avviso e non una cosa da
   * ricaricare.
   */
  function watchRooms(): void {
    const service_ = service()
    if (!service_) return
    stopRoomsWatch?.()
    stopRoomsWatch = service_.watchRooms(applyRooms, (error) => { rawError.value = error?.message || 'Gare non disponibili.' })
  }

  function detach(): void {
    stopRoomWatch?.()
    stopMembersWatch?.()
    stopRoomWatch = null
    stopMembersWatch = null
    if (presenceTimer) clearInterval(presenceTimer)
    presenceTimer = null
    members.value = []
  }

  /**
   * Entra in una gara e la tiene in diretta.
   *
   * Se siamo invitati ma non ancora dentro si entra qui, in un passaggio solo:
   * l'invito e' gia' la decisione, chiedere un secondo clic sarebbe attrito
   * senza scelta.
   */
  async function selectRoom(roomId: string | null): Promise<void> {
    detach()
    selectedRoomId.value = roomId
    room.value = null
    if (!roomId) return
    const service_ = service()
    if (!service_) return

    try {
      const current = await service_.readRoom(roomId)
      if (!current) {
        rawError.value = 'Questa gara non esiste piu.'
        return
      }
      room.value = current
      if (isPitwallRoomInvited(current, myUid.value)) {
        const joined = await service_.joinRoom(roomId)
        if (!joined.ok) {
          rawError.value = joined.reason
          return
        }
        room.value = joined.value
        notice.value = 'Sei entrato nella gara.'
      }
    } catch (error) {
      rawError.value = (error as Error)?.message || 'Gara non raggiungibile.'
      return
    }

    stopRoomWatch = service_.watchRoom(
      roomId,
      (next) => {
        room.value = next
        // Revoca mentre la pagina e' aperta: si dice, non si lascia una
        // schermata che sembra funzionare e non funziona piu'.
        if (next && !isPitwallRoomMember(next, myUid.value) && !isPitwallRoomInvited(next, myUid.value)) {
          rawError.value = 'Non fai piu parte di questa gara.'
          detach()
          selectedRoomId.value = null
          room.value = null
          return
        }
        for (const uid of [...(next?.memberUids ?? []), ...(next?.allowedUids ?? [])]) {
          void loadNickname(uid)
        }
      },
      (error) => { rawError.value = error?.message || 'Gara non raggiungibile.' }
    )
    stopMembersWatch = service_.watchMembers(
      roomId,
      (list) => { members.value = list },
      (error) => { rawError.value = error?.message || 'Equipaggio non leggibile.' }
    )

    void heartbeat()
    if (presenceTimer) clearInterval(presenceTimer)
    presenceTimer = setInterval(() => { void heartbeat() }, PITWALL_MEMBER_HEARTBEAT_MS)
  }

  /**
   * Invia la strategia alla vettura e segue l'ordine fino all'esito.
   * Non dichiara mai riuscito cio' che non e' stato confermato dal PC che ha
   * applicato.
   */
  async function sendPlan(plan: Record<string, unknown>): Promise<boolean> {
    const service_ = service()
    const roomId = selectedRoomId.value
    if (!service_ || !roomId) {
      rawError.value = 'Nessuna gara selezionata.'
      return false
    }
    if (executor.value.reason !== 'ready') {
      rawError.value = executorLabel.value
      return false
    }

    sending.value = true
    rawError.value = null
    orderReason.value = null
    orderFields.value = {}
    try {
      const sent = await service_.sendOrder(roomId, { plan, revision: nextRevision() })
      if (!sent.ok) {
        rawError.value = sent.reason
        orderStatus.value = 'rejected'
        return false
      }

      orderId.value = sent.value
      orderStatus.value = 'pending'
      stopOrderWatch?.()
      stopOrderWatch = service_.watchOrder(roomId, sent.value, (document: PitwallRoomOrder | null) => {
        if (!document) return
        orderStatus.value = document.status as PitwallOrderStatus
        const result = document.result as {
          reason?: string | null
          fields?: Record<string, PitwallFieldOutcome>
        } | undefined
        orderReason.value = result?.reason ?? null
        orderFields.value = result?.fields ?? {}
        if (isPitwallOrderSettled(document.status as PitwallOrderStatus)) {
          stopOrderWatch?.()
          stopOrderWatch = null
        }
      })
      return true
    } finally {
      sending.value = false
    }
  }

  // --- Chi puo' entrare: solo un manager lo cambia ------------------------

  async function invite(uid: string): Promise<void> {
    const service_ = service()
    const roomId = selectedRoomId.value
    if (!service_ || !roomId) return
    const result = await service_.invite(roomId, uid)
    if (!result.ok) rawError.value = result.reason
    else notice.value = 'Invitato: comparira nella gara appena apre la pagina.'
  }

  async function revoke(uid: string): Promise<void> {
    const service_ = service()
    const roomId = selectedRoomId.value
    if (!service_ || !roomId) return
    const result = await service_.revoke(roomId, uid)
    if (!result.ok) rawError.value = result.reason
    else notice.value = 'Accesso tolto.'
  }

  async function promote(uid: string): Promise<void> {
    const service_ = service()
    const roomId = selectedRoomId.value
    if (!service_ || !roomId) return
    const result = await service_.promote(roomId, uid)
    if (!result.ok) rawError.value = result.reason
    else notice.value = 'Adesso puo invitare anche lui.'
  }

  /** Sparisce dal muretto senza uscire dalla gara: e' solo la scheda che si chiude. */
  async function clearPresence(): Promise<void> {
    const service_ = service()
    const roomId = selectedRoomId.value
    if (service_ && roomId) await service_.clearPresence(roomId)
  }

  async function leave(): Promise<void> {
    const service_ = service()
    const roomId = selectedRoomId.value
    if (!service_ || !roomId) return
    const result = await service_.leaveRoom(roomId)
    if (!result.ok) {
      rawError.value = result.reason
      return
    }
    // L'elenco non si rilegge: `watchRooms` e' in ascolto e consegna l'uscita
    // da solo. Rileggerlo erano due query in piu' per sapere una cosa che
    // stava gia' arrivando.
    await selectRoom(null)
    notice.value = 'Sei uscito dalla gara.'
  }

  async function closeRoom(): Promise<void> {
    const service_ = service()
    const roomId = selectedRoomId.value
    if (!service_ || !roomId) return
    const result = await service_.closeRoom(roomId)
    if (!result.ok) rawError.value = result.reason
    else notice.value = 'Gara chiusa: resta consultabile, non accetta piu strategie.'
  }

  function start(): void {
    if (tickTimer) clearInterval(tickTimer)
    tickTimer = setInterval(() => { nowTick.value = Date.now() }, 5_000)
    watchRooms()
  }

  function stop(): void {
    void clearPresence()
    detach()
    stopOrderWatch?.()
    stopOrderWatch = null
    stopRoomsWatch?.()
    stopRoomsWatch = null
    if (tickTimer) clearInterval(tickTimer)
    tickTimer = null
  }

  onScopeDispose(stop)

  return {
    rooms,
    room,
    selectedRoomId,
    members,
    crew,
    carSnapshot,
    executor,
    executorLabel,
    myRole,
    isManager,
    amMember,
    amInvited,
    roomClosed,
    loading,
    sending,
    canSend,
    lastError,
    notice,
    nowTick,
    orderId,
    orderStatus,
    orderReason,
    orderFields,
    orderProgress,
    refreshRooms,
    service,
    watchRooms,
    selectRoom,
    sendPlan,
    invite,
    revoke,
    promote,
    leave,
    closeRoom,
    start,
    stop,
  }
}
