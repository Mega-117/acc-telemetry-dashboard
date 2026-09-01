// ============================================
// Gli ordini dentro una Race Room: mandarli, prenderli in carico, dichiararli.
//
// Vive accanto a `pitwallRoomService.ts` e non dentro: la stanza risponde a
// "chi c'e' e chi puo' entrare", questi ordini rispondono a "chi sta applicando
// cosa, adesso". Sono due domande che cambiano per motivi diversi, e tenerle
// separate e' cio' che permette di leggere l'arbitraggio senza scorrere l'ACL.
//
// Qui vive davvero "prima accettata vince". L'arbitraggio sul singolo PC non
// basta piu': in endurance i computer che ascoltano la stessa stanza sono piu'
// di uno, e due di loro potrebbero decidere insieme di applicare due ordini
// diversi. La transazione sul lucchetto della stanza e' l'unico posto dove
// quella corsa si puo' perdere in modo pulito.
// ============================================

import { collection, doc, query, serverTimestamp, where, type Firestore } from 'firebase/firestore'
// Ogni lettura e scrittura passa dal tracker: la promessa "costo zero" regge
// solo se il consumo Firebase resta misurabile, non stimato a occhio.
import {
  trackedOnDocSnapshot,
  trackedOnSnapshot,
  trackedRunTransaction,
  trackedSetDoc,
  trackedUpdateDoc,
} from '~/composables/useFirebaseTracker'
import {
  PITWALL_CLAIM_LEASE_MS,
  PITWALL_ORDER_TTL_MS,
  PITWALL_ROOM_LOCK_DOCUMENT_ID,
  PITWALL_ROOM_SCHEMA_VERSION,
  buildPitwallRoomOrder,
  type PitwallRoomOrder,
} from './pitwallRoomContract'

export type PitwallRoomResult<T> = { ok: true, value: T } | { ok: false, reason: string }

export interface PitwallRoomOrdersOptions {
  db: Firestore
  uid: string
  now?: () => number
}

