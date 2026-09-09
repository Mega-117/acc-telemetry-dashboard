import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import { applyActionCode, connectAuthEmulator, createUserWithEmailAndPassword, getAuth, sendEmailVerification, signOut, type Auth } from 'firebase/auth'

const fixture = vi.hoisted(() => ({ auth: null as Auth | null, clear: vi.fn(), save: vi.fn() }))
vi.mock('~/config/firebaseAuth', () => ({ get auth() { return fixture.auth } }))
vi.mock('~/services/auth/userProvisioningService', () => ({
  ensureUserDocument: async () => ({ role: 'pilot', nickname: 'PIP404 fixture' }),
  createInitialUserDocument: async () => {},
}))
vi.mock('~/services/auth/localIdentityBridge', () => ({
  clearLocalUserIdentity: () => fixture.clear(),
  saveLocalUserIdentity: () => fixture.save(),
  isSecondaryLocalRuntimeRenderer: () => false,
  requiresLocalIdentityBridge: () => true,
  shouldObserveFirebaseAuth: () => true,
  requestLocalRuntimeAttestation: async () => false,
}))
let app: FirebaseApp
const password = 'LocalOnly-PIP404-123!'
const emails = ['pip404-a@example.invalid', 'pip404-b@example.invalid']
beforeAll(async () => {
  app = initializeApp({ apiKey: 'demo-api-key', projectId: 'accsuite117', appId: 'pip404-auth-fixture' }, 'pip404-lifecycle')
  fixture.auth = getAuth(app)
  connectAuthEmulator(fixture.auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  fixture.clear.mockResolvedValue(true)
  fixture.save.mockResolvedValue(true)
  for (const email of emails) {
    const { user } = await createUserWithEmailAndPassword(fixture.auth, email, password)
    await sendEmailVerification(user)
    const response = await fetch('http://127.0.0.1:9099/emulator/v1/projects/accsuite117/oobCodes')
    const payload = await response.json() as { oobCodes: Array<{ email: string; oobCode: string }> }
    const code = payload.oobCodes.find(entry => entry.email === email)?.oobCode
    expect(code).toBeTruthy()
    await applyActionCode(fixture.auth, code!)
    await signOut(fixture.auth)
  }
}, 30000)
afterAll(async () => {
  fixture.clear.mockResolvedValue(true)
  if (fixture.auth) await signOut(fixture.auth)
  await deleteApp(app)
})
it('Firebase reale su emulatori: A logout A/B, stop lento e retry same-UID dopo stop fallito', async () => {
  const { useFirebaseAuth } = await import('~/composables/useFirebaseAuth')
  const auth = useFirebaseAuth()
  await vi.waitFor(() => expect(auth.authSessionStatus.value).toBe('signed-out'))
  for (const email of emails) {
    expect((await auth.login(emails[0]!, password)).success).toBe(true)
    await vi.waitFor(() => expect(auth.canEnterApp.value).toBe(true))
    let finish!: (value: boolean) => void
    fixture.clear.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const leaving = auth.logout()
    const entering = auth.login(email, password)
    await vi.waitFor(() => expect(finish).toBeDefined())
    expect(auth.canEnterApp.value).toBe(false)
    finish(true)
    expect((await leaving).success).toBe(true)
    expect((await entering).success).toBe(true)
    expect(auth.currentUser.value?.email).toBe(email)
    expect(auth.canEnterApp.value).toBe(true)
    await auth.logout()
  }
  await auth.login(emails[0]!, password)
  fixture.clear.mockResolvedValue(false)
  expect((await auth.logout()).success).toBe(false)
  expect((await auth.login(emails[1]!, password)).success).toBe(false)
  expect(auth.canEnterApp.value).toBe(false)
  fixture.clear.mockResolvedValue(true)
  expect((await auth.login(emails[0]!, password)).success).toBe(true)
  expect(auth.canEnterApp.value).toBe(true)
  await auth.logout()
}, 30000)
