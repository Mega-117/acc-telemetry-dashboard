import { computed, readonly, shallowRef, type ComputedRef } from 'vue'
import {
  deriveRuntimeUiModel,
  type RuntimeUiCapabilityGate,
  type RuntimeUiCapabilityName
} from '~/services/runtime/rendererRuntimeBootstrapAdapter'
import type {
  RuntimeWindowElectronApi,
  RuntimeWindowSnapshot
} from '~/services/runtime/runtimeWindowBridge'

export function createRuntimeCapabilityStore() {
  const snapshot = shallowRef<RuntimeWindowSnapshot | null>(null)
  const source = shallowRef<'electron' | 'browser'>('browser')
  const model = computed(() => deriveRuntimeUiModel(snapshot.value, source.value))
  let consumers = 0
  let unsubscribe: (() => void) | null = null
  let connectedApi: RuntimeWindowElectronApi | null = null

  function applySnapshot(value: RuntimeWindowSnapshot | null | undefined) {
    if (value?.schemaVersion === 1) snapshot.value = value
  }

  function connect(api: RuntimeWindowElectronApi | null | undefined): () => void {
    consumers += 1
    const isElectronConsumer = (
      api?.runtimeBootstrapRole === 'consumer'
      || api?.runtimeBootstrapRole === 'owner'
    )
      && typeof api.getRuntimeBootstrapState === 'function'
    source.value = isElectronConsumer ? 'electron' : 'browser'

    if (isElectronConsumer && !connectedApi) {
      connectedApi = api
      unsubscribe = api.onRuntimeBootstrapState?.(applySnapshot) || null
      void api.getRuntimeBootstrapState?.()
        .then(applySnapshot)
        .catch(() => {
          snapshot.value = null
        })
    }

    let released = false
    return () => {
      if (released) return
      released = true
      consumers = Math.max(0, consumers - 1)
      if (consumers > 0) return
      unsubscribe?.()
      unsubscribe = null
      connectedApi = null
      snapshot.value = null
      source.value = 'browser'
    }
  }

  function gate(name: RuntimeUiCapabilityName): ComputedRef<RuntimeUiCapabilityGate> {
    return computed(() => model.value.gates[name])
  }

  return {
    snapshot: readonly(snapshot),
    source: readonly(source),
    model,
    gate,
    connect
  }
}

const runtimeCapabilityStore = createRuntimeCapabilityStore()

function getRuntimeElectronApi(): RuntimeWindowElectronApi | null {
  if (typeof window === 'undefined') return null
  return (window as typeof window & { electronAPI?: RuntimeWindowElectronApi }).electronAPI || null
}

export function useRuntimeCapabilityGate() {
  return {
    ...runtimeCapabilityStore,
    connect: () => runtimeCapabilityStore.connect(getRuntimeElectronApi())
  }
}
