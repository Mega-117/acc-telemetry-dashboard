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
import { createPitwallRealtimeEngineerService } from '~/services/pitwall/pitwallRealtimeEngineerService'
import {
  createPitwallRealtimeRoomService as createPitwallRoomService,
  type PitwallRealtimeRoomService as PitwallRoomService,
} from '~/services/pitwall/pitwallRealtimeRoomService'
import { createPitwallRevisionClock } from '~/services/pitwall/pitwallRoomRevision'
import {
  describePitwallRoomExecutor,
  isPitwallMemberFresh,
  isPitwallRoomInvited,
  isPitwallRoomMember,
  pitwallRoomRoleOf,
  resolvePitwallRoomExecutor,
  type PitwallCrewRow,
  type PitwallFieldOutcome,
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
import { describePitwallClockSkew } from '~/services/pitwall/pitwallServerClock'

// Le forme di vista (esito per campo, riga dell'equipaggio) vivono nel contratto.
export type { PitwallCrewRow, PitwallFieldOutcome } from '~/services/pitwall/pitwallRoomContract'

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
  /**
   * Batte ogni 5 s: freschezza e conflitti devono invecchiare da soli a schermo.
   *
   * E' l'ora del *server*, non quella di questa macchina: si confronta con
   * battiti e scadenze che datano gli altri computer, e un orologio locale
   * sbagliato di qualche minuto faceva sembrare offline tutta la stanza
   * (PIP-382).
   */
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
  /** Identifica questa scheda: due schede aperte sono due presenze diverse. */
  const runtimeSessionId = `pw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  // Cio' che legge l'ingegnere e' la frase tradotta, non il gergo del servizio.
  const lastError = computed(() => describePitwallLinkError(rawError.value))

  function service(): PitwallRoomService | null {
    const uid = options.uid()
    if (!uid) return null
    if (!serviceRef.value || serviceRef.value.uid !== uid) {
      try { serviceRef.value = createPitwallRoomService({ uid }) }
      catch (error) { rawError.value = (error as Error).message; return null }
    }
    return serviceRef.value
  }

  /**
   * Adesso, in ora del server.
   *
   * Finche' non c'e' un servizio (nessun account collegato) vale l'orologio
   * locale: non c'e' ancora niente da confrontare, e restare senza un "adesso"
   * sarebbe peggio (Principio 5).
   */
  function serverNowMs(): number {
    return serviceRef.value?.serverNow() ?? Date.now()
  }

  /**
   * L'orologio di questo computer e' sbagliato abbastanza da rompere il muretto.
   *
   * Si mostra perche' e' l'unica cosa che l'utente puo' sistemare da solo, ed e'
   * la causa che il 2026-09-05 ha reso ogni strategia "scaduta" senza che
   * nessuno dei due capisse perche'.
   */
  const clockSkewNotice = computed(() => {
    void nowTick.value
    return describePitwallClockSkew(serviceRef.value?.clockOffsetMs() ?? null)
  })

  // Numero d'ordine crescente, mai ripetuto: il perche' sta nel modulo.
  const nextRevision = createPitwallRevisionClock()

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
    const byUid = new Map<string, PitwallRoomMember>()
    for (const member of members.value) {
      if (!byUid.has(member.uid) || member.kind === 'driver') byUid.set(member.uid, member)
    }
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
      protocolVersion: at.protocolVersion,
      connected: at.connected,
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

  async function loadNickname(uid: string): Promise<void> {
    const account = options.uid()
    if (!account) return
    try {
      const name = await createPitwallRealtimeEngineerService({ db, engineerUid: account }).nicknameOf(uid)
      if (account === options.uid()) nicknames.value = { ...nicknames.value, [uid]: name }
    } catch { /* The identifier remains visible when the profile is unavailable. */ }
  }

  /** One browser connection, published on entry; RTDB handles disconnects. */
  async function publishMyPresence(): Promise<void> {
    const service_ = service()
    const roomId = selectedRoomId.value
    const uid = myUid.value
    if (!service_ || !roomId || !uid || !amMember.value) return
    await loadNickname(uid)
    if (roomId !== selectedRoomId.value) return
    await service_.publishPresence(roomId, {
      nickname: nicknames.value[uid] || uid, kind: 'engineer', driving: false, runtimeSessionId,
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
    if (stopRoomsWatch) return
    stopRoomsWatch = service_.watchRooms(applyRooms, (error) => { rawError.value = error?.message || 'Gare non disponibili.' })
  }

  function detach(): void {
    stopRoomWatch?.()
    stopMembersWatch?.()
    stopRoomWatch = null
    stopMembersWatch = null
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
    if (roomId === selectedRoomId.value && (stopRoomWatch || loading.value)) return
    detach()
    selectedRoomId.value = roomId
    room.value = null
    if (!roomId) return
    const service_ = service()
    if (!service_) return

    rawError.value = null
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
        // La gara e' sparita da sotto: un manager l'ha chiusa, e chiudere
        // vuol dire cancellare (PIP-379). Si torna all'elenco dicendolo,
        // prima che l'ascolto dei membri - che senza stanza le regole negano -
        // dipinga un errore su una schermata che non esiste piu'.
        if (!next) {
          const previous = room.value
          const crew = members.value
          detach()
          selectedRoomId.value = null
          room.value = null
          const host = previous?.hostUid ?? null
          const who = host && host !== myUid.value
            ? crew.find(entry => entry.uid === host)?.nickname ?? nicknames.value[host] ?? null
            : null
          notice.value = who ? `${who} ha chiuso il Pitwall.` : 'Il Pitwall è stato chiuso.'
          return
        }
        room.value = next
        // Revoca mentre la pagina e' aperta: si dice, non si lascia una
        // schermata che sembra funzionare e non funziona piu'.
        if (!isPitwallRoomMember(next, myUid.value) && !isPitwallRoomInvited(next, myUid.value)) {
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
    // The first membership snapshot confirms access before announcing this connection.
    let announced = false
    stopMembersWatch = service_.watchMembers(
      roomId,
      (list) => {
        members.value = list
        if (!announced) {
          announced = true
          void publishMyPresence()
        }
      },
      (error) => {
        // Se intanto la gara e' sparita, l'ascolto negato e' la conseguenza,
        // non un errore da mostrare.
        if (selectedRoomId.value !== roomId) return
        rawError.value = error?.message || 'Equipaggio non leggibile.'
      }
    )

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

  /**
   * Chiude la gara: sparisce per tutti, anche per chi la chiude (PIP-379).
   * Gli ascolti si staccano prima della scrittura: chi cancella non deve
   * ricevere la propria cancellazione come "qualcuno ha chiuso il Pitwall".
   */
  async function closeRoom(): Promise<void> {
    const service_ = service()
    const roomId = selectedRoomId.value
    if (!service_ || !roomId) return
    detach()
    const result = await service_.closeRoom(roomId)
    if (!result.ok) {
      rawError.value = result.reason
      await selectRoom(roomId)
      return
    }
    selectedRoomId.value = null
    room.value = null
    notice.value = 'Gara chiusa.'
  }

  function start(): void {
    if (tickTimer) clearInterval(tickTimer)
    tickTimer = setInterval(() => { nowTick.value = serverNowMs() }, 5_000)
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
    serviceRef.value = null
    selectedRoomId.value = null
    room.value = null
    rooms.value = []
    nicknames.value = {}
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
    clockSkewNotice,
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
