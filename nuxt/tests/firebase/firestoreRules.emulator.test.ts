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
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where
} from 'firebase/firestore'
import {
  advanceCanonicalMigrationCheckpoint,
  buildCanonicalMigrationCheckpoint,
  isCompletedCanonicalMigrationCheckpoint
} from '~/services/sync/canonicalMigrationCheckpoint'
import { createSessionUploadService } from '~/services/sync/sessionUploadService'
import { inspectFirebaseStructureState } from '~/services/sync/firebaseStructureHealthService'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const PROJECT_ID = 'accsuite117'
const PILOT_UID = 'qa-pilot'
const SECOND_PILOT_UID = 'qa-pilot-2'
const COACH_UID = 'qa-coach'
const ADMIN_UID = 'qa-admin'
const FRESH_PILOT_UID = 'qa-fresh-pilot'

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
    receivedAt: serverTimestamp(),
    suiteVersion: '0.4.0-dev.1',
    channel: 'develop'
  }
}

function runtimeInstallationPayload(installationId: string, lastContactAt = '2026-07-30T19:00:00.000Z') {
  return {
    schemaVersion: 2,
    installationId,
    startedAt: '2026-07-30T18:00:00.000Z',
    lastSuiteLaunchAt: '2026-07-30T18:45:00.000Z',
    lastDashboardOpenedAt: '2026-07-30T18:50:00.000Z',
    lastContactAt,
    suiteVersion: '0.4.0-dev.4',
    channel: 'develop',
    updateState: 'current',
    lastCheckAt: null,
    components: { launcher: '0.4.0-dev.4', logger: null, webapp: '0.4.0-dev.4', kokoroRuntime: null },
    health: { status: 'healthy', phase: 'ready', reasonCode: null },
    migration: { status: 'healthy', phase: 'completed', progress: 100, code: null, resumedFrom: null }
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
      setDoc(doc(db, `users/${COACH_UID}`), {
        role: 'coach',
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

describe('fresh user provisioning contract', () => {
  it('accetta create e retry dello stesso profilo pilot completo', async () => {
    const db = testEnv.authenticatedContext(FRESH_PILOT_UID).firestore()
    const userRef = doc(db, `users/${FRESH_PILOT_UID}`)
    const payload = {
      uid: FRESH_PILOT_UID,
      email: 'qa-fresh-pilot@accsuite.invalid',
      nickname: 'qa-fresh-pilot',
      role: 'pilot',
      coachId: null,
      createdAt: '2026-08-14T13:00:00.000Z',
      emailVerified: true
    }

    await assertSucceeds(setDoc(userRef, payload))
    await assertSucceeds(setDoc(userRef, payload))

    const stored = await assertSucceeds(getDoc(userRef))
    expect(stored.data()?.coachId).toBeNull()
  })
})

describe('canonical session synchronization', () => {
  it('round-trips the Python V5 summary without reinterpretation', async () => {
    const db = testEnv.authenticatedContext(PILOT_UID).firestore()
    const canonicalSummary = {
      best_rules_version: 5,
      laps: 2,
      lapsValid: 2,
      bestLap: 100000,
      avgCleanLap: 100500,
      totalTime: 201000,
      stintCount: 1,
      best_qualy_ms: null,
      best_qualy_conditions: null,
      best_session_race_ms: 109999,
      best_session_race_conditions: { airTemp: 20, roadTemp: 28, grip: 'Fast' },
      best_race_ms: 109999,
      best_race_conditions: { airTemp: 20, roadTemp: 28, grip: 'Fast' },
      best_avg_race_ms: 100500,
      best_avg_race_conditions: { airTemp: 20, roadTemp: 28, grip: 'Fast' },
      best_by_grip: { Fast: { source: 'python_fixture' } },
      provenance: { source: 'python', generated_at: '2026-08-14T10:00:00.000Z' }
    }
    const rawObj = {
      ownerId: PILOT_UID,
      session_info: {
        track: 'spa',
        date_start: '2026-08-14T10:00:00.000Z',
        car_model: 'amr_v8_vantage_gt3',
        session_type: 2,
        laps_total: 2,
        laps_valid: 2,
        session_best_lap: 100000,
        avg_clean_lap: 100500,
        total_drive_time_ms: 201000
      },
      stints: [{
        fuel_start: 60,
        laps: [
          { lap_time_ms: 100000, is_valid: true },
          { lap_time_ms: 101000, is_valid: true }
        ]
      }],
      summary: canonicalSummary
    }
    const rawText = JSON.stringify(rawObj)
    const service = createSessionUploadService({
      db,
      chunkSize: 100000,
      getExistingSession: async () => null,
      loadRegistryCache: async () => ({}),
      canSkipViaRegistry: () => false,
      deleteOldChunks: async () => undefined
    })

    const result = await service.uploadOrUpdateSession(
      rawObj,
      rawText,
      'pip-321-canonical.json',
      PILOT_UID
    )

    expect(result.status).toBe('created')
    expect(result.sessionId).toBeTruthy()
    const stored = await assertSucceeds(getDoc(doc(db, `users/${PILOT_UID}/sessions/${result.sessionId}`)))
    expect(stored.data()?.summary).toEqual(canonicalSummary)
  })
})

describe('diagnostics rules', () => {
  it('permette al proprietario create e get puntuale, ma non list', async () => {
    const db = testEnv.authenticatedContext(PILOT_UID).firestore()
    const eventRef = doc(db, `users/${PILOT_UID}/diagnostics/event-1`)

    await assertSucceeds(setDoc(eventRef, diagnosticPayload(PILOT_UID, 'event-1')))
    await assertSucceeds(getDoc(eventRef))
    await assertFails(getDocs(collection(db, `users/${PILOT_UID}/diagnostics`)))
  })

  it('vincola tipi, enum, timestamp server e limiti diagnostica', async () => {
    const db = testEnv.authenticatedContext(PILOT_UID).firestore()
    const ref = doc(db, `users/${PILOT_UID}/diagnostics/event-1`)
    const payload = diagnosticPayload(PILOT_UID, 'event-1')

    await assertFails(setDoc(ref, { ...payload, severity: 'debug' }))
    await assertFails(setDoc(ref, { ...payload, code: 'x'.repeat(81) }))
    await assertFails(setDoc(ref, { ...payload, receivedAt: '2026-07-18T10:00:01.000Z' }))
    await assertFails(setDoc(ref, { ...payload, channel: 'production' }))
    await assertFails(setDoc(ref, {
      ...payload,
      context: Object.fromEntries(Array.from({ length: 13 }, (_, index) => [`key${index}`, index]))
    }))
    await assertFails(setDoc(ref, { ...payload, unexpected: true }))
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

  it('nega lettura ed eliminazione diagnostica a coach e piloti', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), `users/${PILOT_UID}/diagnostics/restricted`),
        diagnosticPayload(PILOT_UID, 'restricted')
      )
    })
    const coachDb = testEnv.authenticatedContext(COACH_UID).firestore()
    const pilotDb = testEnv.authenticatedContext(SECOND_PILOT_UID).firestore()
    await assertFails(getDocs(collectionGroup(coachDb, 'diagnostics')))
    await assertFails(getDocs(collectionGroup(pilotDb, 'diagnostics')))
    await assertFails(deleteDoc(doc(coachDb, `users/${PILOT_UID}/diagnostics/restricted`)))
    await assertFails(deleteDoc(doc(pilotDb, `users/${PILOT_UID}/diagnostics/restricted`)))
  })

  it('consente solo all’admin la query di pulizia su receivedAt autorevole', async () => {
    const cutoff = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000)
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await Promise.all([
        setDoc(doc(db, `users/${PILOT_UID}/diagnostics/expired`), {
          ...diagnosticPayload(PILOT_UID, 'expired'),
          receivedAt: Timestamp.fromMillis(cutoff.toMillis() - 1000)
        }),
        setDoc(doc(db, `users/${PILOT_UID}/diagnostics/recent`), {
          ...diagnosticPayload(PILOT_UID, 'recent'),
          receivedAt: Timestamp.fromMillis(cutoff.toMillis() + 1000)
        })
      ])
    })

    const cleanupQuery = (db: ReturnType<ReturnType<typeof testEnv.authenticatedContext>['firestore']>) => query(
      collectionGroup(db, 'diagnostics'),
      where('receivedAt', '<=', cutoff),
      orderBy('receivedAt', 'asc'),
      limit(200)
    )
    const adminDb = testEnv.authenticatedContext(ADMIN_UID).firestore()
    await assertSucceeds(getDocs(cleanupQuery(adminDb)))
    await assertFails(getDocs(cleanupQuery(testEnv.authenticatedContext(COACH_UID).firestore())))
    await assertFails(getDocs(cleanupQuery(testEnv.authenticatedContext(SECOND_PILOT_UID).firestore())))
  })
})

