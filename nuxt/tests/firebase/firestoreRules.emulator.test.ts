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
  documentId,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  startAfter,
  Timestamp,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore'
import {
  advanceCanonicalMigrationCheckpoint,
  buildCanonicalMigrationCheckpoint,
  isCompletedCanonicalMigrationCheckpoint
} from '~/services/sync/canonicalMigrationCheckpoint'
import { createSessionUploadService } from '~/services/sync/sessionUploadService'
import { inspectFirebaseStructureState } from '~/services/sync/firebaseStructureHealthService'
import { repairPilotDirectoryFromUser } from '~/services/pilotDirectoryProjectionService'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const PROJECT_ID = 'accsuite117'
const PILOT_UID = 'qa-pilot'
const SECOND_PILOT_UID = 'qa-pilot-2'
const COACH_UID = 'qa-coach'
const ADMIN_UID = 'qa-admin'
const FRESH_PILOT_UID = 'qa-fresh-pilot'
const FRESH_PILOT_EMAIL = 'qa-fresh-pilot@accsuite.invalid'

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

function initialPilotUserPayload(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    uid,
    email: `${uid}@accsuite.invalid`,
    nickname: uid,
    role: 'pilot',
    coachId: null,
    createdAt: '2026-08-14T13:00:00.000Z',
    emailVerified: true,
    directorySortName: uid,
    searchPrefixes: [uid],
    ...overrides
  }
}

function publicProfilePayload(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    uid,
    nickname: uid,
    avatarUrl: null,
    createdAt: '2026-08-14T13:00:00.000Z',
    updatedAt: '2026-08-14T13:00:00.000Z',
    ...overrides
  }
}

function pilotDirectoryPayload(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    uid,
    firstName: '',
    lastName: '',
    nickname: uid,
    role: 'pilot',
    coachId: null,
    sessionsLast7Days: 0,
    lastSessionDate: null,
    suiteVersion: null,
    suiteVersionUpdatedAt: null,
    clientChannel: null,
    clientUpdateState: null,
    clientLastHeartbeatAt: null,
    directorySortName: uid,
    searchPrefixes: [uid],
    ...overrides
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
        uid: PILOT_UID,
        role: 'pilot',
        coachId: null
      }),
      setDoc(doc(db, `users/${SECOND_PILOT_UID}`), {
        uid: SECOND_PILOT_UID,
        role: 'pilot',
        coachId: null
      }),
      setDoc(doc(db, `users/${ADMIN_UID}`), {
        uid: ADMIN_UID,
        role: 'admin',
        coachId: null
      }),
      setDoc(doc(db, `users/${COACH_UID}`), {
        uid: COACH_UID,
        role: 'coach',
        coachId: null
      }),
      setDoc(doc(db, `pilotDirectory/${PILOT_UID}`), pilotDirectoryPayload(PILOT_UID))
    ])
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

