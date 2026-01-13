// ============================================
// useFirebaseAuth - Firebase Authentication Composable
// ============================================

import { ref, computed, onMounted } from 'vue'
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    sendEmailVerification,
    updateProfile,
    onAuthStateChanged,
    type User
} from 'firebase/auth'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { auth, db } from '~/config/firebase'

// Shared state (singleton across components)
const currentUser = ref<User | null>(null)
const isLoading = ref(true)
const authError = ref<string | null>(null)

// Initialize auth state listener once
let authListenerInitialized = false

export function useFirebaseAuth() {
    // === COMPUTED ===
    const isAuthenticated = computed(() => !!currentUser.value)
    const isEmailVerified = computed(() => currentUser.value?.emailVerified ?? false)
    const userEmail = computed(() => currentUser.value?.email ?? '')
    const userDisplayName = computed(() => currentUser.value?.displayName ?? '')

    // === INIT AUTH LISTENER ===
    const initAuthListener = () => {
        if (authListenerInitialized) return

        authListenerInitialized = true
        onAuthStateChanged(auth, (user) => {
            currentUser.value = user
            isLoading.value = false
            console.log('[AUTH] State changed:', user?.email ?? 'logged out')
        })
    }

    // === REGISTER ===
    const register = async (email: string, password: string, nickname: string) => {
        authError.value = null
        try {
            // 1. Create user in Firebase Auth
            const userCredential = await createUserWithEmailAndPassword(auth, email, password)
            const user = userCredential.user

            // 2. Update display name
            await updateProfile(user, { displayName: nickname })

            // 3. Save additional data to Firestore
            await setDoc(doc(db, 'users', user.uid), {
                nickname,
                email,
                createdAt: new Date().toISOString(),
                emailVerified: false
            })

            // 4. Send verification email
            await sendEmailVerification(user)

            console.log('[AUTH] Registered:', email, 'Verification email sent')
            return { success: true, user }
        } catch (error: any) {
            console.error('[AUTH] Register error:', error.code)
            authError.value = getErrorMessage(error.code)
            return { success: false, error: authError.value }
        }
    }

    // === LOGIN ===
    const login = async (email: string, password: string) => {
        authError.value = null
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password)
            console.log('[AUTH] Logged in:', email)
            return { success: true, user: userCredential.user }
        } catch (error: any) {
            console.error('[AUTH] Login error:', error.code)
            authError.value = getErrorMessage(error.code)
            return { success: false, error: authError.value }
        }
    }

    // === LOGOUT ===
    const logout = async () => {
        try {
            await signOut(auth)
            console.log('[AUTH] Logged out')
            return { success: true }
        } catch (error: any) {
            console.error('[AUTH] Logout error:', error)
            return { success: false, error: error.message }
        }
    }

    // === RESEND VERIFICATION EMAIL ===
    const resendVerificationEmail = async () => {
        if (!currentUser.value) {
            return { success: false, error: 'Utente non autenticato' }
        }
        try {
            await sendEmailVerification(currentUser.value)
            console.log('[AUTH] Verification email resent')
            return { success: true }
        } catch (error: any) {
            console.error('[AUTH] Resend error:', error.code)
            return { success: false, error: getErrorMessage(error.code) }
        }
    }

    // === CHECK EMAIL VERIFIED ===
    const checkEmailVerified = async () => {
        if (!currentUser.value) {
            return { verified: false, error: 'Utente non autenticato' }
        }
        try {
            // Reload user to get fresh emailVerified status
            await currentUser.value.reload()
            // Update our ref with the reloaded user
            currentUser.value = auth.currentUser

            const verified = currentUser.value?.emailVerified ?? false
            console.log('[AUTH] Email verified check:', verified)
            return { verified, error: null }
        } catch (error: any) {
            console.error('[AUTH] Check verification error:', error)
            return { verified: false, error: error.message }
        }
    }

    // === GET USER PROFILE FROM FIRESTORE ===
    const getUserProfile = async (uid: string) => {
        try {
            const docSnap = await getDoc(doc(db, 'users', uid))
            if (docSnap.exists()) {
                return docSnap.data()
            }
            return null
        } catch (error) {
            console.error('[AUTH] Get profile error:', error)
            return null
        }
    }

    // === ERROR TRANSLATION ===
    const getErrorMessage = (code: string): string => {
        const messages: Record<string, string> = {
            'auth/email-already-in-use': 'Email già registrata',
            'auth/weak-password': 'Password troppo debole (min. 6 caratteri)',
            'auth/invalid-email': 'Email non valida',
            'auth/user-not-found': 'Utente non trovato',
            'auth/wrong-password': 'Password errata',
            'auth/invalid-credential': 'Credenziali non valide',
            'auth/too-many-requests': 'Troppi tentativi, riprova più tardi',
            'auth/network-request-failed': 'Errore di rete, controlla la connessione'
        }
        return messages[code] || 'Errore di autenticazione'
    }

    // Initialize listener on first use
    initAuthListener()

    return {
        // State
        currentUser,
        isLoading,
        authError,
        // Computed
        isAuthenticated,
        isEmailVerified,
        userEmail,
        userDisplayName,
        // Methods
        register,
        login,
        logout,
        resendVerificationEmail,
        checkEmailVerified,
        getUserProfile
    }
}
