<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useElectronSync } from '~/composables/useElectronSync'
import { useClientHeartbeat } from '~/composables/useClientHeartbeat'
import { publishRuntimeWindowSnapshot } from '~/services/runtime/runtimeWindowBridge'

const { runtimeBootstrapState, setupAutoSync, syncTelemetryFiles } = useElectronSync()
useClientHeartbeat({
  enabled: computed(() => true),
  runtimeState: runtimeBootstrapState
})
let unsubscribeCommand: (() => void) | null = null

function getElectronApi() {
  if (typeof window === 'undefined') return null
  return (window as any).electronAPI || null
}

watch(runtimeBootstrapState, (state) => {
  void publishRuntimeWindowSnapshot(getElectronApi(), state)
}, { deep: true })

onMounted(() => {
  const api = getElectronApi()
  setupAutoSync()
  void publishRuntimeWindowSnapshot(api, runtimeBootstrapState.value)
  unsubscribeCommand = api?.onRuntimeBootstrapCommand?.(async (command: {
    schemaVersion?: number
    type?: string
  }) => {
    if (command?.schemaVersion !== 1 || command?.type !== 'manual-sync') return
    await syncTelemetryFiles()
  }) || null
})

onBeforeUnmount(() => {
  unsubscribeCommand?.()
  unsubscribeCommand = null
})
</script>

<template>
  <div aria-hidden="true" />
</template>
