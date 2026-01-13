<script setup lang="ts">
// ============================================
// AuthOverlay - Racing Style (Liquid Glass)
// ============================================

import { ref, computed } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'

type AuthView = 'login' | 'register' | 'reset'

const currentTab = ref<'login' | 'register'>('login')
const currentView = ref<AuthView>('login')

const loginFormRef = ref()
const registerFormRef = ref()
const resetFormRef = ref()

// Firebase Auth
const { login, register, authError } = useFirebaseAuth()
const isSubmitting = ref(false)

// Emit events to parent
const emit = defineEmits<{
  'login-success': [email: string]
  'register-success': [email: string]
}>()

// Determine form height class for Liquid Glass animation
const formHeightClass = computed(() => {
  switch (currentView.value) {
    case 'register': return 'form-height--register'
    case 'reset': return 'form-height--reset'
    default: return 'form-height--login'
  }
})

const handleTabChange = (tab: 'login' | 'register') => {
  currentTab.value = tab
  currentView.value = tab
}

const showResetPassword = () => {
  currentView.value = 'reset'
}

const backToLogin = () => {
  currentView.value = 'login'
  currentTab.value = 'login'
  resetFormRef.value?.reset()
}

const handleLogin = async (credentials: { email: string; password: string }) => {
  isSubmitting.value = true
  
  const result = await login(credentials.email, credentials.password)
  
  isSubmitting.value = false
  
  if (result.success) {
    emit('login-success', credentials.email)
  } else {
    // Error is already set in authError by the composable
    loginFormRef.value?.setError(result.error)
  }
}

const handleRegister = async (data: { nickname: string; email: string; password: string }) => {
  isSubmitting.value = true
  
  const result = await register(data.email, data.password, data.nickname)
  
  isSubmitting.value = false
  
  if (result.success) {
    emit('register-success', data.email)
  } else {
    registerFormRef.value?.setError(result.error)
  }
}

const handleResetPassword = (email: string) => {
  console.log('[AUTH] Reset:', email)
  // TODO: Implement password reset with Firebase
  resetFormRef.value?.setSuccess(true)
}
</script>

<template>
  <div class="auth-overlay">
    <!-- Ambient Background -->
    <div class="auth-overlay__ambient">
      <div class="ambient-glow ambient-glow--red"></div>
      <div class="ambient-glow ambient-glow--gold"></div>
    </div>

    <!-- Main Card with Liquid Glass Animation -->
    <div :class="['auth-card', formHeightClass]">
      <!-- Glow Ring -->
      <div class="auth-card__glow"></div>
      
      <!-- Card Body -->
      <div class="auth-card__body">
        <!-- Header -->
        <header class="auth-header">
          <div class="brand">
            <span class="brand__badge">ACC</span>
            <span class="brand__name">TELEMETRY</span>
          </div>
        </header>

        <!-- Tabs -->
        <nav v-if="currentView !== 'reset'" class="auth-nav">
          <button 
            :class="['auth-nav__item', { 'is-active': currentTab === 'login' }]"
            @click="handleTabChange('login')"
          >
            Login
          </button>
          <button 
            :class="['auth-nav__item', { 'is-active': currentTab === 'register' }]"
            @click="handleTabChange('register')"
          >
            Registrati
          </button>
        </nav>

        <!-- Forms with Transition -->
        <div class="auth-form-container">
          <Transition name="liquid" mode="out-in">
            <AuthLoginForm 
              v-if="currentView === 'login'"
              key="login"
              ref="loginFormRef"
              @submit="handleLogin"
              @forgot-password="showResetPassword"
            />

            <AuthRegisterForm 
              v-else-if="currentView === 'register'"
              key="register"
              ref="registerFormRef"
              @submit="handleRegister"
            />

            <AuthResetPasswordForm 
              v-else
              key="reset"
              ref="resetFormRef"
              @submit="handleResetPassword"
              @back="backToLogin"
            />
          </Transition>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// ============================================
// RACING THEME - Liquid Glass Edition
// ============================================

// === DESIGN TOKENS ===
$font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
$font-family-display: 'Outfit', $font-family;

$color-racing-red: #e10600;
$color-racing-orange: #ff6b00;
$color-racing-gold: #ffd700;

$color-bg-page: #0d0d12;
$color-bg-card: #121218;
$color-bg-input: rgba(255, 255, 255, 0.04);

$color-text-primary: #ffffff;
$color-text-secondary: rgba(255, 255, 255, 0.65);
$color-text-muted: rgba(255, 255, 255, 0.4);

