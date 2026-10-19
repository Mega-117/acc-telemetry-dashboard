import { watch } from 'vue'
import { bindUsageUser } from '~/services/usage/usageClient'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'

export default defineNuxtPlugin(() => {
  const { currentUser, canEnterApp } = useFirebaseAuth()
  watch([currentUser, canEnterApp], ([user, allowed]) => bindUsageUser(allowed ? user : null), { immediate: true })
})
