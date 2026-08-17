import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import { useClientHeartbeat } from '~/composables/useClientHeartbeat'
import { useElectronSync } from '~/composables/useElectronSync'
import {
  createCloudOwnerLeaseController,
  type CloudOwnerLease
} from '~/services/sync/autoSyncController'
import {
  isRuntimeWindowOwner,
  publishRuntimeWindowSnapshot,
  type RuntimeWindowElectronApi
} from '~/services/runtime/runtimeWindowBridge'

type PrimaryCloudOwnerApi = RuntimeWindowElectronApi & {
  localIdentityRole?: 'primary' | 'consumer'
}

function getElectronApi(): PrimaryCloudOwnerApi | null {
  if (typeof window === 'undefined') return null
  return ((window as any).electronAPI || null) as PrimaryCloudOwnerApi | null
}

export function usePrimaryCloudOwner(options: {
  currentUser: Ref<{ uid: string } | null>
  canEnterApp: Ref<boolean>
}) {
  const sync = useElectronSync()
  const leases = createCloudOwnerLeaseController()
  const activeLease = ref<CloudOwnerLease | null>(null)
  const readyGeneration = ref<number | null>(null)
  let disposeSync: (() => void) | null = null
  let transitionRevision = 0

  const isExactPrimaryOwner = computed(() => {
    const api = getElectronApi()
    return api?.localIdentityRole === 'primary'
      && isRuntimeWindowOwner(api)
  })
  const currentUid = computed(() => options.currentUser.value?.uid || null)

  const jobsEnabled = computed(() => {
    const active = activeLease.value
    return !!active
      && readyGeneration.value === active.generation
      && isExactPrimaryOwner.value
      && options.canEnterApp.value
      && options.currentUser.value?.uid === active.uid
      && sync.runtimeBootstrapState.value.phase === 'ready'
  })

  function isLeaseCurrent(uid: string): boolean {
    const api = getElectronApi()
    if (!api) return true // Preserve the existing browser branch.
    const active = activeLease.value
    return !!active
      && active.uid === uid
      && isExactPrimaryOwner.value
      && leases.isCurrent(active)
  }

  function revokeCurrentOwner() {
    readyGeneration.value = null
    leases.revoke()
    activeLease.value = null
    disposeSync?.()
    disposeSync = null
  }

  const heartbeat = useClientHeartbeat({
    enabled: jobsEnabled,
    runtimeState: sync.runtimeBootstrapState,
    isLeaseCurrent
  })
  const additionalDrainers = new Set<() => Promise<void>>()

  async function waitForOwnerJobsIdle() {
    await Promise.allSettled([
      sync.waitForOwnerIdle(),
      heartbeat.waitForIdle(),
      ...[...additionalDrainers].map((drain) => drain())
    ])
  }

  function registerOwnerDrainer(drain: () => Promise<void>) {
    additionalDrainers.add(drain)
    return () => additionalDrainers.delete(drain)
  }

  const stopOwnerWatch = watch(
    [currentUid, options.canEnterApp, isExactPrimaryOwner],
    ([uid, canEnter, exactOwner]) => {
      const revision = ++transitionRevision
      revokeCurrentOwner()
      if (!uid || !canEnter || !exactOwner) return

      void (async () => {
        await waitForOwnerJobsIdle()
        if (
          revision !== transitionRevision
          || currentUid.value !== uid
          || !options.canEnterApp.value
          || !isExactPrimaryOwner.value
        ) return

        const lease = leases.start(uid)
        activeLease.value = lease
        disposeSync = sync.setupAutoSync({
          lease,
          isLeaseCurrent: (candidate: CloudOwnerLease) => leases.isCurrent(candidate)
        })
      })()
    },
    { immediate: true, flush: 'sync' }
  )

  const stopStateWatch = watch(
    sync.runtimeBootstrapState,
    (state) => {
      const active = activeLease.value
      console.info(`[PRIMARY_CLOUD_OWNER] phase=${state.phase} lease=${active ? 'active' : 'inactive'}`)
      if (!active || !leases.isCurrent(active)) return
      readyGeneration.value = state.phase === 'ready' ? active.generation : null
      void publishRuntimeWindowSnapshot(getElectronApi(), state).catch((error) => {
        if (leases.isCurrent(active)) {
          console.warn('[SYNC] Primary owner snapshot publish failed:', error)
        }
      })
    },
    { deep: true, flush: 'sync' }
  )

  const stopJobsWatch = watch(jobsEnabled, (enabled) => {
    console.info(`[PRIMARY_CLOUD_OWNER] jobs=${enabled ? 'started' : 'stopped'} reason=${enabled ? 'auth_ready' : 'lease_inactive'}`)
  }, { immediate: true })

  onScopeDispose(() => {
    transitionRevision += 1
    stopOwnerWatch()
    stopStateWatch()
    stopJobsWatch()
    revokeCurrentOwner()
  })

  return {
    jobsEnabled,
    isExactPrimaryOwner,
    isLeaseCurrent,
    registerOwnerDrainer,
    runtimeBootstrapState: sync.runtimeBootstrapState
  }
}
