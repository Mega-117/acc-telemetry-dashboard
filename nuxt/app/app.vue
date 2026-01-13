<script setup lang="ts">
// ============================================
// App.vue - Main Application with Auth Flow
// ============================================

import { ref, computed, onMounted, watch } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'

// === FIREBASE AUTH ===
const { 
  currentUser, 
  isLoading: authLoading, 
  isAuthenticated, 
  isEmailVerified,
  userEmail: firebaseUserEmail,
  userDisplayName,
  logout: firebaseLogout
} = useFirebaseAuth()

// === APP STATE ===
type AppState = 'auth' | 'loading' | 'dashboard' | 'profile'
type AuthState = 'login' | 'register' | 'reset' | 'register-success'
type DissolveAnimation = 'fade-zoom' | 'warp' | 'particles' | 'slide-up'

const appState = ref<AppState>('auth')
const authState = ref<AuthState>('login')
const userEmail = ref('')

// === CONFIG ===
const REQUIRE_EMAIL_VERIFICATION = ref(false) // Always require email verification
const transitionName = 'dissolve-fade-zoom' // Fixed animation

// === WATCH AUTH STATE CHANGES ===
watch(currentUser, (user) => {
  if (user) {
    userEmail.value = user.email || ''
    
    // Check if user needs email verification
    if (REQUIRE_EMAIL_VERIFICATION.value && !user.emailVerified) {
      // Stay on verification screen or show it
      if (appState.value !== 'auth' || authState.value !== 'register-success') {
        appState.value = 'auth'
        authState.value = 'register-success'
      }
    } else {
      // User is verified or verification not required → go to dashboard
      if (appState.value === 'auth' && authState.value !== 'register-success') {
        appState.value = 'loading'
        setTimeout(() => {
          appState.value = 'dashboard'
        }, 1000)
      }
    }
  }
})

// === HANDLERS ===
const handleLoginSuccess = (email: string) => {
  userEmail.value = email
  
  // Check if email verification is required
  if (REQUIRE_EMAIL_VERIFICATION.value && currentUser.value && !currentUser.value.emailVerified) {
    authState.value = 'register-success'
    return
  }
  
  appState.value = 'loading'
  setTimeout(() => {
    appState.value = 'dashboard'
  }, 1500)
}

const handleRegisterSuccess = (email: string) => {
  userEmail.value = email
  
  if (REQUIRE_EMAIL_VERIFICATION.value) {
    // Show verification screen
    authState.value = 'register-success'
  } else {
    // Skip verification, go directly to dashboard
    appState.value = 'loading'
    setTimeout(() => {
      appState.value = 'dashboard'
    }, 1500)
  }
}

const handleGoToDashboard = () => {
  // Called when user clicks "Ho confermato l'email" and verification passed
  appState.value = 'loading'
  setTimeout(() => {
    appState.value = 'dashboard'
  }, 1500)
}

const handleResendEmail = () => {
  console.log('[AUTH] Resending verification email to:', userEmail.value)
}

const handleLogout = async () => {
  await firebaseLogout()
  userEmail.value = ''
  authState.value = 'login'
  appState.value = 'auth'
}

const handleGoToProfile = () => {
  appState.value = 'profile'
}

const handleBackToDashboard = () => {
  appState.value = 'dashboard'
}
</script>

