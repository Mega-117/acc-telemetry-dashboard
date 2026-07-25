import { watch, type Ref } from 'vue'

export type AdminRouteAccess = {
  isAuthenticated: boolean
  isAdmin: boolean
}

export function getAdminRouteRedirect(access: AdminRouteAccess): string | null {
  if (!access.isAuthenticated) return '/'
  if (!access.isAdmin) return '/panoramica'
  return null
}

export function waitForAuthSettled(
  isLoading: Ref<boolean>,
  timeoutMs = 4000,
): Promise<void> {
  if (!isLoading.value) return Promise.resolve()

  return new Promise((resolve) => {
    let stopWatching: (() => void) | undefined

    const finish = () => {
      clearTimeout(timeout)
      stopWatching?.()
      resolve()
    }

    const timeout = setTimeout(finish, timeoutMs)
    stopWatching = watch(isLoading, (loading) => {
      if (!loading) finish()
    })
  })
}
