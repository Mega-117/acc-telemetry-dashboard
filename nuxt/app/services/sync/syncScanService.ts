import { extractMetadata, generateSessionId } from '~/utils/sessionParser'
import { isSessionFileCandidate } from '~/repositories/telemetryLocalRepository'
import { calculateRawDataHash, calculateSummaryHash, type RegistryCacheEntry } from './sessionUploadService'
import { isRegistryEntryCurrentForFile, selectFreshReprocessedFiles } from './syncRegistryPolicy'

export interface TelemetryFileDescriptor {
  name: string
  mtime: number
  size: number
  sessionId?: string
  fileHash?: string
  bestRulesVersion?: number
}

export type SyncScanSkipReason =
  | 'invalid_file'
  | 'read_error'
  | 'zero_laps'
  | 'owner_missing'
  | 'owner_mismatch'

export interface PendingSyncFile {
  file: TelemetryFileDescriptor
  fileName: string
  rawObj: any
  rawText: string
  fileHash: string
  rawDataHash: string
  summaryHash: string
  sessionId: string
}

export interface ScannedSyncFile {
  file: TelemetryFileDescriptor
  fileName: string
  sessionId: string
  fileHash: string
  rawDataHash?: string
  summaryHash?: string
}

export interface SkippedSyncFile {
  file: TelemetryFileDescriptor
  fileName: string
  reason: SyncScanSkipReason
  error?: string
}

export interface SyncScanResult {
  scannedFiles: TelemetryFileDescriptor[]
  registrySnapshot: Record<string, RegistryCacheEntry>
  pendingFiles: PendingSyncFile[]
  unchangedFiles: ScannedSyncFile[]
  skippedFiles: SkippedSyncFile[]
}

export function createSyncScanService(params: {
  electronAPI: any
  loadRegistryCache: () => Promise<Record<string, RegistryCacheEntry>>
  calculateContentHash: (input: string) => Promise<string>
}) {
  const { electronAPI, loadRegistryCache, calculateContentHash } = params

  async function getFiles(fileNames?: string[]): Promise<TelemetryFileDescriptor[]> {
    const files = await electronAPI?.getTelemetryFiles?.()
    const listed = Array.isArray(files) ? files : []
    return Array.isArray(fileNames)
      ? selectFreshReprocessedFiles(listed, fileNames)
      : listed
  }

  async function scanPendingFiles(params: {
    ownerId: string
    fileNames?: string[]
  }): Promise<SyncScanResult> {
    const { ownerId, fileNames } = params
    const files = await getFiles(fileNames)
    const registrySnapshot = await loadRegistryCache()

    const pendingFiles: PendingSyncFile[] = []
    const unchangedFiles: ScannedSyncFile[] = []
    const skippedFiles: SkippedSyncFile[] = []

    for (const file of files) {
      const fileName = String(file?.name || '')

      try {
        const registryEntry = registrySnapshot[fileName]
        const registryMetadataHit = isRegistryEntryCurrentForFile({
          entry: registryEntry,
          file,
          ownerId
        })

        if (registryMetadataHit && registryEntry) {
          unchangedFiles.push({
            file,
            fileName,
            fileHash: registryEntry.fileHash,
            rawDataHash: registryEntry.rawDataHash,
            summaryHash: registryEntry.summaryHash,
            sessionId: registryEntry.sessionId
          })
          continue
        }

        const rawObj = await electronAPI?.readFile?.(fileName)
        if (!rawObj || !isSessionFileCandidate(fileName, rawObj)) {
          skippedFiles.push({ file, fileName, reason: 'invalid_file' })
          continue
        }

        if (typeof rawObj.ownerId !== 'string' || !rawObj.ownerId) {
          skippedFiles.push({ file, fileName, reason: 'owner_missing' })
          continue
        }

        if (rawObj.ownerId !== ownerId) {
          skippedFiles.push({ file, fileName, reason: 'owner_mismatch' })
          continue
        }

        const totalLaps = Number(rawObj?.session_info?.laps_total || 0)
        if (totalLaps === 0) {
          skippedFiles.push({ file, fileName, reason: 'zero_laps' })
          continue
        }

        const { meta } = extractMetadata(rawObj)
        const sessionId = generateSessionId(meta.date_start, meta.track)
        const rawText = JSON.stringify(rawObj)
        const fileHash = await calculateContentHash(rawText)
        const rawDataHash = await calculateRawDataHash(rawObj)
        const summaryHash = await calculateSummaryHash(rawObj.summary || null)
        const registryHit = isRegistryEntryCurrentForFile({
          entry: registryEntry,
          file,
          ownerId,
          sessionId,
          fileHash,
          bestRulesVersion: Number(rawObj?.summary?.best_rules_version)
        })

        if (registryHit) {
          unchangedFiles.push({
            file,
            fileName,
            fileHash,
            rawDataHash,
            summaryHash,
            sessionId
          })
          continue
        }

        pendingFiles.push({
          file,
          fileName,
          rawObj,
          rawText,
          fileHash,
          rawDataHash,
          summaryHash,
          sessionId
        })
      } catch (error: any) {
        skippedFiles.push({
          file,
          fileName,
          reason: 'read_error',
          error: error?.message || 'unknown_read_error'
        })
      }
    }

    return {
      scannedFiles: files,
      registrySnapshot,
      pendingFiles,
      unchangedFiles,
      skippedFiles
    }
  }

  return {
    scanPendingFiles
  }
}
