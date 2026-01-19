// Middleware for coach OR admin access
export default defineNuxtRouteMiddleware(async (to, from) => {
    const { isAuthenticated, userRole, isLoading } = useFirebaseAuth()

    // Wait for auth to load
    let attempts = 0
    while (isLoading.value && attempts < 100) {
        await new Promise(resolve => setTimeout(resolve, 50))
        attempts++
    }

    if (!isAuthenticated.value) {
        return navigateTo('/')
    }

    const role = userRole.value
    if (role !== 'coach' && role !== 'admin') {
        return navigateTo('/panoramica')  // Redirect pilots
    }
})
