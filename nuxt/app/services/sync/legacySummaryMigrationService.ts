import { collection, orderBy, query } from 'firebase/firestore'

export async function reconstructRawPayloadFromChunks(
  uid: string,
  sessionId: string,
  getDocsFn: (queryRef: any) => Promise<any>
): Promise<any | null> {
  try {
    const chunksRef = collection((await import('~/config/firebase')).db, `users/${uid}/sessions/${sessionId}/rawChunks`)
    let snapshot: any
    try {
      snapshot = await getDocsFn(query(chunksRef, orderBy('idx')))
    } catch {
      snapshot = await getDocsFn(chunksRef)
    }

    const rawText = (snapshot.docs || [])
      .map((docSnap: any) => docSnap.data())
      .sort((a: any, b: any) => Number(a?.idx || 0) - Number(b?.idx || 0))
      .map((chunk: any) => String(chunk?.chunk || ''))
      .join('')

    return rawText ? JSON.parse(rawText) : null
  } catch (e: any) {
    console.warn(`[SYNC] Could not reconstruct raw payload for ${sessionId}:`, e.message)
    return null
  }
}

export async function migrateLegacyCloudSummaries(params: {
  uid: string
  bestRulesVersion: number
  getDocsFn: (queryRef: any) => Promise<any>
  setDocFn: (ref: any, data: any, options?: any) => Promise<any>
  canonicalizeSummary: (rawObj: any) => Promise<any | null>
}): Promise<number> {
  const { uid, bestRulesVersion, getDocsFn, setDocFn, canonicalizeSummary } = params
  const migrationKey = `best_rules_v${bestRulesVersion}_cloud_migration_done_${uid}`

  if (typeof window !== 'undefined' && localStorage.getItem(migrationKey)) {
    return 0
  }

  try {
    const { db } = await import('~/config/firebase')
    const sessionsRef = collection(db, `users/${uid}/sessions`)
    const snapshot = await getDocsFn(sessionsRef)
    const legacyDocs = snapshot.docs.filter((docSnap: any) => {
      const data = docSnap.data()
      const existingVersion = Number(data?.summary?.best_rules_version || data?.summaryRulesVersion || 0)
      return existingVersion < bestRulesVersion
    })

    if (legacyDocs.length === 0) {
      if (typeof window !== 'undefined') {
        localStorage.setItem(migrationKey, new Date().toISOString())
      }
      return 0
    }

    let migrated = 0
    for (const docSnap of legacyDocs) {
      const rawObj = await reconstructRawPayloadFromChunks(uid, docSnap.id, getDocsFn)
      if (!rawObj) continue

      const canonicalSummary = await canonicalizeSummary(rawObj)
      if (!canonicalSummary) continue

      await setDocFn(docSnap.ref, {
        summary: canonicalSummary,
        summaryRulesVersion: Number(canonicalSummary.best_rules_version || bestRulesVersion)
      }, { merge: true })
      migrated++
    }

    if (typeof window !== 'undefined' && migrated === legacyDocs.length) {
      localStorage.setItem(migrationKey, new Date().toISOString())
    }

    return migrated
  } catch (e: any) {
    console.warn('[SYNC] Cloud legacy summary migration failed:', e.message)
    return 0
  }
}
