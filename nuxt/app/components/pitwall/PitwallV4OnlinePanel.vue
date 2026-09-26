<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import type { usePitwallRoom } from '~/composables/usePitwallRoom'
import { canUseDevTools } from '~/utils/devToolsAccess'
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
const frameHeight = ref(1040)
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
const development = ref(false)
const recipientLabel = computed(() => props.port?.availableTargets?.value.find(target => target.uid === props.port?.selectedTargetUid?.value)?.nickname || '')
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
    development: development.value, recipientLabel: recipientLabel.value, ready: !reason.value, reason: error.value || reason.value, busy: !!busy.value,
    contextId: car.value?.mfdV4?.contextId, strategy: car.value,
    crew: props.port?.carSnapshot.value?.crew || [], draft: v4Draft.value, outcome: outcome.value,
  } }
  frame.value?.contentWindow?.postMessage(JSON.parse(JSON.stringify(snapshot)), '*')
}
async function message(event: MessageEvent) {
  if (!frame.value?.contentWindow || event.source !== frame.value.contentWindow || event.data?.channel !== 'mfd-v4-online') return
  if (event.data.type === 'layout-height') {
    const height = event.data.value
    if (typeof height === 'number' && Number.isFinite(height) && height >= 100 && height <= 10000) {
      frameHeight.value = Math.ceil(height)
    }
    return
  }
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
watch(draftKey, () => { frameReady.value = false; frameHeight.value = 1040; error.value = '' }, { flush: 'sync' })
watch([development, recipientLabel, car, busy, reason, outcome, () => props.port?.carSnapshot.value?.crew], publish, { deep: true })
onMounted(() => { development.value = canUseDevTools(); window.addEventListener('message', message) })
onBeforeUnmount(() => window.removeEventListener('message', message))
</script>
<template>
  <div class="v4-online">
    <p v-if="error || (!frameReady && reason)" role="status">{{ error || reason }}</p>
    <p class="v4-recipient">Destinatario strategia <strong>{{ recipientLabel || 'Nessun pilota disponibile' }}</strong></p>
    <details v-if="development" class="v4-tools">
      <summary>Strumenti di sviluppo</summary>
      <label v-if="port?.availableTargets" class="v4-target">
        Destinatario strategia
        <select :value="port.selectedTargetUid.value ?? ''" :disabled="busy"
          @change="port.selectTarget(($event.target as HTMLSelectElement).value || null)">
          <option value="">Seleziona un pilota</option>
          <option v-for="target in port.availableTargets.value" :key="target.uid" :value="target.uid">{{ target.nickname }}</option>
          <option v-if="port.selectedTargetUid.value && !port.availableTargets.value.some(target => target.uid === port?.selectedTargetUid.value)" :value="port.selectedTargetUid.value" disabled>Pilota non disponibile</option>
        </select>
      </label>
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
    </details>
    <iframe :key="draftKey" ref="frame" title="Strategia V4 online" :src="formUrl" sandbox="allow-scripts" class="v4-frame" :style="{ height: `${frameHeight}px` }" />
  </div>
</template>
<style scoped>
.v4-frame { display: block; width: 100%; border: 0; background: transparent; color-scheme: dark; }
.v4-online > details { margin: 12px 0; font-size: 12px; }
.v4-online > p:not(.v4-recipient) { color: #ff6178; font-size: 12px; }

.v4-recipient { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 16px 12px; color: #a9a9b2; font-size: 12px; }
.v4-recipient strong { color: #e8e8eb; font-weight: 600; }
.v4-tools { margin: 0 16px 12px !important; color: #a9a9b2; }
.v4-tools summary { cursor: pointer; }
.v4-target { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin: 12px 0; }
.v4-target select { padding: 8px 12px; color: #e8e8eb; background: #101014; border: 1px solid #ffffff30; }
</style>
