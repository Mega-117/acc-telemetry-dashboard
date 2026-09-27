import { onScopeDispose, watch, type Ref } from 'vue'
import { createFriendRequestQueue, type FriendRequestBridge } from '~/services/pitwall/friendRequestQueue'
import type { PitwallStore } from '~/composables/usePitwallStore'

/** Reuses the app's inbox subscription; overlay renderers never start cloud jobs. */
export function useControlKFriendRequests(store: Pick<PitwallStore, 'notices' | 'people' | 'meId'> & {
  inboxAccount: Ref<string | null>
  respondFriendRequest: (personId: string, accept: boolean) => Promise<boolean>
}, enabled: Ref<boolean>, api?: FriendRequestBridge) {
  if (!api && typeof window !== 'undefined') api = (window as Window & { electronAPI?: FriendRequestBridge }).electronAPI
  if (api?.localIdentityRole !== 'primary' || !api.friendRequestsPublish || !api.onFriendRequestDecision) return
  const bridge = api
  const queue = createFriendRequestQueue({
    publish: state => { void bridge.friendRequestsPublish!(state).catch(() => {}) },
    respond: (id, accept) => store.respondFriendRequest(id, accept),
    token: () => crypto.randomUUID(),
  })
  const unsubscribe = bridge.onFriendRequestDecision!(decision => { void queue.decide(decision) })
  const stop = watch(() => ({
    uid: enabled.value && store.inboxAccount.value === store.meId.value ? store.meId.value : null,
    incoming: store.notices.value.filter(row => row.kind === 'request').map(row => ({
      personId: row.personId,
      nickname: store.people.value.find(person => person.id === row.personId)?.handle || 'Pilota',
    })),
  }), ({ uid, incoming }) => queue.sync(uid, incoming), { immediate: true, flush: 'sync' })
  onScopeDispose(() => { stop(); unsubscribe(); queue.sync(null, []) })
}
