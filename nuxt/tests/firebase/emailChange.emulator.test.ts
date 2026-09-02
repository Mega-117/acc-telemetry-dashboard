import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app'
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signOut,
  verifyBeforeUpdateEmail,
  type Auth
} from 'firebase/auth'

// Come per gli altri test emulator, qui si verifica l'assunzione su Firebase e
// non il nostro wrapper: importare il service tirerebbe dentro la config del
// progetto reale. Che `sendVerificationToUpdatedEmail` chiami proprio questa
// API e' coperto dal test unitario del service.
const PROJECT_ID = 'accsuite117'
const QA_EMAIL = 'qa-email-change@example.invalid'
const QA_TYPO_TARGET = 'qa-email-change-fixed@example.invalid'
const QA_PASSWORD = 'LocalOnly-Password-123!'

let app: FirebaseApp
let auth: Auth

beforeAll(() => {
  app = initializeApp({
    apiKey: 'demo-api-key',
    authDomain: PROJECT_ID + '.firebaseapp.com',
    projectId: PROJECT_ID,
    appId: 'demo-email-change-test'
  }, 'email-change-emulator-test')
  auth = getAuth(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
})

afterAll(async () => {
  await signOut(auth).catch(() => {})
  await deleteApp(app)
})

describe('Firebase Auth email change emulator contract', () => {
  it('non adotta il nuovo indirizzo finche il link non viene aperto', async () => {
    const credential = await createUserWithEmailAndPassword(auth, QA_EMAIL, QA_PASSWORD)

    await expect(
      verifyBeforeUpdateEmail(credential.user, QA_TYPO_TARGET)
    ).resolves.toBeUndefined()

    // E' la garanzia che rende sicura la correzione: se anche il secondo
    // indirizzo fosse sbagliato, l'account resta raggiungibile com'era invece
    // di finire su una casella ancora piu' irraggiungibile.
    await credential.user.reload()
    expect(auth.currentUser?.email).toBe(QA_EMAIL)
    expect(auth.currentUser?.uid).toBe(credential.user.uid)
  })
})
