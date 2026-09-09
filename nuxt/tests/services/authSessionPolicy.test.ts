// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import {
  classifyPersistedAuthError,
  refreshUserCredentials,
  refreshPersistedAuthSession,
  toAuthStartupOutcome,
} from '~/services/auth/authSessionPolicy'

function user(overrides: Record<string, unknown> = {}) {
  return {
    uid: 'pilot-1',
    reload: vi.fn().mockResolvedValue(undefined),
    getIdToken: vi.fn().mockResolvedValue('token'),
    ...overrides,
  } as any
}

describe('auth session policy', () => {
  it.each([
    'auth/network-request-failed',
    'auth/too-many-requests',
    'auth/internal-error',
    'auth/unknown-provider-error',
  ])('preserva la persistenza per un errore recuperabile: %s', (code) => {
    expect(classifyPersistedAuthError({ code })).toBe('recoverable')
  })

  it.each([
    'auth/invalid-user-token',
    'auth/user-token-expired',
    'auth/user-disabled',
    'auth/user-not-found',
  ])('considera definitiva soltanto una invalidazione esplicita: %s', (code) => {
    expect(classifyPersistedAuthError({ code })).toBe('invalid')
  })

  it('rinnova una sessione valida senza eseguire signOut', async () => {
    const persisted = user()
    const signOut = vi.fn()

    await expect(refreshPersistedAuthSession(persisted, {
      getCurrentUser: () => persisted,
      signOut,
    })).resolves.toEqual({ status: 'ready', user: persisted })

    expect(persisted.reload).toHaveBeenCalledOnce()
    expect(persisted.getIdToken).toHaveBeenCalledWith(true)
    expect(signOut).not.toHaveBeenCalled()
  })

  it('mantiene la sessione Firebase su errore transitorio', async () => {
    const error = { code: 'auth/network-request-failed' }
    const persisted = user({ reload: vi.fn().mockRejectedValue(error) })
    const signOut = vi.fn()

    await expect(refreshPersistedAuthSession(persisted, {
      getCurrentUser: () => persisted,
      signOut,
    })).resolves.toEqual({
      status: 'recoverable',
      user: persisted,
      errorCode: error.code,
    })
    expect(signOut).not.toHaveBeenCalled()
  })

  it('esegue signOut per un token definitivamente invalido', async () => {
    const error = { code: 'auth/invalid-user-token' }
    const persisted = user({ reload: vi.fn().mockRejectedValue(error) })
    const signOut = vi.fn().mockResolvedValue(undefined)

    await expect(refreshPersistedAuthSession(persisted, {
      getCurrentUser: () => persisted,
      signOut,
    })).resolves.toEqual({
      status: 'invalid',
      user: null,
      errorCode: error.code,
    })
    expect(signOut).toHaveBeenCalledOnce()
  })

  it('mappa lo stato canonico sul solo esito startup osservabile', () => {
    expect(toAuthStartupOutcome('initializing')).toBeNull()
    expect(toAuthStartupOutcome('ready')).toBe('ready')
    expect(toAuthStartupOutcome('recoverable')).toBe('recoverable')
    expect(toAuthStartupOutcome('signed-out')).toBe('login-required')
    expect(toAuthStartupOutcome('unverified')).toBe('verification-required')
  })
})

it('condivide reload/token concorrenti ma non conserva un successo', async () => {
  let finish!: () => void
  const persisted = user({ reload: vi.fn(() => new Promise<void>(resolve => { finish = resolve })) })
  const a = refreshUserCredentials(persisted)
  const b = refreshUserCredentials(persisted)
  expect(a).toBe(b)
  finish()
  await a
  expect(persisted.reload).toHaveBeenCalledTimes(1)
  expect(persisted.getIdToken).toHaveBeenCalledTimes(1)
  const c = refreshUserCredentials(persisted)
  finish()
  await c
  expect(persisted.reload).toHaveBeenCalledTimes(2)
})

it('una vecchia sessione invalida non esegue signOut della nuova, anche a stesso UID', async () => {
  const oldUser = user({ reload: vi.fn().mockRejectedValue({ code: 'auth/invalid-user-token' }) })
  const newUser = user()
  const signOut = vi.fn()
  await refreshPersistedAuthSession(oldUser, { getCurrentUser: () => newUser, signOut })
  expect(signOut).not.toHaveBeenCalled()
})
