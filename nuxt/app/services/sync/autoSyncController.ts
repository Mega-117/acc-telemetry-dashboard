import type { TelemetryFileDescriptor } from './syncScanService'

const WINDOW_FOCUS_SYNC_THROTTLE_MS = 5000

export function setupAutoSyncController(params: {
  isElectron: boolean
  electronAPI: any
  currentUser: { value: any }
  handleTrigger: (trigger: 'filesChanged' | 'windowFocused' | 'initialFiles' | 'authReady', payload?: {
    files?: TelemetryFileDescriptor[]
    uid?: string
  }) => Promise<void>
  onInitialRegistry?: (data: { files: any[]; registry: any }) => void
}) {
  const {
    isElectron,
    electronAPI,
    currentUser,
    handleTrigger,
    onInitialRegistry
  } = params

  if (!isElectron || !electronAPI) return

  let lastWindowFocusSyncAt = 0

  electronAPI.onFilesChanged?.(async (data: { new: any[]; modified: any[] }) => {
    const changedFiles = [...(data?.new || []), ...(data?.modified || [])]
    if (changedFiles.length === 0) return
    await handleTrigger('filesChanged', { files: changedFiles })
  })

  electronAPI.onWindowFocused?.(async () => {
    const now = Date.now()
    if (now - lastWindowFocusSyncAt < WINDOW_FOCUS_SYNC_THROTTLE_MS) return
    lastWindowFocusSyncAt = now
    await handleTrigger('windowFocused')
  })

  electronAPI.onInitialFiles?.(async (data: { files: any[]; registry: any }) => {
    onInitialRegistry?.(data)
    await handleTrigger('initialFiles')
  })

  let authTriggered = false
  const stop = window.setInterval(async () => {
    const user = currentUser.value
    if (!user || authTriggered) return
    authTriggered = true
    window.clearInterval(stop)
    await handleTrigger('authReady', { uid: user.uid })
  }, 500)
}
