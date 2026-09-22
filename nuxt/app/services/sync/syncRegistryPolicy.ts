import { BEST_RULES_VERSION } from '~/utils/sessionParser'

/**
 * PIP-444: stato del documento cloud `sessions/{sessionId}` come lo ha lasciato l'ultimo
 * caricamento riuscito da questo PC. Con questo blocco la sync non rilegge la sessione ne'
 * interroga i raw chunk prima di ricaricare: sa gia' versione, hash e numero di chunk
 * (gli id sono sempre `0..rawChunkCount-1`, scritti dallo stesso batch atomico).
 */
export interface RegistryCloudState {
  sessionId: string
  fileHash: string
  rawDataHash: string
  summaryRulesVersion: number
  sessionVersion: number
  rawChunkCount: number
  rawSizeBytes: number
  rawEncoding: string
}

export interface RegistryCacheEntry {
  fileHash: string
  rawDataHash?: string
  summaryHash?: string
  mtime: number
  size: number
  uploadedBy: string
  sessionId: string
  uploadedAt: string
  bestRulesVersion?: number
  /** Additivo: assente per le voci scritte prima di PIP-444 (primo ciclo: letture come prima). */
  cloud?: RegistryCloudState
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

/** Blocco cloud valido e coerente con la voce che lo contiene; altrimenti `null`. */
export function normalizeRegistryCloudState(value: unknown): RegistryCloudState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  if (typeof candidate.sessionId !== 'string' || !candidate.sessionId) return null
  if (typeof candidate.fileHash !== 'string' || !candidate.fileHash) return null
  if (typeof candidate.rawDataHash !== 'string') return null
  if (!isNonNegativeInteger(candidate.summaryRulesVersion)) return null
  if (!isNonNegativeInteger(candidate.sessionVersion) || candidate.sessionVersion < 1) return null
  if (!isNonNegativeInteger(candidate.rawChunkCount)) return null
  if (!isNonNegativeInteger(candidate.rawSizeBytes)) return null
  if (typeof candidate.rawEncoding !== 'string' || !candidate.rawEncoding) return null
  return {
    sessionId: candidate.sessionId,
    fileHash: candidate.fileHash,
    rawDataHash: candidate.rawDataHash,
    summaryRulesVersion: candidate.summaryRulesVersion,
    sessionVersion: candidate.sessionVersion,
    rawChunkCount: candidate.rawChunkCount,
    rawSizeBytes: candidate.rawSizeBytes,
    rawEncoding: candidate.rawEncoding
  }
}

/**
 * Stato cloud noto per questo file, solo se la voce e' di questo owner, della stessa
 * sessione e il blocco cloud e' coerente con la voce (stesso hash caricato). Qualsiasi
 * incoerenza vale come "non noto": si rilegge dal cloud come prima.
 */
export function resolveKnownCloudSession(params: {
  entry: RegistryCacheEntry | null | undefined
  ownerId: string
  sessionId: string
}): RegistryCloudState | null {
  const { entry, ownerId, sessionId } = params
  if (!entry || !ownerId || !sessionId) return null
  if (entry.uploadedBy !== ownerId || entry.sessionId !== sessionId) return null
  const cloud = normalizeRegistryCloudState(entry.cloud)
  if (!cloud) return null
  if (cloud.sessionId !== sessionId || cloud.fileHash !== entry.fileHash) return null
  return cloud
}

/** Stato cloud da un documento `sessions/{id}` letto o appena scritto. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- documento Firestore sessione
export function cloudStateFromSessionDocument(sessionId: string, document: any): RegistryCloudState | null {
  if (!document || typeof document !== 'object') return null
  return normalizeRegistryCloudState({
    sessionId,
    fileHash: document.fileHash,
    rawDataHash: typeof document.rawDataHash === 'string' ? document.rawDataHash : '',
    summaryRulesVersion: Number(document.summary?.best_rules_version || document.summaryRulesVersion || 0),
    sessionVersion: Number(document.version || 0),
    rawChunkCount: Number(document.rawChunkCount || 0),
    rawSizeBytes: Number(document.rawSizeBytes || 0),
    rawEncoding: typeof document.rawEncoding === 'string' && document.rawEncoding ? document.rawEncoding : 'json-string'
  })
}

/** Id dei raw chunk presenti nel cloud secondo lo stato noto: sempre `0..n-1`. */
export function knownRawChunkIds(cloud: RegistryCloudState): string[] {
  return Array.from({ length: cloud.rawChunkCount }, (_, index) => String(index))
}

export interface RegistryComparableFile {
  name: string
  mtime: number
  size: number
  sessionId?: string
  fileHash?: string
  bestRulesVersion?: number
}

export function isRegistryEntryCurrentForFile(params: {
  entry?: RegistryCacheEntry | null
  file: RegistryComparableFile
  ownerId: string
  sessionId?: string
  fileHash?: string
  bestRulesVersion?: number
  minimumBestRulesVersion?: number
}): boolean {
  const {
    entry,
    file,
    ownerId,
    sessionId,
    fileHash,
    bestRulesVersion,
    minimumBestRulesVersion = BEST_RULES_VERSION
  } = params
  const currentSessionId = sessionId || file.sessionId || ''
  const currentFileHash = fileHash || file.fileHash || ''
  const currentRulesVersion = Number(bestRulesVersion ?? file.bestRulesVersion)
  if (!entry || !ownerId || entry.uploadedBy !== ownerId) return false
  if (!currentSessionId || entry.sessionId !== currentSessionId) return false
  if (!currentFileHash || entry.fileHash !== currentFileHash) return false
  if (!Number.isFinite(entry.mtime) || !Number.isFinite(entry.size)) return false
  if (entry.mtime !== file.mtime || entry.size !== file.size) return false
  if (!Number.isFinite(currentRulesVersion) || currentRulesVersion < minimumBestRulesVersion) return false
  return Number(entry.bestRulesVersion) === currentRulesVersion
}

export function selectFreshReprocessedFiles(
  files: unknown,
  requestedNames: string[]
): RegistryComparableFile[] {
  if (!Array.isArray(files)) return []
  const requested = new Set(requestedNames)
  const selected = new Map<string, RegistryComparableFile>()
  for (const candidate of files) {
    const file = candidate as Partial<RegistryComparableFile>
    if (
      typeof file.name !== 'string'
      || !requested.has(file.name)
      || !Number.isFinite(file.mtime)
      || !Number.isFinite(file.size)
      || typeof file.sessionId !== 'string'
      || !file.sessionId
      || typeof file.fileHash !== 'string'
      || !file.fileHash
      || !Number.isFinite(file.bestRulesVersion)
      || file.name.includes('/')
      || file.name.includes('\\')
    ) continue
    selected.set(file.name, {
      name: file.name,
      mtime: Number(file.mtime),
      size: Number(file.size),
      sessionId: file.sessionId,
      fileHash: file.fileHash,
      bestRulesVersion: Number(file.bestRulesVersion)
    })
  }
  return Array.from(selected.values())
}