<template>
  <div id="app">
    <NuxtRouteAnnouncer />

    <!-- Main Content with Transitions -->
    <Transition :name="transitionName" mode="out-in">
      <!-- Auth Overlay -->
      <AuthOverlay 
        v-if="appState === 'auth' && authState !== 'register-success'"
        key="auth"
        @login-success="handleLoginSuccess"
        @register-success="handleRegisterSuccess"
      />

      <!-- Registration Success -->
      <div 
        v-else-if="appState === 'auth' && authState === 'register-success'" 
        key="register-success"
        class="auth-wrapper"
      >
        <div class="auth-card-standalone">
          <AuthRegistrationSuccess
            :email="userEmail"
            :require-email-verification="REQUIRE_EMAIL_VERIFICATION"
            @go-to-dashboard="handleGoToDashboard"
            @resend-email="handleResendEmail"
          />
        </div>
      </div>

      <!-- Loading Screen -->
      <div v-else-if="appState === 'loading'" key="loading" class="loading-screen">
        <div class="loading-content">
          <div class="loading-spinner"></div>
          <p class="loading-text">Caricamento Dashboard...</p>
        </div>
      </div>

      <!-- Profile Page -->
      <ProfilePage
        v-else-if="appState === 'profile'"
        key="profile"
        :user-email="userEmail"
        :user-nickname="userDisplayName"
        @logout="handleLogout"
        @back="handleBackToDashboard"
      />

      <!-- Dashboard (default fallback) -->
      <DashboardMain 
        v-else
        key="dashboard"
        :user-email="userEmail"
        :user-nickname="userDisplayName"
        @logout="handleLogout"
        @go-to-profile="handleGoToProfile"
      />
    </Transition>
  </div>
</template>

<style lang="scss">
$font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
$color-racing-red: #e10600;
$color-racing-orange: #ff6b00;
$color-bg: #0d0d12;
$color-card: #121218;

#app {
  min-height: 100vh;
  background: $color-bg;
}

// === AUTH WRAPPER ===
.auth-wrapper {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $color-bg;
}

.auth-card-standalone {
  background: $color-card;
  border: 2px solid rgba($color-racing-red, 0.4);
  border-radius: 28px;
  padding: 56px 64px;
  max-width: 480px;
  box-shadow: 
    0 0 60px rgba($color-racing-red, 0.15),
    0 30px 60px -15px rgba(0, 0, 0, 0.5);
}

// === LOADING SCREEN ===
.loading-screen {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $color-bg;
}

.loading-content {
  text-align: center;
}

.loading-spinner {
  width: 48px;
  height: 48px;
  margin: 0 auto 24px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: $color-racing-red;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  font-family: $font-family;
  font-size: 16px;
  color: rgba(255, 255, 255, 0.6);
}

// ============================================
// DISSOLVE ANIMATIONS
// ============================================

// === 1. FADE ZOOM ===
.dissolve-fade-zoom-enter-active,
.dissolve-fade-zoom-leave-active {
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.dissolve-fade-zoom-enter-from {
  opacity: 0;
  transform: scale(0.9);
}

.dissolve-fade-zoom-leave-to {
  opacity: 0;
  transform: scale(1.15);
  filter: blur(8px);
}

// === 2. WARP SPEED ===
.dissolve-warp-enter-active,
.dissolve-warp-leave-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.dissolve-warp-enter-from {
  opacity: 0;
  transform: scaleX(0.8) translateY(20px);
}

.dissolve-warp-leave-to {
  opacity: 0;
  transform: scaleX(1.5) scaleY(0.5);
  filter: blur(12px);
}

// === 3. PARTICLES (simulated with blur + scale) ===
.dissolve-particles-enter-active {
  transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

.dissolve-particles-leave-active {
  transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.dissolve-particles-enter-from {
  opacity: 0;
  transform: scale(0.8);
  filter: blur(20px);
}

.dissolve-particles-leave-to {
  opacity: 0;
  transform: scale(1.3);
  filter: blur(30px) brightness(2);
}

// === 4. SLIDE UP ===
.dissolve-slide-up-enter-active,
.dissolve-slide-up-leave-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.dissolve-slide-up-enter-from {
  opacity: 0;
  transform: translateY(40px);
}

.dissolve-slide-up-leave-to {
  opacity: 0;
  transform: translateY(-60px);
  filter: blur(4px);
}

// Responsive
@media (max-width: 768px) {
  .auth-card-standalone {
    margin: 16px;
    padding: 40px 32px;
  }
}
</style>
