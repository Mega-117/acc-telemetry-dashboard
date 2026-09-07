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
type Outcome = { status: 'applied' | 'partial' | 'failed' | 'rejected', reason?: string | null, fields?: unknown, tyreSetCondition?: unknown }
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

  async function sendOrder(roomId: string, input: { plan: Record<string, unknown>, revision: number, orderId?: string, ttlMs?: number }): Promise<PitwallRoomResult<string>> {
    try {
      const target = activeDriver(connections(roomId))
      const senderConnectionId = session.connectionId()
      if (!io.online() || session.roomId() !== roomId || !senderConnectionId || !target) throw new Error('Il collegamento o il pilota non sono pronti. La strategia non viene messa in attesa.')
      const orderId = input.orderId || crypto.randomUUID()
      const base = buildPitwallRoomOrder({ orderId, revision: input.revision, senderId: uid, plan: input.plan,
        nowMs: io.serverNow(), ttlMs: Math.min(input.ttlMs ?? PITWALL_ORDER_TTL_MS, PITWALL_ORDER_TTL_MS) })
      if (!base) throw new Error('Strategia non valida da inviare.')
      const order: RealtimeOrder = { ...base, protocolVersion: 3, targetUid: target.uid,
        targetConnectionId: target.connectionId, senderConnectionId }
      await io.write(`rooms/${roomId}`, { [`orders/${orderId}`]: order, [`pending/${orderId}`]: true })
      return { ok: true, value: orderId }
    } catch (error) { return fail(error) }
  }

  function watchOrder(roomId: string, orderId: string, callback: (order: PitwallRoomOrder | null) => void) {
    return io.watch(orderPath(roomId, orderId), value => callback(value as RealtimeOrder | null), () => callback(null))
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
      const completed = { ...order, status: outcome.status, appliedAt: new Date(io.serverNow()).toISOString(), result: { reason: outcome.reason ?? null, fields: outcome.fields ?? {}, ...(boundPitwallTyreCondition(outcome.tyreSetCondition) ? { tyreSetCondition: boundPitwallTyreCondition(outcome.tyreSetCondition) } : {}) } }
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
  return { sendOrder, watchOrder, readOrder, watchPendingOrders, claimOrder, acknowledgedOrder, publishOutcome, rejectOrder, releaseClaim }
}
