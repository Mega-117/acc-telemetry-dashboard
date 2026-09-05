import { computed, ref } from 'vue'
import { withFirebaseScenario } from '~/composables/useFirebaseTracker'
import {
  completeOwnerDataMaintenanceAfterLocalSync,
  describeOwnerMaintenanceError,
  runOwnerDataMaintenanceGate,
  type OwnerDataMaintenancePhase,
  type OwnerDataMaintenanceProgress,
  type OwnerDataMaintenanceReport,
  type OwnerDataMaintenanceStatus
} from '~/services/sync/ownerDataMaintenanceService'

const status = ref<OwnerDataMaintenanceStatus>('idle')
const phase = ref<OwnerDataMaintenancePhase>('idle')
const progress = ref(0)
const message = ref('')
const error = ref<string | null>(null)
const report = ref<OwnerDataMaintenanceReport | null>(null)
let browserOwner: string | null = null
let browserGeneration = 0
let browserFlight: Promise<OwnerDataMaintenanceReport | null> | null = null

function setBrowserOwner(uid: string | null) {
  if (browserOwner === uid) return
  browserOwner = uid
  browserGeneration++
  browserFlight = null
  resetMaintenanceState()
}

export function shouldProjectMaintenanceProgress(
  presentationMode: 'foreground' | 'background',
  nextStatus: OwnerDataMaintenanceStatus
): boolean {
  return presentationMode === 'foreground'
    || nextStatus === 'completed'
    || nextStatus === 'failed'
    || nextStatus === 'skipped'
}

function resetMaintenanceState() {
  status.value = 'idle'
  phase.value = 'idle'
  progress.value = 0
  message.value = ''
  error.value = null
  report.value = null
}

export function useOwnerDataMaintenance() {
  const isRunning = computed(() => status.value === 'checking' || status.value === 'running' || status.value === 'sync_pending')
  const blocksSync = computed(() => status.value === 'checking' || status.value === 'running')

  async function runGate(uid: string, options: {
    electronAPI?: any
    force?: boolean
    presentationMode?: 'foreground' | 'background'
    onProgress?: (progress: OwnerDataMaintenanceProgress) => void
    assertActive?: () => void
  } = {}) {
    return runOwnerDataMaintenanceGate({
      uid,
      electronAPI: options.electronAPI,
      force: options.force,
      assertActive: options.assertActive,
      onProgress: (next) => {
        options.assertActive?.()
        if (shouldProjectMaintenanceProgress(options.presentationMode || 'foreground', next.status)) {
          status.value = next.status
          phase.value = next.phase
          progress.value = next.progress
          message.value = next.message
          error.value = next.error || null
          if (next.report) report.value = next.report
        }
        options.onProgress?.(next)
      }
    })
  }

  // Browser entry/retry owns error containment. Electron keeps its rejecting
  // gate contract so failed maintenance cannot be mistaken for a sync permit.
  function runBrowserGate(uid: string): Promise<OwnerDataMaintenanceReport | null> {
    if (uid !== browserOwner) return Promise.resolve(null)
    if (browserFlight) return browserFlight
    const generation = browserGeneration
    const isActive = () => generation === browserGeneration && uid === browserOwner
    const assertActive = () => {
      if (!isActive()) throw new Error('cloud_owner_lease_stale')
    }
    const attempt = Promise.resolve().then(() => {
      assertActive()
      return withFirebaseScenario('app.dashboard.maintenanceGate', { userId: uid }, () => runGate(uid, { assertActive }))
    }).catch((failure: unknown) => {
      if (isActive()) {
        status.value = 'failed'
        phase.value = 'failed'
        progress.value = 0
        error.value = describeOwnerMaintenanceError(failure).message
        message.value = error.value
        report.value = null
      }
      return null
    }).finally(() => {
      if (browserFlight === attempt) browserFlight = null
    })
    browserFlight = attempt
    return attempt
  }

  async function completeAfterLocalSync(uid: string, options: { assertActive?: () => void } = {}) {
    return completeOwnerDataMaintenanceAfterLocalSync({
      uid,
      assertActive: options.assertActive,
      onProgress: (next) => {
        status.value = next.status
        phase.value = next.phase
        progress.value = next.progress
        message.value = next.message
        error.value = next.error || null
        if (next.report) report.value = next.report
      }
    })
  }

  return {
    status,
    phase,
    progress,
    message,
    error,
    report,
    isRunning,
    blocksSync,
    runGate,
    runBrowserGate,
    setBrowserOwner,
    completeAfterLocalSync,
    resetMaintenanceState
  }
}