$gradient-racing: linear-gradient(135deg, $color-racing-red 0%, $color-racing-orange 60%, $color-racing-gold 100%);

$radius-sm: 10px;
$radius-md: 14px;
$radius-lg: 20px;
$radius-xl: 28px;

$shadow-glow-sm: 0 0 30px rgba($color-racing-red, 0.25);
$shadow-glow-lg: 0 0 60px rgba($color-racing-red, 0.4);

// Liquid Glass timing - fast and snappy
$liquid-timing: cubic-bezier(0.2, 0, 0, 1);
$liquid-duration: 0.2s;

// === OVERLAY ===
.auth-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $color-bg-page;
  font-family: $font-family;
  overflow: hidden;
}

// === AMBIENT GLOWS ===
.auth-overlay__ambient {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.ambient-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(120px);
  opacity: 0.35;

  &--red {
    top: -30%;
    left: -20%;
    width: 60%;
    height: 70%;
    background: radial-gradient(circle, rgba($color-racing-red, 0.4) 0%, transparent 65%);
  }

  &--gold {
    bottom: -30%;
    right: -15%;
    width: 50%;
    height: 60%;
    background: radial-gradient(circle, rgba($color-racing-gold, 0.25) 0%, transparent 65%);
  }
}

// === MAIN CARD ===
.auth-card {
  position: relative;
  width: 100%;
  max-width: 445px;
  z-index: 10;
  // Liquid Glass height transition
  transition: all $liquid-duration $liquid-timing;
}

// === GLOW RING ===
.auth-card__glow {
  position: absolute;
  inset: -4px;
  border-radius: $radius-xl + 4px;
  background: $gradient-racing;
  opacity: 0.5;
  filter: blur(20px);
  z-index: -1;
  animation: glowPulse 3s ease-in-out infinite;
  transition: all $liquid-duration $liquid-timing;
}

@keyframes glowPulse {
  0%, 100% {
    opacity: 0.35;
    transform: scale(1);
  }
  50% {
    opacity: 0.6;
    transform: scale(1.02);
  }
}

// === CARD BODY ===
.auth-card__body {
  position: relative;
  background: $color-bg-card;
  border: 2px solid rgba($color-racing-red, 0.45);
  border-radius: $radius-xl;
  padding: 64px;
  box-shadow: 
    0 0 0 1px rgba(255, 255, 255, 0.04),
    0 30px 60px -15px rgba(0, 0, 0, 0.5);
  animation: cardEnter 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  transition: all $liquid-duration $liquid-timing;
}

@keyframes cardEnter {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

// === HEADER ===
.auth-header {
  text-align: center;
  margin-bottom: 40px;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 14px;

  &__badge {
    font-family: $font-family-display;
    font-size: 26px;
    font-weight: 700;
    letter-spacing: 2px;
    color: $color-racing-red;
    padding: 10px 16px;
    border: 2px solid $color-racing-red;
    border-radius: 8px;
    text-shadow: 0 0 16px rgba($color-racing-red, 0.5);
  }

  &__name {
    font-family: $font-family-display;
    font-size: 28px;
    font-weight: 700;
    letter-spacing: 4px;
    color: $color-text-primary;
  }
}

// === NAVIGATION TABS ===
.auth-nav {
  max-width: 240px;
  margin-left: auto;
  margin-right: auto;
  display: flex;
  gap: 12px;
  margin-bottom: 32px;
}

.auth-nav__item {
  flex: 1;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: $radius-sm;
  font-family: $font-family;
  font-size: 16px;
  font-weight: 600;
  color: $color-text-secondary;
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover:not(.is-active) {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.18);
    color: $color-text-primary;
  }

  &.is-active {
    background: $gradient-racing;
    border-color: $color-racing-red;
    color: #fff;
    font-weight: 700;
    box-shadow: $shadow-glow-sm;
  }
}

// === FORM CONTAINER ===
.auth-form-container {
  max-width: 240px;
  margin: 0 auto;
  min-height: 200px; // Prevent layout shift
}

// === LIQUID GLASS TRANSITION ===
.liquid-enter-active,
.liquid-leave-active {
  transition: opacity $liquid-duration $liquid-timing,
              transform $liquid-duration $liquid-timing;
  will-change: opacity, transform;
}

.liquid-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.liquid-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

