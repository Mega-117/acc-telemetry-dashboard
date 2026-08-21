import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import {
  applyActionCode,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
} from 'firebase/auth'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const PROJECT_ID = 'accsuite117'
const QA_EMAIL = 'qa-auth-verification@example.invalid'
const QA_PASSWORD = 'LocalOnly-Verification-123!'

let app: FirebaseApp
let auth: Auth

beforeAll(() => {
  app = initializeApp({
    apiKey: 'demo-api-key',
    authDomain: `${PROJECT_ID}.firebaseapp.com`,
    projectId: PROJECT_ID,
    appId: 'demo-auth-verification-test',
  }, 'auth-verification-emulator-test')
  auth = getAuth(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
})

afterAll(async () => {
  await signOut(auth).catch(() => {})
  await deleteApp(app)
})

describe('Firebase Auth verification reconciliation emulator contract', () => {
  it('rilegge emailVerified dopo la verifica completata fuori dalla sessione corrente', async () => {
    const credential = await createUserWithEmailAndPassword(auth, QA_EMAIL, QA_PASSWORD)
    expect(credential.user.emailVerified).toBe(false)

    await sendEmailVerification(credential.user)
    const response = await fetch(
      `http://127.0.0.1:9099/emulator/v1/projects/${PROJECT_ID}/oobCodes`,
    )
    expect(response.ok).toBe(true)
    const payload = await response.json() as {
      oobCodes?: Array<{ email?: string; oobCode?: string; requestType?: string }>
    }
    const verification = payload.oobCodes?.find((entry) => (
      entry.email === QA_EMAIL && entry.requestType === 'VERIFY_EMAIL'
    ))
    expect(verification?.oobCode).toBeTruthy()

    await applyActionCode(auth, verification!.oobCode!)
    await credential.user.reload()
    await credential.user.getIdToken(true)
    expect(auth.currentUser?.emailVerified).toBe(true)

    await signOut(auth)
    const signedInAgain = await signInWithEmailAndPassword(auth, QA_EMAIL, QA_PASSWORD)
    await signedInAgain.user.reload()
    expect(signedInAgain.user.emailVerified).toBe(true)
  })
})