export function createPitwallRoomOrders(options: PitwallRoomOrdersOptions) {
  const { db, uid } = options
  const now = options.now ?? (() => Date.now())

  const ordersRef = (roomId: string) => collection(db, 'pitwallRooms', roomId, 'orders')
  const lockRef = (roomId: string) => doc(db, 'pitwallRooms', roomId, 'control', PITWALL_ROOM_LOCK_DOCUMENT_ID)

  function nowIso(nowMs: number): string {
    return new Date(nowMs).toISOString()
  }

  function failure(error: unknown, fallback: string): { ok: false, reason: string } {
    return { ok: false, reason: (error as Error)?.message || fallback }
  }



  /**
   * Manda la strategia alla vettura.
   *
   * Nasce con una scadenza obbligatoria: se nessuno la prende in carico entro
   * quella, muore. Nessuna coda che riparte da sola a situazione cambiata.
   */
  async function sendOrder(roomId: string, input: {
    plan: Record<string, unknown>
    revision: number
    orderId?: string
    ttlMs?: number
  }): Promise<PitwallRoomResult<string>> {
    const nowMs = now()
    const orderId = input.orderId || `${uid}-${nowMs}`
    const document = buildPitwallRoomOrder({
      orderId,
      revision: input.revision,
      senderId: uid,
      plan: input.plan,
      nowMs,
      ttlMs: input.ttlMs ?? PITWALL_ORDER_TTL_MS,
    })
    if (!document) return { ok: false, reason: 'Strategia non valida da inviare.' }
    try {
      await trackedSetDoc(doc(ordersRef(roomId), orderId), document, 'pitwallRoom.sendOrder')
      return { ok: true, value: orderId }
    } catch (error) {
      return failure(error, 'Invio rifiutato.')
    }
  }

  /** Segue un ordine finche' chi lo applica non ne dichiara l'esito. */
  function watchOrder(
    roomId: string,
    orderId: string,
    onChange: (order: PitwallRoomOrder | null) => void
  ): () => void {
    return trackedOnDocSnapshot(
      doc(ordersRef(roomId), orderId),
      'pitwallRoom.watchOrder',
      (snapshot) => {
        onChange(snapshot.exists() ? (snapshot.data() as PitwallRoomOrder) : null)
      },
      () => onChange(null)
    )
  }

  /** Gli ordini ancora da applicare: quello che il PC del pilota deve guardare. */
  function watchPendingOrders(
    roomId: string,
    onChange: (orders: PitwallRoomOrder[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    return trackedOnSnapshot(
      query(ordersRef(roomId), where('status', '==', 'pending')),
      'pitwallRoom.watchPendingOrders',
      (snapshot: { docs: { id: string, data: () => unknown }[] }) => {
        onChange(snapshot.docs.map(entry => ({
          ...(entry.data() as PitwallRoomOrder),
          orderId: entry.id,
        })))
      },
      (error: Error) => onError?.(error)
    )
  }

  /**
   * Prende in carico un ordine, in modo atomico.
   *
   * Qui vive davvero "prima accettata vince". L'arbitraggio sul singolo PC non
   * basta piu': in endurance i computer che ascoltano la stessa stanza sono
   * piu' di uno, e due di loro potrebbero decidere insieme di applicare due
   * ordini diversi. La transazione sul lucchetto della stanza e' l'unico posto
   * dove quella corsa si puo' perdere in modo pulito.
   *
   * Non fonde mai due ordini e non mette in coda il secondo: chi perde riceve
   * `conflict`, e l'ingegnere lo scopre subito invece di vederselo partire fra
   * tre minuti.
   */
  async function claimOrder(roomId: string, orderId: string): Promise<
    { ok: true } | { ok: false, reason: 'conflict' | 'expired' | 'gone' | 'error', detail: string }
  > {
    const nowMs = now()
    try {
      return await trackedRunTransaction(db, 'pitwallRoom.claimOrder', lockRef(roomId), async (transaction) => {
        const orderSnapshot = await transaction.get(doc(ordersRef(roomId), orderId))
        if (!orderSnapshot.exists()) {
          return { ok: false as const, reason: 'gone' as const, detail: 'Ordine non piu presente.' }
        }
        const order = orderSnapshot.data() as PitwallRoomOrder
        if (order.status !== 'pending') {
          return { ok: false as const, reason: 'gone' as const, detail: `Ordine gia ${order.status}.` }
        }
        if (!Number.isFinite(Number(order.expiresAtMs)) || Number(order.expiresAtMs) <= nowMs) {
          return { ok: false as const, reason: 'expired' as const, detail: 'Ordine scaduto prima di partire.' }
        }

        const lockSnapshot = await transaction.get(lockRef(roomId))
        const lock = lockSnapshot.exists() ? lockSnapshot.data() as { orderId?: string | null, leaseUntilMs?: number | null } : null
        const busy = lock != null
          && lock.orderId != null
          && lock.orderId !== orderId
          && Number.isFinite(Number(lock.leaseUntilMs))
          && Number(lock.leaseUntilMs) > nowMs
        if (busy) {
          return {
            ok: false as const,
            reason: 'conflict' as const,
            detail: 'Un altro ordine e gia in applicazione: questo e stato rifiutato, non unito.',
          }
        }

        transaction.set(lockRef(roomId), {
          schemaVersion: PITWALL_ROOM_SCHEMA_VERSION,
          orderId,
          claimedBy: uid,
          claimedAtMs: nowMs,
          leaseUntilMs: nowMs + PITWALL_CLAIM_LEASE_MS,
          updatedAt: serverTimestamp(),
        })
        transaction.update(doc(ordersRef(roomId), orderId), {
          status: 'applying',
          claimedBy: uid,
          claimedAtMs: nowMs,
        })
        return { ok: true as const }
      }, { reads: 2, writes: 2 })
    } catch (error) {
      return { ok: false, reason: 'error', detail: (error as Error)?.message || 'Presa in carico rifiutata.' }
    }
  }

  /** Dichiara com'e' andata. Solo chi ha preso l'ordine puo' farlo, e le regole lo impongono. */
  async function publishOutcome(roomId: string, orderId: string, outcome: {
    status: 'applied' | 'partial' | 'failed' | 'rejected'
    reason?: string | null
    fields?: unknown
  }): Promise<PitwallRoomResult<true>> {
    try {
      await trackedUpdateDoc(doc(ordersRef(roomId), orderId), {
        status: outcome.status,
        appliedAt: nowIso(now()),
        result: { reason: outcome.reason ?? null, fields: outcome.fields ?? {} },
      }, 'pitwallRoom.publishOutcome')
      return { ok: true, value: true }
    } catch (error) {
      return failure(error, 'Esito non pubblicato.')
    }
  }

  /**
   * Rifiuta un ordine che nessuno puo' applicare, dicendolo.
   *
   * Scaduto, in conflitto, o senza nessuno al volante: si chiude subito invece
   * di lasciarlo pendente. Un ordine che resta `pending` per sempre e' il modo
   * in cui l'ingegnere finisce per credere che il pilota lo stia leggendo.
   */
  async function rejectOrder(roomId: string, orderId: string, reason: string): Promise<void> {
    try {
      await trackedUpdateDoc(doc(ordersRef(roomId), orderId), {
        status: 'rejected',
        appliedAt: nowIso(now()),
        result: { reason, fields: {} },
      }, 'pitwallRoom.rejectOrder')
    } catch {
      // Un altro PC l'ha gia' chiuso, o e' scaduto: in entrambi i casi
      // l'ordine non partira', che e' quello che conta.
    }
  }

  /** Libera il lucchetto quando l'ordine e' concluso: la stanza accetta il prossimo. */
  async function releaseClaim(roomId: string): Promise<void> {
    try {
      await trackedSetDoc(lockRef(roomId), {
        schemaVersion: PITWALL_ROOM_SCHEMA_VERSION,
        orderId: null,
        claimedBy: null,
        claimedAtMs: null,
        leaseUntilMs: null,
        updatedAt: serverTimestamp(),
      }, 'pitwallRoom.releaseClaim')
    } catch {
      // Non liberato: la presa scade da sola entro il lease. Peggio sarebbe
      // fingere di averlo fatto.
    }
  }

  return {
    sendOrder,
    watchOrder,
    watchPendingOrders,
    claimOrder,
    publishOutcome,
    rejectOrder,
    releaseClaim,
  }
}

export type PitwallRoomOrdersApi = ReturnType<typeof createPitwallRoomOrders>
