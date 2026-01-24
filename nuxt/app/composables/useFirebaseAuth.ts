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
const userRole = ref<string>('pilot') // Default role
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
    const isCoach = computed(() => userRole.value === 'coach')
    const isAdmin = computed(() => userRole.value === 'admin')

    // === ENSURE USER DOC ===
    // Checks/Creates user document in Firestore to ensure role availability
    const ensureUserDocument = async (user: User) => {
        try {
            const userDocRef = doc(db, 'users', user.uid)
            const docSnap = await getDoc(userDocRef)

            if (!docSnap.exists()) {
                // Create default pilot profile if missing
                await setDoc(userDocRef, {
                    email: user.email,
                    nickname: user.displayName || 'Utente',
                    role: 'pilot',
                    createdAt: new Date().toISOString(),
                    emailVerified: user.emailVerified
                })
                userRole.value = 'pilot'
                console.log('[AUTH] Created missing user profile')
            } else {
                // Load existing role
                const data = docSnap.data()
                userRole.value = data.role || 'pilot'
            }
        } catch (e) {
            console.error('[AUTH] Failed to ensure user document:', e)
            // Fallback safe default
            userRole.value = 'pilot'
        }
    }

    // === INIT AUTH LISTENER ===
    const initAuthListener = () => {
        if (authListenerInitialized) return

        authListenerInitialized = true
        onAuthStateChanged(auth, async (user) => {
            currentUser.value = user

            if (user) {
                // Always ensure we have their role loaded
                await ensureUserDocument(user)

                // === ELECTRON: Save user identity to local file ===
                // This creates .user_identity.json so the Logger can associate sessions
                try {
                    const electronAPI = (window as any).electronAPI
                    console.log('[AUTH] electronAPI exists:', !!electronAPI)
                    console.log('[AUTH] saveUserIdentity exists:', !!electronAPI?.saveUserIdentity)

                    if (electronAPI?.saveUserIdentity) {
                        console.log('[AUTH] Calling saveUserIdentity with:', {
                            userId: user.uid,
                            email: user.email,
                            displayName: user.displayName
                        })
                        const result = await electronAPI.saveUserIdentity({
                            userId: user.uid,
                            email: user.email,
                            displayName: user.displayName || user.email?.split('@')[0] || 'User'
                        })
                        console.log('[AUTH] Electron identity saved:', result ? '✅' : '❌')
                    } else {
                        console.log('[AUTH] Not in Electron environment (electronAPI not available)')
                    }
                } catch (e) {
                    console.error('[AUTH] Identity save failed:', e)
                }
            } else {
                userRole.value = 'pilot'

                // === ELECTRON: Clear identity on logout ===
                try {
                    const electronAPI = (window as any).electronAPI
                    if (electronAPI?.clearUserIdentity) {
                        await electronAPI.clearUserIdentity()
                        console.log('[AUTH] Electron identity cleared')
                    }
                } catch (e) {
                    // Ignore - not in Electron
                }
            }

            isLoading.value = false
            console.log('[AUTH] State changed:', user?.email ?? 'logged out', '| Role:', userRole.value)
        })
    }

    // === REGISTER ===
    const register = async (email: string, password: string, nickname: string, firstName: string = '', lastName: string = '') => {
        authError.value = null
        try {
            // 1. Create user in Firebase Auth
            const userCredential = await createUserWithEmailAndPassword(auth, email, password)
            const user = userCredential.user

            // 2. Update display name (use nickname for display)
            await updateProfile(user, { displayName: nickname })

            // 3. Save additional data to Firestore
            await setDoc(doc(db, 'users', user.uid), {
                firstName,
                lastName,
                nickname,
                email,
                role: 'pilot',
                coachId: null,
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
        getUserProfile,
        userRole,
        isCoach,
        isAdmin
    }
}
