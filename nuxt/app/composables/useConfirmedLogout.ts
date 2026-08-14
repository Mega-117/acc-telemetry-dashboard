export const LOGOUT_FAILURE_MESSAGE = 'Logout non riuscito. La sessione resta attiva: riprova.'

export interface LogoutResult {
  success: boolean
  error?: string | null
}

export type LogoutAction = () => Promise<LogoutResult>
export type ConfirmedLogoutCallback = () => void | Promise<void>

interface ConfirmedLogoutDependencies {
  logout: LogoutAction
  notifyFailure: (message: string) => void
}

/**
 * Centralizza il confine fail-closed: la UI cambia stato solo dopo che il
 * provider auth ha confermato il logout. Il lock evita due sign-out concorrenti.
 */
export function createConfirmedLogoutCoordinator({
  logout,
  notifyFailure,
}: ConfirmedLogoutDependencies) {
  let pending = false

  async function runConfirmedLogout(onConfirmed: ConfirmedLogoutCallback): Promise<boolean> {
    if (pending) return false
    pending = true

    let result: LogoutResult
    try {
      result = await logout()
    } catch {
      notifyFailure(LOGOUT_FAILURE_MESSAGE)
      pending = false
      return false
    }

    if (!result.success) {
      notifyFailure(LOGOUT_FAILURE_MESSAGE)
      pending = false
      return false
    }

    try {
      await onConfirmed()
      return true
    } finally {
      pending = false
    }
  }

  return { runConfirmedLogout }
}

export function useConfirmedLogout(logout: LogoutAction) {
  const { push } = useAppNotifications()

  return createConfirmedLogoutCoordinator({
    logout,
    notifyFailure: message => push(message, 'error'),
  })
}
