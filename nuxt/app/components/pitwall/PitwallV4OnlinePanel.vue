<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import type { usePitwallRoom } from '~/composables/usePitwallRoom'
import { boundPitwallStrategy } from '~/services/pitwall/pitwallLink'
import { usePitwallApplicationMethod } from '~/composables/usePitwallApplicationMethod'
const props = defineProps<{ port?: ReturnType<typeof usePitwallRoom> }>()
// Public assets share Nuxt's deployment base, including static hosted builds.
const formUrl = `${useRuntimeConfig().app.baseURL}mfd-v4-online.html`
const { v4Drafts } = usePitwallApplicationMethod()
const draftKey = computed(() => JSON.stringify([props.port?.selectedRoomId?.value, props.port?.selectedTargetUid?.value]))
const v4Draft = computed({
  get: () => v4Drafts.value[draftKey.value] ?? null,
  set: value => { v4Drafts.value[draftKey.value] = value },
})
const frame = ref<HTMLIFrameElement | null>(null)
const frameReady = ref(false)
type LocalIdentity = { ok: boolean, key?: string, reason?: string, drivers?: Array<{ driverIndex: number, firstName: string, lastName: string }> }
const identity = ref<LocalIdentity | null>(null)
const selectedIdentity = ref<number | null>(null)
const localApi = typeof window === 'undefined' ? null : (window as unknown as { electronAPI?: { pitwallV4Identity?: (request: unknown) => Promise<LocalIdentity> } }).electronAPI
async function associate(save = false) {
  if (busy.value || !localApi?.pitwallV4Identity) return
  try { identity.value = await localApi.pitwallV4Identity(save
    ? { action: 'associate', key: identity.value?.key, driverIndex: selectedIdentity.value }
    : { action: 'status' }) }
  catch { identity.value = { ok: false, reason: 'Identità locale non disponibile.' } }
}
const error = ref('')
const busy = computed(() => props.port?.sending.value || ['pending', 'applying'].includes(props.port?.orderStatus.value ?? ''))
const car = computed(() => boundPitwallStrategy(props.port?.carSnapshot.value?.strategy, ''))
const reason = computed(() => !props.port?.canSend.value ? props.port?.sendReadiness.value.reason || 'Seleziona una stanza con un solo pilota disponibile.'
  : !car.value?.applicationMethods?.includes('mfd-v4') ? 'Il PC del pilota non annuncia V4 online.'
    : !car.value.mfdV4?.ready ? car.value.mfdV4?.reason || 'V4 non disponibile sul PC del pilota.' : null)
const outcome = computed(() => props.port?.orderMethod.value === 'mfd-v4'
  ? [props.port.orderDiary?.value, props.port.orderReason.value, ...Object.entries(props.port.orderFields.value).map(([key, value]) => `${key}: ${JSON.stringify(value)}`)].filter(Boolean).join('\n') : '')
function publish() {
  if (!frameReady.value) return
  // The room and draft contain nested Vue proxies, which postMessage cannot clone.
  // This boundary carries JSON data only, like the remote strategy contract.
  const snapshot = { channel: 'mfd-v4-online', type: 'snapshot', value: {
    ready: !reason.value, reason: error.value || reason.value, busy: !!busy.value,
    contextId: car.value?.mfdV4?.contextId, strategy: car.value,
    crew: props.port?.carSnapshot.value?.crew || [], draft: v4Draft.value, outcome: outcome.value,
  } }
  frame.value?.contentWindow?.postMessage(JSON.parse(JSON.stringify(snapshot)), '*')
}
async function message(event: MessageEvent) {
  if (!frame.value?.contentWindow || event.source !== frame.value.contentWindow || event.data?.channel !== 'mfd-v4-online') return
  if (event.data.type === 'ready') { frameReady.value = true; publish(); return }
  if (event.data.type === 'draft' && !busy.value) {
    if (event.data.value && JSON.stringify(event.data.value).length < 4000) v4Draft.value = event.data.value
    return
  }
  if (event.data.type !== 'submit' || busy.value || reason.value || !props.port) return
  error.value = ''
  try {
    const plan = event.data.value
    if (!plan || typeof plan !== 'object' || JSON.stringify(plan).length > 4000 || plan.contextId !== car.value?.mfdV4?.contextId) throw new Error('Contesto V4 cambiato: controlla il destinatario.')
    const sent = await props.port.sendPlan({ method: 'mfd-v4', mfdV4: plan })
    if (!sent) error.value = props.port.lastError.value || props.port.orderReason.value || 'Invio non riuscito.'
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Invio non riuscito.' }
  finally { publish() }
}
watch(draftKey, () => { frameReady.value = false; error.value = '' }, { flush: 'sync' })
watch([car, busy, reason, outcome], publish)
onMounted(() => window.addEventListener('message', message))
onBeforeUnmount(() => window.removeEventListener('message', message))
</script>
<template>
  <div>
    <p>Destinatario: <strong>{{ port?.executorLabel.value || 'Pilota non disponibile' }}</strong></p>
    <p role="status">{{ error || reason || 'V4 pronta sul PC del pilota.' }}</p>
    <details v-if="localApi?.pitwallV4Identity">
      <summary>Identità sul PC del pilota</summary>
      <p>Solo se il nome locale di ACC è ambiguo, indica a quale pilota appartiene questo PC.</p>
      <button type="button" :disabled="busy" @click="associate()">Leggi equipaggio locale</button>
      <p role="status">{{ identity?.reason }}</p>
      <template v-if="identity?.drivers?.length">
        <select v-model="selectedIdentity" aria-label="Pilota di questo PC" :disabled="busy">
          <option :value="null">Scegli il tuo pilota</option>
          <option v-for="driver in identity.drivers" :key="driver.driverIndex" :value="driver.driverIndex">{{ driver.firstName }} {{ driver.lastName }}</option>
        </select>
        <button type="button" :disabled="busy || selectedIdentity === null" @click="associate(true)">Conferma associazione locale</button>
      </template>
    </details>
    <iframe :key="draftKey" ref="frame" title="Strategia V4 online" :src="formUrl" sandbox="allow-scripts" class="v4-frame" />
  </div>
</template>
<style scoped>
.v4-frame { display: block; width: 100%; height: 950px; border: 1px solid #3d4650; background: #0c0e10; }
</style>
