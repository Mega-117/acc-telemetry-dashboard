import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendPasswordResetEmailMock = vi.hoisted(() => vi.fn())
const createUserWithEmailAndPasswordMock = vi.hoisted(() => vi.fn())
const signInWithEmailAndPasswordMock = vi.hoisted(() => vi.fn())
const signOutMock = vi.hoisted(() => vi.fn())
const sendEmailVerificationMock = vi.hoisted(() => vi.fn())
const updateProfileMock = vi.hoisted(() => vi.fn())
const createInitialUserDocumentMock = vi.hoisted(() => vi.fn())
const authMock = vi.hoisted(() => ({
  currentUser: null as null | {
    emailVerified: boolean
    reload: ReturnType<typeof vi.fn>
    getIdToken: ReturnType<typeof vi.fn>
  }
}))

vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: createUserWithEmailAndPasswordMock,
  signInWithEmailAndPassword: signInWithEmailAndPasswordMock,
  signOut: signOutMock,
  sendEmailVerification: sendEmailVerificationMock,
  sendPasswordResetEmail: sendPasswordResetEmailMock,
  updateProfile: updateProfileMock
}))

vi.mock('~/config/firebaseAuth', () => ({ auth: authMock }))
vi.mock('~/services/auth/userProvisioningService', () => ({
  createInitialUserDocument: createInitialUserDocumentMock
}))

import {
  loginWithEmail,
  logoutCurrentUser,
  registerWithEmail,
  refreshEmailVerificationState,
  resendCurrentVerificationEmail,
  sendPasswordResetWithEmail,
  translateAuthError
} from '~/services/auth/authService'

describe('registration and account actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMock.currentUser = null
  })

  it('registers the Firebase user, provisions the profile, and sends verification', async () => {
    const user = { uid: 'uid-new' }
    createUserWithEmailAndPasswordMock.mockResolvedValue({ user })
    updateProfileMock.mockResolvedValue(undefined)
    createInitialUserDocumentMock.mockResolvedValue(undefined)
    sendEmailVerificationMock.mockResolvedValue(undefined)

    await expect(registerWithEmail({
      email: 'new@example.invalid',
      password: 'secret-123',
      nickname: 'NewDriver',
      firstName: 'New',
      lastName: 'Driver'
    })).resolves.toEqual({ user })

    expect(createUserWithEmailAndPasswordMock).toHaveBeenCalledWith(
      authMock,
      'new@example.invalid',
      'secret-123'
    )
    expect(updateProfileMock).toHaveBeenCalledWith(user, { displayName: 'NewDriver' })
    expect(createInitialUserDocumentMock).toHaveBeenCalledWith(user, {
      firstName: 'New',
      lastName: 'Driver',
      nickname: 'NewDriver'
    })
    expect(sendEmailVerificationMock).toHaveBeenCalledWith(user)
  })

  it('delegates logout and verification resend to Firebase Auth', async () => {
    const user = { uid: 'uid-current' }
    signOutMock.mockResolvedValue(undefined)
    sendEmailVerificationMock.mockResolvedValue(undefined)

    await expect(logoutCurrentUser()).resolves.toBeUndefined()
    await expect(resendCurrentVerificationEmail(user as any)).resolves.toBeUndefined()

    expect(signOutMock).toHaveBeenCalledOnce()
    expect(signOutMock).toHaveBeenCalledWith(authMock)
    expect(sendEmailVerificationMock).toHaveBeenCalledOnce()
    expect(sendEmailVerificationMock).toHaveBeenCalledWith(user)
  })
})

describe('loginWithEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMock.currentUser = null
  })

  it('refreshes the canonical Firebase user before exposing email verification state', async () => {
    const user = {
      emailVerified: false,
      reload: vi.fn(async () => {
        user.emailVerified = true
      }),
      getIdToken: vi.fn().mockResolvedValue('fresh-token')
    }
    signInWithEmailAndPasswordMock.mockImplementation(async () => {
      authMock.currentUser = user
      return { user }
    })

    const result = await loginWithEmail('qa@example.invalid', 'local-only-password')

    expect(signInWithEmailAndPasswordMock).toHaveBeenCalledWith(
      authMock,
      'qa@example.invalid',
      'local-only-password'
    )
    expect(user.reload).toHaveBeenCalledOnce()
    expect(user.getIdToken).toHaveBeenCalledWith(true)
    expect(user.reload.mock.invocationCallOrder[0]).toBeLessThan(
      user.getIdToken.mock.invocationCallOrder[0]
    )
    expect(result.user).toBe(user)
    expect(result.user.emailVerified).toBe(true)
  })
})

describe('refreshEmailVerificationState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMock.currentUser = null
  })

  it('refreshes the ID token after reload before exposing the verified user', async () => {
    const user = {
      emailVerified: false,
      reload: vi.fn(async () => {
        user.emailVerified = true
      }),
      getIdToken: vi.fn().mockResolvedValue('fresh-token')
    }
    authMock.currentUser = user

    const result = await refreshEmailVerificationState(user as never)

    expect(user.reload).toHaveBeenCalledOnce()
    expect(user.getIdToken).toHaveBeenCalledWith(true)
    expect(user.reload.mock.invocationCallOrder[0]).toBeLessThan(
      user.getIdToken.mock.invocationCallOrder[0]
    )
    expect(result).toEqual({ verified: true, user })
  })
})

describe('sendPasswordResetWithEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMock.currentUser = null
  })

  it('asks Firebase Auth to send the reset email and resolves after Firebase accepts it', async () => {
    sendPasswordResetEmailMock.mockResolvedValue(undefined)

    await expect(sendPasswordResetWithEmail('qa@example.invalid')).resolves.toBeUndefined()

    expect(sendPasswordResetEmailMock).toHaveBeenCalledOnce()
    expect(sendPasswordResetEmailMock).toHaveBeenCalledWith(authMock, 'qa@example.invalid')
  })

  it('propagates Firebase failures without mutating user or profile data', async () => {
    const error = { code: 'auth/network-request-failed' }
    sendPasswordResetEmailMock.mockRejectedValue(error)

    await expect(sendPasswordResetWithEmail('qa@example.invalid')).rejects.toBe(error)
    expect(updateProfileMock).not.toHaveBeenCalled()
    expect(createInitialUserDocumentMock).not.toHaveBeenCalled()
  })
})

describe('translateAuthError', () => {
  it.each([
    ['auth/user-not-found', 'Utente non trovato'],
    ['auth/invalid-email', 'Email non valida'],
    ['auth/too-many-requests', 'Troppi tentativi, riprova piu tardi'],
    ['auth/network-request-failed', 'Errore di rete, controlla la connessione'],
    ['auth/operation-not-allowed', 'Il recupero password non è disponibile al momento'],
    ['auth/invalid-continue-uri', 'Il link di recupero non è configurato correttamente']
  ])('maps %s to a user-facing message', (code, message) => {
    expect(translateAuthError(code)).toBe(message)
  })

  it('uses a generic message for unknown Firebase codes', () => {
    expect(translateAuthError('auth/unknown-reset-error')).toBe('Errore di autenticazione')
  })
})
