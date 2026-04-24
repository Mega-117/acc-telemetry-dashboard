export interface ReprocessTelemetryResult {
  ok?: boolean
  processed?: number
  updated?: number
  skipped?: number
  errors?: number
  bestRulesVersion?: number | null
  error?: string
  stderr?: string
}

function getElectronApi(): any | null {
  if (typeof window === 'undefined') return null
  return (window as any).electronAPI || null
}

function normalizeFilePaths(filePaths?: string[]): string[] {
  if (!Array.isArray(filePaths)) return []
  return Array.from(new Set(filePaths.map((filePath) => String(filePath || '').trim()).filter(Boolean)))
}

export async function reprocessTelemetrySummaries(payload: {
  filePaths?: string[]
} = {}): Promise<ReprocessTelemetryResult | null> {
  const electronAPI = getElectronApi()
  if (!electronAPI?.reprocessTelemetrySummaries) return null
  return await electronAPI.reprocessTelemetrySummaries({
    filePaths: normalizeFilePaths(payload.filePaths)
  })
}

export async function canonicalizeTelemetryPayload(rawPayload: any): Promise<{
  ok?: boolean
  summary?: any
  bestRulesVersion?: number | null
  error?: string
} | null> {
  const electronAPI = getElectronApi()
  if (!electronAPI?.canonicalizeTelemetryPayload) return null
  return await electronAPI.canonicalizeTelemetryPayload(rawPayload)
}
