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

export interface PitwallDriverElectronApi {
  pitwallSubmitRemoteOrder?: (payload: {
    order: PitwallOrderDocument
    grant: PitwallGrant | null
  }) => Promise<{ accepted: boolean, status: string, reason?: string | null, orderId?: string | null, fields?: unknown }>
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
    try {
      // Si dichiara subito che l'ordine e' in lavorazione, cosi' l'ingegnere
      // vede qualcosa muoversi invece di restare su "inviato".
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

    let outcome: { status: string, reason?: string | null, fields?: unknown }
    try {
      const result = await electronApi.pitwallSubmitRemoteOrder?.({ order, grant })
      outcome = result
        ? { status: result.status, reason: result.reason ?? null, fields: result.fields ?? {} }
        : { status: 'rejected', reason: 'Ponte Electron non disponibile.', fields: {} }
    } catch (error) {
      outcome = { status: 'failed', reason: (error as Error)?.message || String(error), fields: {} }
    }

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
    delivering = delivering.then(() => deliver(order)).catch((error) => {
      log.error?.('[PITWALL] consegna ordine fallita:', (error as Error)?.message)
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

  return {
    publishPresence,
    goOffline,
    stop: () => {
      stopped = true
      if (presenceTimer) clearInterval(presenceTimer)
      presenceTimer = null
      unsubscribeOrders?.()
      unsubscribeOrders = null
    },
  }
}
