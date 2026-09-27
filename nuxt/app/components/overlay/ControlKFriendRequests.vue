<script setup lang="ts">
import { computed, onMounted, onScopeDispose, ref } from 'vue'
import type { FriendRequestBridge, FriendRequestSnapshot } from '~/services/pitwall/friendRequestQueue'

const props = defineProps<{ api?: FriendRequestBridge | null }>()
const state = ref<FriendRequestSnapshot>({ session: null, requests: [], busy: false, error: null })
const current = computed(() => state.value.requests[0])
const sending = ref(false)
const localError = ref<string | null>(null)
let revision = -1
let disposed = false
let unsubscribe: (() => void) | undefined
function receive(snapshot: FriendRequestSnapshot & { revision?: number }) {
  if (disposed || (snapshot.revision ?? 0) < revision) return
  revision = snapshot.revision ?? 0
  state.value = snapshot
  localError.value = null
}
onMounted(() => {
  unsubscribe = props.api?.onFriendRequestsState?.(receive)
  void props.api?.friendRequestsGet?.().then(receive).catch(() => {})
})
onScopeDispose(() => { disposed = true; unsubscribe?.() })
async function respond(accept: boolean) {
  if (!current.value || !state.value.session || state.value.busy || sending.value) return
  const session = state.value.session
  const id = current.value.id
  sending.value = true
  localError.value = null
  try {
    const result = await props.api?.friendRequestsRespond?.({ session, id, accept })
    if (!result?.accepted && session === state.value.session && id === current.value?.id) {
      localError.value = result?.reason || 'Finestra principale non raggiungibile. Riprova.'
    }
  } catch {
    if (session === state.value.session && id === current.value?.id) localError.value = 'Invio non riuscito. Riprova.'
  } finally { sending.value = false }
}
</script>

<template>
  <section v-if="current" class="control-k-request" aria-label="Richieste di amicizia" :aria-busy="state.busy || sending">
    <div class="control-k-request__heading">
      <span>Richiesta di amicizia</span>
      <span v-if="state.requests.length > 1" class="control-k-request__count">+{{ state.requests.length - 1 }} in attesa</span>
    </div>
    <p class="control-k-request__sender" aria-live="polite">{{ current.nickname }}</p>
    <div class="control-k-request__actions">
      <button type="button" class="launcher-tool-button" :data-overlay-wheel-action="`friend-accept:${current.id}`" :disabled="state.busy || sending" @click="respond(true)">Accetta</button>
      <button type="button" class="launcher-tool-button" :data-overlay-wheel-action="`friend-reject:${current.id}`" :disabled="state.busy || sending" @click="respond(false)">Rifiuta</button>
    </div>
    <p v-if="state.busy || sending" class="control-k-request__status" role="status">Invio risposta…</p>
    <p v-else-if="localError || state.error" class="control-k-request__status control-k-request__error" role="alert">{{ localError || state.error }}</p>
  </section>
</template>

<style scoped>
.control-k-request { margin-top: 14px; border-top: 1px solid #333; padding-top: 12px; text-align: left; }
.control-k-request__heading { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; color: #aaa; font-size: 12px; }
.control-k-request__count { color: #ddd; }
.control-k-request__sender { margin: 8px 0 10px; color: #fff; font-size: 14px; font-weight: 700; overflow-wrap: anywhere; }
.control-k-request__actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.control-k-request__actions button { min-height: 36px; }
.control-k-request__status { font-size: 12px; line-height: 1.4; margin: 8px 0 0; color: #aaa; }
.control-k-request__error { color: #ff929d; }
</style>
