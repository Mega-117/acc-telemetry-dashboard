import { extractMetadata, generateSessionId } from '~/utils/sessionParser'
import { isSessionFileCandidate } from '~/repositories/telemetryLocalRepository'
import type { RegistryCacheEntry } from './sessionUploadService'

export interface TelemetryFileDescriptor {
  name: string
  path: string
  mtime: number
  size: number
}

export type SyncScanSkipReason =
  | 'invalid_file'
  | 'read_error'
  | 'zero_laps'
  | 'owner_mismatch'

export interface PendingSyncFile {
  file: TelemetryFileDescriptor
  fileName: string
  filePath: string
  rawObj: any
  rawText: string
  fileHash: string
  sessionId: string
}

export interface ScannedSyncFile {
  file: TelemetryFileDescriptor
  fileName: string
  filePath: string
  sessionId: string
  fileHash: string
}

export interface SkippedSyncFile {
  file: TelemetryFileDescriptor
  fileName: string
  filePath: string
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

  async function getFiles(specificFiles?: TelemetryFileDescriptor[]): Promise<TelemetryFileDescriptor[]> {
    if (Array.isArray(specificFiles)) return specificFiles
    const files = await electronAPI?.getTelemetryFiles?.()
    return Array.isArray(files) ? files : []
  }

  async function scanPendingFiles(params: {
    ownerId: string
    files?: TelemetryFileDescriptor[]
  }): Promise<SyncScanResult> {
    const { ownerId, files: specificFiles } = params
    const files = await getFiles(specificFiles)
    const registrySnapshot = await loadRegistryCache()

    const pendingFiles: PendingSyncFile[] = []
    const unchangedFiles: ScannedSyncFile[] = []
    const skippedFiles: SkippedSyncFile[] = []

    for (const file of files) {
      const fileName = String(file?.name || '')
      const filePath = String(file?.path || '')

      try {
        const rawObj = await electronAPI?.readFile?.(filePath)
        if (!rawObj || !isSessionFileCandidate(fileName, rawObj)) {
          skippedFiles.push({ file, fileName, filePath, reason: 'invalid_file' })
          continue
        }

        if (rawObj.ownerId && rawObj.ownerId !== ownerId) {
          skippedFiles.push({ file, fileName, filePath, reason: 'owner_mismatch' })
          continue
        }

        const totalLaps = Number(rawObj?.session_info?.laps_total || 0)
        if (totalLaps === 0) {
          skippedFiles.push({ file, fileName, filePath, reason: 'zero_laps' })
          continue
        }

        const { meta } = extractMetadata(rawObj)
        const sessionId = generateSessionId(meta.date_start, meta.track)
        const rawText = JSON.stringify(rawObj)
        const fileHash = await calculateContentHash(rawText)
        const registryEntry = registrySnapshot[fileName]
        const registryHit = !!registryEntry
          && registryEntry.fileHash === fileHash
          && registryEntry.uploadedBy === ownerId
          && registryEntry.sessionId === sessionId

        if (registryHit) {
          unchangedFiles.push({
            file,
            fileName,
            filePath,
            fileHash,
            sessionId
          })
          continue
        }

        pendingFiles.push({
          file,
          fileName,
          filePath,
          rawObj,
          rawText,
          fileHash,
          sessionId
        })
      } catch (error: any) {
        skippedFiles.push({
          file,
          fileName,
          filePath,
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
