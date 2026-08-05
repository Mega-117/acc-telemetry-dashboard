import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app'
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type Auth
} from 'firebase/auth'

const PROJECT_ID = 'accsuite117'
const QA_EMAIL = 'qa-reset@example.invalid'
const QA_PASSWORD = 'LocalOnly-Password-123!'

let app: FirebaseApp
let auth: Auth

beforeAll(() => {
  app = initializeApp({
    apiKey: 'demo-api-key',
    authDomain: PROJECT_ID + '.firebaseapp.com',
    projectId: PROJECT_ID,
    appId: 'demo-reset-test'
  }, 'password-reset-emulator-test')
  auth = getAuth(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
})

afterAll(async () => {
  await signOut(auth).catch(() => {})
  await deleteApp(app)
})

describe('Firebase Auth password reset emulator contract', () => {
  it('accepts a reset request without changing the existing password', async () => {
    await createUserWithEmailAndPassword(auth, QA_EMAIL, QA_PASSWORD)

    await expect(sendPasswordResetEmail(auth, QA_EMAIL)).resolves.toBeUndefined()

    await expect(
      signInWithEmailAndPassword(auth, QA_EMAIL, QA_PASSWORD)
    ).resolves.toMatchObject({
      user: { email: QA_EMAIL }
    })
  })
})