export function setupAutoSyncController(params: {
  isElectron: boolean
  electronAPI: any
  currentUser: { value: any }
  syncTelemetryFiles: (specificFiles?: any[]) => Promise<any[]>
  onNotify: (results: any[]) => void
  onBeforeAuthReady?: (uid: string) => Promise<void>
  onFilesDetected?: (data: { new: any[]; modified: any[] }) => void
  onInitialRegistry?: (data: { files: any[]; registry: any }) => void
}) {
  const {
    isElectron,
    electronAPI,
    currentUser,
    syncTelemetryFiles,
    onNotify,
    onBeforeAuthReady,
    onFilesDetected,
    onInitialRegistry
  } = params

  if (!isElectron || !electronAPI) return

  electronAPI.onFilesChanged?.(async (data: { new: any[]; modified: any[] }) => {
    const changedFiles = [...(data?.new || []), ...(data?.modified || [])]
    if (changedFiles.length === 0) return
    onFilesDetected?.(data)
    const results = await syncTelemetryFiles(changedFiles)
    onNotify(results)
  })

  electronAPI.onWindowFocused?.(async () => {
    const results = await syncTelemetryFiles()
    onNotify(results)
  })

  electronAPI.onInitialFiles?.(async (data: { files: any[]; registry: any }) => {
    onInitialRegistry?.(data)
    const results = await syncTelemetryFiles()
    onNotify(results)
  })

  let authTriggered = false
  const stop = window.setInterval(async () => {
    const user = currentUser.value
    if (!user || authTriggered) return
    authTriggered = true
    window.clearInterval(stop)
    if (onBeforeAuthReady) {
      await onBeforeAuthReady(user.uid)
    }
    const results = await syncTelemetryFiles()
    onNotify(results)
  }, 500)
}
