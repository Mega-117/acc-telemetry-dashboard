<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { isDevToolsHost } from '~/utils/devToolsAccess'
import PitwallV4OnlinePanel from './PitwallV4OnlinePanel.vue'
import { usePitwallApplicationMethod, MFD_V4_METHOD } from '~/composables/usePitwallApplicationMethod'
import type { usePitwallRoom } from '~/composables/usePitwallRoom'
const props = defineProps<{ port?: ReturnType<typeof usePitwallRoom> }>()
const { method } = usePitwallApplicationMethod()
// Resolve after hydration: published pages are generated without a browser host.
const standardAvailable = ref(false)
onMounted(() => { standardAvailable.value = isDevToolsHost() })
const busy = computed(() => props.port?.sending.value || ['pending', 'applying'].includes(props.port?.orderStatus.value ?? ''))
watch(method, value => {
  // This port intentionally exposes refs as its control interface.
  // eslint-disable-next-line vue/no-mutating-props
  if (props.port) props.port.draftSuspended.value = value !== 'standard'
}, { immediate: true })
</script>
<template>
  <section>
    <div role="group" aria-label="Metodo di applicazione" class="methods">
      <button v-if="standardAvailable" type="button" :disabled="busy" :aria-pressed="method === 'standard'" @click="method = 'standard'">Standard</button>
      <button type="button" :disabled="busy" :aria-pressed="method === MFD_V4_METHOD" @click="method = MFD_V4_METHOD">V4 online</button>
    </div>
    <PitwallV4OnlinePanel v-show="method === MFD_V4_METHOD" :port="port" />
  </section>
</template>
<style scoped>
.methods { display: flex; gap: 8px; margin-bottom: 12px; }
button { min-height: 44px; padding: 8px 14px; color: white; background: #111820; border: 1px solid #56616c; border-radius: 5px; }
button[aria-pressed=true] { border-color: #ff6500; }
button:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
</style>
