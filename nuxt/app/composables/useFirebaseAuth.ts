// ============================================
// useFirebaseAuth - Firebase Authentication Composable
// ============================================

import { ref, computed } from 'vue'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from '~/config/firebase'
import {
    loginWithEmail,
    logoutCurrentUser,
    refreshEmailVerificationState,
    registerWithEmail,
    resendCurrentVerificationEmail,
    translateAuthError
} from '~/services/auth/authService'
import { clearLocalUserIdentity, saveLocalUserIdentity } from '~/services/auth/localIdentityBridge'
import { ensureUserDocument, getUserProfile } from '~/services/auth/userProvisioningService'

const currentUser = ref<User | null>(null)
const userRole = ref<string>('pilot')
const firestoreNickname = ref<string>('')
const isLoading = ref(true)
const authError = ref<string | null>(null)

let authListenerInitialized = false

async function syncAuthenticatedUser(user: User) {
    const ensured = await ensureUserDocument(user)
    userRole.value = ensured.role
    firestoreNickname.value = ensured.nickname
    await saveLocalUserIdentity(user)
}

async function syncLoggedOutUser() {
    userRole.value = 'pilot'
    firestoreNickname.value = ''
    await clearLocalUserIdentity()
}

function initAuthListener() {
    if (authListenerInitialized) return

    authListenerInitialized = true
    onAuthStateChanged(auth, async (user) => {
        currentUser.value = user

        if (user) {
            await syncAuthenticatedUser(user)
        } else {
            await syncLoggedOutUser()
        }

        isLoading.value = false
        console.log('[AUTH] State changed:', user?.email ?? 'logged out', '| Role:', userRole.value)
    })
}

export function useFirebaseAuth() {
    const isAuthenticated = computed(() => !!currentUser.value)
    const isEmailVerified = computed(() => currentUser.value?.emailVerified ?? false)
    const userEmail = computed(() => currentUser.value?.email ?? '')
    const userDisplayName = computed(() => firestoreNickname.value || currentUser.value?.displayName || '')
    const isCoach = computed(() => userRole.value === 'coach')
    const isAdmin = computed(() => userRole.value === 'admin')

    const register = async (
        email: string,
        password: string,
        nickname: string,
        firstName: string = '',
        lastName: string = ''
    ) => {
        authError.value = null
        try {
            const { user } = await registerWithEmail({ email, password, nickname, firstName, lastName })
            console.log('[AUTH] Registered:', email, 'Verification email sent')
            return { success: true, user }
        } catch (error: any) {
            console.error('[AUTH] Register error:', error.code)
            authError.value = translateAuthError(error.code)
            return { success: false, error: authError.value }
        }
    }

    const login = async (email: string, password: string) => {
        authError.value = null
        try {
            const { user } = await loginWithEmail(email, password)
            console.log('[AUTH] Logged in:', email)
            return { success: true, user }
        } catch (error: any) {
            console.error('[AUTH] Login error:', error.code)
            authError.value = translateAuthError(error.code)
            return { success: false, error: authError.value }
        }
    }

    const logout = async () => {
        try {
            await logoutCurrentUser()
            console.log('[AUTH] Logged out')
            return { success: true }
        } catch (error: any) {
            console.error('[AUTH] Logout error:', error)
            return { success: false, error: error.message }
        }
    }

    const resendVerificationEmail = async () => {
        if (!currentUser.value) {
            return { success: false, error: 'Utente non autenticato' }
        }
        try {
            await resendCurrentVerificationEmail(currentUser.value)
            console.log('[AUTH] Verification email resent')
            return { success: true }
        } catch (error: any) {
            console.error('[AUTH] Resend error:', error.code)
            return { success: false, error: translateAuthError(error.code) }
        }
    }

    const checkEmailVerified = async () => {
        if (!currentUser.value) {
            return { verified: false, error: 'Utente non autenticato' }
        }
        try {
            const refreshed = await refreshEmailVerificationState(currentUser.value)
            currentUser.value = refreshed.user
            console.log('[AUTH] Email verified check:', refreshed.verified)
            return { verified: refreshed.verified, error: null }
        } catch (error: any) {
            console.error('[AUTH] Check verification error:', error)
            return { verified: false, error: error.message }
        }
    }

    initAuthListener()

    return {
        currentUser,
        isLoading,
        authError,
        isAuthenticated,
        isEmailVerified,
        userEmail,
        userDisplayName,
        register,
        login,
        logout,
        resendVerificationEmail,
        checkEmailVerified,
        getUserProfile,
        userRole,
        isCoach,
        isAdmin
    }
}
