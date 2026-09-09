import { boundPitwallTyreCondition } from './pitwallLink'
import type { PitwallRealtimeTransport } from './pitwallRealtimeTransport'
import type { PitwallRealtimeSession } from './pitwallRealtimeSession'
import { activeDriver, canClaimRealtimeOrder, type RealtimeConnection, type RealtimeOrder } from './pitwallRealtimeProtocol'
import { buildPitwallRoomOrder, PITWALL_CLAIM_LEASE_MS, PITWALL_ORDER_TTL_MS, type PitwallRoomOrder } from './pitwallRoomContract'
import type { PitwallRoomResult } from './pitwallRoomOrders'

export interface RealtimeClaim {
  protocolVersion: 3
  orderId: string
  uid: string
  connectionId: string
  claimedAtMs: number
  leaseUntilMs: number
}
type Outcome = { status: 'applied' | 'partial' | 'failed' | 'rejected', reason?: string | null, fields?: unknown, tyreSetCondition?: unknown, method?: string, sourceStatus?: string, events?: unknown, selectedDriverId?: number }
const terminal = (order: RealtimeOrder) => ['applied', 'partial', 'failed', 'rejected'].includes(order.status)
const fail = (error: unknown): { ok: false, reason: string } => ({ ok: false, reason: error instanceof Error ? error.message : String(error) })

