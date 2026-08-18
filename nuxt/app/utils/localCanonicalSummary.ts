import {
  reprocessTelemetrySummaries,
  type ReprocessTelemetryResult
} from '~/services/sync/canonicalSummaryBridge'

const DIRECTORY_REFRESH_DEBOUNCE_MS = 5000

let lastDirectoryRefreshAt = 0
let inFlightDirectoryRefresh: Promise<ReprocessTelemetryResult | null> | null = null

function getElectronApi(): any | null {
  if (typeof window === 'undefined') return null
  return (window as any).electronAPI || null
}

function normalizeFileNames(fileNames?: string[]): string[] {
  if (!Array.isArray(fileNames)) return []
  return Array.from(
    new Set(
      fileNames
        .filter((fileName): fileName is string => typeof fileName === 'string')
        .map((fileName) => fileName.trim())
        .filter(Boolean)
    )
  )
}

async function invokeReprocess(payload: { fileNames?: string[] } = {}): Promise<ReprocessTelemetryResult | null> {
  const electronAPI = getElectronApi()
  if (!electronAPI?.reprocessTelemetrySummaries) return null

  const result = await reprocessTelemetrySummaries({
    fileNames: normalizeFileNames(payload.fileNames)
  })

  if (!result) return null

  if (result?.ok === false) {
    console.warn('[CANONICAL] Local summary reprocess failed:', result.error || result.stderr || 'unknown error')
  } else if ((result?.updated || 0) > 0) {
    console.log(
      `[CANONICAL] Local summaries updated=${result.updated} processed=${result.processed} rules=v${result.bestRulesVersion ?? 'unknown'}`
    )
  }

  return result || null
}

export async function ensureLocalTelemetrySummariesCanonical(options: {
  fileNames?: string[]
  force?: boolean
} = {}): Promise<ReprocessTelemetryResult | null> {
  const fileNames = normalizeFileNames(options.fileNames)

  if (fileNames.length > 0) {
    return invokeReprocess({ fileNames })
  }

  const now = Date.now()
  if (!options.force && now - lastDirectoryRefreshAt < DIRECTORY_REFRESH_DEBOUNCE_MS) {
    return null
  }

  if (inFlightDirectoryRefresh) {
    return inFlightDirectoryRefresh
  }

  inFlightDirectoryRefresh = invokeReprocess({})
  try {
    const result = await inFlightDirectoryRefresh
    lastDirectoryRefreshAt = Date.now()
    return result
  } finally {
    inFlightDirectoryRefresh = null
  }
}
