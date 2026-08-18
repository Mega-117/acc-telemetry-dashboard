export const DIAGNOSTICS_ESTIMATE_SAFE_MAX = Number.MAX_SAFE_INTEGER

export interface DiagnosticsOperationEstimate {
  estimatedReads: number
  estimatedWrites: number
  maxEstimatedReads: number
  maxEstimatedWrites: number
}

function boundedInteger(value: number, maximum = DIAGNOSTICS_ESTIMATE_SAFE_MAX): number {
  if (!Number.isFinite(value)) return maximum
  return Math.min(maximum, Math.max(0, Math.floor(value)))
}

function saturatedMultiply(left: number, right: number): number {
  const normalizedLeft = boundedInteger(left)
  const normalizedRight = boundedInteger(right)
  if (normalizedLeft === 0 || normalizedRight === 0) return 0
  if (normalizedLeft > Math.floor(DIAGNOSTICS_ESTIMATE_SAFE_MAX / normalizedRight)) {
    return DIAGNOSTICS_ESTIMATE_SAFE_MAX
  }
  return normalizedLeft * normalizedRight
}

export function estimateDiagnosticsCount(maxIndexEntries: number): DiagnosticsOperationEstimate {
  const boundedEntries = boundedInteger(maxIndexEntries)
  const estimatedReads = Math.max(1, Math.ceil(boundedEntries / 1000))
  return {
    estimatedReads,
    estimatedWrites: 0,
    maxEstimatedReads: estimatedReads,
    maxEstimatedWrites: 0
  }
}

export function estimateDiagnosticsPages(
  pages: number,
  pageSize: number
): DiagnosticsOperationEstimate {
  const diagnosticReads = saturatedMultiply(pages, pageSize)
  const nicknameReads = diagnosticReads
  const estimatedReads = Math.min(
    DIAGNOSTICS_ESTIMATE_SAFE_MAX,
    diagnosticReads + nicknameReads
  )
  return {
    estimatedReads,
    estimatedWrites: 0,
    maxEstimatedReads: estimatedReads,
    maxEstimatedWrites: 0
  }
}

export function estimateDiagnosticsCleanup(
  batches: number,
  batchSize: number
): DiagnosticsOperationEstimate {
  const boundedDocuments = saturatedMultiply(batches, batchSize)
  return {
    estimatedReads: boundedDocuments,
    estimatedWrites: boundedDocuments,
    maxEstimatedReads: boundedDocuments,
    maxEstimatedWrites: boundedDocuments
  }
}

export const DIAGNOSTICS_ESTIMATE_ASSUMPTIONS = Object.freeze([
  'Le stime descrivono documenti e aggregazioni richiesti dall’app, non la fattura Firebase.',
  'Non includono letture negate dalle Rules, index-entry reads, retry, listener o operazioni esterne.',
  'Nessuna stima usa o interroga Firebase Billing.'
])
