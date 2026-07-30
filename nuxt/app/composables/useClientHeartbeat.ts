import { onBeforeUnmount, watch, type Ref } from 'vue'
import { db } from '~/config/firebase'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { trackedSetDoc } from '~/composables/useFirebaseTracker'
import {
  CLIENT_HEARTBEAT_INTERVAL_MS,
  buildClientHeartbeatPayload,
  shouldSendClientHeartbeat,
  type RuntimeInstallationIdentity,
  type SuiteVersionInfo
} from '~/services/monitoring/clientHeartbeatService'
import { writeClientRuntimeReport } from '~/services/monitoring/clientRuntimeReportingService'
import type { RuntimeBootstrapResult } from '~/services/runtime/runtimeBootstrapCoordinator'

const CALLER = 'ClientHeartbeat'
const STORAGE_KEY_PREFIX = 'acc_client_heartbeat_'

type ElectronHeartbeatApi = {
  getSuiteVersion?: () => Promise<SuiteVersionInfo | null>
  getRuntimeIdentity?: () => Promise<RuntimeInstallationIdentity | null>
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
}) {
  const { currentUser, canEnterApp } = useFirebaseAuth()
  let intervalId: number | null = null
  let isSending = false

  async function sendHeartbeat(force = false): Promise<boolean> {
    const uid = currentUser.value?.uid
    const electronAPI = getElectronApi()
    if (
      !options.enabled.value
      || !uid
      || !canEnterApp.value
      || !electronAPI?.getSuiteVersion
      || !electronAPI?.getRuntimeIdentity
      || isSending
    ) {
      return false
    }

    isSending = true
    try {
      const identity = await electronAPI.getRuntimeIdentity()
      const installationId = identity?.installationId
      if (!installationId || identity?.fallback === true) return false
      const nowMs = Date.now()
      const storageOwner = `${uid}_${installationId}`
      if (!force && !shouldSendClientHeartbeat(getStoredHeartbeatAt(storageOwner), nowMs)) {
        return false
      }

      const version = await electronAPI.getSuiteVersion()
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
        setDocFn: (ref, data, writeOptions) => trackedSetDoc(
          ref as Parameters<typeof trackedSetDoc>[0],
          data,
          writeOptions as { merge: true },
          CALLER
        )
      })
      storeHeartbeatAt(storageOwner, heartbeatAt)
      return true
    } catch (error: any) {
      console.warn('[HEARTBEAT] Client heartbeat failed:', error?.message || error)
      return false
    } finally {
      isSending = false
    }
  }

  const stopWatch = watch(
    [currentUser, canEnterApp, options.enabled],
    ([user, canEnter, enabled]) => {
      if (user && canEnter && enabled) {
        void sendHeartbeat(false)
      }
    },
    { immediate: true }
  )

  if (typeof window !== 'undefined') {
    intervalId = window.setInterval(() => {
      void sendHeartbeat(false)
    }, CLIENT_HEARTBEAT_INTERVAL_MS)
  }

  onBeforeUnmount(() => {
    stopWatch()
    if (intervalId !== null) {
      clearInterval(intervalId)
      intervalId = null
    }
  })

  return {
    sendHeartbeat
  }
}