// === FORM STYLES ===
:deep(.auth-form) {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

:deep(.form-input) {
  width: 100%;
  padding: 14px 16px;
  background: $color-bg-input;
  border: 1.5px solid rgba(255, 255, 255, 0.1);
  border-radius: $radius-sm;
  color: $color-text-primary;
  font-family: $font-family;
  font-size: 16px;
  transition: all 0.25s ease;

  &::placeholder {
    font-family: $font-family;
    font-size: 16px;
    color: $color-text-muted;
  }

  &:hover:not(:focus) {
    border-color: rgba(255, 255, 255, 0.15);
  }

  &:focus {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba($color-racing-red, 0.6);
    box-shadow: 0 0 0 4px rgba($color-racing-red, 0.1);
    outline: none;
  }
}

:deep(.btn--primary) {
  width: 100%;
  padding: 12px 16px;
  margin-top: 12px;
  background: $gradient-racing;
  border: none;
  border-radius: $radius-sm;
  font-family: $font-family;
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  cursor: pointer;
  box-shadow: $shadow-glow-sm;
  transition: all 0.25s ease;

  &:hover {
    box-shadow: 0 0 40px rgba($color-racing-red, 0.5);
  }

  &:active {
    box-shadow: $shadow-glow-sm;
  }
}

:deep(.btn--link) {
  display: block;
  width: 100%;
  background: none;
  border: none;
  padding: 14px;
  margin-top: 8px;
  font-family: $font-family;
  font-size: 16px;
  color: $color-racing-red;
  text-align: center;
  cursor: pointer;
  transition: color 0.2s ease;

  &:hover {
    color: $color-racing-orange;
  }
}

:deep(.form-error) {
  padding: 16px 20px;
  background: rgba($color-racing-red, 0.1);
  border: 1px solid rgba($color-racing-red, 0.3);
  border-radius: $radius-sm;
  font-family: $font-family;
  font-size: 16px;
  color: #ff8585;
  text-align: center;
  line-height: 1.5;
}

// === RESET FORM SPECIFIC ===
:deep(.reset-form__title) {
  font-family: $font-family;
  font-size: 20px;
}

:deep(.reset-form__description) {
  font-family: $font-family;
  font-size: 16px;
}

// ============================================
// RESPONSIVE - Mobile First Breakpoints
// ============================================

// Tablet and below (< 768px)
@media (max-width: 768px) {
  .auth-card {
    max-width: 100%;
    margin: 0 16px;
  }

  .auth-card__body {
    padding: 48px 40px;
    border-radius: $radius-lg;
  }

  .auth-card__glow {
    border-radius: $radius-lg + 4px;
    filter: blur(16px);
  }

  .brand {
    gap: 10px;

    &__badge {
      font-size: 22px;
      padding: 8px 12px;
    }

    &__name {
      font-size: 24px;
      letter-spacing: 3px;
    }
  }

  .auth-header {
    margin-bottom: 32px;
  }

  .auth-nav {
    max-width: 100%;
    margin-bottom: 28px;
  }

  .auth-nav__item {
    padding: 12px 14px;
    font-size: 15px;
  }

  .auth-form-container {
    max-width: 100%;
  }
}

// Mobile small (< 480px)
@media (max-width: 480px) {
  .auth-overlay {
    padding: 16px;
  }

  .auth-card {
    margin: 0;
  }

  .auth-card__body {
    padding: 36px 28px;
    border-radius: $radius-md;
  }

  .auth-card__glow {
    border-radius: $radius-md + 4px;
    filter: blur(12px);
    inset: -3px;
  }

  .brand {
    flex-direction: column;
    gap: 8px;

    &__badge {
      font-size: 20px;
      padding: 6px 10px;
    }

    &__name {
      font-size: 20px;
      letter-spacing: 2px;
    }
  }

  .auth-header {
    margin-bottom: 28px;
  }

  .auth-nav {
    gap: 8px;
    margin-bottom: 24px;
  }

  .auth-nav__item {
    padding: 10px 12px;
    font-size: 14px;
  }

  :deep(.auth-form) {
    gap: 14px;
  }

  :deep(.form-input) {
    padding: 12px 14px;
    font-size: 16px; // Keep 16px to prevent iOS zoom
  }

  :deep(.btn--primary) {
    padding: 12px 16px;
    font-size: 15px;
  }

  :deep(.btn--link) {
    padding: 12px;
    font-size: 15px;
  }

  // Reduce ambient glows on mobile for performance
  .ambient-glow {
    filter: blur(80px);
    opacity: 0.25;
  }
}

// Extra small (< 360px)
@media (max-width: 360px) {
  .auth-card__body {
    padding: 28px 20px;
  }

  .brand {
    &__badge {
      font-size: 18px;
    }

    &__name {
      font-size: 18px;
    }
  }
}
</style>