describe('fresh user provisioning contract', () => {
  it('crea profilo e proiezioni in una sola batch validata sullo stato finale', async () => {
    const db = testEnv.authenticatedContext(FRESH_PILOT_UID, {
      email: FRESH_PILOT_EMAIL,
      email_verified: true
    }).firestore()
    const batch = writeBatch(db)
    batch.set(doc(db, `users/${FRESH_PILOT_UID}`), initialPilotUserPayload(FRESH_PILOT_UID))
    batch.set(doc(db, `pilotDirectory/${FRESH_PILOT_UID}`), pilotDirectoryPayload(FRESH_PILOT_UID))
    batch.set(doc(db, `publicProfiles/${FRESH_PILOT_UID}`), publicProfilePayload(FRESH_PILOT_UID))

    await assertSucceeds(batch.commit())

    await expect(getDoc(doc(db, `users/${FRESH_PILOT_UID}`))).resolves.toMatchObject({ exists: expect.any(Function) })
    expect((await getDoc(doc(db, `users/${FRESH_PILOT_UID}`))).exists()).toBe(true)
    expect((await getDoc(doc(db, `pilotDirectory/${FRESH_PILOT_UID}`))).exists()).toBe(true)
    expect((await getDoc(doc(db, `publicProfiles/${FRESH_PILOT_UID}`))).exists()).toBe(true)
  })

  it('rifiuta tutta la batch se la directory non coincide con il ruolo autorevole', async () => {
    const db = testEnv.authenticatedContext(FRESH_PILOT_UID, {
      email: FRESH_PILOT_EMAIL,
      email_verified: true
    }).firestore()
    const batch = writeBatch(db)
    batch.set(doc(db, `users/${FRESH_PILOT_UID}`), initialPilotUserPayload(FRESH_PILOT_UID))
    batch.set(
      doc(db, `pilotDirectory/${FRESH_PILOT_UID}`),
      pilotDirectoryPayload(FRESH_PILOT_UID, { role: 'coach' })
    )
    batch.set(doc(db, `publicProfiles/${FRESH_PILOT_UID}`), publicProfilePayload(FRESH_PILOT_UID))

    await assertFails(batch.commit())

    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const adminDb = adminContext.firestore()
      expect((await getDoc(doc(adminDb, `users/${FRESH_PILOT_UID}`))).exists()).toBe(false)
      expect((await getDoc(doc(adminDb, `pilotDirectory/${FRESH_PILOT_UID}`))).exists()).toBe(false)
      expect((await getDoc(doc(adminDb, `publicProfiles/${FRESH_PILOT_UID}`))).exists()).toBe(false)
    })
  })

  it('accetta create e retry dello stesso profilo pilot completo', async () => {
    const db = testEnv.authenticatedContext(FRESH_PILOT_UID, {
      email: FRESH_PILOT_EMAIL,
      email_verified: true
    }).firestore()
    const userRef = doc(db, `users/${FRESH_PILOT_UID}`)
    const payload = initialPilotUserPayload(FRESH_PILOT_UID)

    await assertSucceeds(setDoc(userRef, payload))
    await assertSucceeds(setDoc(userRef, payload))
    await assertSucceeds(setDoc(
      doc(db, `pilotDirectory/${FRESH_PILOT_UID}`),
      pilotDirectoryPayload(FRESH_PILOT_UID)
    ))
    await assertSucceeds(setDoc(
      doc(db, `publicProfiles/${FRESH_PILOT_UID}`),
      publicProfilePayload(FRESH_PILOT_UID)
    ))

    const stored = await assertSucceeds(getDoc(userRef))
    expect(stored.data()?.coachId).toBeNull()
  })
})

