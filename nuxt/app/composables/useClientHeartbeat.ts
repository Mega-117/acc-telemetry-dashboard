import { onBeforeUnmount, watch, type Ref } from 'vue'
import { db } from '~/config/firebase'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { trackedWriteBatch } from '~/composables/useFirebaseTracker'
import {
  buildClientHeartbeatPayload,
  isRuntimeReportDue,
  runtimeReportSignature,
  type RuntimeReportReceipt,
  type RuntimeInstallationIdentity,
  type SuiteVersionInfo
} from '~/services/monitoring/clientHeartbeatService'
import { writeClientRuntimeReport } from '~/services/monitoring/clientRuntimeReportingService'
import { loadOwnerDocument, peekOwnerDocument, rememberOwnerDocumentPatch } from '~/repositories/ownerDocumentRepository'
import type { RuntimeBootstrapResult } from '~/services/runtime/runtimeBootstrapCoordinator'
import { createOwnerOperationTracker } from '~/services/sync/ownerOperationTracker'

const CALLER = 'ClientHeartbeat'
const STORAGE_KEY_PREFIX = 'acc_client_heartbeat_'

const memoryReceipts = new Map<string, RuntimeReportReceipt>()
/** Clear memory only: persisted receipts deliberately survive renderer reload. */
export function resetForcedHeartbeatsForTest() { memoryReceipts.clear() }

type ElectronHeartbeatApi = {
  getSuiteVersion?: () => Promise<SuiteVersionInfo | null>
  getRuntimeIdentity?: () => Promise<RuntimeInstallationIdentity | null>
  onWindowFocused?: (callback: () => void) => (() => void) | void
}

function getElectronApi(): ElectronHeartbeatApi | null {
  if (typeof window === 'undefined') return null
  return ((window as any).electronAPI || null) as ElectronHeartbeatApi | null
}

function readReceipt(owner: string): RuntimeReportReceipt | null {
  if (memoryReceipts.has(owner)) return memoryReceipts.get(owner)!
  try {
    const value = JSON.parse(localStorage.getItem(`${STORAGE_KEY_PREFIX}v2_${owner}`) || 'null')
    return value && typeof value.version === 'string' && typeof value.health === 'string'
      && typeof value.sentAt === 'number' ? value : null
  } catch { return null }
}
function saveReceipt(owner: string, receipt: RuntimeReportReceipt) {
  memoryReceipts.set(owner, receipt)
  try { localStorage.setItem(`${STORAGE_KEY_PREFIX}v2_${owner}`, JSON.stringify(receipt)) } catch { /* memory fallback */ }
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
  const retryByOwner = new Map<string, { attempts: number; nextAt: number }>()
  const ownerOperations = createOwnerOperationTracker()
  const isCurrent = (uid: string) => options.enabled.value && canEnterApp.value
    && currentUser.value?.uid === uid && (!options.isLeaseCurrent || options.isLeaseCurrent(uid))
  function retryState(owner: string) {
    if (retryByOwner.has(owner)) return retryByOwner.get(owner)
    try {
      const value = JSON.parse(localStorage.getItem(`${STORAGE_KEY_PREFIX}retry_${owner}`) || 'null')
      if (value && Number.isFinite(value.nextAt) && Number.isFinite(value.attempts)
        && value.nextAt <= Date.now() + 3_600_000) return value as { attempts: number; nextAt: number }
    } catch { /* unavailable storage */ }
    return undefined
  }
  function persistRetry(owner: string, value: { attempts: number; nextAt: number } | null) {
    if (value) retryByOwner.set(owner, value)
    else retryByOwner.delete(owner)
    try { localStorage.setItem(`${STORAGE_KEY_PREFIX}retry_${owner}`, JSON.stringify(value)) } catch { /* memory fallback */ }
  }

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
    if (!isCurrent(uid)) return false

    if (isSending) {
      sendQueued = true
      sendQueuedForce = sendQueuedForce || force
      return false
    }

    isSending = true
    let failedOwner: string | null = null
    try {
      const identity = await electronAPI.getRuntimeIdentity()
      if (!isCurrent(uid)) return false
      const installationId = identity?.installationId
      if (!installationId || identity?.fallback === true) return false
      const nowMs = Date.now()
      const storageOwner = `${uid}_${installationId}`
      failedOwner = storageOwner
      const retry = retryState(storageOwner)
      if (retry && nowMs < retry.nextAt) return false
      const version = await electronAPI.getSuiteVersion()
      if (!isCurrent(uid)) return false
      const heartbeatAt = new Date(nowMs).toISOString()
      const payload = version ? buildClientHeartbeatPayload(version, heartbeatAt, {
        identity,
        runtimeState: options.runtimeState.value
      }) : null
      if (!payload) return false
      if (!isRuntimeReportDue(readReceipt(storageOwner), payload, nowMs)) return false

      const mayWriteProfile = options.runtimeState.value.capabilities.cloudWrite?.state === 'allowed'
      let previousUser = mayWriteProfile ? peekOwnerDocument(uid)?.data : null
      if (mayWriteProfile && !previousUser) previousUser = (await loadOwnerDocument(uid, { caller: CALLER })).data
      if (!isCurrent(uid)) return false
      const report = await writeClientRuntimeReport({
        db,
        uid,
        payload,
        previousUser,
        writeBatchFn: (firestore) => trackedWriteBatch(
          firestore as Parameters<typeof trackedWriteBatch>[0],
          CALLER
        ),
        assertCurrent: () => { if (!isCurrent(uid)) throw new Error('cloud_owner_lease_stale') }
      })
      if (!isCurrent(uid)) return false
      // PIP-442: stessi campi scritti su `users/{uid}`; la copia condivisa resta allineata
      // senza rileggere (la revisione delle proiezioni non cambia).
      if (report.metadataChanged) rememberOwnerDocumentPatch(uid, {
        suiteVersion: payload.suiteVersion,
        suiteVersionDetail: payload.suiteVersionDetail,
        suiteVersionUpdatedAt: payload.suiteVersionUpdatedAt,
        clientRuntime: payload.clientRuntime
      })
      saveReceipt(storageOwner, { ...runtimeReportSignature(payload), sentAt: nowMs })
      persistRetry(storageOwner, null)
      console.info('[HEARTBEAT] Runtime report committed')
      return true
    } catch (error: any) {
      if (failedOwner && (!options.isLeaseCurrent || options.isLeaseCurrent(uid))) {
        const attempts = (retryState(failedOwner)?.attempts || 0) + 1
        const delay = [60_000, 300_000, 900_000, 3_600_000][Math.min(attempts - 1, 3)]!
        persistRetry(failedOwner, { attempts, nextAt: Date.now() + delay })
      }
      console.warn('[HEARTBEAT] Client heartbeat failed:' , error?.message || error)
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
    [currentUser, canEnterApp, options.enabled, () => options.runtimeState.value.phase],
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
    intervalId = window.setInterval(handleRuntimeActivity, 60_000)
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
