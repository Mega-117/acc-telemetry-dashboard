import { collection, doc, serverTimestamp } from 'firebase/firestore'
import { trackedWriteBatch } from '~/composables/useFirebaseTracker'
import type { TrackBestProjectionDelta } from './trackBestsProjectionService'
import { BEST_RULES_VERSION, extractMetadata, generateSessionId } from '~/utils/sessionParser'

export interface RegistryCacheEntry {
  fileHash: string
  mtime: number
  size: number
  uploadedBy: string
  sessionId: string
  uploadedAt: string
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

export function createSessionUploadService(params: {
  db: any
  chunkSize: number
  getExistingSession: (uid: string, sessionId: string) => Promise<any>
  loadRegistryCache: () => Promise<Record<string, RegistryCacheEntry>>
  canSkipViaRegistry: (registry: Record<string, RegistryCacheEntry>, fileName: string, fileHash: string, uid: string) => boolean
  deleteOldChunks: (uid: string, sessionId: string) => Promise<void>
}) {
  const { db, chunkSize, getExistingSession, loadRegistryCache, canSkipViaRegistry, deleteOldChunks } = params

  return {
    async uploadOrUpdateSession(
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

        const { meta, summary } = extractMetadata(rawObj)
        const summaryWithRules = {
          ...summary,
          best_rules_version: Number(summary?.best_rules_version || BEST_RULES_VERSION)
        }
        const sessionId = generateSessionId(meta.date_start, meta.track)
        const fileHash = options.precomputedHash || await calculateContentHash(rawText)

        const getExistingRulesVersion = (existingDoc: any): number =>
          Number(existingDoc?.summary?.best_rules_version || existingDoc?.summaryRulesVersion || 0)

        let existing: any = null
        let existingChecked = false
        const registry = await loadRegistryCache()
        if (canSkipViaRegistry(registry, fileName, fileHash, uid)) {
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
          if (existing.fileHash === fileHash) {
            if (!needsRulesMigration) {
              return { status: 'unchanged' as const, fileName, sessionId, reason: 'firebase_hash_match' }
            }
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
      } catch (error: any) {
        return { status: 'error' as const, fileName, error: error.message }
      }
    }
  }
}
