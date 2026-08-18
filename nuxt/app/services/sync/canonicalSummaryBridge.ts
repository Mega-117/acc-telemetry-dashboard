export interface ReprocessTelemetryResult {
  ok?: boolean
  processed?: number
  updated?: number
  skipped?: number
  errors?: number
  bestRulesVersion?: number | null
  error?: string
  stderr?: string
  files?: Array<{ name: string; mtime: number; size: number }>
}

function getElectronApi(): any | null {
  if (typeof window === 'undefined') return null
  return (window as any).electronAPI || null
}

function normalizeFileNames(fileNames?: string[]): string[] {
  if (!Array.isArray(fileNames)) return []
  return Array.from(new Set(fileNames.map((fileName) => String(fileName || '').trim()).filter(Boolean)))
}

export async function reprocessTelemetrySummaries(payload: {
  fileNames?: string[]
} = {}): Promise<ReprocessTelemetryResult | null> {
  const electronAPI = getElectronApi()
  if (!electronAPI?.reprocessTelemetrySummaries) return null
  return await electronAPI.reprocessTelemetrySummaries({
    fileNames: normalizeFileNames(payload.fileNames)
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