describe('heartbeat and admin projection rules', () => {
  it('mantiene distinte due installazioni dello stesso utente', async () => {
    const db = testEnv.authenticatedContext(PILOT_UID).firestore()
    const a = doc(db, `users/${PILOT_UID}/runtimeInstallations/install-a`)
    const b = doc(db, `users/${PILOT_UID}/runtimeInstallations/install-b`)

    await assertSucceeds(setDoc(a, runtimeInstallationPayload('install-a')))
    await assertSucceeds(setDoc(b, runtimeInstallationPayload('install-b')))
    await assertSucceeds(setDoc(a, {
      ...runtimeInstallationPayload('install-a'),
      lastContactAt: '2026-07-30T19:15:00.000Z'
    }))

    const [aSnap, bSnap] = await Promise.all([getDoc(a), getDoc(b)])
    expect(aSnap.data()?.lastContactAt).toBe('2026-07-30T19:15:00.000Z')
    expect(bSnap.data()?.lastContactAt).toBe('2026-07-30T19:00:00.000Z')
  })

  it('vincola schema, identita e startedAt del report installation-aware', async () => {
    const db = testEnv.authenticatedContext(PILOT_UID).firestore()
    const ref = doc(db, `users/${PILOT_UID}/runtimeInstallations/install-a`)
    await assertFails(setDoc(ref, runtimeInstallationPayload('install-b')))
    await assertFails(setDoc(ref, { ...runtimeInstallationPayload('install-a'), rootKey: 'secret' }))
    await assertFails(setDoc(ref, {
      ...runtimeInstallationPayload('install-a'),
      lastSuiteLaunchAt: 42
    }))
    const legacyPayload: Record<string, unknown> = runtimeInstallationPayload('install-a')
    delete legacyPayload.lastSuiteLaunchAt
    delete legacyPayload.lastDashboardOpenedAt
    await assertSucceeds(setDoc(ref, legacyPayload))
    await assertSucceeds(setDoc(ref, runtimeInstallationPayload('install-a')))
    await assertFails(setDoc(ref, {
      ...runtimeInstallationPayload('install-a'),
      startedAt: '2026-07-30T18:30:00.000Z'
    }))
  })

  it('nega cross-user e coach, consente read/list admin', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), `users/${PILOT_UID}/runtimeInstallations/install-a`),
        runtimeInstallationPayload('install-a')
      )
    })
    const otherDb = testEnv.authenticatedContext(SECOND_PILOT_UID).firestore()
    const coachDb = testEnv.authenticatedContext(COACH_UID).firestore()
    const adminDb = testEnv.authenticatedContext(ADMIN_UID).firestore()

    await assertFails(getDoc(doc(otherDb, `users/${PILOT_UID}/runtimeInstallations/install-a`)))
    await assertFails(getDocs(collectionGroup(coachDb, 'runtimeInstallations')))
    await assertSucceeds(getDoc(doc(adminDb, `users/${PILOT_UID}/runtimeInstallations/install-a`)))
    await assertSucceeds(getDocs(collectionGroup(adminDb, 'runtimeInstallations')))
  })

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

