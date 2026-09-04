// ============================================
// Lato pilota della Race Room.
//
// Gira nella finestra principale della suite, l'unica con un utente Firebase
// proprio e l'unica autorizzata a consegnare un ordine ad ACC. Fa tre cose:
//
//  1. tiene la vettura dentro la sua stanza e ci pubblica il proprio battito,
//     con `driving` derivato dallo stato reale di ACC - mai da un bottone: il
//     pilota non deve gestire niente mentre guida;
//  2. guarda gli ordini della stanza e, **solo se e' lui l'unico al volante**,
//     li prende in carico con la transazione atomica e li porta a Electron;
//  3. dichiara l'esito, perche' e' l'unico computer che sa davvero com'e'
//     andata.
//
// Cosa NON fa, e conta quanto il resto: non mette niente in coda. Un ordine
// che non puo' partire adesso scade da solo entro il suo TTL. Una strategia
// che parte tre minuti dopo, a situazione cambiata, e' piu' pericolosa di una
// che non parte - e su un PC reale la coda infinita aveva gia' reso il
// computer inutilizzabile a furia di rubare il primo piano.
// ============================================

import type { Firestore } from 'firebase/firestore'
import {
  PITWALL_MEMBER_HEARTBEAT_MS,
  PITWALL_MEMBER_IDLE_HEARTBEAT_MS,
  isPitwallRoomOrderExpired,
  resolvePitwallRoomExecutor,
  shouldStampPitwallRoomLive,
  type PitwallRoom,
  type PitwallRoomMember,
  type PitwallRoomOrder,
} from './pitwallRoomContract'
import { createPitwallRoomService, type PitwallRoomService } from './pitwallRoomService'
import type { PitwallDriverElectronApi, PitwallPendingOutcome } from './pitwallDriverLinkService'

/**
 * Ogni quanto si riguarda un ordine che non e' ancora partito.
 *
 * Corto perche' l'unica attesa legittima e' la telemetria che deve ancora
 * arrivare, o il volante che passa a qualcun altro; e comunque limitata dal
 * TTL dell'ordine, non da un contatore di tentativi.
 */
export const PITWALL_ROOM_ORDER_RETRY_MS = 5_000

/**
 * Ogni quanto si rimette in pari l'elenco degli invitati.
 *
 * Lento apposta: la fiducia fra account cambia raramente, e ogni giro costa
 * due query. Cinque minuti bastano perche' un compagno autorizzato a meta'
 * weekend si ritrovi dentro senza che nessuno tocchi niente.
 */
export const PITWALL_ROOM_INVITE_SYNC_MS = 5 * 60_000

/**
 * Lo stato del Pitwall del pilota, come lo legge la sua card.
 *
 * `off`: non lo vuole; `arming`: lo ha chiesto ma la vettura non c'e' ancora
 * (ACC fuori sessione, o impronta da confermare); `open`: la gara esiste e il
 * battito e' acceso.
 */
export type PitwallDriverState = 'off' | 'arming' | 'open'

export interface PitwallDriverStatus {
  state: PitwallDriverState
  roomId: string | null
  /** Perche' non e' ancora aperto, quando e' `arming`. */
  reason: string | null
}

export interface PitwallRoomDriverOptions {
  db: Firestore
  uid: string
  nickname: string
  /** Cambia a ogni avvio dell'app: distingue due sessioni dello stesso account. */
  runtimeSessionId: string
  electronApi: PitwallDriverElectronApi
  /**
   * Identita' della vettura vista da ACC su questo PC, piu' la fotografia da
   * allegare al battito. Null quando ACC non e' vivo: allora non si inventa
   * una stanza, e il battito rallenta.
   */
  readVehicle: () => Promise<{
    fingerprint: string
    label: string
    track?: string | null
    raceNumber?: number | null
    teamName?: string | null
    /** Sta guidando adesso: derivato dallo stato ACC, non dichiarato a mano. */
    driving: boolean
    crew?: unknown
    strategy?: unknown
  } | null>
  /** Chi si ritrova invitato senza chiederlo: gli amici. */
  readTrustedUids?: () => Promise<string[]>
  /** Cambi di stato del Pitwall: li ascoltano la card del pilota e il pannello rapido. */
  onStatus?: (status: PitwallDriverStatus) => void
  /**
   * Quante letture uguali servono prima di aprire o cambiare stanza.
   *
   * Due, perche' l'impronta contiene l'equipaggio e la EntryList non arriva
   * tutta insieme: con un pilota ancora mancante l'impronta e' un'altra, e si
   * aprirebbe una seconda stanza per la stessa gara. Iniettabile perche' un
   * test che parla d'altro non debba simulare l'attesa.
   */
  vehicleConfirmations?: number
  now?: () => number
  log?: Pick<Console, 'warn' | 'error'>
  service?: PitwallRoomService
}

