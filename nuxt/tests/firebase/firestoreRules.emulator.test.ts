import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment
} from '@firebase/rules-unit-testing'
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const PROJECT_ID = 'accsuite117'
const PILOT_UID = 'qa-pilot'
const SECOND_PILOT_UID = 'qa-pilot-2'
const ADMIN_UID = 'qa-admin'

let testEnv: RulesTestEnvironment

function diagnosticPayload(uid: string, eventId: string) {
  return {
    schemaVersion: 1,
    eventId,
    fingerprint: 'fixture-fingerprint',
    userId: uid,
    component: 'updater',
    severity: 'error',
    code: 'qa.fixture',
    message: 'Errore di test',
    stack: '',
    context: { source: 'emulator' },
    occurredAt: '2026-07-18T10:00:00.000Z',
    receivedAt: '2026-07-18T10:00:01.000Z',
    suiteVersion: '0.4.0-dev.1',
    channel: 'develop'
  }
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync(resolve(process.cwd(), '..', 'firestore.rules'), 'utf8')
    }
  })
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await Promise.all([
      setDoc(doc(db, `users/${PILOT_UID}`), {
        role: 'pilot',
        coachId: null
      }),
      setDoc(doc(db, `users/${SECOND_PILOT_UID}`), {
        role: 'pilot',
        coachId: null
      }),
      setDoc(doc(db, `users/${ADMIN_UID}`), {
        role: 'admin',
        coachId: null
      }),
      setDoc(doc(db, `pilotDirectory/${PILOT_UID}`), {
        uid: PILOT_UID,
        role: 'pilot',
        coachId: null
      })
    ])
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

describe('diagnostics rules', () => {
  it('permette al proprietario create e get puntuale, ma non list', async () => {
    const db = testEnv.authenticatedContext(PILOT_UID).firestore()
    const eventRef = doc(db, `users/${PILOT_UID}/diagnostics/event-1`)

    await assertSucceeds(setDoc(eventRef, diagnosticPayload(PILOT_UID, 'event-1')))
    await assertSucceeds(getDoc(eventRef))
    await assertFails(getDocs(collection(db, `users/${PILOT_UID}/diagnostics`)))
  })

  it('nega modifica e accesso tra piloti', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), `users/${PILOT_UID}/diagnostics/event-1`),
        diagnosticPayload(PILOT_UID, 'event-1')
      )
    })

    const ownerDb = testEnv.authenticatedContext(PILOT_UID).firestore()
    const secondPilotDb = testEnv.authenticatedContext(SECOND_PILOT_UID).firestore()
    await assertFails(updateDoc(
      doc(ownerDb, `users/${PILOT_UID}/diagnostics/event-1`),
      { message: 'Tentativo di modifica' }
    ))
    await assertFails(getDoc(
      doc(secondPilotDb, `users/${PILOT_UID}/diagnostics/event-1`)
    ))
  })

  it('permette all’admin list e delete', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), `users/${PILOT_UID}/diagnostics/event-1`),
        diagnosticPayload(PILOT_UID, 'event-1')
      )
    })

    const adminDb = testEnv.authenticatedContext(ADMIN_UID).firestore()
    await assertSucceeds(getDocs(query(collectionGroup(adminDb, 'diagnostics'))))
    await assertSucceeds(deleteDoc(
      doc(adminDb, `users/${PILOT_UID}/diagnostics/event-1`)
    ))
  })
})

describe('heartbeat and admin projection rules', () => {
  it('permette heartbeat owner e mirror pilotDirectory senza cambiare ruolo', async () => {
    const db = testEnv.authenticatedContext(PILOT_UID).firestore()
    await assertSucceeds(setDoc(doc(db, `users/${PILOT_UID}`), {
      clientRuntime: {
        schemaVersion: 1,
        suiteVersion: '0.4.0-dev.1',
        channel: 'develop',
        updateState: 'current',
        lastHeartbeatAt: '2026-07-18T10:00:00.000Z'
      }
    }, { merge: true }))
    await assertSucceeds(setDoc(doc(db, `pilotDirectory/${PILOT_UID}`), {
      uid: PILOT_UID,
      schemaVersion: 1,
      clientLastHeartbeatAt: '2026-07-18T10:00:00.000Z'
    }, { merge: true }))
  })

  it('espone la proiezione heartbeat all’admin e la isola dagli altri piloti', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `pilotDirectory/${PILOT_UID}`), {
        uid: PILOT_UID,
        role: 'pilot',
        coachId: null,
        clientLastHeartbeatAt: '2026-07-18T10:00:00.000Z'
      })
    })

    const adminDb = testEnv.authenticatedContext(ADMIN_UID).firestore()
    const otherDb = testEnv.authenticatedContext(SECOND_PILOT_UID).firestore()
    await assertSucceeds(getDoc(doc(adminDb, `pilotDirectory/${PILOT_UID}`)))
    await assertFails(getDoc(doc(otherDb, `pilotDirectory/${PILOT_UID}`)))
  })
})
