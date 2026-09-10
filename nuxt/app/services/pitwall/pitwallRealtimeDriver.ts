import type { PitwallRoomDriverOptions, PitwallRoomDriverHandle, PitwallDriverStatus } from './pitwallRoomDriverService'
import type { PitwallRealtimeRoomService } from './pitwallRealtimeRoomService'
import { resolvePitwallRoomExecutor, type PitwallRoom, type PitwallRoomMember, type PitwallRoomOrder } from './pitwallRoomContract'
import { createPitwallRoomOutcomeRecovery } from './pitwallRoomOutcomeRecovery'

type Options = Pick<PitwallRoomDriverOptions, 'uid' | 'nickname' | 'runtimeSessionId' | 'electronApi' | 'readVehicle' | 'readTrustedUids' | 'onStatus'> & {
  service: PitwallRealtimeRoomService
  bindMain: (value: { connectionId: string, roomId: string | null, online: boolean }) => Promise<unknown>
}

/** Event-driven driver: each new order is considered once, never retried when ACC becomes ready. */
export function startPitwallRealtimeDriver(options: Options): PitwallRoomDriverHandle {
  const rooms = options.service
  let wanted = false; let stopped = false
  let room: PitwallRoom | null = null
  let reason: string | null = null
  let members: PitwallRoomMember[] = []
  let syncing: Promise<void> | null = null
  let dirty = false
  let confirming: string | null = null
  let confirmed = false
  let confirmationTimer: ReturnType<typeof setTimeout> | null = null
  let stopMembers: (() => void) | null = null
  let stopRoom: (() => void) | null = null
  let stopOrders: (() => void) | null = null
  let applying: string | null = null
  const handled = new Set<string>()
  const { drainPendingOutcomes, confirmOutcomes } = createPitwallRoomOutcomeRecovery({ uid: options.uid,
    electronApi: options.electronApi, rooms, log: console, isStopped: () => stopped })
  let recovery: Promise<void> | null = null
  const recover = () => { if (!recovery && rooms.io.online()) recovery = drainPendingOutcomes().finally(() => { recovery = null }); return recovery }
  const status = (): PitwallDriverStatus => ({ state: !wanted ? 'off' : room ? 'open' : 'arming', roomId: room?.roomId ?? null, reason })
  let statusKey = ''
  function emit() { const value = status(); const key = JSON.stringify(value); if (key !== statusKey) { statusKey = key; options.onStatus?.(value) } }
  async function bindMain() {
    return options.bindMain({ connectionId: rooms.session.connectionId(), roomId: rooms.session.roomId(), online: rooms.io.online() })
  }
  function detach() { stopMembers?.(); stopRoom?.(); stopOrders?.(); stopMembers = stopRoom = stopOrders = null; members = [] }

  async function deliver(order: PitwallRoomOrder, roomId: string) {
    // Set before any await: cached snapshot replay or simultaneous callbacks cannot enqueue it twice.
    if (handled.has(order.orderId) || stopped) return
    handled.add(order.orderId)
    const executor = resolvePitwallRoomExecutor(members, rooms.serverNow()).executor
    if (applying || executor?.connectionId !== rooms.session.connectionId()) {
      await rooms.rejectOrder(roomId, order.orderId, 'Il pilota non e disponibile o un altro ordine e in corso. Invia di nuovo quando pronto.')
      return
    }
    applying = order.orderId
    try {
      const local = await options.electronApi.pitwallGetLinkStatus?.()
      if (!local?.accReady || !local.trustedSender || local.driverUid !== options.uid) {
        await rooms.rejectOrder(roomId, order.orderId, local?.accReason || 'ACC non disponibile. Occorre un nuovo invio manuale.')
        return
      }
      const claim = await rooms.claimOrder(roomId, order.orderId)
      if (!claim.ok) {
        if (claim.reason !== 'gone') await rooms.rejectOrder(roomId, order.orderId, claim.detail).catch(() => {})
        return
      }
      await bindMain()
      const acknowledged = rooms.acknowledgedOrder(roomId, order.orderId)
      const current = await options.electronApi.pitwallGetLinkStatus?.()
      let outcome: { status: string, reason?: string | null, fields?: unknown, tyreSetCondition?: unknown, method?: string, diary?: string, sourceStatus?: string, events?: unknown, selectedDriverId?: number }
      if (!acknowledged || stopped || room?.roomId !== roomId || !current?.accReady || current.driverUid !== options.uid
        || resolvePitwallRoomExecutor(members, rooms.serverNow()).executor?.connectionId !== rooms.session.connectionId()) {
        outcome = { status: 'rejected', reason: 'Stato cambiato dopo la presa in carico: nessun input inviato. Invia di nuovo quando pronto.' }
      } else {
        try {
          outcome = await options.electronApi.pitwallSubmitRemoteOrder?.({
            order: { ...acknowledged, expiresAtMs: rooms.toLocalMs(acknowledged.expiresAtMs),
              leaseUntilMs: rooms.toLocalMs(acknowledged.leaseUntilMs!) } as never,
            grant: null, room: { roomId, memberUids: room.memberUids },
          }) ?? { status: 'failed', reason: 'Ponte ACC non disponibile.' }
        } catch (error) {
          // IPC loss says nothing about ACC's actual state. Recover the main outbox,
          // without overwriting its real result with an invented failure or applying again.
          reason = `Conferma ACC non ricevuta: ${(error as Error).message}. Verifica il MFD prima di un nuovo invio.`
          emit(); void recover(); return
        }
      }
      const terminal = (['applied', 'partial', 'failed', 'rejected'] as const).find(value => value === outcome.status) ?? 'rejected'
      const result = await rooms.publishOutcome(roomId, order.orderId, { status: terminal,
        reason: outcome.reason ?? (outcome.status === 'waiting' ? 'Impedimento rilevato: occorre un nuovo invio manuale.' : null), fields: outcome.fields, tyreSetCondition: outcome.tyreSetCondition,
        method: outcome.method, diary: outcome.diary, sourceStatus: outcome.sourceStatus, events: outcome.events, selectedDriverId: outcome.selectedDriverId })
      if (result.ok) await confirmOutcomes([order.orderId])
      else console.warn('[PITWALL] Esito conservato localmente:', result.reason)
    } finally { applying = null }
  }

  function attach(roomId: string) {
    detach()
    stopRoom = rooms.watchRoom(roomId, value => {
      if (!value || !value.memberUids.includes(options.uid)) { wanted = false; room = null; detach(); emit(); return }
      room = value
    }, error => { reason = error.message; members = []; emit() })
    stopMembers = rooms.watchMembers(roomId, value => {
      members = value
      if (!stopOrders && members.some(member => member.connectionId === rooms.session.connectionId())) {
        stopOrders = rooms.watchPendingOrders(roomId, orders => {
          for (const order of orders) void deliver(order, roomId).catch(error => { reason = (error as Error).message; emit() })
        }, error => { reason = error.message; emit() })
      }
    }, error => { members = []; reason = error.message; emit() })
  }

  async function refreshInvites() {
    if (!room || !options.readTrustedUids) return
    const result = await rooms.syncInvites(room.roomId, await options.readTrustedUids())
    if (!result.ok) { reason = result.reason; emit() }
  }
  async function runSync() {
    const vehicle = await options.readVehicle()
    if (stopped) return
    if (wanted && vehicle && !room) {
      if (confirming !== vehicle.fingerprint) {
        confirming = vehicle.fingerprint; confirmed = false
        if (confirmationTimer) clearTimeout(confirmationTimer)
        confirmationTimer = setTimeout(() => { confirmed = true; void sync() }, 500)
      }
      if (confirmed) {
        const created = await rooms.ensureRoomForVehicle({ ...vehicle, seedAllowedUids: await options.readTrustedUids?.() ?? [] })
        if (!created.ok) { reason = created.reason; emit(); return }
        if (!wanted || stopped) { await rooms.closeRoom(created.value.roomId); return }
        room = created.value
      }
    }
    if (room && vehicle && room.vehicleFingerprint !== vehicle.fingerprint) {
      const previous = room.roomId
      detach(); room = null; confirming = null; confirmed = false
      await rooms.clearPresence(previous)
      dirty = true
    }
    const presence = await rooms.publishPresence(room?.roomId ?? null, { nickname: options.nickname, kind: 'driver',
      runtimeSessionId: options.runtimeSessionId, driving: vehicle?.driving ?? false, crew: vehicle?.crew, strategy: vehicle?.strategy,
      car: vehicle?.label, track: vehicle?.track })
    if (!presence.ok) reason = presence.reason
    else reason = wanted && !room ? 'Si apre appena ACC e la vettura sono disponibili.' : null
    await bindMain()
    if (room && !stopMembers) attach(room.roomId)
    emit()
  }
  function sync(): Promise<void> {
    if (stopped) return Promise.resolve()
    dirty = true
    if (syncing) return syncing
    syncing = (async () => { while (dirty && !stopped) { dirty = false; await runSync() } })()
      .catch(error => { reason = (error as Error).message; emit() }).finally(() => { syncing = null })
    return syncing
  }
  let observedConnection = ''
  const stopReady = rooms.session.onReady(() => {
    void bindMain()
    const id = rooms.session.connectionId()
    if (id && id !== observedConnection) { observedConnection = id; void recover(); if (wanted && !room) void sync() }
  })
  async function closePitwall() {
    wanted = false
    if (confirmationTimer) clearTimeout(confirmationTimer)
    const previous = room
    if (previous) {
      const result = previous.managerUids.includes(options.uid) ? await rooms.closeRoom(previous.roomId) : await rooms.leaveRoom(previous.roomId)
      if (!result.ok) { wanted = true; reason = result.reason; emit(); return }
    }
    detach(); room = null; confirming = null; confirmed = false
    await sync(); emit()
  }
  void recover()
  void sync()
  return { roomId: () => room?.roomId ?? null, unavailableReason: () => reason, status, sync, refreshInvites,
    async openPitwall() { wanted = true; await sync(); emit() }, closePitwall,
    async goOffline() { if (room) await rooms.clearPresence(room.roomId); await options.bindMain({ connectionId: '', roomId: null, online: false }) },
    stop() { stopped = true; wanted = false; if (confirmationTimer) clearTimeout(confirmationTimer); stopReady(); detach(); void rooms.deactivateDriver().catch(() => {}); void options.bindMain({ connectionId: '', roomId: null, online: false }); emit() },
  }
}
