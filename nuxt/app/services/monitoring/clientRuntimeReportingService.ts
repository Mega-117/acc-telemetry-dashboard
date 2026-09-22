import { doc } from 'firebase/firestore'
import { buildPilotDirectoryActivityDocument } from '~/services/pilotDirectoryProjectionService'
import type { ClientHeartbeatPayload } from '~/services/monitoring/clientHeartbeatService'

export const CLIENT_RUNTIME_REPORT_WRITE_BUDGET = 1
export const CLIENT_RUNTIME_REPORT_READ_BUDGET = 0

type FirestoreDocFn = (db: unknown, path: string) => unknown
type FirestoreWriteBatch = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- adapter boundary for Firestore and tests
  set: (ref: any, data: any, options?: any) => void
  commit: () => Promise<unknown>
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- adapter boundary for Firestore and tests
type FirestoreWriteBatchFn = (db: any) => FirestoreWriteBatch

export async function writeClientRuntimeReport(params: {
  db: unknown
  uid: string
  payload: ClientHeartbeatPayload
  writeBatchFn: FirestoreWriteBatchFn
  docFn?: FirestoreDocFn
  assertCurrent?: () => void
  previousUser?: { suiteVersion?: unknown; clientRuntime?: { channel?: unknown; updateState?: unknown } } | null
}): Promise<{ writes: number, reads: 0, metadataChanged: boolean }> {
  const {
    db,
    uid,
    payload,
    writeBatchFn,
    docFn = doc as unknown as FirestoreDocFn,
    assertCurrent = () => {}
  } = params
  const installationId = payload.installationRuntime.installationId
  // Le proiezioni pubbliche descrivono la versione, non la presenza. Il contatto
  // periodico vive soltanto nel documento canonico dell'installazione.
  const previous = params.previousUser
  const metadataChanged = !!previous && (
    previous.suiteVersion !== payload.suiteVersion
    || (previous.clientRuntime?.channel ?? null) !== payload.clientRuntime.channel
    || (previous.clientRuntime?.updateState ?? null) !== payload.clientRuntime.updateState
  )
  const batch = writeBatchFn(db)

  batch.set(
    docFn(db, `users/${uid}/runtimeInstallations/${installationId}`),
    payload.installationRuntime,
    { merge: true }
  )

  if (metadataChanged) {
    batch.set(docFn(db, `users/${uid}`), {
      suiteVersion: payload.suiteVersion,
      suiteVersionDetail: payload.suiteVersionDetail,
      suiteVersionUpdatedAt: payload.suiteVersionUpdatedAt,
      clientRuntime: payload.clientRuntime
    }, { merge: true })

    batch.set(docFn(db, `pilotDirectory/${uid}`), buildPilotDirectoryActivityDocument(uid, {
      suiteVersion: payload.suiteVersion,
      suiteVersionUpdatedAt: payload.suiteVersionUpdatedAt,
      clientChannel: payload.clientRuntime.channel,
      clientUpdateState: payload.clientRuntime.updateState,
      clientLastHeartbeatAt: payload.clientRuntime.lastHeartbeatAt
    }), { merge: true })
  }

  assertCurrent()
  await batch.commit()
  assertCurrent()

  return {
    writes: CLIENT_RUNTIME_REPORT_WRITE_BUDGET + (metadataChanged ? 2 : 0),
    reads: CLIENT_RUNTIME_REPORT_READ_BUDGET,
    metadataChanged
  }
}
