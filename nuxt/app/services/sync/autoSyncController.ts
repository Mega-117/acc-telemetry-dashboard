import type { TelemetryFileDescriptor } from './syncScanService'

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

  electronAPI.onFilesChanged?.(async (data: { new: any[]; modified: any[] }) => {
    const changedFiles = [...(data?.new || []), ...(data?.modified || [])]
    if (changedFiles.length === 0) return
    await handleTrigger('filesChanged', { files: changedFiles })
  })

  electronAPI.onWindowFocused?.(async () => {
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
