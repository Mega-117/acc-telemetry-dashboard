import { onBeforeUnmount, watch, type Ref } from 'vue'
import { db } from '~/config/firebase'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { trackedWriteBatch } from '~/composables/useFirebaseTracker'
import {
  CLIENT_HEARTBEAT_INTERVAL_MS,
  buildClientHeartbeatPayload,
  getLatestRuntimeActivityAt,
  shouldSendClientHeartbeat,
  type RuntimeInstallationIdentity,
  type SuiteVersionInfo
} from '~/services/monitoring/clientHeartbeatService'
import { writeClientRuntimeReport } from '~/services/monitoring/clientRuntimeReportingService'
import type { RuntimeBootstrapResult } from '~/services/runtime/runtimeBootstrapCoordinator'
import { createOwnerOperationTracker } from '~/services/sync/ownerOperationTracker'

const CALLER = 'ClientHeartbeat'
const STORAGE_KEY_PREFIX = 'acc_client_heartbeat_'

type ElectronHeartbeatApi = {
  getSuiteVersion?: () => Promise<SuiteVersionInfo | null>
  getRuntimeIdentity?: () => Promise<RuntimeInstallationIdentity | null>
  onWindowFocused?: (callback: () => void) => (() => void) | void
}

function getElectronApi(): ElectronHeartbeatApi | null {
  if (typeof window === 'undefined') return null
  return ((window as any).electronAPI || null) as ElectronHeartbeatApi | null
}

function getStoredHeartbeatAt(uid: string): string | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage.getItem(`${STORAGE_KEY_PREFIX}${uid}`)
}

function storeHeartbeatAt(uid: string, heartbeatAt: string) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(`${STORAGE_KEY_PREFIX}${uid}`, heartbeatAt)
}

export function useClientHeartbeat(options: {
  enabled: Ref<boolean>
  runtimeState: Ref<RuntimeBootstrapResult<unknown>>
  isLeaseCurrent?: (uid: string) => boolean
}) {
  const { currentUser, canEnterApp } = useFirebaseAuth()
  let intervalId: number | null = null
  let unsubscribeWindowFocused: (() => void) | null = null
  let isSending = false
  let sendQueued = false
  let sendQueuedForce = false
  const ownerOperations = createOwnerOperationTracker()

  async function performHeartbeat(force = false): Promise<boolean> {
    const uid = currentUser.value?.uid
    const electronAPI = getElectronApi()
    if (
      !options.enabled.value
      || !uid
      || !canEnterApp.value
      || !electronAPI?.getSuiteVersion
      || !electronAPI?.getRuntimeIdentity
    ) {
      return false
    }
    if (options.isLeaseCurrent && !options.isLeaseCurrent(uid)) return false

    if (isSending) {
      sendQueued = true
      sendQueuedForce = sendQueuedForce || force
      return false
    }

    isSending = true
    try {
      const identity = await electronAPI.getRuntimeIdentity()
      if (options.isLeaseCurrent && !options.isLeaseCurrent(uid)) return false
      const installationId = identity?.installationId
      if (!installationId || identity?.fallback === true) return false
      const nowMs = Date.now()
      const storageOwner = `${uid}_${installationId}`
      const lastHeartbeatAt = getStoredHeartbeatAt(storageOwner)
      const latestRuntimeActivityAt = getLatestRuntimeActivityAt(identity)
      if (!force && !shouldSendClientHeartbeat(
        lastHeartbeatAt,
        nowMs,
        CLIENT_HEARTBEAT_INTERVAL_MS,
        latestRuntimeActivityAt
      )) {
        return false
      }

      const version = await electronAPI.getSuiteVersion()
      if (options.isLeaseCurrent && !options.isLeaseCurrent(uid)) return false
      const heartbeatAt = new Date(nowMs).toISOString()
      const payload = version ? buildClientHeartbeatPayload(version, heartbeatAt, {
        identity,
        runtimeState: options.runtimeState.value
      }) : null
      if (!payload) return false

      await writeClientRuntimeReport({
        db,
        uid,
        payload,
        writeBatchFn: (firestore) => trackedWriteBatch(
          firestore as Parameters<typeof trackedWriteBatch>[0],
          CALLER
        ),
        assertCurrent: options.isLeaseCurrent
          ? () => {
              if (!options.isLeaseCurrent!(uid)) throw new Error('cloud_owner_lease_stale')
            }
          : undefined
      })
      if (options.isLeaseCurrent && !options.isLeaseCurrent(uid)) return false
      storeHeartbeatAt(storageOwner, heartbeatAt)
      console.info('[HEARTBEAT] Client runtime report committed reason=auth_ready')
      return true
    } catch (error: any) {
      console.warn('[HEARTBEAT] Client heartbeat failed:', error?.message || error)
      return false
    } finally {
      isSending = false
      if (sendQueued) {
        const queuedForce = sendQueuedForce
        sendQueued = false
        sendQueuedForce = false
        void sendHeartbeat(queuedForce)
      }
    }
  }

  function sendHeartbeat(force = false): Promise<boolean> {
    return ownerOperations.track(performHeartbeat(force))
  }

  const stopWatch = watch(
    [currentUser, canEnterApp, options.enabled],
    ([user, canEnter, enabled]) => {
      if (user && canEnter && enabled) {
        void sendHeartbeat(true)
      }
    },
    { immediate: true }
  )

  function handleRuntimeActivity() {
    void sendHeartbeat(false)
  }

  if (typeof window !== 'undefined') {
    intervalId = window.setInterval(handleRuntimeActivity, CLIENT_HEARTBEAT_INTERVAL_MS)
    window.addEventListener('online', handleRuntimeActivity)
    const unsubscribe = getElectronApi()?.onWindowFocused?.(handleRuntimeActivity)
    unsubscribeWindowFocused = typeof unsubscribe === 'function' ? unsubscribe : null
  }

  onBeforeUnmount(() => {
    stopWatch()
    if (intervalId !== null) {
      clearInterval(intervalId)
      intervalId = null
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleRuntimeActivity)
    }
    unsubscribeWindowFocused?.()
    unsubscribeWindowFocused = null
  })

  return {
    sendHeartbeat,
    waitForIdle: () => ownerOperations.drain()
  }
}
