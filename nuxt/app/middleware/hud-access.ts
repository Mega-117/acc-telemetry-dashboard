import { watch, type Ref } from 'vue'
import { canAccessFeature } from '~/utils/featureAccess'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'

function waitForAuthSettled(isLoading: Ref<boolean>): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => { stop(); resolve() }, 4000)
    const stop = watch(isLoading, (loading) => {
      if (!loading) { clearTimeout(timeout); stop(); resolve() }
    }, { immediate: true })
  })
}

export default defineNuxtRouteMiddleware(async () => {
  if (import.meta.server) return

  const { isAdmin, isLoading, userRole } = useFirebaseAuth()
  if (isLoading.value) await waitForAuthSettled(isLoading)

  const allowed = canAccessFeature('hud', {
    role: userRole.value,
    isAdmin: isAdmin.value
  })

  if (!allowed) {
    return navigateTo('/panoramica')
  }
})
