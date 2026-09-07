<script setup lang="ts">
// ============================================
// AuthOverlay - Racing Style (Liquid Glass)
// ============================================

import { ref } from 'vue'
import AuthScene from './AuthScene.vue'
import AuthIcon from './AuthIcon.vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'

type AuthView = 'login' | 'register' | 'reset'

const currentTab = ref<'login' | 'register'>('login')
const currentView = ref<AuthView>('login')

const loginFormRef = ref()
const registerFormRef = ref()
const resetFormRef = ref()

// Firebase Auth
const { login, register, resetPassword } = useFirebaseAuth()
const isSubmitting = ref(false)

// Emit events to parent
const emit = defineEmits<{
  'login-success': [email: string]
  'register-success': [email: string]
}>()

const handleTabChange = (tab: 'login' | 'register') => {
  if (isSubmitting.value) return
  currentTab.value = tab
  currentView.value = tab
}

const showResetPassword = () => {
  if (isSubmitting.value) return
  currentView.value = 'reset'
}

const backToLogin = () => {
  if (isSubmitting.value) return
  currentView.value = 'login'
  currentTab.value = 'login'
  resetFormRef.value?.reset()
}

const handleLogin = async (credentials: { email: string; password: string }) => {
  if (isSubmitting.value) return
  isSubmitting.value = true

  try {
    const result = await login(credentials.email, credentials.password)
    if (result.success) {
      // The global Firebase observer owns verification and shell routing.
      emit('login-success', credentials.email)
    } else {
      loginFormRef.value?.setError(result.error)
    }
  } catch {
    loginFormRef.value?.setError('Errore di autenticazione')
  } finally {
    isSubmitting.value = false
  }
}

const handleRegister = async (data: { firstName: string; lastName: string; nickname: string; email: string; password: string }) => {
  if (isSubmitting.value) return
  isSubmitting.value = true

  try {
    const result = await register(data.email, data.password, data.nickname, data.firstName, data.lastName)
    if (result.success) {
      emit('register-success', data.email)
    } else {
      registerFormRef.value?.setError(result.error)
    }
  } catch {
    registerFormRef.value?.setError('Errore di autenticazione')
  } finally {
    isSubmitting.value = false
  }
}

const handleResetPassword = async (email: string) => {
  if (isSubmitting.value) return
  isSubmitting.value = true

  try {
    const result = await resetPassword(email)
    if (result.success) {
      resetFormRef.value?.setSuccess(true)
    } else {
      resetFormRef.value?.setError(result.error)
    }
  } catch {
    resetFormRef.value?.setError('Errore di autenticazione')
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <AuthScene :wide="currentView === 'register'">
    <nav class="auth-nav" aria-label="Accesso o registrazione">
      <button v-if="currentView === 'reset'" class="auth-back" :disabled="isSubmitting" @click="backToLogin">
        <AuthIcon name="back" /> Torna al login
      </button>
      <template v-else>
      <button class="auth-nav__item" :class="{ 'is-active': currentTab === 'login' }" :aria-current="currentTab === 'login' ? 'page' : undefined"
        :disabled="isSubmitting" @click="handleTabChange('login')">ACCEDI</button>
      <button class="auth-nav__item" :class="{ 'is-active': currentTab === 'register' }" :aria-current="currentTab === 'register' ? 'page' : undefined"
        :disabled="isSubmitting" @click="handleTabChange('register')">REGISTRATI</button>
      </template>
    </nav>
        <!-- Forms with Transition -->
        <div class="auth-form-container">
          <Transition name="racer" @before-leave="el => el.setAttribute('inert', '')">
            <AuthLoginForm 
              v-if="currentView === 'login'"
              key="login"
              ref="loginFormRef"
              :loading="isSubmitting"
              @submit="handleLogin"
              @forgot-password="showResetPassword"
            />

            <AuthRegisterForm 
              v-else-if="currentView === 'register'"
              key="register"
              ref="registerFormRef"
              :loading="isSubmitting"
              @submit="handleRegister"
            />

            <AuthResetPasswordForm 
              v-else
              key="reset"
              ref="resetFormRef"
              hide-back
              :loading="isSubmitting"
              @submit="handleResetPassword"
              @back="backToLogin"
            />
          </Transition>
        </div>
  </AuthScene>
</template>
