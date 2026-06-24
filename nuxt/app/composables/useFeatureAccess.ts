import { computed } from 'vue'
import { canAccessFeature, type AppFeature } from '~/utils/featureAccess'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'

export function useFeatureAccess() {
  const { isAdmin, isLoading, userRole } = useFirebaseAuth()

  const canAccess = (feature: AppFeature) => computed(() => canAccessFeature(feature, {
    role: userRole.value,
    isAdmin: isAdmin.value
  }))

  return {
    isAuthLoading: isLoading,
    canAccess
  }
}
