import { doc } from 'firebase/firestore'
import { buildPilotDirectoryActivityDocument } from '~/services/pilotDirectoryProjectionService'
import type { ClientHeartbeatPayload } from '~/services/monitoring/clientHeartbeatService'

export const CLIENT_RUNTIME_REPORT_WRITE_BUDGET = 3
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
}): Promise<{ writes: number, reads: 0 }> {
  const {
    db,
    uid,
    payload,
    writeBatchFn,
    docFn = doc as unknown as FirestoreDocFn,
    assertCurrent = () => {}
  } = params
  const installationId = payload.installationRuntime.installationId
  const batch = writeBatchFn(db)

  batch.set(
    docFn(db, `users/${uid}/runtimeInstallations/${installationId}`),
    payload.installationRuntime,
    { merge: true }
  )

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

  assertCurrent()
  await batch.commit()
  assertCurrent()

  return {
    writes: CLIENT_RUNTIME_REPORT_WRITE_BUDGET,
    reads: CLIENT_RUNTIME_REPORT_READ_BUDGET
  }
}