/** The claim transaction never performs ACC input. Only its acknowledged owner may proceed. */
export function createPitwallRealtimeOrders(options: {
  io: PitwallRealtimeTransport
  session: PitwallRealtimeSession
  connections: (roomId: string) => RealtimeConnection[]
}) {
  const { io, session, connections } = options
  const uid = session.uid
  const orderPath = (room: string, order: string) => `rooms/${room}/orders/${order}`
  const controlPath = (room: string) => `rooms/${room}/control/claim`
  const acknowledged = new Map<string, RealtimeOrder>()
  const diagnostic = (event: string, attemptId: string, reason?: string) => {
    console.info('[PITWALL_DIAGNOSTIC] ' + JSON.stringify({ at: new Date().toISOString(), event, attemptId, orderId: attemptId, reason: reason?.slice(0, 500) }))
  }

  function sendReadiness(roomId: string): { ready: boolean, reason: string | null } {
    const reason = !io.online() ? 'Il tuo collegamento è offline.'
      : !session.isReady(roomId) ? 'Il tuo ingresso nella gara non è ancora confermato.'
      : !activeDriver(connections(roomId)) ? 'Nessun pilota disponibile per applicare la strategia.' : null
    return { ready: reason === null, reason }
  }

  async function sendOrder(roomId: string, input: { plan: Record<string, unknown>, revision: number, orderId?: string, ttlMs?: number }): Promise<PitwallRoomResult<string>> {
    const orderId = input.orderId || crypto.randomUUID()
    diagnostic('send_attempt', orderId)
    try {
      const target = activeDriver(connections(roomId))
      const senderConnectionId = session.connectionId()
      const readiness = sendReadiness(roomId)
      if (!readiness.ready || !target) throw new Error(readiness.reason || 'Pilota non disponibile.')
      if (input.plan.method === 'acc-drive-7.8.1') throw new Error('Metodo ACC Drive dismesso.')
      if (input.plan.method === 'mfd-v2') {
        const mfd = await io.read<{ uid: string, connectionId: string, strategy?: { applicationMethods?: string[], mfdV2?: { ready: boolean } } }>(`rooms/${roomId}/mfd`)
        if (mfd?.uid !== target.uid || mfd.connectionId !== target.connectionId || !mfd.strategy?.applicationMethods?.includes('mfd-v2') || mfd.strategy?.mfdV2?.ready !== true) {
          throw new Error('Il PC del pilota non ha confermato la disponibilità V2.')
        }
      }
      const base = buildPitwallRoomOrder({ orderId, revision: input.revision, senderId: uid, plan: input.plan,
        nowMs: io.serverNow(), ttlMs: Math.min(input.ttlMs ?? PITWALL_ORDER_TTL_MS, PITWALL_ORDER_TTL_MS) })
      if (!base) throw new Error('Strategia non valida da inviare.')
      const order: RealtimeOrder = { ...base, protocolVersion: 3, targetUid: target.uid,
        targetConnectionId: target.connectionId, senderConnectionId }
      await io.write(`rooms/${roomId}`, { [`orders/${orderId}`]: order, [`pending/${orderId}`]: true })
      diagnostic('send_confirmed', orderId)
      return { ok: true, value: orderId }
    } catch (error) { const result = fail(error); diagnostic('send_failed', orderId, result.reason); return result }
  }

  function watchOrder(roomId: string, orderId: string, callback: (order: PitwallRoomOrder | null) => void) {
    let status = ''
    return io.watch(orderPath(roomId, orderId), value => {
      const order = value as RealtimeOrder | null
      if (order && status !== order.status) { status = order.status; diagnostic('order_' + status, orderId, (order.result as { reason?: string } | undefined)?.reason) }
      callback(order)
    }, () => callback(null))
  }
  async function readOrder(roomId: string, orderId: string): Promise<PitwallRoomResult<PitwallRoomOrder | null>> {
    try { return { ok: true, value: await io.read<RealtimeOrder>(orderPath(roomId, orderId)) } }
    catch (error) { return fail(error) }
  }

  function watchPendingOrders(roomId: string, callback: (orders: PitwallRoomOrder[]) => void, error?: (error: Error) => void) {
    const entries = new Map<string, RealtimeOrder>()
    const stops = new Map<string, () => void>()
    const cleanupAttempted = new Set<string>()
    let expiryTimer: ReturnType<typeof setTimeout> | null = null
    const emit = () => {
      if (expiryTimer) clearTimeout(expiryTimer)
      const now = io.serverNow()
      const pending = [...entries.values()].filter(order => order.status === 'pending')
      for (const order of pending) {
        if (order.targetUid !== uid || cleanupAttempted.has(order.orderId) || !io.online() || !session.connectionId()) continue
        if (order.expiresAtMs > now && order.targetConnectionId === session.connectionId()) continue
        cleanupAttempted.add(order.orderId)
        void rejectOrder(roomId, order.orderId, 'Ordine scaduto o connessione cambiata. Occorre un nuovo invio manuale.')
      }
      const future = pending.map(order => order.expiresAtMs).filter(stamp => stamp > now)
      if (future.length) expiryTimer = setTimeout(emit, Math.max(1, Math.min(...future) - now + 1))
      callback(pending.filter(order => canClaimRealtimeOrder(order, uid, session.connectionId(), now)))
    }
    const stopConnection = session.onReady(emit)
    const stop = io.watch(`rooms/${roomId}/pending`, value => {
      const ids = new Set(Object.keys((value ?? {}) as Record<string, true>))
      for (const [id, unsubscribe] of stops) if (!ids.has(id)) { unsubscribe(); stops.delete(id); entries.delete(id) }
      for (const id of ids) if (!stops.has(id)) {
        // Reserve before watch: a shared cached listener may call back synchronously.
        stops.set(id, () => {})
        stops.set(id, io.watch(orderPath(roomId, id), value => {
          if (value) entries.set(id, value as RealtimeOrder); else entries.delete(id)
          emit()
        }, cause => { entries.delete(id); emit(); error?.(cause) }))
      }
      emit()
    }, cause => { entries.clear(); emit(); error?.(cause) })
    return () => { stop(); stopConnection(); if (expiryTimer) clearTimeout(expiryTimer); for (const unsubscribe of stops.values()) unsubscribe(); entries.clear() }
  }

  async function claimOrder(roomId: string, orderId: string): Promise<{ ok: true } | { ok: false, reason: 'conflict' | 'expired' | 'gone' | 'error', detail: string }> {
    const connectionId = session.connectionId()
    try {
      const order = await io.read<RealtimeOrder>(orderPath(roomId, orderId))
      if (!order || order.status !== 'pending') return { ok: false, reason: 'gone', detail: 'Ordine non piu disponibile.' }
      if (!canClaimRealtimeOrder(order, uid, connectionId, io.serverNow())) return { ok: false, reason: 'expired', detail: 'Ordine scaduto o destinato a una connessione precedente.' }
      const result = await io.transact<RealtimeClaim>(controlPath(roomId), current => {
        const now = io.serverNow()
        if (session.connectionId() !== connectionId || session.roomId() !== roomId || !canClaimRealtimeOrder(order, uid, connectionId, now)) return undefined
        if (current && current.leaseUntilMs > now) return undefined
        return { protocolVersion: 3, orderId, uid, connectionId, claimedAtMs: now, leaseUntilMs: now + PITWALL_CLAIM_LEASE_MS }
      })
      if (!result.committed || !result.value) return { ok: false, reason: 'conflict', detail: 'Un altro ordine e gia in applicazione. Occorre un nuovo invio manuale.' }
      const claim = result.value
      if (!io.online() || session.connectionId() !== connectionId || claim.leaseUntilMs <= io.serverNow()) throw new Error('Connessione cambiata durante la presa in carico.')
      // Persist the executor identity on the order so its outbox can recover after this lease is gone.
      // Keeping this acknowledgement outside the claim branch avoids retransmitting order history in every transaction.
      const applying: RealtimeOrder = { ...order, status: 'applying', claimedBy: uid, claimedAtMs: claim.claimedAtMs, leaseUntilMs: claim.leaseUntilMs }
      await io.write(`rooms/${roomId}`, { [`orders/${orderId}`]: applying, [`pending/${orderId}`]: null })
      if (!io.online() || session.connectionId() !== connectionId || claim.leaseUntilMs <= io.serverNow()) throw new Error('Presa in carico non piu valida: nessun input inviato.')
      acknowledged.set(`${roomId}/${orderId}`, applying)
      return { ok: true }
    } catch (error) { return { ok: false, reason: 'error', detail: fail(error).reason } }
  }

  /** Used immediately before IPC and translated to the main process's local clock. */
  function acknowledgedOrder(roomId: string, orderId: string): RealtimeOrder | null {
    const order = acknowledged.get(`${roomId}/${orderId}`)
    if (!order || !io.online() || order.targetConnectionId !== session.connectionId() || session.roomId() !== roomId
      || (order.leaseUntilMs ?? 0) <= io.serverNow() || order.expiresAtMs <= io.serverNow()) return null
    return order
  }

  async function publishOutcome(roomId: string, orderId: string, outcome: Outcome): Promise<PitwallRoomResult<true>> {
    try {
      const key = `${roomId}/${orderId}`
      const order = acknowledged.get(key) ?? await io.read<RealtimeOrder>(orderPath(roomId, orderId))
      if (!order) throw new Error('Ordine non disponibile: conservare il registro locale.')
      if (terminal(order)) return { ok: true, value: true }
      if (order.status !== 'applying' || order.claimedBy !== uid) throw new Error('Esito non appartenente a questo esecutore.')
      const completed = { ...order, status: outcome.status, appliedAt: new Date(io.serverNow()).toISOString(), result: { reason: outcome.reason ?? null, fields: outcome.fields ?? {}, ...(boundPitwallTyreCondition(outcome.tyreSetCondition) ? { tyreSetCondition: boundPitwallTyreCondition(outcome.tyreSetCondition) } : {}),
        ...(outcome.method === 'mfd-v2' ? { method: outcome.method } : {}),
        ...(outcome.method === 'acc-drive-7.8.1' ? { method: outcome.method, sourceStatus: outcome.sourceStatus ?? null, events: outcome.events ?? [], selectedDriverId: outcome.selectedDriverId ?? null } : {}) } }
      const claim = await io.read<RealtimeClaim>(controlPath(roomId))
      const changes: Record<string, unknown> = { [`orders/${orderId}`]: completed }
      if (claim?.orderId === orderId && claim.uid === uid && claim.connectionId === order.targetConnectionId) changes['control/claim'] = null
      // Rules compare the old claim with this order. A race rejects the whole update, never clears someone else's claim.
      await io.write(`rooms/${roomId}`, changes)
      acknowledged.delete(key)
      return { ok: true, value: true }
    } catch (error) { return fail(error) }
  }

  async function rejectOrder(roomId: string, orderId: string, reason: string): Promise<void> {
    const order = await io.read<RealtimeOrder>(orderPath(roomId, orderId))
    if (!order || order.status !== 'pending') return
    await io.write(`rooms/${roomId}`, { [`orders/${orderId}`]: { ...order, status: 'rejected', appliedAt: new Date(io.serverNow()).toISOString(), result: { reason, fields: {} } }, [`pending/${orderId}`]: null })
  }

  // Outcomes own release atomically. Compatibility callers must not blindly unlock in finally.
  async function releaseClaim(_roomId: string): Promise<void> {}
  return { sendReadiness, sendOrder, watchOrder, readOrder, watchPendingOrders, claimOrder, acknowledgedOrder, publishOutcome, rejectOrder, releaseClaim }
}
