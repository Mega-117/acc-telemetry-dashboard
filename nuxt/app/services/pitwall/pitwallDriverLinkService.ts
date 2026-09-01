// ============================================
// Lato pilota del collegamento Pit Wall.
//
// Gira nella finestra runtime, che e' l'unico renderer con accesso a Firestore
// e l'unico autorizzato a consegnare un ordine ad ACC. Fa tre cose:
//
//  1. annuncia che il pilota e' in pista, cosi' l'ingegnere lo trova;
//  2. ascolta gli ordini in arrivo e li passa a Electron;
//  3. riscrive l'esito sull'ordine, perche' questo e' l'unico computer che
//     puo' dire davvero com'e' andata.
//
// La telemetria non passa da qui: viaggia diretta fra i due PC.
// ============================================

import { collection, doc, query, where } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
// Ogni lettura e scrittura passa dal tracker: la promessa "costo zero" regge
// solo se il consumo Firebase resta misurabile, non stimato a occhio.
import {
  trackedGetDoc,
  trackedOnSnapshot,
  trackedSetDoc,
  trackedUpdateDoc,
} from '~/composables/useFirebaseTracker'
import {
  PITWALL_LINK_SCHEMA_VERSION,
  boundPitwallCrew,
  boundPitwallStrategy,
  isPitwallOrderSettled,
  pitwallGrantId,
  type PitwallGrant,
  type PitwallOrderDocument,
} from './pitwallLink'

/**
 * Ogni quanto il pilota conferma di essere ancora in pista, **mentre guida**.
 *
 * A questo passo la fotografia della vettura resta utile all'ingegnere.
 */
export const PITWALL_PRESENCE_INTERVAL_MS = 30_000

/**
 * Ogni quanto ci si annuncia quando ACC non e' vivo (menu, gioco chiuso, PC
 * acceso e basta).
 *
 * Il battito serve a farsi trovare, e per quello un colpo ogni cinque minuti
 * basta e avanza. Tenere il passo da 30 secondi anche a gioco spento e' il
 * modo piu' rapido di consumare il piano gratuito senza dire niente di nuovo:
 * misurato, da solo si mangiava meta' del budget giornaliero con quattro
 * piloti accesi. Qui si taglia di dieci volte.
 */
export const PITWALL_PRESENCE_IDLE_INTERVAL_MS = 5 * 60_000

/**
 * Ogni quanto si riprova un ordine che aspetta il momento giusto.
 *
 * L'ingegnere manda la strategia mentre il pilota e' ancora in pista: l'ordine
 * deve restare in coda e riprovare finche' l'auto non e' ferma ai box, invece
 * di fallire subito.
 */
export const PITWALL_ORDER_RETRY_INTERVAL_MS = 8_000

/**
 * Quante volte si riprova un ordine prima di rinunciare.
 *
 * Un tetto esiste perche' una condizione che sembra temporanea potrebbe non
 * esserlo: senza limite, un ordine bloccato riproverebbe per sempre. E'
 * successo su un PC reale, dove ogni tentativo rubava il primo piano e faceva
 * lampeggiare gli overlay, rendendo il computer inutilizzabile.
 *
 * 40 tentativi da 8 secondi coprono circa cinque minuti: abbastanza per un
 * rientro ai box, non abbastanza per diventare un problema.
 */
export const PITWALL_ORDER_MAX_ATTEMPTS = 40

