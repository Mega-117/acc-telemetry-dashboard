import { collectionGroup, limit, orderBy, query } from 'firebase/firestore'
import { db } from '~/config/firebase'
import { trackedGetDocs } from '~/composables/useFirebaseTracker'
import type { ClientDiagnosticDocument } from '~/services/monitoring/clientDiagnosticsService'

const CALLER = 'ClientDiagnosticsRepository'
export const CLIENT_DIAGNOSTICS_ADMIN_LIMIT = 200

export interface ClientDiagnosticItem extends ClientDiagnosticDocument {
  path: string
}

export async function loadRecentClientDiagnostics(
  maxItems = CLIENT_DIAGNOSTICS_ADMIN_LIMIT
): Promise<ClientDiagnosticItem[]> {
  const diagnosticsQuery = query(
    collectionGroup(db, 'diagnostics'),
    orderBy('occurredAt', 'desc'),
    limit(Math.max(1, Math.min(CLIENT_DIAGNOSTICS_ADMIN_LIMIT, maxItems)))
  )
  const snapshot = await trackedGetDocs(diagnosticsQuery, CALLER)
  return snapshot.docs.map((docSnap: any) => ({
    ...(docSnap.data() as ClientDiagnosticDocument),
    path: docSnap.ref.path
  }))
}
