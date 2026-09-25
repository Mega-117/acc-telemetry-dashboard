// @vitest-environment jsdom
import { effectScope, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const f = vi.hoisted(() => ({
  rooms: vi.fn(() => ({})), friends: vi.fn((cb: (uids: string[]) => void) => { cb([]); return vi.fn() }),
  driver: vi.fn(), nickname: vi.fn(async () => 'Me'),
}))
vi.mock('~/config/firebase', () => ({ db: {} }))
vi.mock('~/services/pitwall/pitwallRealtimeRoomService', () => ({ createPitwallRealtimeRoomService: f.rooms, stopPitwallRealtimeAccount: vi.fn(async () => {}) }))
vi.mock('~/services/pitwall/pitwallRealtimeEngineerService', () => ({ createPitwallRealtimeEngineerService: () => ({ watchTrustedUids: f.friends, nicknameOf: f.nickname }) }))
vi.mock('~/services/pitwall/pitwallRealtimeDriver', () => ({ startPitwallRealtimeDriver: f.driver }))
import { usePitwallDriverPresence } from '~/composables/usePitwallDriverPresence'
import { requestPitwallOpen, requestPitwallClose, resetPitwallIntentForTests } from '~/composables/usePitwallIntent'

let scope: ReturnType<typeof effectScope>
let status: (value: { state: string, roomId: string | null, reason: null }) => void
const handle = { stop: vi.fn(), sync: vi.fn(async () => {}), refreshInvites: vi.fn(), unavailableReason: () => null,
  openPitwall: vi.fn(async () => { status({ state: 'open', roomId: 'room', reason: null }) }),
  closePitwall: vi.fn(async () => { status({ state: 'off', roomId: null, reason: null }) }),
}
async function settle() { for (let n = 0; n < 20; n++) await Promise.resolve(); await nextTick() }
function start(demand = ref(false)) {
  const jobsEnabled = ref(true)
  const presence = scope.run(() => usePitwallDriverPresence({ jobsEnabled, demand }))!
  return { demand, jobsEnabled, presence }
}
beforeEach(() => {
  vi.clearAllMocks(); resetPitwallIntentForTests(); scope = effectScope()
  Object.assign(window, { electronAPI: {
    localIdentityRole: 'primary', pitwallGetLinkStatus: vi.fn(async () => ({ trustedSender: true, driverUid: 'me' })),
    onPitwallStrategyState: vi.fn(() => vi.fn()), pitwallSetRealtimeConnection: vi.fn(async () => {}),
    pitwallGetStrategyState: vi.fn(async () => null), onPitwallIntentRequest: vi.fn(() => vi.fn()),
  } })
  f.driver.mockImplementation(options => { status = options.onStatus; return handle })
})
afterEach(() => { scope.stop(); resetPitwallIntentForTests(); Reflect.deleteProperty(window, 'electronAPI') })

describe('Pitwall presence on demand', () => {
  it('does no remote work in background, starts on page entry and stops after leaving without a room', async () => {
    const h = start(); await settle()
    expect(f.rooms).not.toHaveBeenCalled(); expect(f.friends).not.toHaveBeenCalled(); expect(f.nickname).not.toHaveBeenCalled()
    h.demand.value = true; await settle()
    expect(f.driver).toHaveBeenCalledTimes(1); expect(h.presence.active.value).toBe(true)
    h.demand.value = false; await settle()
    expect(handle.stop).toHaveBeenCalledTimes(1); expect(h.presence.active.value).toBe(false)
  })
  it('opens from the local shortcut and keeps an active room after navigation', async () => {
    const h = start(); await settle()
    await requestPitwallOpen(); await settle()
    expect(handle.openPitwall).toHaveBeenCalledTimes(1)
    h.demand.value = true; await settle(); h.demand.value = false; await settle()
    expect(handle.stop).not.toHaveBeenCalled()
    await requestPitwallClose(); await settle()
    expect(handle.closePitwall).toHaveBeenCalledTimes(1); expect(handle.stop).toHaveBeenCalledTimes(1)
  })
  it('stops on logout and invalidates a startup awaiting the nickname', async () => {
    let resolve!: (value: string) => void
    f.nickname.mockReturnValueOnce(new Promise<string>(done => { resolve = done }))
    const h = start(ref(true)); await settle()
    h.jobsEnabled.value = false; resolve('Me'); await settle()
    expect(f.driver).not.toHaveBeenCalled(); expect(h.presence.active.value).toBe(false)
    expect((await requestPitwallOpen()).ok).toBe(false)
  })
})