export interface PitwallDriverElectronApi {
  pitwallSubmitRemoteOrder?: (payload: {
    order: PitwallOrderDocument
    grant: PitwallGrant | null
    /**
     * Autorizzazione alternativa al permesso uno-a-uno: l ordine arriva dalla
     * Race Room, dove cio che conta e che mittente e pilota siano nello stesso
     * equipaggio adesso. Le regole Firestore lo hanno gia imposto sul server;
     * il processo main lo ricontrolla perche e l unico che sa quale pilota e
     * loggato su questo computer.
     */
    room?: { roomId: string, memberUids: string[] } | null
  }) => Promise<{
    accepted: boolean
    status: string
    reason?: string | null
    orderId?: string | null
    fields?: unknown
    /** L'ordine non e' applicabile adesso ma lo sara': non va concluso. */
    retryable?: boolean
  }>
  pitwallGetLinkStatus?: () => Promise<{
    trustedSender: boolean
    driverUid: string | null
    applying: boolean
    /** ACC e' pronto a ricevere adesso. Letto senza toccare il gioco. */
    accReady?: boolean
    accReason?: string | null
    /** L'impedimento passa da solo: aspettare ha senso, rifiutare no. */
    accTransient?: boolean
    /** driving | stopped | menu | offline: cosa sta facendo il pilota. */
    driverState?: string
  }>
  pitwallGetStrategyState?: () => Promise<{
    live: boolean
    fresh: boolean
    stationaryPit: boolean
    car: {
      pressures: Record<'FL' | 'FR' | 'RL' | 'RR', number> | null
      tyreSet: number | null
      fuelToAdd: number | null
      compound: 'dry' | 'wet' | null
    }
    crew?: {
      available: boolean
      drivers: { driverIndex: number, firstName: string, lastName: string, shortName: string }[]
      currentDriverIndex: number | null
    }
    identity?: { car?: string | null, track?: string | null } | null
    /**
     * Quale vettura, in quale gara: l impronta che ogni PC calcola da solo dai
     * dati ACC. Serve a ritrovare la Race Room senza girarsi codici, e non
     * autorizza nessuno (PIP-362).
     */
    vehicle?: {
      available: boolean
      reason: string | null
      fingerprint: string | null
      label: string | null
      raceNumber?: number | null
      teamName?: string | null
      trackName?: string | null
    } | null
  }>
}

export interface PitwallDriverLinkOptions {
  db: Firestore
  driverUid: string
  sessionId: string
  electronApi: PitwallDriverElectronApi
  now?: () => number
  log?: Pick<Console, 'warn' | 'error'>
  /**
   * Fotografia piccola e lenta della vettura da allegare alla presenza:
   * equipaggio reale e strategia nel Pit MFD. Viaggia dentro la stessa
   * scrittura ogni 30 secondi, quindi non costa nulla in piu'; non e' il
   * canale di telemetria live. Null = niente da allegare in questo battito.
   */
  readCarContext?: () => Promise<{
    car?: string | null
    track?: string | null
    crew?: unknown
    strategy?: unknown
  } | null>
}

export interface PitwallDriverLinkHandle {
  /** Annuncia o aggiorna la presenza. */
  publishPresence: (context?: { car?: string | null, track?: string | null }) => Promise<void>
  /** Dichiara che il pilota non e' piu' raggiungibile. */
  goOffline: () => Promise<void>
  /** Perche' un ordine sta aspettando il momento giusto, se sta aspettando. */
  waitingReason: () => string | null
  /** Chiude tutti gli ascolti e ferma il battito di presenza. */
  stop: () => void
}

/**
 * Avvia il lato pilota.
 *
 * Gli ordini gia' conclusi vengono ignorati: Firestore riconsegna i documenti
 * a ogni riconnessione, e riapplicare una strategia perche' la rete e' andata
 * e tornata sarebbe il peggior modo di fallire.
 */
