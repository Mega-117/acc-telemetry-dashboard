// ============================================
// usePilotContext - Share pilot UID for coach viewing
// ============================================
// When coach views a pilot's dashboard, this provides the pilot's UID 
// to all child components so they load the correct data.

import { ref, provide, inject, type InjectionKey, type Ref } from 'vue'

// Symbolic key for injection
const PILOT_CONTEXT_KEY: InjectionKey<Ref<string | null>> = Symbol('pilotContext')

/**
 * Provides pilot context to child components.
 * Call this in the parent component (e.g., /piloti/[id].vue)
 */
export function providePilotContext(pilotId: string | null) {
    const pilotIdRef = ref(pilotId)
    provide(PILOT_CONTEXT_KEY, pilotIdRef)
    return pilotIdRef
}

/**
 * Injects the pilot context.
 * Returns null if not in coach mode (normal user viewing own data)
 */
export function usePilotContext(): Ref<string | null> {
    return inject(PILOT_CONTEXT_KEY, ref(null))
}

/**
 * Helper to get the target user ID for data loading.
 * Returns pilotId if in coach mode, otherwise current user's UID.
 */
export function useTargetUserId() {
    const { currentUser } = useFirebaseAuth()
    const pilotId = usePilotContext()

    return computed(() => pilotId.value || currentUser.value?.uid || null)
}
