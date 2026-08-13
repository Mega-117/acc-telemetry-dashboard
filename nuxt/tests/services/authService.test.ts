import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendPasswordResetEmailMock = vi.hoisted(() => vi.fn())
const updateProfileMock = vi.hoisted(() => vi.fn())
const createInitialUserDocumentMock = vi.hoisted(() => vi.fn())

vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  sendEmailVerification: vi.fn(),
  sendPasswordResetEmail: sendPasswordResetEmailMock,
  updateProfile: updateProfileMock
}))

vi.mock('~/config/firebaseAuth', () => ({ auth: {} }))
vi.mock('~/services/auth/userProvisioningService', () => ({
  createInitialUserDocument: createInitialUserDocumentMock
}))

import {
  sendPasswordResetWithEmail,
  translateAuthError
} from '~/services/auth/authService'

describe('sendPasswordResetWithEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('asks Firebase Auth to send the reset email and resolves after Firebase accepts it', async () => {
    sendPasswordResetEmailMock.mockResolvedValue(undefined)

    await expect(sendPasswordResetWithEmail('qa@example.invalid')).resolves.toBeUndefined()

    expect(sendPasswordResetEmailMock).toHaveBeenCalledOnce()
    expect(sendPasswordResetEmailMock).toHaveBeenCalledWith({}, 'qa@example.invalid')
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