export function startPitwallDriverLink(options: PitwallDriverLinkOptions): PitwallDriverLinkHandle {
  const { db, driverUid, sessionId, electronApi } = options
  const now = options.now ?? (() => Date.now())
  const log = options.log ?? console

  const sessionRef = doc(db, 'pitwallSessions', driverUid)
  const ordersRef = collection(db, 'pitwallSessions', driverUid, 'orders')

  let stopped = false
  let presenceTimer: ReturnType<typeof setInterval> | null = null
  let unsubscribeOrders: (() => void) | null = null
  let lastContext: { car?: string | null, track?: string | null } = {}
  // Ordini gia' presi in carico in questa sessione: protegge dalla
  // riconsegna dello stesso documento dopo una riconnessione.
  const handled = new Set<string>()
  let delivering: Promise<void> = Promise.resolve()
  // Ordini visti e ancora da applicare, tenuti per riprovare quando il pilota
  // arriva ai box.
  const waiting = new Map<string, PitwallOrderDocument>()
  const attempts = new Map<string, number>()
  let waitingReason: string | null = null
  let retryTimer: ReturnType<typeof setInterval> | null = null
  // Quando si e' scritta l'ultima presenza: serve a rallentare il battito
  // quando ACC non e' vivo, senza perdere il primo annuncio.
  let lastPresenceAtMs = 0

  async function publishPresence(context: { car?: string | null, track?: string | null } = {}): Promise<void> {
    if (stopped) return
    lastContext = { ...lastContext, ...context }

    // La fotografia della vettura si rilegge a ogni battito: equipaggio e
    // strategia MFD veri, non un segnaposto. Se non e' leggibile si pubblica
    // la sola presenza: meglio un pilota trovabile senza dettagli che uno
    // sparito perche' un accessorio e' fallito.
    let carContext: Awaited<ReturnType<NonNullable<typeof options.readCarContext>>> = null
    try {
      carContext = await options.readCarContext?.() ?? null
    } catch {
      carContext = null
    }
    const nowIso = new Date(now()).toISOString()
    const crew = boundPitwallCrew(carContext?.crew)
    const strategy = boundPitwallStrategy(carContext?.strategy, nowIso)
    const car = carContext?.car ?? lastContext.car
    const track = carContext?.track ?? lastContext.track

    // Quando ACC non e' vivo non c'e' niente di nuovo da dire: ci si annuncia
    // molto piu' di rado. Il passo veloce si paga solo mentre serve davvero.
    const live = carContext != null
    if (!live && now() - lastPresenceAtMs < PITWALL_PRESENCE_IDLE_INTERVAL_MS) return

    try {
      await trackedSetDoc(sessionRef, {
        schemaVersion: PITWALL_LINK_SCHEMA_VERSION,
        driverUid,
        sessionId,
        online: true,
        updatedAt: nowIso,
        ...(car == null ? {} : { car }),
        ...(track == null ? {} : { track }),
        ...(crew == null ? {} : { crew }),
        ...(strategy == null ? {} : { strategy }),
      }, 'pitwall.publishPresence')
      lastPresenceAtMs = now()
    } catch (error) {
      log.warn?.('[PITWALL] presenza non pubblicata:', (error as Error)?.message)
    }
  }

  async function goOffline(): Promise<void> {
    try {
      await trackedSetDoc(sessionRef, {
        schemaVersion: PITWALL_LINK_SCHEMA_VERSION,
        driverUid,
        sessionId,
        online: false,
        updatedAt: new Date(now()).toISOString(),
      }, 'pitwall.goOffline')
    } catch (error) {
      log.warn?.('[PITWALL] stato offline non pubblicato:', (error as Error)?.message)
    }
  }

  /** Rilegge il permesso adesso: una revoca deve valere subito. */
  async function loadGrant(engineerUid: string): Promise<PitwallGrant | null> {
    const snapshot = await trackedGetDoc(doc(db, 'pitwallGrants', pitwallGrantId(driverUid, engineerUid)), 'pitwall.loadGrant')
    return snapshot.exists() ? (snapshot.data() as PitwallGrant) : null
  }

  async function deliver(order: PitwallOrderDocument): Promise<void> {
    if (stopped || handled.has(order.orderId)) return

    // Si chiede prima se e' il momento, e la domanda non tocca ACC: nessun
    // input, nessun overlay sospeso. Solo quando la risposta e' si' si va
    // avanti. Chiedere provando significava rubare il primo piano al pilota a
    // ogni tentativo, per tutta l'attesa.
    let notReady: { reason: string, transient: boolean } | null = null
    try {
      const status = await electronApi.pitwallGetLinkStatus?.()
      if (status && status.accReady === false) {
        notReady = {
          reason: status.accReason ?? 'ACC non e ancora pronto.',
          transient: status.accTransient !== false,
        }
      }
    } catch {
      // Stato non leggibile: si prova comunque, ma una sola volta per giro.
    }

    // Solo cio' che passa da solo merita di essere aspettato. Se dipende da
    // cosa sta facendo il pilota - fermo, nei menu, fuori sessione - l'ordine
    // si chiude subito dicendolo: l'ingegnere lo rimanda quando e' in guida,
    // invece di vederselo partire da solo qualche minuto dopo.
    if (notReady?.transient) {
      waitingReason = notReady.reason
      return
    }
    if (notReady) {
      handled.add(order.orderId)
      waiting.delete(order.orderId)
      waitingReason = null
      try {
        await trackedUpdateDoc(doc(ordersRef, order.orderId), {
          status: 'rejected',
          appliedAt: new Date(now()).toISOString(),
          result: { reason: notReady.reason, fields: {} },
        }, 'pitwall.publishOutcome')
      } catch (error) {
        log.error?.('[PITWALL] rifiuto non scritto sull ordine:', (error as Error)?.message)
      }
      return
    }

    handled.add(order.orderId)
    const orderRef = doc(ordersRef, order.orderId)

    // Solo adesso, che si sta davvero per applicare, si dichiara "in
    // lavorazione". Scriverlo prima del controllo avrebbe fatto lampeggiare lo
    // stato dell'ingegnere a ogni tentativo di un ordine in attesa.
    try {
      await trackedUpdateDoc(orderRef, { status: 'applying' }, 'pitwall.markApplying')
    } catch (error) {
      log.warn?.('[PITWALL] stato applying non scritto:', (error as Error)?.message)
    }

    let grant: PitwallGrant | null = null
    try {
      grant = await loadGrant(order.senderId)
    } catch (error) {
      log.warn?.('[PITWALL] permesso non leggibile:', (error as Error)?.message)
    }

    let outcome: { status: string, reason?: string | null, fields?: unknown, retryable?: boolean }
    try {
      const result = await electronApi.pitwallSubmitRemoteOrder?.({ order, grant })
      outcome = result
        ? { status: result.status, reason: result.reason ?? null, fields: result.fields ?? {}, retryable: result.retryable }
        : { status: 'rejected', reason: 'Ponte Electron non disponibile.', fields: {} }
    } catch (error) {
      outcome = { status: 'failed', reason: (error as Error)?.message || String(error), fields: {} }
    }

    // Non ancora applicabile - l'auto non e' ai box, la telemetria non e'
    // pronta - non e' un fallimento: l'ordine resta `pending` su Firestore e si
    // riprova. Scrivere un esito adesso vorrebbe dire buttarlo via proprio
    // mentre il pilota sta rientrando.
    if (outcome.retryable || outcome.status === 'waiting') {
      const used = (attempts.get(order.orderId) ?? 0) + 1
      attempts.set(order.orderId, used)
      waitingReason = outcome.reason ?? null
      if (used < PITWALL_ORDER_MAX_ATTEMPTS) {
        handled.delete(order.orderId)
        return
      }
      // Tetto raggiunto: si smette e si dice perche', invece di riprovare per
      // sempre. L'ingegnere puo' rimandare quando la situazione e' cambiata.
      outcome = {
        status: 'failed',
        reason: `Non applicabile dopo ${used} tentativi: ${outcome.reason ?? 'condizione invariata'}.`,
        fields: {},
      }
    }
    waitingReason = null
    attempts.delete(order.orderId)

    try {
      await trackedUpdateDoc(orderRef, {
        status: outcome.status,
        appliedAt: new Date(now()).toISOString(),
        result: { reason: outcome.reason ?? null, fields: outcome.fields ?? {} },
      }, 'pitwall.publishOutcome')
    } catch (error) {
      log.error?.('[PITWALL] esito non scritto sull ordine:', (error as Error)?.message)
    }
  }

  // Un ordine alla volta anche in ingresso: se ne arrivano due insieme, il
  // secondo aspetta il suo turno invece di correre in parallelo verso ACC.
  function enqueue(order: PitwallOrderDocument): void {
    waiting.set(order.orderId, order)
    delivering = delivering.then(() => deliver(order)).catch((error) => {
      log.error?.('[PITWALL] consegna ordine fallita:', (error as Error)?.message)
    }).then(() => {
      // Se non e' piu' in coda di attesa, e' concluso e non va riprovato.
      if (!handled.has(order.orderId)) return
      waiting.delete(order.orderId)
    })
  }

  unsubscribeOrders = trackedOnSnapshot(
    query(ordersRef, where('status', '==', 'pending')),
    'pitwall.watchOrders',
    (snapshot) => {
      if (stopped) return
      for (const change of snapshot.docChanges()) {
        if (change.type === 'removed') continue
        const order = change.doc.data() as PitwallOrderDocument
        if (isPitwallOrderSettled(order.status)) continue
        enqueue({ ...order, orderId: change.doc.id })
      }
    },
    (error) => log.error?.('[PITWALL] ascolto ordini interrotto:', error?.message)
  )

  void publishPresence()
  presenceTimer = setInterval(() => { void publishPresence() }, PITWALL_PRESENCE_INTERVAL_MS)
  retryTimer = setInterval(() => {
    if (stopped) return
    for (const order of waiting.values()) {
      if (!handled.has(order.orderId)) enqueue(order)
    }
  }, PITWALL_ORDER_RETRY_INTERVAL_MS)

  return {
    publishPresence,
    goOffline,
    /** Perche' un ordine sta aspettando, se sta aspettando. */
    waitingReason: () => waitingReason,
    stop: () => {
      stopped = true
      if (presenceTimer) clearInterval(presenceTimer)
      if (retryTimer) clearInterval(retryTimer)
      presenceTimer = null
      retryTimer = null
      waiting.clear()
      attempts.clear()
      unsubscribeOrders?.()
      unsubscribeOrders = null
    },
  }
}