describe('top-level profile authorization matrix', () => {
  it('nega self-admin, self-coach, identita incoerente e shape user extra o incompleta', async () => {
    const db = testEnv.authenticatedContext(FRESH_PILOT_UID, {
      email: FRESH_PILOT_EMAIL,
      email_verified: true
    }).firestore()
    const userRef = doc(db, `users/${FRESH_PILOT_UID}`)
    const payload = initialPilotUserPayload(FRESH_PILOT_UID)

    await assertFails(setDoc(userRef, { ...payload, role: 'admin' }))
    await assertFails(setDoc(userRef, { ...payload, role: 'coach' }))
    await assertFails(setDoc(userRef, { ...payload, coachId: FRESH_PILOT_UID }))
    await assertFails(setDoc(userRef, { ...payload, uid: SECOND_PILOT_UID }))
    await assertFails(setDoc(userRef, { ...payload, email: 'spoofed@accsuite.invalid' }))
    await assertFails(setDoc(userRef, { ...payload, emailVerified: false }))
    await assertFails(setDoc(userRef, { ...payload, serverOwned: true }))
    await assertFails(setDoc(userRef, { ...payload, nickname: 42 }))
    await assertFails(setDoc(userRef, { ...payload, searchPrefixes: 'qa' }))

    const incomplete = { ...payload } as Record<string, unknown>
    delete incomplete.searchPrefixes
    await assertFails(setDoc(userRef, incomplete))
    await assertFails(setDoc(
      doc(db, `users/${SECOND_PILOT_UID}`),
      initialPilotUserPayload(SECOND_PILOT_UID)
    ))
  })

  it('consente update owner legittimi ma blocca trusted fields e delete user', async () => {
    const db = testEnv.authenticatedContext(PILOT_UID).firestore()
    const userRef = doc(db, `users/${PILOT_UID}`)

    await assertSucceeds(setDoc(userRef, {
      equipment: { wheel: 'QA Wheel' },
      stats: { schemaVersion: 1, totalSessions: 2 },
      maintenance: { firebaseStructureHealth: { status: 'repairing' } }
    }, { merge: true }))
    await assertFails(updateDoc(userRef, { role: 'admin' }))
    await assertFails(updateDoc(userRef, { coachId: PILOT_UID }))
    await assertFails(updateDoc(userRef, { uid: SECOND_PILOT_UID }))
    await assertFails(updateDoc(userRef, { createdAt: 'spoofed' }))
    await assertFails(setDoc(userRef, { serverOwned: true }, { merge: true }))
    await assertFails(deleteDoc(userRef))
  })

  it('vincola email ed emailVerified del profilo esistente ai claim Auth', async () => {
    const uid = 'qa-auth-identity'
    const email = `${uid}@accsuite.invalid`
    const db = testEnv.authenticatedContext(uid, {
      email,
      email_verified: true
    }).firestore()
    const userRef = doc(db, `users/${uid}`)

    await assertSucceeds(setDoc(userRef, initialPilotUserPayload(uid)))
    await assertFails(updateDoc(userRef, { email: 'spoofed@accsuite.invalid' }))
    await assertFails(updateDoc(userRef, { emailVerified: false }))
    await assertSucceeds(updateDoc(userRef, { nickname: 'QA Auth' }))
  })

  it('consente all admin create, update e delete user', async () => {
    const uid = 'qa-admin-managed-user'
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore()
    const userRef = doc(db, `users/${uid}`)

    await assertSucceeds(setDoc(userRef, {
      uid,
      role: 'coach',
      coachId: null,
      createdAt: '2026-08-17T20:00:00.000Z'
    }))
    await assertSucceeds(updateDoc(userRef, { role: 'pilot', coachId: COACH_UID }))
    await assertSucceeds(deleteDoc(userRef))
  })

  it('consente read al coach assegnato ma nega mutazioni e pilot-spoof', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, `users/${PILOT_UID}`), {
        uid: PILOT_UID,
        role: 'pilot',
        coachId: COACH_UID
      })
    })

    const coachDb = testEnv.authenticatedContext(COACH_UID).firestore()
    const pilotSpoofDb = testEnv.authenticatedContext(SECOND_PILOT_UID).firestore()
    await assertSucceeds(getDoc(doc(coachDb, `users/${PILOT_UID}`)))
    await assertFails(setDoc(doc(coachDb, 'users/qa-coach-created'), {
      uid: 'qa-coach-created',
      role: 'pilot',
      coachId: COACH_UID
    }))
    await assertFails(updateDoc(doc(coachDb, `users/${PILOT_UID}`), { nickname: 'tamper' }))
    await assertFails(deleteDoc(doc(coachDb, `users/${PILOT_UID}`)))

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), `users/${PILOT_UID}`), {
        coachId: SECOND_PILOT_UID
      })
    })
    await assertFails(getDoc(doc(pilotSpoofDb, `users/${PILOT_UID}`)))
  })

  it('limita publicProfiles owner ai campi pubblici e riserva delete all admin', async () => {
    const db = testEnv.authenticatedContext(PILOT_UID).firestore()
    const profileRef = doc(db, `publicProfiles/${PILOT_UID}`)
    const ensurePayload = publicProfilePayload(PILOT_UID) as Record<string, unknown>
    delete ensurePayload.createdAt

    await assertSucceeds(setDoc(profileRef, ensurePayload))
    await assertSucceeds(updateDoc(profileRef, {
      nickname: 'QA Pilot',
      updatedAt: '2026-08-17T20:01:00.000Z'
    }))
    await assertFails(setDoc(profileRef, { role: 'admin' }, { merge: true }))
    await assertFails(updateDoc(profileRef, { nickname: 42 }))
    await assertFails(updateDoc(profileRef, { uid: SECOND_PILOT_UID }))
    await assertFails(updateDoc(profileRef, { createdAt: 'spoofed' }))
    await assertFails(deleteDoc(profileRef))
  })

  it('applica la matrice admin/coach a publicProfiles', async () => {
    const uid = 'qa-public-managed'
    const profilePath = `publicProfiles/${uid}`
    const adminDb = testEnv.authenticatedContext(ADMIN_UID).firestore()
    const coachDb = testEnv.authenticatedContext(COACH_UID).firestore()

    await assertFails(setDoc(doc(coachDb, profilePath), publicProfilePayload(uid)))
    await assertSucceeds(setDoc(doc(adminDb, profilePath), publicProfilePayload(uid)))
    await assertFails(updateDoc(doc(coachDb, profilePath), { nickname: 'tamper' }))
    await assertFails(deleteDoc(doc(coachDb, profilePath)))
    await assertSucceeds(updateDoc(doc(adminDb, profilePath), {
      createdAt: '2026-08-17T20:02:00.000Z'
    }))
    await assertSucceeds(deleteDoc(doc(adminDb, profilePath)))
  })

  it('richiede directory owner completa, allowlisted e coerente con users', async () => {
    const uid = 'qa-directory-owner'
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `users/${uid}`), {
        uid,
        role: 'pilot',
        coachId: null
      })
    })
    const db = testEnv.authenticatedContext(uid).firestore()
    const directoryRef = doc(db, `pilotDirectory/${uid}`)
    const payload = pilotDirectoryPayload(uid)

    await assertFails(setDoc(directoryRef, { schemaVersion: 1, uid }))
    await assertFails(setDoc(directoryRef, { ...payload, role: 'admin' }))
    await assertFails(setDoc(directoryRef, { ...payload, coachId: uid }))
    await assertFails(setDoc(directoryRef, { ...payload, uid: SECOND_PILOT_UID }))
    await assertFails(setDoc(directoryRef, { ...payload, serverOwned: true }))
    await assertFails(setDoc(directoryRef, { ...payload, sessionsLast7Days: 'three' }))
    await assertSucceeds(setDoc(directoryRef, payload))
    await assertSucceeds(setDoc(directoryRef, {
      schemaVersion: 1,
      uid,
      sessionsLast7Days: 3,
      lastSessionDate: '2026-08-17T20:03:00.000Z',
      suiteVersion: '0.4.0-dev.5',
      suiteVersionUpdatedAt: '2026-08-17T20:03:00.000Z',
      clientChannel: 'develop',
      clientUpdateState: 'current',
      clientLastHeartbeatAt: '2026-08-17T20:03:00.000Z',
      firebaseHealthStatus: 'healthy',
      firebaseHealthMigrationVersion: 5,
      firebaseHealthCheckedAt: '2026-08-17T20:03:00.000Z',
      firebaseHealthCode: 'structure_verified'
    }, { merge: true }))
    await assertFails(updateDoc(directoryRef, { role: 'admin' }))
    await assertFails(updateDoc(directoryRef, { coachId: uid }))
    await assertFails(setDoc(directoryRef, { trustedExtra: true }, { merge: true }))
    await assertFails(deleteDoc(directoryRef))
  })

  it('ripara una directory mancante e proietta solo coach autorevole', async () => {
    const adminDb = testEnv.authenticatedContext(ADMIN_UID).firestore()
    await assertSucceeds(updateDoc(doc(adminDb, `users/${PILOT_UID}`), {
      coachId: COACH_UID
    }))
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await deleteDoc(doc(context.firestore(), `pilotDirectory/${PILOT_UID}`))
    })

    const ownerDb = testEnv.authenticatedContext(PILOT_UID).firestore()
    await expect(repairPilotDirectoryFromUser({
      db: ownerDb,
      uid: PILOT_UID,
      getDocFn: getDoc,
      setDocFn: setDoc
    })).resolves.toMatchObject({ uid: PILOT_UID, wrote: true })

    const stored = await assertSucceeds(getDoc(doc(ownerDb, `pilotDirectory/${PILOT_UID}`)))
    expect(stored.data()).toMatchObject({
      uid: PILOT_UID,
      role: 'pilot',
      coachId: COACH_UID
    })
    const coachDb = testEnv.authenticatedContext(COACH_UID).firestore()
    await assertSucceeds(getDoc(doc(coachDb, `pilotDirectory/${PILOT_UID}`)))
    await assertFails(getDoc(doc(
      testEnv.authenticatedContext(SECOND_PILOT_UID).firestore(),
      `pilotDirectory/${PILOT_UID}`
    )))
  })

  it('applica create, update e delete admin e nega le stesse mutazioni al coach', async () => {
    const uid = 'qa-directory-managed'
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `users/${uid}`), {
        uid,
        role: 'pilot',
        coachId: null
      })
    })
    const adminDb = testEnv.authenticatedContext(ADMIN_UID).firestore()
    const coachDb = testEnv.authenticatedContext(COACH_UID).firestore()
    const path = `pilotDirectory/${uid}`

    await assertFails(setDoc(doc(coachDb, path), pilotDirectoryPayload(uid)))
    await assertSucceeds(setDoc(doc(adminDb, path), pilotDirectoryPayload(uid)))
    await assertFails(updateDoc(doc(coachDb, path), { nickname: 'tamper' }))
    await assertFails(deleteDoc(doc(coachDb, path)))
    await assertSucceeds(updateDoc(doc(adminDb, path), { nickname: 'Admin managed' }))
    await assertFails(updateDoc(doc(adminDb, path), { role: 'admin' }))
    await assertSucceeds(updateDoc(doc(adminDb, `users/${uid}`), { role: 'coach' }))
    await assertSucceeds(updateDoc(doc(adminDb, path), { role: 'coach' }))
    await assertSucceeds(deleteDoc(doc(adminDb, path)))
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
      listExistingChunks: async () => []
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

  it('permette all’admin list bounded e delete, negando list non bounded', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), `users/${PILOT_UID}/diagnostics/event-1`),
        diagnosticPayload(PILOT_UID, 'event-1')
      )
    })

    const adminDb = testEnv.authenticatedContext(ADMIN_UID).firestore()
    await assertSucceeds(getDocs(query(collectionGroup(adminDb, 'diagnostics'), limit(50))))
    await assertFails(getDocs(query(collectionGroup(adminDb, 'diagnostics'))))
    await assertFails(getDocs(query(collectionGroup(adminDb, 'diagnostics'), limit(1002))))
    await assertSucceeds(deleteDoc(
      doc(adminDb, `users/${PILOT_UID}/diagnostics/event-1`)
    ))
  })

  it('pagina oltre 50 eventi con cursor stabile receivedAt+path e count coerente', async () => {
    const baseMs = Date.parse('2026-08-18T10:00:00.000Z')
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await Promise.all(Array.from({ length: 60 }, (_, index) => {
        const eventId = `bounded-${String(index).padStart(3, '0')}`
        return setDoc(doc(db, `users/${PILOT_UID}/diagnostics/${eventId}`), {
          ...diagnosticPayload(PILOT_UID, eventId),
          component: 'logger',
          severity: 'error',
          receivedAt: Timestamp.fromMillis(baseMs - (index === 50 ? 49 : index) * 1000),
          occurredAt: index === 0
            ? 'not-a-date'
            : index === 1
              ? '2099-01-01T00:00:00.000Z'
              : index === 59
                ? '1999-01-01T00:00:00.000Z'
                : new Date(baseMs + index * 86_400_000).toISOString()
        })
      }))
    })

    const adminDb = testEnv.authenticatedContext(ADMIN_UID).firestore()
    const constraints = [
      where('receivedAt', '>=', Timestamp.fromMillis(baseMs - 120_000)),
      where('receivedAt', '<', Timestamp.fromMillis(baseMs + 1000)),
      where('component', '==', 'logger'),
      where('severity', '==', 'error'),
      orderBy('receivedAt', 'desc'),
      orderBy(documentId(), 'desc')
    ] as const
    const first = await assertSucceeds(getDocs(query(
      collectionGroup(adminDb, 'diagnostics'),
      ...constraints,
      limit(50)
    )))
    const firstLast = first.docs.at(-1)!
    const second = await assertSucceeds(getDocs(query(
      collectionGroup(adminDb, 'diagnostics'),
      ...constraints,
      startAfter(firstLast.data().receivedAt, firstLast.ref.path),
      limit(50)
    )))
    const ids = [...first.docs, ...second.docs].map(snapshot => snapshot.id)

    expect(first.size).toBe(50)
    expect(second.size).toBe(10)
    expect(new Set(ids).size).toBe(60)
    expect(ids[0]).toBe('bounded-000')
    expect(ids.at(-1)).toBe('bounded-059')
    expect(first.docs[0]?.data().occurredAt).toBe('not-a-date')
    expect(first.docs[1]?.data().occurredAt).toBe('2099-01-01T00:00:00.000Z')
    expect(second.docs.at(-1)?.data().occurredAt).toBe('1999-01-01T00:00:00.000Z')
    expect(ids.indexOf('bounded-050')).toBeLessThan(ids.indexOf('bounded-049'))

    const count = await assertSucceeds(getCountFromServer(query(
      collectionGroup(adminDb, 'diagnostics'),
      where('receivedAt', '>=', Timestamp.fromMillis(baseMs - 120_000)),
      where('receivedAt', '<', Timestamp.fromMillis(baseMs + 1000)),
      where('component', '==', 'logger'),
      where('severity', '==', 'error'),
      limit(1001)
    )))
    expect(count.data().count).toBe(60)
  })

  it('nega lettura ed eliminazione diagnostica a coach, piloti e non autenticati', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), `users/${PILOT_UID}/diagnostics/restricted`),
        diagnosticPayload(PILOT_UID, 'restricted')
      )
    })
    const coachDb = testEnv.authenticatedContext(COACH_UID).firestore()
    const pilotDb = testEnv.authenticatedContext(SECOND_PILOT_UID).firestore()
    const unauthenticatedDb = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDocs(query(collectionGroup(coachDb, 'diagnostics'), limit(50))))
    await assertFails(getDocs(query(collectionGroup(pilotDb, 'diagnostics'), limit(50))))
    await assertFails(getDocs(query(collectionGroup(unauthenticatedDb, 'diagnostics'), limit(50))))
    await assertFails(deleteDoc(doc(coachDb, `users/${PILOT_UID}/diagnostics/restricted`)))
    await assertFails(deleteDoc(doc(pilotDb, `users/${PILOT_UID}/diagnostics/restricted`)))
    await assertFails(deleteDoc(doc(unauthenticatedDb, `users/${PILOT_UID}/diagnostics/restricted`)))
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
    const expired = await assertSucceeds(getDocs(cleanupQuery(adminDb)))
    const cleanupBatch = writeBatch(adminDb)
    expired.docs.forEach(snapshot => cleanupBatch.delete(snapshot.ref))
    await assertSucceeds(cleanupBatch.commit())
    expect((await getDocs(cleanupQuery(adminDb))).empty).toBe(true)
    expect((await getDoc(doc(adminDb, `users/${PILOT_UID}/diagnostics/recent`))).exists()).toBe(true)
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

