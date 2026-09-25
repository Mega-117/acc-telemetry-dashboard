// PIP-442/PIP-444: revisione delle proiezioni owner, in un modulo puro cosi' che anche il
// piano di sync (senza Firebase) possa ricavarla dal documento che sta per scrivere.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- documento Firestore `users/{uid}`
export type OwnerDocumentData = Record<string, any>

/**
 * La revisione cambia solo quando cambiano le proiezioni owner: `sessionIndex.updatedAt`
 * viene scritto dalla sync incrementale, dal rebuild completo e dalla riparazione owner,
 * mai da heartbeat, profilo o checkpoint di manutenzione. `stats.updatedAt` copre i
 * documenti scritti prima dell'indice sessioni.
 */
export function extractOwnerRevision(data: OwnerDocumentData | null | undefined): string | null {
  const fromIndex = data?.sessionIndex?.updatedAt
  if (typeof fromIndex === 'string' && fromIndex) return fromIndex
  const fromStats = data?.stats?.updatedAt
  if (typeof fromStats === 'string' && fromStats) return fromStats
  return null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * Documento owner dopo un `setDoc(..., { merge: true })` locale: stessa semantica di
 * Firestore (le mappe si fondono campo per campo, array e valori vengono sostituiti).
 */
export function mergeOwnerDocumentPatch(base: OwnerDocumentData | null, patch: OwnerDocumentData): OwnerDocumentData {
  const output: OwnerDocumentData = { ...(base || {}) }
  for (const [key, value] of Object.entries(patch)) {
    const current = output[key]
    output[key] = isPlainObject(current) && isPlainObject(value) ? mergeOwnerDocumentPatch(current, value) : value
  }
  return output
}
