import { collection, doc, serverTimestamp } from 'firebase/firestore'
import { trackedWriteBatch } from '~/composables/useFirebaseTracker'
import type { TrackBestProjectionDelta } from './trackBestsProjectionService'
import { BEST_RULES_VERSION, extractMetadata, generateSessionId } from '~/utils/sessionParser'

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

export function splitTextIntoChunks(str: string, size: number): string[] {
  const chunks: string[] = []
  for (let i = 0; i < str.length; i += size) {
    chunks.push(str.slice(i, i + size))
  }
  return chunks
}

export async function calculateContentHash(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
function stableStringify(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
function cloneWithoutDerivedSummary(rawObj: any): any {
  if (!rawObj || typeof rawObj !== 'object') return rawObj
  const cloned = JSON.parse(JSON.stringify(rawObj))
  delete cloned.summary
  delete cloned.summaryRulesVersion
  return cloned
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
export async function calculateRawDataHash(rawObj: any): Promise<string> {
  return calculateContentHash(stableStringify(cloneWithoutDerivedSummary(rawObj)))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
export async function calculateSummaryHash(summary: any): Promise<string> {
  return calculateContentHash(stableStringify(summary || null))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
function canRebuildSummaryFromLocalRaw(rawObj: any): boolean {
  return Array.isArray(rawObj?.stints) && rawObj.stints.length > 0
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
export function prepareSummaryForUpload(rawObj: any):
  | { ok: true; meta: any; summary: any; summarySource: 'canonical' | 'legacy_fallback' }
  | { ok: false; meta: any; reason: 'legacy_local_requires_reprocess' } {
  const canonical = extractMetadata(rawObj)

  if (canRebuildSummaryFromLocalRaw(rawObj)) {
    const rebuilt = extractMetadata(rawObj, { allowLegacyFallback: true, forceRawRebuild: true })
    return {
      ok: true,
      meta: rebuilt.meta,
      summary: {
        ...rebuilt.summary,
        best_rules_version: BEST_RULES_VERSION
      },
      summarySource: canonical.summarySource === 'canonical' ? 'canonical' : 'legacy_fallback'
    }
  }

  if (canonical.summarySource === 'canonical') {
    return {
      ok: true,
      meta: canonical.meta,
      summary: {
        ...canonical.summary,
        best_rules_version: BEST_RULES_VERSION
      },
      summarySource: 'canonical'
    }
  }

  return {
    ok: false,
    meta: canonical.meta,
    reason: 'legacy_local_requires_reprocess'
  }
}

export function createSessionUploadService(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  db: any
  chunkSize: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  getExistingSession: (uid: string, sessionId: string) => Promise<any>
  loadRegistryCache: () => Promise<Record<string, RegistryCacheEntry>>
  canSkipViaRegistry: (
    registry: Record<string, RegistryCacheEntry>,
    fileName: string,
    hashes: { fileHash: string; rawDataHash: string; summaryHash: string },
    uid: string
  ) => boolean
  deleteOldChunks: (uid: string, sessionId: string) => Promise<void>
}) {
  const { db, chunkSize, getExistingSession, loadRegistryCache, canSkipViaRegistry, deleteOldChunks } = params

  return {
    async uploadOrUpdateSession(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
      rawObj: any,
      rawText: string,
      fileName: string,
      uid: string,
      options: { precomputedHash?: string } = {}
    ) {
      try {
        const totalLaps = rawObj.session_info?.laps_total || 0
        if (totalLaps === 0) {
          return { status: 'skipped' as const, fileName, reason: 'zero_laps' }
        }

        const fileOwnerId = rawObj.ownerId || null
        if (fileOwnerId && fileOwnerId !== uid) {
          return { status: 'skipped' as const, fileName, reason: 'owner_mismatch' }
        }
        const preparedSummary = prepareSummaryForUpload(rawObj)
        if (!preparedSummary.ok) {
          return { status: 'skipped' as const, fileName, reason: preparedSummary.reason }
        }
        const { meta, summary: summaryWithRules } = preparedSummary
        const sessionId = generateSessionId(meta.date_start, meta.track)
        const fileHash = options.precomputedHash || await calculateContentHash(rawText)
        const rawDataHash = await calculateRawDataHash(rawObj)
        const summaryHash = await calculateSummaryHash(summaryWithRules)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
        const getExistingRulesVersion = (existingDoc: any): number =>
          Number(existingDoc?.summary?.best_rules_version || existingDoc?.summaryRulesVersion || 0)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
        let existing: any = null
        let existingChecked = false
        const registry = await loadRegistryCache()
        const registryEntry = registry[fileName]
        if (canSkipViaRegistry(registry, fileName, { fileHash, rawDataHash, summaryHash }, uid)) {
          existing = await getExistingSession(uid, sessionId)
          existingChecked = true
          const existingRulesVersion = getExistingRulesVersion(existing)
          if (existing && existing.fileHash === fileHash && existingRulesVersion >= BEST_RULES_VERSION) {
            return { status: 'unchanged' as const, fileName, sessionId, reason: 'registry_cache_hit' }
          }
        }

        if (!existingChecked) {
          existing = await getExistingSession(uid, sessionId)
        }

        let isUpdate = false
        let chunksNeedUpdate = true
        let isRulesMigration = false
        if (existing) {
          isUpdate = true
          const existingRulesVersion = getExistingRulesVersion(existing)
          const needsRulesMigration = existingRulesVersion < BEST_RULES_VERSION
          const existingRawDataHash = String(existing.rawDataHash || '')
          const registryMatchesExistingUpload = !!registryEntry
            && registryEntry.uploadedBy === uid
            && registryEntry.sessionId === sessionId
            && !!registryEntry.fileHash
            && registryEntry.fileHash === existing.fileHash
          const rawDataUnchanged = (!!existingRawDataHash && existingRawDataHash === rawDataHash)
            || (!existingRawDataHash && registryMatchesExistingUpload && needsRulesMigration)

          if (existing.fileHash === fileHash) {
            if (!needsRulesMigration) {
              return { status: 'unchanged' as const, fileName, sessionId, reason: 'firebase_hash_match' }
            }
            chunksNeedUpdate = false
            isRulesMigration = true
          } else if (rawDataUnchanged && needsRulesMigration) {
            chunksNeedUpdate = false
            isRulesMigration = true
          } else {
            await deleteOldChunks(uid, sessionId)
          }
        }

        const chunks = chunksNeedUpdate ? splitTextIntoChunks(rawText, chunkSize) : []
        const batch = trackedWriteBatch(db, 'SessionUploadService')

        const sessionRef = doc(db, `users/${uid}/sessions/${sessionId}`)
        batch.set(sessionRef, {
          fileHash,
          rawDataHash,
          summaryHash,
          fileName,
          uploadedAt: serverTimestamp(),
          meta,
          summary: summaryWithRules,
          summaryRulesVersion: Number(summaryWithRules.best_rules_version || BEST_RULES_VERSION),
          rawChunkCount: chunksNeedUpdate ? chunks.length : (existing?.rawChunkCount || 0),
          rawSizeBytes: chunksNeedUpdate ? rawText.length : (existing?.rawSizeBytes || rawText.length),
          rawEncoding: existing?.rawEncoding || 'json-string',
          version: (existing?.version || 0) + 1
        })

        const uploadRef = doc(db, `users/${uid}/uploads/${fileHash}`)
        batch.set(uploadRef, { fileName, uploadedAt: serverTimestamp(), sessionId })

        if (chunksNeedUpdate) {
          for (let idx = 0; idx < chunks.length; idx++) {
            const chunkRef = doc(collection(db, `users/${uid}/sessions/${sessionId}/rawChunks`), `${idx}`)
            batch.set(chunkRef, { idx, chunk: chunks[idx] })
          }
        }

        await batch.commit()
        const projectionDelta: TrackBestProjectionDelta = {
          trackId: meta.track,
          sessionId,
          dateStart: meta.date_start,
          sessionType: meta.session_type,
          summary: summaryWithRules,
          car: meta.car
        }

        return {
          status: (isUpdate ? 'updated' : 'created') as 'created' | 'updated',
          fileName,
          sessionId,
          projectionDelta,
          reason: isRulesMigration ? 'summary_rules_migration' : undefined
        }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
      } catch (error: any) {
        return { status: 'error' as const, fileName, error: error.message }
      }
    }
  }
}
