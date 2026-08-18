import { BEST_RULES_VERSION } from '~/utils/sessionParser'

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
