import type { User } from 'firebase/auth'

export type AuthSessionStatus =
  | 'initializing'
  | 'ready'
  | 'unverified'
  | 'recoverable'
  | 'signed-out'

export type AuthStartupOutcome =
  | 'ready'
  | 'recoverable'
  | 'login-required'
  | 'verification-required'

export type PersistedAuthRefreshResult =
  | { status: 'ready'; user: User }
  | { status: 'recoverable'; user: User; errorCode: string }
  | { status: 'invalid'; user: null; errorCode: string }

const DEFINITIVE_SESSION_ERROR_CODES = new Set([
  'auth/invalid-user-token',
  'auth/user-token-expired',
  'auth/user-disabled',
  'auth/user-not-found',
])

export function getAuthErrorCode(error: unknown): string {
  if (
    error
    && typeof error === 'object'
    && 'code' in error
    && typeof error.code === 'string'
    && error.code.trim()
  ) {
    return error.code.trim()
  }
  return 'auth/unknown-refresh-error'
}

export function classifyPersistedAuthError(error: unknown): 'invalid' | 'recoverable' {
  return DEFINITIVE_SESSION_ERROR_CODES.has(getAuthErrorCode(error))
    ? 'invalid'
    : 'recoverable'
}

// Share only in-flight refreshes of the exact Firebase User instance.
// Never cache success across logout or reuse credentials for another session.
const credentialRefreshes = new WeakMap<User, Promise<void>>()
export function refreshUserCredentials(user: User): Promise<void> {
  const pending = credentialRefreshes.get(user)
  if (pending) return pending
  const request = (async () => {
    await user.reload()
    await user.getIdToken(true)
  })().finally(() => { credentialRefreshes.delete(user) })
  credentialRefreshes.set(user, request)
  return request
}

export async function refreshPersistedAuthSession(
  user: User,
  dependencies: {
    getCurrentUser: () => User | null
    signOut: () => Promise<void>
  },
): Promise<PersistedAuthRefreshResult> {
  try {
    await refreshUserCredentials(user)
    const currentUser = dependencies.getCurrentUser()
    if (!currentUser || currentUser.uid !== user.uid) {
      return {
        status: 'invalid',
        user: null,
        errorCode: 'auth/session-user-mismatch',
      }
    }
    return { status: 'ready', user: currentUser }
  } catch (error) {
    const errorCode = getAuthErrorCode(error)
    if (classifyPersistedAuthError(error) === 'recoverable') {
      return { status: 'recoverable', user, errorCode }
    }
    // An obsolete failure must never sign out a newer session, even for the same UID.
    if (dependencies.getCurrentUser() === user) await dependencies.signOut().catch(() => {})
    return { status: 'invalid', user: null, errorCode }
  }
}

export function toAuthStartupOutcome(status: AuthSessionStatus): AuthStartupOutcome | null {
  switch (status) {
    case 'ready':
      return 'ready'
    case 'unverified':
      return 'verification-required'
    case 'recoverable':
      return 'recoverable'
    case 'signed-out':
      return 'login-required'
    default:
      return null
  }
}
