import { effectScope, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useControlKFriendRequests } from '~/composables/useControlKFriendRequests'
import type { FriendRequestDecision, FriendRequestSnapshot } from '~/services/pitwall/friendRequestQueue'

describe('primary Control K friendship owner', () => {
  function setup(role = 'primary') {
    const store = { notices: ref([{ id: 'req:A', kind: 'request' as const, personId: 'A' }]), people: ref([{ id: 'A', handle: '@A' }]),
      meId: ref<string | null>('me'), inboxAccount: ref<string | null>('me'), respondFriendRequest: vi.fn(async () => true) }
    let decision!: (request: FriendRequestDecision) => void
    const stop = vi.fn(); const publish = vi.fn(async (_state: FriendRequestSnapshot) => true)
    const subscribe = vi.fn((callback: typeof decision) => { decision = callback; return stop })
    const enabled = ref(true); const scope = effectScope()
    scope.run(() => useControlKFriendRequests(store, enabled, { localIdentityRole: role, friendRequestsPublish: publish, onFriendRequestDecision: subscribe }))
    return { store, enabled, scope, stop, publish, subscribe, decide: (value: FriendRequestDecision) => decision(value) }
  }
  it('subscribes only in the primary and disposes without cloud operations', () => {
    const s = setup('consumer'); expect(s.subscribe).not.toHaveBeenCalled(); s.scope.stop()
  })
  it('publishes existing inbox, routes decisions and clears on disable/disposal', async () => {
    const s = setup(); const state = s.publish.mock.lastCall![0]
    expect(state.requests[0]!.nickname).toBe('@A')
    s.decide({ session: state.session!, id: state.requests[0]!.id, accept: false })
    await Promise.resolve(); expect(s.store.respondFriendRequest).toHaveBeenCalledWith('A', false)
    s.enabled.value = false; expect(s.publish.mock.lastCall![0].requests).toEqual([])
    s.scope.stop(); expect(s.stop).toHaveBeenCalledOnce()
  })
  it('never publishes the old account inbox under the new identity', () => {
    const s = setup(); s.store.meId.value = 'next'
    expect(s.publish.mock.lastCall![0].session).toBeNull()
    s.store.notices.value = []; s.store.inboxAccount.value = 'next'
    expect(s.publish.mock.lastCall![0].requests).toEqual([])
    expect(s.publish.mock.lastCall![0].session).not.toBeNull()
    s.scope.stop()
  })
})
