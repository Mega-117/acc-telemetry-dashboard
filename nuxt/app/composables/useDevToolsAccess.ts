import { computed } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { canUseDevTools } from '~/utils/devToolsAccess'

/**
 * Accesso agli strumenti dev e al voice lab (PIP-109): ambiente locale/dev
 * **E** ruolo admin. In produzione `canUseDevTools()` è false, quindi gli
 * strumenti non esistono per nessuno; in locale li vede solo l'admin.
 *
 * Usalo per gateare elementi reattivi della UI (es. un futuro link all'hub).
 * Il blocco vero delle route resta sul middleware `dev-tools`.
 */
export function useDevToolsAccess() {
  const { isAdmin, isLoading } = useFirebaseAuth()
  const canAccessDevTools = computed(() => canUseDevTools() && isAdmin.value)
  return { canAccessDevTools, isAdmin, isAuthLoading: isLoading }
}