export interface PitwallRoomDriverHandle {
  /** La stanza in cui siamo adesso, se ce n'e' una. */
  roomId: () => string | null
  /** Perche' non c'e' una stanza, se non c'e'. */
  unavailableReason: () => string | null
  /** Un giro completo: identita' vettura, stanza, battito. */
  sync: () => Promise<void>
  /**
   * Rimette in pari gli invitati adesso, senza aspettare il giro a tempo.
   *
   * Si chiama quando arriva un permesso nuovo: e' la differenza fra un
   * ingegnere che puo' entrare subito e uno che vede "il suo PC ti sta
   * aggiungendo" per cinque minuti.
   */
  refreshInvites: () => Promise<void>
  /** Sparisce dalla presenza senza uscire dalla stanza. */
  goOffline: () => Promise<void>
  /**
   * Il pilota vuole il Pitwall: da qui in poi la gara si apre appena ACC e'
   * in sessione, e resta aperta finche' non la chiude lui.
   */
  openPitwall: () => Promise<void>
  /** Chiude la gara (se e' la sua), toglie il battito e smette di cercare la vettura. */
  closePitwall: () => Promise<void>
  status: () => PitwallDriverStatus
  stop: () => void
}

/**
 * Avvia il lato pilota della stanza.
 *
 * Gli ordini gia' presi in carico in questa sessione non si riprendono:
 * Firestore riconsegna i documenti a ogni riconnessione, e riapplicare una
 * strategia perche' la rete e' andata e tornata sarebbe il peggior modo di
 * fallire.
 */