describe('migration checkpoint emulator', () => {
  it('serializza checkpoint e rifiuta un writer stale dopo cambio lease', async () => {
    const db = testEnv.authenticatedContext(PILOT_UID).firestore()
    const userRef = doc(db, `users/${PILOT_UID}`)
    await assertSucceeds(setDoc(userRef, {
      maintenance: {
        canonicalDataMigration: { version: 5, bestRulesVersion: 5, status: 'running' },
        firebaseStructureHealth: {
          status: 'repairing',
          lease: { id: 'lease-1', expiresAt: '2026-07-30T19:00:00.000Z' }
        }
      }
    }, { merge: true }))

    const run = <T>(callback: Parameters<typeof advanceCanonicalMigrationCheckpoint>[0]['runTransaction'] extends (
      callback: infer C
    ) => Promise<T> ? C : never) => runTransaction(db, async (transaction) => callback(transaction as never))
    const first = buildCanonicalMigrationCheckpoint({
      attempt: 1,
      phase: 'rebuild',
      targetMigrationVersion: 5,
      targetBestRulesVersion: 5
    })
    await expect(advanceCanonicalMigrationCheckpoint({
      runTransaction: run as never,
      userRef,
      leaseId: 'lease-1',
      checkpoint: first
    })).resolves.toBe('advanced')

    await assertSucceeds(setDoc(userRef, {
      maintenance: {
        firebaseStructureHealth: {
          status: 'repairing',
          lease: { id: 'lease-2', expiresAt: '2026-07-30T19:10:00.000Z' }
        }
      }
    }, { merge: true }))
    const stale = buildCanonicalMigrationCheckpoint({
      attempt: 2,
      phase: 'checking_status',
      targetMigrationVersion: 5,
      targetBestRulesVersion: 5,
      resumedFrom: 'rebuild'
    })
    await expect(advanceCanonicalMigrationCheckpoint({
      runTransaction: run as never,
      userRef,
      leaseId: 'lease-1',
      checkpoint: stale
    })).resolves.toBe('stale_lease')

    const beforeResume = (await getDoc(userRef)).data()?.maintenance?.canonicalDataMigration?.checkpoint
    expect(beforeResume.phase).toBe('rebuild')
    expect(beforeResume.attempt).toBe(1)
    await expect(advanceCanonicalMigrationCheckpoint({
      runTransaction: run as never,
      userRef,
      leaseId: 'lease-2',
      checkpoint: stale
    })).resolves.toBe('advanced')
    const resumed = (await getDoc(userRef)).data()?.maintenance?.canonicalDataMigration?.checkpoint
    expect(resumed).toMatchObject({ attempt: 2, phase: 'checking_status', resumedFrom: 'rebuild' })
  })

  it('nega downgrade future e richiede completed prima di healthy', async () => {
    const db = testEnv.authenticatedContext(PILOT_UID).firestore()
    const userRef = doc(db, `users/${PILOT_UID}`)
    await assertSucceeds(setDoc(userRef, {
      maintenance: {
        canonicalDataMigration: { version: 6, bestRulesVersion: 6, status: 'completed' },
        firebaseStructureHealth: { status: 'future_schema' }
      }
    }, { merge: true }))
    const stored = (await getDoc(userRef)).data()?.maintenance
    expect(inspectFirebaseStructureState({
      migration: stored?.canonicalDataMigration,
      health: stored?.firebaseStructureHealth,
      targetMigrationVersion: 5,
      targetBestRulesVersion: 5
    }).action).toBe('future_schema')

    const finalVerification = buildCanonicalMigrationCheckpoint({
      attempt: 1,
      phase: 'final_verification',
      targetMigrationVersion: 5,
      targetBestRulesVersion: 5
    })
    expect(isCompletedCanonicalMigrationCheckpoint({
      checkpoint: finalVerification,
      targetMigrationVersion: 5,
      targetBestRulesVersion: 5
    })).toBe(false)
  })
})
