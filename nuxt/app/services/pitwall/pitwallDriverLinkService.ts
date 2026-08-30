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
  isPitwallOrderSettled,
  pitwallGrantId,
  type PitwallGrant,
  type PitwallOrderDocument,
} from './pitwallLink'

/** Ogni quanto il pilota conferma di essere ancora in pista. */
export const PITWALL_PRESENCE_INTERVAL_MS = 30_000

/**
 * Ogni quanto si riprova un ordine che aspetta il momento giusto.
 *
 * L'ingegnere manda la strategia mentre il pilota e' ancora in pista: l'ordine
 * deve restare in coda e riprovare finche' l'auto non e' ferma ai box, invece
 * di fallire subito.
 */
export const PITWALL_ORDER_RETRY_INTERVAL_MS = 8_000

export interface PitwallDriverElectronApi {
  pitwallSubmitRemoteOrder?: (payload: {
    order: PitwallOrderDocument
    grant: PitwallGrant | null
  }) => Promise<{
    accepted: boolean
    status: string
    reason?: string | null
    orderId?: string | null
    fields?: unknown
    /** L'ordine non e' applicabile adesso ma lo sara': non va concluso. */
    retryable?: boolean
  }>
  pitwallGetLinkStatus?: () => Promise<{ trustedSender: boolean, driverUid: string | null, applying: boolean }>
}

export interface PitwallDriverLinkOptions {
  db: Firestore
  driverUid: string
  sessionId: string
  electronApi: PitwallDriverElectronApi
  now?: () => number
  log?: Pick<Console, 'warn' | 'error'>
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
  let waitingReason: string | null = null
  let retryTimer: ReturnType<typeof setInterval> | null = null

  async function publishPresence(context: { car?: string | null, track?: string | null } = {}): Promise<void> {
    if (stopped) return
    lastContext = { ...lastContext, ...context }
    try {
      await trackedSetDoc(sessionRef, {
        schemaVersion: PITWALL_LINK_SCHEMA_VERSION,
        driverUid,
        sessionId,
        online: true,
        updatedAt: new Date(now()).toISOString(),
        ...(lastContext.car == null ? {} : { car: lastContext.car }),
        ...(lastContext.track == null ? {} : { track: lastContext.track }),
      }, 'pitwall.publishPresence')
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
    handled.add(order.orderId)

    const orderRef = doc(ordersRef, order.orderId)
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
      handled.delete(order.orderId)
      waitingReason = outcome.reason ?? null
      return
    }
    waitingReason = null

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
      unsubscribeOrders?.()
      unsubscribeOrders = null
    },
  }
}