export function startPitwallRoomDriver(options: PitwallRoomDriverOptions): PitwallRoomDriverHandle {
  const now = options.now ?? (() => Date.now())
  const log = options.log ?? console
  const rooms = options.service ?? createPitwallRoomService({ db: options.db, uid: options.uid, now })

  let stopped = false
  let room: PitwallRoom | null = null
  let unavailableReason: string | null = null
  let members: PitwallRoomMember[] = []
  let pending: PitwallRoomOrder[] = []
  let lastPresenceAtMs = 0
  let lastFingerprint: string | null = null
  /** Quando il battito ha lasciato l'ultimo segno di vita sulla stanza. */
  let lastLiveStampAtMs = 0
  /**
   * Le regole pubblicate non conoscono ancora il segno di vita.
   *
   * Si smette di riprovare per questa sessione invece di bruciare una
   * scrittura negata ogni dieci minuti: la stanza funziona lo stesso, e'
   * soltanto il suo elenco che resta com'era prima.
   */
  let liveStampRefused = false
  /** L'impronta in attesa di conferma, e quante volte di fila si e' vista. */
  let confirmingFingerprint: string | null = null
  let confirmedReadings = 0
  let confirmTimer: ReturnType<typeof setTimeout> | null = null
  const confirmationsNeeded = Math.max(1, options.vehicleConfirmations ?? 2)

  let stopMembers: (() => void) | null = null
  let stopOrders: (() => void) | null = null
  let stopRoom: (() => void) | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let retryTimer: ReturnType<typeof setInterval> | null = null
  let inviteTimer: ReturnType<typeof setInterval> | null = null

  /** Ordini gia' presi in carico: la riconsegna dello stesso documento non li ripete. */
  const handled = new Set<string>()
  /** Un ordine alla volta anche in ingresso: due insieme non corrono in parallelo verso ACC. */
  let delivering: Promise<void> = Promise.resolve()
  /**
   * L'ordine che stiamo applicando adesso, se ce n'e' uno.
   *
   * Serve a far valere "prima accettata vince" anche fra due ordini arrivati
   * sullo stesso computer. Metterli in fila sembrava innocuo - il secondo
   * partiva dieci secondi dopo - ma vuol dire mandare al Pit MFD due strategie
   * di seguito e dire a due ingegneri che sono andate a buon fine entrambe,
   * mentre la macchina ha finito con quella del secondo.
   */
  let applyingOrderId: string | null = null

  /**
   * Il pilota ha chiesto il Pitwall.
   *
   * E' l'unica cosa che decide se una stanza nasce: la vettura riconosciuta da
   * sola non basta piu'. Non si allena da soli con il muretto aperto, e nessuna
   * scrittura verso il cloud parte senza che qualcuno l'abbia voluta.
   */
  let wanted = false
  /** Il giro in corso: un secondo `sync` mentre il primo sta aprendo la stanza ne aprirebbe due. */
  let syncing: Promise<void> | null = null
  let lastStatusKey = ''

  function status(): PitwallDriverStatus {
    if (!wanted) return { state: 'off', roomId: null, reason: null }
    if (room) return { state: 'open', roomId: room.roomId, reason: null }
    return { state: 'arming', roomId: null, reason: unavailableReason }
  }

  /** Dice lo stato solo quando cambia: chi ascolta non deve filtrare doppioni. */
  function emitStatus(): void {
    const next = status()
    const key = `${next.state}|${next.roomId ?? ''}|${next.reason ?? ''}`
    if (key === lastStatusKey) return
    lastStatusKey = key
    options.onStatus?.(next)
  }

  function detachRoom(): void {
    stopMembers?.()
    stopOrders?.()
    stopRoom?.()
    stopMembers = null
    stopOrders = null
    stopRoom = null
    members = []
    pending = []
  }

  function attachRoom(roomId: string): void {
    detachRoom()
    // La stanza si guarda in diretta, non si fotografa all'ingresso: chi entra
    // dopo di noi deve poter mandare una strategia. Con una fotografia vecchia
    // il suo ordine sarebbe arrivato fin qui e poi rifiutato dal processo main
    // con "non fa parte di questa gara", che e' vero solo secondo una copia
    // scaduta dell'elenco.
    stopRoom = rooms.watchRoom(
      roomId,
      (next) => { if (next) room = next },
      (error) => log.warn?.('[PITWALL] stanza non leggibile:', error?.message)
    )
    stopMembers = rooms.watchMembers(
      roomId,
      (list) => { members = list },
      (error) => log.warn?.('[PITWALL] membri della stanza non leggibili:', error?.message)
    )
    stopOrders = rooms.watchPendingOrders(
      roomId,
      (orders) => {
        pending = orders
        for (const order of orders) enqueue(order)
      },
      (error) => log.error?.('[PITWALL] ascolto ordini della stanza interrotto:', error?.message)
    )
  }

  /**
   * Consegna un ordine, se e solo se tocca a noi.
   *
   * L'ordine dei controlli e' scelto: prima cio' che non costa niente e non
   * tocca ACC (scadenza, chi e' al volante), poi lo stato del gioco - letto
   * senza mandare un solo tasto - e solo alla fine la presa atomica. Chiedere
   * "e' il momento?" provando davvero significava rubare il primo piano al
   * pilota a ogni tentativo.
   */
  async function deliver(order: PitwallRoomOrder): Promise<void> {
    const roomId = room?.roomId
    if (stopped || !roomId || handled.has(order.orderId)) return

    // 1. Scaduto: si chiude dicendolo, invece di lasciarlo pendente in eterno.
    if (isPitwallRoomOrderExpired(order, now())) {
      handled.add(order.orderId)
      await rooms.rejectOrder(roomId, order.orderId, 'Scaduto prima che qualcuno potesse applicarlo.')
      return
    }

    // 2. Tocca a noi? Con nessuno o due al volante non si indovina: non si
    //    prende in carico, e l'ordine scade da solo. L'ingegnere lo vede.
    const resolution = resolvePitwallRoomExecutor(members, now())
    if (resolution.executor?.uid !== options.uid) return

    // 3. ACC e' pronto adesso? Domanda a costo zero: nessun input, nessun
    //    overlay toccato.
    let notReady: { reason: string, transient: boolean } | null = null
    try {
      const status = await options.electronApi.pitwallGetLinkStatus?.()
      if (status && status.accReady === false) {
        notReady = { reason: status.accReason ?? 'ACC non e ancora pronto.', transient: status.accTransient !== false }
      }
    } catch {
      // Stato non leggibile: si prova comunque, una volta per giro.
    }
    // Solo cio' che passa da solo merita di essere aspettato, e comunque non
    // oltre la scadenza dell'ordine. Se dipende da cosa sta facendo il pilota
    // - fermo, nei menu, fuori sessione - si chiude subito dicendolo.
    if (notReady?.transient) return
    if (notReady) {
      handled.add(order.orderId)
      await rooms.rejectOrder(roomId, order.orderId, notReady.reason)
      return
    }

    // 4. Presa atomica. Qui si perde o si vince la corsa con gli altri PC
    //    della stessa vettura, in modo pulito e una volta sola.
    const claim = await rooms.claimOrder(roomId, order.orderId)
    if (!claim.ok) {
      if (claim.reason === 'conflict' || claim.reason === 'expired') {
        handled.add(order.orderId)
        await rooms.rejectOrder(roomId, order.orderId, claim.detail)
      }
      // `gone` significa che un altro l'ha gia' preso: niente da fare e niente
      // da dire, il suo esito arrivera' da lui.
      if (claim.reason === 'gone') handled.add(order.orderId)
      return
    }
    handled.add(order.orderId)
    applyingOrderId = order.orderId

    // Da qui in poi la presa si rilascia **sempre**, qualunque cosa succeda.
    // Senza il `finally`, un errore inatteso in mezzo lasciava il segnaposto
    // acceso e la vettura rifiutava ogni ordine successivo per sempre, con la
    // motivazione sbagliata ("un altro ordine e' gia' in applicazione") e senza
    // che nessuno potesse sbloccarla se non riavviando l'app.
    try {
      // 5. Ad ACC. L'autorizzazione l'hanno gia' imposta le regole Firestore;
      //    qui si presenta la stanza perche' il processo main possa verificare
      //    che l'ordine riguardi *questo* pilota e non un'altra macchina.
      let outcome: { status: string, reason?: string | null, fields?: unknown }
      try {
        const result = await options.electronApi.pitwallSubmitRemoteOrder?.({
          order: { ...order, schemaVersion: 2 } as never,
          grant: null,
          room: { roomId, memberUids: room?.memberUids ?? [] },
        })
        outcome = result
          ? { status: result.status, reason: result.reason ?? null, fields: result.fields ?? {} }
          : { status: 'failed', reason: 'Ponte Electron non disponibile.', fields: {} }
      } catch (error) {
        outcome = { status: 'failed', reason: (error as Error)?.message || String(error), fields: {} }
      }

      const terminal = (['applied', 'partial', 'failed', 'rejected'] as const)
        .find(status => status === outcome.status) ?? 'failed'
      const published = await rooms.publishOutcome(roomId, order.orderId, {
        status: terminal,
        reason: outcome.reason ?? null,
        fields: outcome.fields ?? {},
      })
      if (published.ok) {
        // Il cloud lo sa: il processo main puo' dimenticarlo. Finche' questa
        // conferma non arriva, il record resta su disco apposta.
        await confirmOutcomes([order.orderId])
      } else {
        // L'esito non e' arrivato al cloud, ma ACC e' gia' cambiato. Non e'
        // piu' perso: il processo main lo ha posato su disco prima di
        // restituircelo, e il recupero lo ripubblichera' (PIP-367).
        log.error?.('[PITWALL] esito della stanza non pubblicato, resta in attesa:', published.reason)
      }
    } finally {
      applyingOrderId = null
      await rooms.releaseClaim(roomId)
    }
  }

  function enqueue(order: PitwallRoomOrder): void {
    if (handled.has(order.orderId)) return

    // Se ne stiamo gia' applicando un altro si rifiuta subito, senza metterlo
    // in coda. La decisione sta qui e non dentro `deliver`: la coda serializza,
    // quindi li' dentro il secondo ordine arriverebbe a turno finito e non
    // troverebbe piu' nessun conflitto da dichiarare - partirebbe dieci secondi
    // dopo, a situazione gia' cambiata, dicendo a due ingegneri che sono andate
    // a buon fine entrambe mentre la macchina ha finito con la seconda.
    const roomId = room?.roomId
    if (roomId && applyingOrderId && applyingOrderId !== order.orderId) {
      handled.add(order.orderId)
      void rooms.rejectOrder(
        roomId,
        order.orderId,
        'Un altro ordine e gia in applicazione su questa vettura: questo e stato rifiutato, non unito.'
      )
      return
    }

    delivering = delivering
      .then(() => deliver(order))
      .catch((error) => log.error?.('[PITWALL] consegna ordine stanza fallita:', (error as Error)?.message))
  }

  /**
   * Un giro completo: chi e' questa vettura, in quale stanza sta, e chi sono io
   * dentro quella stanza.
   *
   * Si richiama a ogni battito perche' tutto puo' cambiare mentre si guida: il
   * pilota entra in pista, cambia sessione, o passa il volante.
   */
  function sync(): Promise<void> {
    if (stopped) return Promise.resolve()
    if (syncing) return syncing
    syncing = runSync().finally(() => { syncing = null })
    return syncing
  }

  async function runSync(): Promise<void> {
    // Prima di tutto il resto, e senza aspettare ACC ne' il pilota: un esito
    // rimasto in sospeso riguarda una gara che potrebbe essere finita ieri, e
    // il record si porta dietro la propria stanza. Non serve essere in pista
    // per dire com'e' andata.
    await drainPendingOutcomes()

    if (!wanted) {
      emitStatus()
      return
    }

    let vehicle: Awaited<ReturnType<typeof options.readVehicle>> = null
    try {
      vehicle = await options.readVehicle()
    } catch {
      vehicle = null
    }

    if (!vehicle) {
      // ACC non e' vivo: non si inventa una stanza. Se ce n'era una si resta
      // membri - il punto della feature e' proprio poter rientrare - ma il
      // battito rallenta, perche' non c'e' niente di nuovo da dire.
      unavailableReason = 'Si apre appena ACC e in sessione.'
      if (room && now() - lastPresenceAtMs >= PITWALL_MEMBER_IDLE_HEARTBEAT_MS) {
        await heartbeat(false, null, null)
      }
      emitStatus()
      return
    }

    if (!room || lastFingerprint !== vehicle.fingerprint) {
      // Prima di aprire o cambiare stanza si vuole la stessa impronta due
      // volte di fila.
      //
      // L'impronta contiene l'equipaggio, e la EntryList non arriva tutta
      // insieme: con un pilota ancora mancante l'impronta e' un'altra, il
      // puntatore ne apre una seconda stanza per la stessa gara, e la prima
      // resta aperta per sempre con dentro chi era gia' entrato. E' il modo
      // peggiore di fallire - due equipaggi che si credono insieme e non lo
      // sono - e costa cinque secondi evitarlo.
      if (confirmingFingerprint !== vehicle.fingerprint) {
        confirmingFingerprint = vehicle.fingerprint
        confirmedReadings = 1
      } else {
        confirmedReadings += 1
      }
      if (confirmedReadings < confirmationsNeeded) {
        unavailableReason = 'Sto riconoscendo la vettura: un momento.'
        if (confirmTimer) clearTimeout(confirmTimer)
        confirmTimer = setTimeout(() => { if (!stopped) void sync() }, PITWALL_ROOM_ORDER_RETRY_MS)
        emitStatus()
        return
      }

      // Cambio di vettura con una gara ancora aperta: quella vecchia si lascia
      // per bene, altrimenti resterebbe aperta per sempre col nostro battito
      // dentro. Se e' nostra si chiude, se e' di un altro si esce e basta.
      if (room) await leaveCurrentRoom(room.hostUid === options.uid)

      // Vettura nuova (primo avvio, o cambio evento): si cerca o si apre la
      // sua stanza. Il puntatore fa convergere gli altri PC della stessa
      // macchina senza che nessuno si giri un codice.
      let trusted: string[] = []
      try {
        trusted = await options.readTrustedUids?.() ?? []
      } catch {
        trusted = []
      }
      const resolved = await rooms.ensureRoomForVehicle({
        fingerprint: vehicle.fingerprint,
        label: vehicle.label,
        track: vehicle.track ?? null,
        raceNumber: vehicle.raceNumber ?? null,
        teamName: vehicle.teamName ?? null,
        seedAllowedUids: trusted,
      })
      // Nel frattempo il pilota puo' aver chiuso: una stanza nata adesso non
      // si adotta. Restera' dormiente e il ciclo di vita la archiviera'.
      if (!wanted || stopped) return
      if (!resolved.ok) {
        unavailableReason = resolved.reason
        emitStatus()
        return
      }
      lastFingerprint = vehicle.fingerprint
      confirmingFingerprint = null
      confirmedReadings = 0
      room = resolved.value
      unavailableReason = null
      handled.clear()
      attachRoom(room.roomId)
      void refreshInvites()
    }

    await heartbeat(vehicle.driving, vehicle.crew ?? null, vehicle.strategy ?? null)
    emitStatus()
  }

  /**
   * Lascia la stanza in cui siamo: battito via, ascolti staccati, memoria
   * azzerata. Con `close` la gara viene anche chiusa - solo se e' nostra, le
   * regole non lasciano chiudere quella di un altro.
   */
  async function leaveCurrentRoom(close: boolean): Promise<void> {
    const current = room
    detachRoom()
    room = null
    lastFingerprint = null
    confirmingFingerprint = null
    confirmedReadings = 0
    lastLiveStampAtMs = 0
    handled.clear()
    if (confirmTimer) clearTimeout(confirmTimer)
    confirmTimer = null
    if (!current) return
    try {
      const cleared = await rooms.clearPresence(current.roomId)
      if (cleared?.ok === false) log.warn?.('[PITWALL] battito non tolto dalla stanza:', cleared.reason)
    } catch (error) {
      log.warn?.('[PITWALL] battito non tolto dalla stanza:', (error as Error)?.message)
    }
    if (!close) return
    try {
      const closed = await rooms.closeRoom(current.roomId)
      if (closed?.ok === false) log.warn?.('[PITWALL] gara non chiusa:', closed.reason)
    } catch (error) {
      log.warn?.('[PITWALL] gara non chiusa:', (error as Error)?.message)
    }
  }

  async function openPitwall(): Promise<void> {
    if (stopped || wanted) return
    wanted = true
    unavailableReason = null
    emitStatus()
    await sync()
  }

  async function closePitwall(): Promise<void> {
    if (!wanted) return
    wanted = false
    // Un giro in corso finisce da solo e non adotta la stanza (vedi runSync).
    await leaveCurrentRoom(room?.hostUid === options.uid)
    unavailableReason = null
    emitStatus()
  }

  /**
   * Rimette in pari gli invitati con chi ci ha dato fiducia.
   *
   * Seminarli solo all'apertura della gara non basta: un permesso "solo per
   * oggi" puo' scadere cinque minuti prima che la gara si apra, e chi lo
   * rinnova dopo resterebbe fuori per tutto il weekend - il puntatore della
   * vettura dura due giorni, quindi non nascera' una stanza nuova. L'unica
   * alternativa sarebbe invitarlo a mano dal PC di chi guida, che e'
   * esattamente cio' che il pilota non deve fare.
   */
  async function refreshInvites(): Promise<void> {
    if (stopped || !room) return
    let trusted: string[] = []
    try {
      trusted = await options.readTrustedUids?.() ?? []
    } catch {
      return
    }
    if (!trusted.length) return
    const result = await rooms.syncInvites(room.roomId, trusted)
    if (!result.ok) log.warn?.('[PITWALL] invitati non aggiornati:', result.reason)
  }

  /** Dice al processo main di dimenticare: si chiama solo a consegna avvenuta. */
  async function confirmOutcomes(orderIds: string[]): Promise<void> {
    if (!orderIds.length) return
    try {
      await options.electronApi.pitwallConfirmOutcomes?.(orderIds)
    } catch (error) {
      // Il record resta: al prossimo giro si scoprira' che l'ordine e' gia'
      // terminale e si chiudera' li'. Meglio un tentativo di troppo che una
      // verita' cancellata senza prova.
      log.warn?.('[PITWALL] conferma esito non registrata:', (error as Error)?.message)
    }
  }

  /**
   * Pubblica gli esiti che ACC ha gia' applicato ma il cloud non ha mai saputo.
   *
   * Qui non si tocca ACC: si racconta soltanto cio' che e' gia' successo. E'
   * la differenza fra recuperare una verita' e rifare una strategia a
   * situazione cambiata, che sarebbe il peggior modo di fallire.
   */
  async function drainPendingOutcomes(): Promise<void> {
    if (stopped || !options.electronApi.pitwallPendingOutcomes) return
    let outcomes: PitwallPendingOutcome[] = []
    try {
      outcomes = await options.electronApi.pitwallPendingOutcomes() ?? []
    } catch (error) {
      log.warn?.('[PITWALL] esiti in attesa non leggibili:', (error as Error)?.message)
      return
    }

    for (const outcome of outcomes) {
      if (stopped) return
      // Un esito applicato da un altro account su questo computer non e'
      // nostro da pubblicare: le regole accettano l'esito solo da chi aveva
      // preso in carico l'ordine.
      if (outcome.driverUid && outcome.driverUid !== options.uid) continue

      const published = await rooms.publishOutcome(outcome.roomId, outcome.orderId, {
        status: outcome.status,
        reason: outcome.reason,
        fields: outcome.fields,
      })
      if (published.ok) {
        await confirmOutcomes([outcome.orderId])
        continue
      }

      // Rifiutato: o il cloud non risponde, o lassu' l'ordine e' gia'
      // concluso - le regole accettano l'esito solo finche' e' `applying`.
      // Le due cose si distinguono solo leggendo, e la differenza conta: nel
      // secondo caso ritentare all'infinito qualcosa di gia' fatto.
      const current = await rooms.readOrder(outcome.roomId, outcome.orderId)
      if (!current.ok) continue
      const stillOpen = current.value && (current.value.status === 'pending' || current.value.status === 'applying')
      if (!stillOpen) await confirmOutcomes([outcome.orderId])
    }
  }

  async function heartbeat(driving: boolean, crew: unknown, strategy: unknown): Promise<void> {
    if (!room) return
    const published = await rooms.publishPresence(room.roomId, {
      nickname: options.nickname,
      kind: 'driver',
      driving,
      runtimeSessionId: options.runtimeSessionId,
      crew,
      strategy,
    })
    if (published.ok) lastPresenceAtMs = now()
    else log.warn?.('[PITWALL] battito della stanza non pubblicato:', published.reason)
    await stampLiveIfDue()
  }

  /**
   * Ogni tanto il battito lascia un segno anche *sulla stanza*.
   *
   * Il battito dice "io ci sono" due volte al minuto, perche' da lui dipende
   * chi applica la strategia. Questo dice "questa gara e' ancora di qualcuno",
   * e non ha nessuna fretta: allo stesso passo sarebbero centoventi scritture
   * l'ora per una risposta che cambia una volta al giorno.
   *
   * Senza, chi non e' dentro la stanza non ha modo di sapere se e' viva: le
   * regole gli vietano di leggere i membri, ed e' esattamente il motivo per cui
   * le gare si accumulavano tutte uguali e nessuno poteva chiuderle.
   */
  async function stampLiveIfDue(): Promise<void> {
    if (!room || liveStampRefused) return
    if (!shouldStampPitwallRoomLive(lastLiveStampAtMs, now())) return
    const stamped = await rooms.stampRoomLive(room.roomId)
    if (stamped.ok) {
      lastLiveStampAtMs = now()
      return
    }
    liveStampRefused = true
    log.warn?.('[PITWALL] segno di vita della stanza rifiutato, non si riprova:', stamped.reason)
  }

  void sync()
  heartbeatTimer = setInterval(() => { void sync() }, PITWALL_MEMBER_HEARTBEAT_MS)
  retryTimer = setInterval(() => {
    if (stopped) return
    for (const order of pending) enqueue(order)
  }, PITWALL_ROOM_ORDER_RETRY_MS)
  inviteTimer = setInterval(() => { void refreshInvites() }, PITWALL_ROOM_INVITE_SYNC_MS)

  return {
    roomId: () => room?.roomId ?? null,
    unavailableReason: () => unavailableReason,
    sync,
    refreshInvites,
    goOffline: async () => {
      if (room) await rooms.clearPresence(room.roomId)
    },
    openPitwall,
    closePitwall,
    status,
    stop: () => {
      stopped = true
      if (heartbeatTimer) clearInterval(heartbeatTimer)
      if (retryTimer) clearInterval(retryTimer)
      if (inviteTimer) clearInterval(inviteTimer)
      if (confirmTimer) clearTimeout(confirmTimer)
      heartbeatTimer = null
      retryTimer = null
      inviteTimer = null
      confirmTimer = null
      detachRoom()
      room = null
      lastFingerprint = null
      confirmingFingerprint = null
      confirmedReadings = 0
      handled.clear()
    },
  }
}
