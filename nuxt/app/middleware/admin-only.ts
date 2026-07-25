import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { getAdminRouteRedirect, waitForAuthSettled } from '~/utils/authRouteGuard'

export default defineNuxtRouteMiddleware(async () => {
  // Firebase Auth vive sul client. Il controllo effettivo viene eseguito
  // durante l'idratazione, quando ruolo e sessione sono disponibili.
  if (import.meta.server) return

  const { isAuthenticated, isAdmin, isLoading } = useFirebaseAuth()
  await waitForAuthSettled(isLoading)

  const redirect = getAdminRouteRedirect({
    isAuthenticated: isAuthenticated.value,
    isAdmin: isAdmin.value,
  })

  if (redirect) return navigateTo(redirect)
})
