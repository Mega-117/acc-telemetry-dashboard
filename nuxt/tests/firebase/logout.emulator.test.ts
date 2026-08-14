import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
} from 'firebase/auth'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const PROJECT_ID = 'accsuite117'
const QA_EMAIL = 'qa-logout@example.invalid'
const QA_PASSWORD = 'LocalOnly-Logout-123!'

let app: FirebaseApp
let auth: Auth

beforeAll(() => {
  app = initializeApp({
    apiKey: 'demo-api-key',
    authDomain: `${PROJECT_ID}.firebaseapp.com`,
    projectId: PROJECT_ID,
    appId: 'demo-logout-test',
  }, 'logout-emulator-test')
  auth = getAuth(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
})

afterAll(async () => {
  await signOut(auth).catch(() => {})
  await deleteApp(app)
})

describe('Firebase Auth logout emulator contract', () => {
  it('rimuove la sessione corrente e consente un nuovo login isolato', async () => {
    await createUserWithEmailAndPassword(auth, QA_EMAIL, QA_PASSWORD)
    expect(auth.currentUser?.email).toBe(QA_EMAIL)

    await signOut(auth)
    expect(auth.currentUser).toBeNull()

    await signInWithEmailAndPassword(auth, QA_EMAIL, QA_PASSWORD)
    expect(auth.currentUser?.email).toBe(QA_EMAIL)
  })
})
