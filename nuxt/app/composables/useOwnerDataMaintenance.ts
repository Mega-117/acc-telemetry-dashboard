import { computed, ref } from 'vue'
import {
  completeOwnerDataMaintenanceAfterLocalSync,
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
    completeAfterLocalSync,
    resetMaintenanceState
  }
}
