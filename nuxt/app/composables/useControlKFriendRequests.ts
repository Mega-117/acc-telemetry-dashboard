import { onScopeDispose, watch, type Ref } from 'vue'
import { createFriendRequestQueue, type FriendRequestBridge } from '~/services/pitwall/friendRequestQueue'
import type { PitwallStore } from '~/composables/usePitwallStore'

/** Reuses the app's inbox subscription; overlay renderers never start cloud jobs. */
export function useControlKFriendRequests(store: Pick<PitwallStore, 'notices' | 'people' | 'meId'> & {
  inboxAccount: Ref<string | null>
  respondFriendRequest: (personId: string, accept: boolean) => Promise<boolean>
}, enabled: Ref<boolean>, api?: FriendRequestBridge, localReady: Ref<boolean> = enabled) {
  if (!api && typeof window !== 'undefined') api = (window as Window & { electronAPI?: FriendRequestBridge }).electronAPI
  if (api?.localIdentityRole !== 'primary' || !api.friendRequestsPublish || !api.onFriendRequestDecision) return
  const bridge = api
  const queue = createFriendRequestQueue({
    publish: state => bridge.friendRequestsPublish!(state),
    respond: (id, accept) => store.respondFriendRequest(id, accept),
    token: () => crypto.randomUUID(),
  })
  queue.setReady(false)
  const unsubscribe = bridge.onFriendRequestDecision!(decision => { void queue.decide(decision) })
  const stop = watch(() => ({
    ready: localReady.value,
    uid: enabled.value && store.inboxAccount.value === store.meId.value ? store.meId.value : null,
    incoming: store.notices.value.filter(row => row.kind === 'request').map(row => ({
      personId: row.personId,
      nickname: store.people.value.find(person => person.id === row.personId)?.handle || 'Pilota',
    })),
  }), ({ uid, incoming, ready }) => {
    // Freeze publication until the current snapshot and local capability agree.
    if (!ready) queue.setReady(false)
    queue.sync(uid, incoming)
    queue.setReady(ready)
  }, { immediate: true, flush: 'sync' })
  onScopeDispose(() => { stop(); unsubscribe(); queue.sync(null, []); queue.dispose() })
}
