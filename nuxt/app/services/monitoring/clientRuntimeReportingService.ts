import { doc } from 'firebase/firestore'
import { updatePilotDirectoryActivity } from '~/services/pilotDirectoryProjectionService'
import type { ClientHeartbeatPayload } from '~/services/monitoring/clientHeartbeatService'

export const CLIENT_RUNTIME_REPORT_WRITE_BUDGET = 3
export const CLIENT_RUNTIME_REPORT_READ_BUDGET = 0

type FirestoreDocFn = (db: unknown, path: string) => unknown
type FirestoreSetDocFn = (ref: unknown, data: unknown, options?: unknown) => Promise<unknown>

export async function writeClientRuntimeReport(params: {
  db: unknown
  uid: string
  payload: ClientHeartbeatPayload
  setDocFn: FirestoreSetDocFn
  docFn?: FirestoreDocFn
  updateProjectionFn?: typeof updatePilotDirectoryActivity
}): Promise<{ writes: number, reads: 0 }> {
  const {
    db,
    uid,
    payload,
    setDocFn,
    docFn = doc as unknown as FirestoreDocFn,
    updateProjectionFn = updatePilotDirectoryActivity
  } = params
  const installationId = payload.installationRuntime.installationId

  await setDocFn(
    docFn(db, `users/${uid}/runtimeInstallations/${installationId}`),
    payload.installationRuntime,
    { merge: true }
  )

  const adapterWrites = await Promise.allSettled([
    setDocFn(docFn(db, `users/${uid}`), {
      suiteVersion: payload.suiteVersion,
      suiteVersionDetail: payload.suiteVersionDetail,
      suiteVersionUpdatedAt: payload.suiteVersionUpdatedAt,
      clientRuntime: payload.clientRuntime
    }, { merge: true }),
    updateProjectionFn({
      db,
      uid,
      fields: {
        suiteVersion: payload.suiteVersion,
        suiteVersionUpdatedAt: payload.suiteVersionUpdatedAt,
        clientChannel: payload.clientRuntime.channel,
        clientUpdateState: payload.clientRuntime.updateState,
        clientLastHeartbeatAt: payload.clientRuntime.lastHeartbeatAt
      },
      setDocFn,
      docFn
    })
  ])
  const rejected = adapterWrites.find((result) => result.status === 'rejected')
  if (rejected?.status === 'rejected') throw rejected.reason

  return {
    writes: CLIENT_RUNTIME_REPORT_WRITE_BUDGET,
    reads: CLIENT_RUNTIME_REPORT_READ_BUDGET
  }
}
