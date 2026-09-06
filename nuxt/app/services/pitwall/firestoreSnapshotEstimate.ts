interface SnapshotMetadata { fromCache?: boolean, hasPendingWrites?: boolean }
interface EstimateSnapshot {
  metadata?: SnapshotMetadata
  docs?: readonly { metadata?: SnapshotMetadata }[]
  docChanges?: () => readonly { doc: { metadata?: SnapshotMetadata } }[]
}

/** SDK observations only: dependent Rules reads and billing are not observable here. */
export function estimateFirestoreSnapshot(snapshot: EstimateSnapshot, firstServerSnapshot: boolean) {
  const source = snapshot.metadata?.fromCache ? 'cache' : snapshot.metadata?.hasPendingWrites ? 'local' : 'server-estimate'
  if (source !== 'server-estimate') return { reads: 0, source, serverSeen: false }
  const documents = firstServerSnapshot ? snapshot.docs : snapshot.docChanges?.().map(change => change.doc)
  const reads = documents ? documents.filter(doc => !doc.metadata?.hasPendingWrites).length : 1
  return { reads: firstServerSnapshot ? Math.max(1, reads) : reads, source, serverSeen: true }
}
