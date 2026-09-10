
import { beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({
  auth: { currentUser: null as any },
  observe: null as any,
  clear: vi.fn(),
  save: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_: any, callback: any) => { mock.observe = callback; void callback(mock.auth.currentUser) },
}))
vi.mock('~/config/firebaseAuth', () => ({ auth: mock.auth }))
vi.mock('~/services/auth/authService', () => ({
  loginWithEmail: (...args: any[]) => mock.signIn(...args),
  logoutCurrentUser: () => mock.signOut(),
  translateAuthError: () => 'auth failure',
}))
vi.mock('~/services/auth/userProvisioningService', () => ({
  ensureUserDocument: async () => ({ role: 'pilot', nickname: 'fixture' }),
}))
vi.mock('~/services/auth/localIdentityBridge', () => ({
  clearLocalUserIdentity: () => mock.clear(),
  saveLocalUserIdentity: () => mock.save(),
  isSecondaryLocalRuntimeRenderer: () => false,
  requiresLocalIdentityBridge: () => true,
  shouldObserveFirebaseAuth: () => true,
  requestLocalRuntimeAttestation: async () => false,
}))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mock.auth.currentUser = null
  mock.clear.mockResolvedValue(true)
  mock.save.mockResolvedValue(true)
  mock.signIn.mockImplementation(async (uid: string) => {
    const user = { uid, emailVerified: true, reload: async () => {}, getIdToken: async () => 'fixture' }
    mock.auth.currentUser = user
    void mock.observe(user)
    return { user }
  })
  mock.signOut.mockImplementation(async () => {
    mock.auth.currentUser = null
    void mock.observe(null)
  })
})
async function initialized() {
  const { useFirebaseAuth } = await import('~/composables/useFirebaseAuth')
  const auth = useFirebaseAuth()
  await vi.waitFor(() => expect(auth.authSessionStatus.value).toBe('signed-out'))
  return auth
}
it.each(['A', 'B'])('logout lento condiviso blocca login %s fino a cleanup completo', async uid => {
  const auth = await initialized()
  expect((await auth.login('A', 'fixture')).success).toBe(true)
  await vi.waitFor(() => expect(auth.canEnterApp.value).toBe(true))
  let finish!: (ok: boolean) => void
  mock.clear.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const logout = auth.logout()
  expect(auth.logout()).toBe(logout)
  const login = auth.login(uid, 'fixture')
  await vi.waitFor(() => expect(finish).toBeDefined())
  expect(mock.signIn).toHaveBeenCalledTimes(1)
  finish(true)
  expect((await logout).success).toBe(true)
  expect((await login).success).toBe(true)
  expect(auth.currentUser.value?.uid).toBe(uid)
  expect(mock.clear).toHaveBeenCalledTimes(2) // initial bootstrap and one logout
  // A delayed null notification cannot erase the new canonical Firebase user.
  await mock.observe(null)
  expect(auth.currentUser.value?.uid).toBe(uid)
})
it('un cleanup fallito resta chiuso e il login non procede finche lo stop fallisce', async () => {
  const auth = await initialized()
  await auth.login('A', 'fixture')
  mock.clear.mockResolvedValue(false)
  expect((await auth.logout()).success).toBe(false)
  expect(auth.canEnterApp.value).toBe(false)
  expect((await auth.login('B', 'fixture')).success).toBe(false)
  expect(mock.signIn).toHaveBeenCalledTimes(1)
})

it('riconcilia il ri-login same-UID anche se Firebase non emette un nuovo observer', async () => {
  const auth = await initialized()
  await auth.login('A', 'fixture')
  mock.signOut.mockRejectedValueOnce(new Error('network'))
  expect((await auth.logout()).success).toBe(false)
  mock.signIn.mockImplementationOnce(async () => ({ user: mock.auth.currentUser }))
  expect((await auth.login('A', 'fixture')).success).toBe(true)
  expect(auth.canEnterApp.value).toBe(true)
})