// ============================================================================
// Pit Wall (PIP-359): il collegamento fra pilota e ingegnere e' un permesso fra
// due account. Qui si prova che nessuno possa autorizzarsi da solo, che la
// telemetria non abbia una porta d'ingresso, e che l'esito di un ordine lo
// dichiari soltanto il PC che lo applica davvero.
// ============================================================================

const DRIVER_UID = PILOT_UID
const ENGINEER_UID = SECOND_PILOT_UID
const OUTSIDER_UID = 'qa-outsider'
const GRANT_ID = `${DRIVER_UID}__${ENGINEER_UID}`

function pitwallGrantPayload(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    driverUid: DRIVER_UID,
    engineerUid: ENGINEER_UID,
    status: 'pending',
    createdBy: ENGINEER_UID,
    createdAt: '2026-08-30T15:00:00.000Z',
    updatedAt: '2026-08-30T15:00:00.000Z',
    ...overrides
  }
}

function pitwallSessionPayload(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    driverUid: DRIVER_UID,
    sessionId: 'sessione-qa',
    online: true,
    updatedAt: '2026-08-30T15:00:00.000Z',
    car: 'ferrari_296_gt3',
    track: 'nurburgring',
    ...overrides
  }
}

function pitwallSignalPayload(from: string, to: string, overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    from,
    to,
    kind: 'offer',
    payload: 'v=0 o=- 0 0 IN IP4 127.0.0.1',
    createdAt: '2026-08-30T15:00:00.000Z',
    ...overrides
  }
}

