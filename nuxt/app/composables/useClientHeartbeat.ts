import { onBeforeUnmount, watch, type Ref } from 'vue'
import { doc } from 'firebase/firestore'
import { db } from '~/config/firebase'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { trackedSetDoc } from '~/composables/useFirebaseTracker'
import { updatePilotDirectoryActivity } from '~/services/pilotDirectoryProjectionService'
import {
  CLIENT_HEARTBEAT_INTERVAL_MS,
  buildClientHeartbeatPayload,
  shouldSendClientHeartbeat,
  type SuiteVersionInfo
} from '~/services/monitoring/clientHeartbeatService'

const CALLER = 'ClientHeartbeat'
const STORAGE_KEY_PREFIX = 'acc_client_heartbeat_'

type ElectronHeartbeatApi = {
  getSuiteVersion?: () => Promise<SuiteVersionInfo | null>
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

export function useClientHeartbeat(options: { enabled: Ref<boolean> }) {
  const { currentUser, canEnterApp } = useFirebaseAuth()
  let intervalId: number | null = null
  let isSending = false

  async function sendHeartbeat(force = false): Promise<boolean> {
    const uid = currentUser.value?.uid
    const electronAPI = getElectronApi()
    if (!options.enabled.value || !uid || !canEnterApp.value || !electronAPI?.getSuiteVersion || isSending) {
      return false
    }

    const nowMs = Date.now()
    if (!force && !shouldSendClientHeartbeat(getStoredHeartbeatAt(uid), nowMs)) {
      return false
    }

    isSending = true
    try {
      const version = await electronAPI.getSuiteVersion()
      const heartbeatAt = new Date(nowMs).toISOString()
      const payload = version ? buildClientHeartbeatPayload(version, heartbeatAt) : null
      if (!payload) return false

      await trackedSetDoc(doc(db, `users/${uid}`), payload, { merge: true }, CALLER)
      await updatePilotDirectoryActivity({
        db,
        uid,
        fields: {
          suiteVersion: payload.suiteVersion,
          suiteVersionUpdatedAt: heartbeatAt,
          clientChannel: payload.clientRuntime.channel,
          clientUpdateState: payload.clientRuntime.updateState,
          clientLastHeartbeatAt: heartbeatAt
        },
        setDocFn: (ref, data, writeOptions) => trackedSetDoc(ref, data, writeOptions, CALLER)
      })
      storeHeartbeatAt(uid, heartbeatAt)
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
