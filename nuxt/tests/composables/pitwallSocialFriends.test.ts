import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { createPitwallFriendActions } from '~/composables/usePitwallFriendActions'
import { createPitwallPresenceWatch } from '~/composables/usePitwallPresenceWatch'
import type { PitwallFriendView } from '~/services/pitwall/pitwallFriends'
import type { PitwallOutgoingLink } from '~/services/pitwall/pitwallEngineerService'

function setup() {
  const trust = { preAuthorise: vi.fn(async () => true), requestLink: vi.fn(async () => true), decide: vi.fn(async () => true), withdrawRequest: vi.fn(async () => true) }
  const friendViews = ref<PitwallFriendView[]>([])
  const notice = ref<string | null>('old success')
  const revoke = vi.fn()
  const leaveRoom = vi.fn()
  const actions = createPitwallFriendActions({ uid: () => 'A', friendViews, trust, link: { rooms: ref([]), notice, service: () => ({ revoke, leaveRoom }) } })
  return { ...actions, trust, friendViews, notice, revoke, leaveRoom }
}

describe('social friendship actions', () => {
  it('does not request or announce success after failed pre-authorisation', async () => {
    const s = setup(); s.trust.preAuthorise.mockResolvedValue(false)
    await s.befriend('B')
    expect(s.trust.requestLink).not.toHaveBeenCalled()
    expect(s.notice.value).toBeNull()
  })
  it('does not announce success after a refused request', async () => {
    const s = setup(); s.trust.requestLink.mockResolvedValue(false)
    await s.befriend('B'); expect(s.notice.value).toBeNull()
  })
  it('accepts without another request or confirmation notification', async () => {
    const s = setup()
    s.friendViews.value = [{ personId: 'B', nickname: 'B', state: 'received', iAllow: false, theyAllow: true, mineStatus: 'pending', theirsStatus: 'granted' }]
    await s.befriend('B')
    expect(s.trust.preAuthorise).toHaveBeenCalledWith('B', 'always', null)
    expect(s.trust.requestLink).not.toHaveBeenCalled()
    expect(s.notice.value).toBeNull()
  })
  it('removing friendship never ejects admitted participants', async () => {
    const s = setup()
    s.friendViews.value = [{ personId: 'B', nickname: 'B', state: 'friends', iAllow: true, theyAllow: true, mineStatus: 'granted', theirsStatus: 'granted' }]
    await s.unfriend('B')
    expect(s.trust.decide).toHaveBeenCalledWith('B', 'revoked')
    expect(s.trust.withdrawRequest).toHaveBeenCalledWith('B')
    expect(s.revoke).not.toHaveBeenCalled(); expect(s.leaveRoom).not.toHaveBeenCalled()
  })
})

describe('presence subscription recovery', () => {
  const link = (driverUid: string) => ({ driverUid, usable: true, reachable: false, session: null } as PitwallOutgoingLink)
  it('recreates a denied listener after friendship changes and does not truncate friends', () => {
    const outgoing = ref(Array.from({ length: 20 }, (_, i) => link(String(i))))
    const errors = new Map<string, (error: Error) => void>()
    const stop = vi.fn()
    const watchPilotPresence = vi.fn((uid: string, _change: unknown, error?: (error: Error) => void) => { errors.set(uid, error!); return stop })
    const presence = createPitwallPresenceWatch({ outgoing, eventDriven: true, service: () => ({ watchPilotPresence }) })
    presence.start(); expect(watchPilotPresence).toHaveBeenCalledTimes(20)
    errors.get('0')!(new Error('permission-denied'))
    presence.sync(); expect(watchPilotPresence).toHaveBeenCalledTimes(21)
    presence.stop()
  })
  it('handles synchronous denial without retaining the failed handle', () => {
    const stop = vi.fn()
    const watchPilotPresence = vi.fn((_uid: string, _change: unknown, error?: (error: Error) => void) => { error!(new Error('denied')); return stop })
    const presence = createPitwallPresenceWatch({ outgoing: ref([link('B')]), eventDriven: true, service: () => ({ watchPilotPresence }) })
    presence.start(); presence.sync()
    expect(watchPilotPresence).toHaveBeenCalledTimes(2)
    expect(stop).toHaveBeenCalledTimes(2)
    presence.stop()
  })
})
