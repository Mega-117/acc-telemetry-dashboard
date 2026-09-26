<script setup lang="ts">
import { watch } from 'vue'
import PitwallV4OnlinePanel from './PitwallV4OnlinePanel.vue'
import { usePitwallApplicationMethod, MFD_V4_METHOD } from '~/composables/usePitwallApplicationMethod'
import type { usePitwallRoom } from '~/composables/usePitwallRoom'
const props = defineProps<{ port?: ReturnType<typeof usePitwallRoom> }>()
const { method } = usePitwallApplicationMethod()
method.value = MFD_V4_METHOD
// Preserve the existing draft isolation while the V4 form is displayed.
watch(() => props.port, port => {
  if (port) port.draftSuspended.value = true
}, { immediate: true })
</script>
<template>
  <PitwallV4OnlinePanel :port="port" />
</template>