function pitwallOrderPayload(orderId: string, senderId: string, overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    orderId,
    revision: 1,
    senderId,
    issuedAt: '2026-08-30T15:00:00.000Z',
    status: 'pending',
    plan: { fuelLiters: 60, tyreSet: 4 },
    ...overrides
  }
}

async function seedPitwallProfiles() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await Promise.all([
      setDoc(doc(db, `publicProfiles/${DRIVER_UID}`), publicProfilePayload(DRIVER_UID)),
      setDoc(doc(db, `publicProfiles/${ENGINEER_UID}`), publicProfilePayload(ENGINEER_UID)),
      setDoc(doc(db, `publicProfiles/${OUTSIDER_UID}`), publicProfilePayload(OUTSIDER_UID)),
      setDoc(doc(db, `users/${OUTSIDER_UID}`), { uid: OUTSIDER_UID, role: 'pilot', coachId: null })
    ])
  })
}

async function seedGrantedLink() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, `pitwallGrants/${GRANT_ID}`), pitwallGrantPayload({ status: 'granted' }))
    await setDoc(doc(db, `pitwallSessions/${DRIVER_UID}`), pitwallSessionPayload())
  })
}

describe('Pit Wall - permesso fra account', () => {
  beforeEach(seedPitwallProfiles)

  it('l ingegnere chiede il collegamento e la richiesta nasce in attesa', async () => {
    const db = testEnv.authenticatedContext(ENGINEER_UID).firestore()
    await assertSucceeds(setDoc(doc(db, `pitwallGrants/${GRANT_ID}`), pitwallGrantPayload()))
  })

  it('nessuno puo autorizzarsi da solo ad assistere un pilota', async () => {
    const db = testEnv.authenticatedContext(ENGINEER_UID).firestore()
    await assertFails(setDoc(doc(db, `pitwallGrants/${GRANT_ID}`), pitwallGrantPayload({ status: 'granted' })))
  })

  it('non si puo creare un permesso a nome di terzi', async () => {
    const db = testEnv.authenticatedContext(OUTSIDER_UID).firestore()
    await assertFails(setDoc(doc(db, `pitwallGrants/${GRANT_ID}`), pitwallGrantPayload()))
    await assertFails(setDoc(doc(db, `pitwallGrants/${GRANT_ID}`), pitwallGrantPayload({ status: 'granted', createdBy: OUTSIDER_UID })))
  })

  it('l id del permesso deve derivare dai due uid, per non avere doppioni divergenti', async () => {
    const db = testEnv.authenticatedContext(ENGINEER_UID).firestore()
    await assertFails(setDoc(doc(db, 'pitwallGrants/identificatore-inventato'), pitwallGrantPayload()))
  })

  it('non si chiede un collegamento a un account che non esiste', async () => {
    const db = testEnv.authenticatedContext(ENGINEER_UID).firestore()
    const ghost = 'qa-fantasma'
    await assertFails(setDoc(
      doc(db, `pitwallGrants/${ghost}__${ENGINEER_UID}`),
      pitwallGrantPayload({ driverUid: ghost })
    ))
  })

  it('il pilota puo pre-autorizzare un ingegnere senza attendere una richiesta', async () => {
    const db = testEnv.authenticatedContext(DRIVER_UID).firestore()
    await assertSucceeds(setDoc(doc(db, `pitwallGrants/${GRANT_ID}`), pitwallGrantPayload({
      status: 'granted',
      createdBy: DRIVER_UID
    })))
  })

  it('solo il pilota concede; l ingegnere non si approva la propria richiesta', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `pitwallGrants/${GRANT_ID}`), pitwallGrantPayload())
    })
    const engineerDb = testEnv.authenticatedContext(ENGINEER_UID).firestore()
    await assertFails(updateDoc(doc(engineerDb, `pitwallGrants/${GRANT_ID}`), {
      status: 'granted',
      updatedAt: '2026-08-30T15:05:00.000Z'
    }))

    const driverDb = testEnv.authenticatedContext(DRIVER_UID).firestore()
    await assertSucceeds(updateDoc(doc(driverDb, `pitwallGrants/${GRANT_ID}`), {
      status: 'granted',
      updatedAt: '2026-08-30T15:05:00.000Z'
    }))
  })

  it('entrambe le parti possono revocare, ma nessuna puo riscrivere le identita', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `pitwallGrants/${GRANT_ID}`), pitwallGrantPayload({ status: 'granted' }))
    })
    const engineerDb = testEnv.authenticatedContext(ENGINEER_UID).firestore()
    await assertFails(updateDoc(doc(engineerDb, `pitwallGrants/${GRANT_ID}`), {
      driverUid: OUTSIDER_UID,
      updatedAt: '2026-08-30T15:06:00.000Z'
    }))
    await assertSucceeds(updateDoc(doc(engineerDb, `pitwallGrants/${GRANT_ID}`), {
      status: 'revoked',
      updatedAt: '2026-08-30T15:06:00.000Z'
    }))
  })

  it('un estraneo non legge il permesso di altri', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `pitwallGrants/${GRANT_ID}`), pitwallGrantPayload({ status: 'granted' }))
    })
    const outsiderDb = testEnv.authenticatedContext(OUTSIDER_UID).firestore()
    await assertFails(getDoc(doc(outsiderDb, `pitwallGrants/${GRANT_ID}`)))
  })
})

