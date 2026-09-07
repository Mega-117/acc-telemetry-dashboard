import { onScopeDispose, ref, watch, type Ref } from 'vue'
import { db } from '~/config/firebase'
import { createPitwallRealtimeRoomService, type PitwallRealtimeRoomService } from '~/services/pitwall/pitwallRealtimeRoomService'
import { createPitwallRealtimeEngineerService } from '~/services/pitwall/pitwallRealtimeEngineerService'
import { startPitwallRealtimeDriver } from '~/services/pitwall/pitwallRealtimeDriver'
import type { PitwallDriverElectronApi } from '~/services/pitwall/pitwallDriverLinkService'
import type { PitwallDriverStatus, PitwallRoomDriverHandle } from '~/services/pitwall/pitwallRoomDriverService'
import { registerPitwallIntentControls, setPitwallIntentStatus } from '~/composables/usePitwallIntent'

type LocalState = Awaited<ReturnType<NonNullable<PitwallDriverElectronApi['pitwallGetStrategyState']>>> & { driverState?: string }
interface Bridge extends PitwallDriverElectronApi {
  localIdentityRole?: string
  onLocalRuntimeAuthChanged?: (callback: () => void) => () => void
  onPitwallStrategyState?: (callback: (state: LocalState) => void) => () => void
  pitwallSetRealtimeConnection?: (value: { connectionId: string, roomId: string | null, online: boolean }) => Promise<unknown>
  pitwallReportIntentState?: (status: PitwallDriverStatus & { available: boolean }) => Promise<unknown>
  onPitwallIntentRequest?: (callback: (request: { open: boolean } | null) => void) => () => void
}
const bridgeOf = () => typeof window === 'undefined' ? null : (window as unknown as { electronAPI?: Bridge }).electronAPI ?? null
export interface PitwallDriverPresenceOptions { jobsEnabled: Ref<boolean> }

/** The authenticated primary renderer owns one event-driven runtime presence. */
export function usePitwallDriverPresence(options: PitwallDriverPresenceOptions) {
  const active = ref(false)
  const driverUid = ref<string | null>(null)
  const unavailableReason = ref<string | null>(null)
  const roomId = ref<string | null>(null)
  let handle: PitwallRoomDriverHandle | null = null
  let service: PitwallRealtimeRoomService | null = null
  let local: LocalState | null = null
  let friends: string[] = []
  let generation = 0
  const stops: Array<() => void> = []
  let syncing: Promise<void> | null = null
  let syncAgain = false
  let disposed = false
  function stop() {
    generation++
    while (stops.length) stops.pop()?.()
    handle?.stop(); handle = null
    service = null; local = null; friends = []
    active.value = false; driverUid.value = null; roomId.value = null
    registerPitwallIntentControls(null)
    setPitwallIntentStatus({ state: 'off', roomId: null, reason: null })
    // Main already clears runtime state on logout; no protected IPC after auth ends.
  }
  async function runSync() {
    const bridge = bridgeOf()
    if (disposed || !options.jobsEnabled.value || bridge?.localIdentityRole !== 'primary' || !bridge.pitwallGetLinkStatus) { stop(); return }
    if (!bridge.onPitwallStrategyState || !bridge.pitwallSetRealtimeConnection) {
      unavailableReason.value = 'Aggiorna e riavvia ACC Suite per usare il nuovo Pitwall.'; stop(); return
    }
    const identity = await bridge.pitwallGetLinkStatus()
    if (disposed || !options.jobsEnabled.value) return
    if (!identity.trustedSender || !identity.driverUid) { stop(); return }
    if (handle && driverUid.value === identity.driverUid) return
    stop()
    const token = generation
    const uid = identity.driverUid
    driverUid.value = uid
    try {
      service = createPitwallRealtimeRoomService({ uid })
      const links = createPitwallRealtimeEngineerService({ db, engineerUid: uid })
      // Subscribe before fetching the initial local frame; a later event wins over a stale response.
      let frameRevision = 0
      stops.push(bridge.onPitwallStrategyState(value => { local = value; frameRevision++; void handle?.sync() }))
      const initialRevision = frameRevision
      const initial = await bridge.pitwallGetStrategyState?.()
      if (token !== generation || disposed || !options.jobsEnabled.value) return
      if (frameRevision === initialRevision) local = initial as LocalState ?? null
      let readyFriends!: () => void
      const firstFriends = new Promise<void>(resolve => { readyFriends = resolve })
      stops.push(links.watchTrustedUids(value => { friends = value; readyFriends(); void handle?.refreshInvites() }, () => { friends = []; readyFriends() }))
      const nickname = await links.nicknameOf(uid)
      if (token !== generation || disposed) return
      handle = startPitwallRealtimeDriver({ uid, nickname, runtimeSessionId: crypto.randomUUID(), service,
        electronApi: bridge, bindMain: value => options.jobsEnabled.value
          ? bridge.pitwallSetRealtimeConnection!(value) : Promise.resolve(),
        readTrustedUids: async () => { await firstFriends; return friends },
        readVehicle: async () => {
          const state = local
          const vehicle = state?.vehicle
          if (!state?.live || !state.fresh || !vehicle?.available || !vehicle.fingerprint) return null
          const crew = state.crew?.available ? state.crew.drivers.map(member => ({ driverIndex: member.driverIndex,
            name: `${member.firstName} ${member.lastName}`.trim() || member.shortName,
            current: member.driverIndex === state.crew?.currentDriverIndex })) : null
          return { fingerprint: vehicle.fingerprint, label: vehicle.label ?? 'Gara in corso', track: vehicle.trackName ?? state.identity?.track,
            raceNumber: vehicle.raceNumber, teamName: vehicle.teamName, driving: state.driverState === 'driving', crew, strategy: state.car ? { ...state.car, fittedTyreSet: state.identity?.fittedTyreSet ?? null } : null }
        },
        onStatus: value => { roomId.value = value.roomId; unavailableReason.value = value.reason; setPitwallIntentStatus(value); if (options.jobsEnabled.value) void bridge.pitwallReportIntentState?.({ ...value, available: true }).catch(() => {}) },
      })
      const current = handle
      registerPitwallIntentControls({ open: () => current.openPitwall(), close: () => current.closePitwall() })
      stops.push(bridge.onPitwallIntentRequest?.(request => { if (handle === current) void (request?.open ? current.openPitwall() : current.closePitwall()) }) ?? (() => {}))
      active.value = true
      unavailableReason.value = null
    } catch (error) { unavailableReason.value = (error as Error).message; stop() }
  }
  function sync() {
    syncAgain = true
    if (syncing) return syncing
    syncing = (async () => {
      while (syncAgain && !disposed) { syncAgain = false; await runSync() }
    })().catch(error => { unavailableReason.value = (error as Error).message }).finally(() => { syncing = null })
    return syncing
  }
  const stopAuth = bridgeOf()?.onLocalRuntimeAuthChanged?.(() => { void sync() })
  watch(options.jobsEnabled, enabled => { if (!enabled) stop(); void sync() }, { flush: 'sync' })
  void sync()
  onScopeDispose(() => { disposed = true; stopAuth?.(); stop() })
  return { active, driverUid, unavailableReason, roomId, roomUnavailableReason: () => handle?.unavailableReason() ?? null, stop }
}
