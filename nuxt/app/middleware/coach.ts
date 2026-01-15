export default defineNuxtRouteMiddleware(async (to, from) => {
    const { isCoach, isLoading, isAuthenticated } = useFirebaseAuth()

    // Wait for auth to initialize if loading
    if (isLoading.value) {
        await new Promise<void>(resolve => {
            const unwatch = watch(isLoading, (loading) => {
                if (!loading) {
                    unwatch()
                    resolve()
                }
            }, { immediate: true })
        })
    }

    // Check Auth
    if (!isAuthenticated.value) {
        return navigateTo('/')
    }

    // Check Role
    if (!isCoach.value) {
        console.warn('[MIDDLEWARE] Access denied to coach route:', to.path)
        return navigateTo('/panoramica')
    }
})