describe('Pit Wall - sessione, segnalazione e ordini', () => {
  beforeEach(async () => {
    await seedPitwallProfiles()
    await seedGrantedLink()
  })

  it('l ingegnere autorizzato vede la sessione del pilota, un estraneo no', async () => {
    const engineerDb = testEnv.authenticatedContext(ENGINEER_UID).firestore()
    await assertSucceeds(getDoc(doc(engineerDb, `pitwallSessions/${DRIVER_UID}`)))

    const outsiderDb = testEnv.authenticatedContext(OUTSIDER_UID).firestore()
    await assertFails(getDoc(doc(outsiderDb, `pitwallSessions/${DRIVER_UID}`)))
  })

  it('la presenza la scrive solo il pilota', async () => {
    const engineerDb = testEnv.authenticatedContext(ENGINEER_UID).firestore()
    await assertFails(setDoc(doc(engineerDb, `pitwallSessions/${DRIVER_UID}`), pitwallSessionPayload({ online: false })))

    const driverDb = testEnv.authenticatedContext(DRIVER_UID).firestore()
    await assertSucceeds(setDoc(doc(driverDb, `pitwallSessions/${DRIVER_UID}`), pitwallSessionPayload({ online: false })))
  })

  it('revocato il permesso, l ingegnere perde subito l accesso', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `pitwallGrants/${GRANT_ID}`), pitwallGrantPayload({ status: 'revoked' }))
    })
    const engineerDb = testEnv.authenticatedContext(ENGINEER_UID).firestore()
    await assertFails(getDoc(doc(engineerDb, `pitwallSessions/${DRIVER_UID}`)))
  })

  it('la segnalazione viaggia solo fra i due, e sempre a nome di chi la scrive', async () => {
    const engineerDb = testEnv.authenticatedContext(ENGINEER_UID).firestore()
    await assertSucceeds(setDoc(
      doc(engineerDb, `pitwallSessions/${DRIVER_UID}/signals/segnale-1`),
      pitwallSignalPayload(ENGINEER_UID, DRIVER_UID)
    ))
    // Non si firma un segnale col nome di un altro.
    await assertFails(setDoc(
      doc(engineerDb, `pitwallSessions/${DRIVER_UID}/signals/segnale-falso`),
      pitwallSignalPayload(DRIVER_UID, ENGINEER_UID)
    ))

    const outsiderDb = testEnv.authenticatedContext(OUTSIDER_UID).firestore()
    await assertFails(setDoc(
      doc(outsiderDb, `pitwallSessions/${DRIVER_UID}/signals/segnale-estraneo`),
      pitwallSignalPayload(OUTSIDER_UID, DRIVER_UID)
    ))
  })

  it('un segnale enorme viene rifiutato invece di diventare un canale dati', async () => {
    const engineerDb = testEnv.authenticatedContext(ENGINEER_UID).firestore()
    await assertFails(setDoc(
      doc(engineerDb, `pitwallSessions/${DRIVER_UID}/signals/segnale-gonfio`),
      pitwallSignalPayload(ENGINEER_UID, DRIVER_UID, { payload: 'x'.repeat(16001) })
    ))
  })

  it('la segnalazione non si riscrive: e effimera, si crea e si cancella', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), `pitwallSessions/${DRIVER_UID}/signals/segnale-1`),
        pitwallSignalPayload(ENGINEER_UID, DRIVER_UID)
      )
    })
    const engineerDb = testEnv.authenticatedContext(ENGINEER_UID).firestore()
    await assertFails(updateDoc(doc(engineerDb, `pitwallSessions/${DRIVER_UID}/signals/segnale-1`), { kind: 'answer' }))
    await assertSucceeds(deleteDoc(doc(engineerDb, `pitwallSessions/${DRIVER_UID}/signals/segnale-1`)))
  })

  it('l ingegnere autorizzato invia un ordine, l estraneo no', async () => {
    const engineerDb = testEnv.authenticatedContext(ENGINEER_UID).firestore()
    await assertSucceeds(setDoc(
      doc(engineerDb, `pitwallSessions/${DRIVER_UID}/orders/ordine-1`),
      pitwallOrderPayload('ordine-1', ENGINEER_UID)
    ))

    const outsiderDb = testEnv.authenticatedContext(OUTSIDER_UID).firestore()
    await assertFails(setDoc(
      doc(outsiderDb, `pitwallSessions/${DRIVER_UID}/orders/ordine-2`),
      pitwallOrderPayload('ordine-2', OUTSIDER_UID)
    ))
  })

  it('un ordine non nasce gia applicato e non si firma a nome altrui', async () => {
    const engineerDb = testEnv.authenticatedContext(ENGINEER_UID).firestore()
    await assertFails(setDoc(
      doc(engineerDb, `pitwallSessions/${DRIVER_UID}/orders/ordine-3`),
      pitwallOrderPayload('ordine-3', ENGINEER_UID, { status: 'applied' })
    ))
    await assertFails(setDoc(
      doc(engineerDb, `pitwallSessions/${DRIVER_UID}/orders/ordine-4`),
      pitwallOrderPayload('ordine-4', DRIVER_UID)
    ))
  })

  it('l esito lo dichiara solo il PC del pilota, che e l unico ad applicare davvero', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), `pitwallSessions/${DRIVER_UID}/orders/ordine-1`),
        pitwallOrderPayload('ordine-1', ENGINEER_UID)
      )
    })
    const engineerDb = testEnv.authenticatedContext(ENGINEER_UID).firestore()
    await assertFails(updateDoc(doc(engineerDb, `pitwallSessions/${DRIVER_UID}/orders/ordine-1`), { status: 'applied' }))

    const driverDb = testEnv.authenticatedContext(DRIVER_UID).firestore()
    await assertSucceeds(updateDoc(doc(driverDb, `pitwallSessions/${DRIVER_UID}/orders/ordine-1`), {
      status: 'applied',
      appliedAt: '2026-08-30T15:10:00.000Z'
    }))
  })

  it('il pilota non puo riscrivere il contenuto di un ordine ricevuto', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), `pitwallSessions/${DRIVER_UID}/orders/ordine-1`),
        pitwallOrderPayload('ordine-1', ENGINEER_UID)
      )
    })
    const driverDb = testEnv.authenticatedContext(DRIVER_UID).firestore()
    await assertFails(updateDoc(doc(driverDb, `pitwallSessions/${DRIVER_UID}/orders/ordine-1`), {
      plan: { fuelLiters: 5 },
      status: 'applied'
    }))
  })
})
