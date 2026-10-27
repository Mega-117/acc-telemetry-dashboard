<script setup lang="ts">
// ============================================
// AuthOverlay - Racing Style (Liquid Glass)
// ============================================

import { computed, ref } from 'vue'
import AuthScene from './AuthScene.vue'
import AuthIcon from './AuthIcon.vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import type { RegisterConsent } from '~/utils/legalVersions'
import { useI18n } from '~/i18n'

const { t } = useI18n()

type AuthView = 'login' | 'register' | 'reset'

const currentTab = ref<'login' | 'register'>('login')
const currentView = ref<AuthView>('login')

const loginFormRef = ref()
const registerFormRef = ref()
const resetFormRef = ref()

// Firebase Auth
const { login, register, resetPassword } = useFirebaseAuth()
const props = defineProps<{ busy?: boolean }>()
const isSubmitting = ref(false)
const isBusy = computed(() => isSubmitting.value || props.busy)

// Emit events to parent
const emit = defineEmits<{
  'login-success': [email: string]
  'register-success': [email: string]
}>()

const handleTabChange = (tab: 'login' | 'register') => {
  if (isBusy.value) return
  currentTab.value = tab
  currentView.value = tab
}

const showResetPassword = () => {
  if (isBusy.value) return
  currentView.value = 'reset'
}

const backToLogin = () => {
  if (isBusy.value) return
  currentView.value = 'login'
  currentTab.value = 'login'
  resetFormRef.value?.reset()
}

const handleLogin = async (credentials: { email: string; password: string }) => {
  if (isBusy.value) return
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
    loginFormRef.value?.setError(t('auth.service.generic'))
  } finally {
    isSubmitting.value = false
  }
}

const handleRegister = async (data: { firstName: string; lastName: string; nickname: string; email: string; password: string; consent: RegisterConsent }) => {
  if (isBusy.value) return
  isSubmitting.value = true

  try {
    const result = await register(data.email, data.password, data.nickname, data.firstName, data.lastName, data.consent)
    if (result.success) {
      emit('register-success', data.email)
    } else {
      registerFormRef.value?.setError(result.error)
    }
  } catch {
    registerFormRef.value?.setError(t('auth.service.generic'))
  } finally {
    isSubmitting.value = false
  }
}

const handleResetPassword = async (email: string) => {
  if (isBusy.value) return
  isSubmitting.value = true

  try {
    const result = await resetPassword(email)
    if (result.success) {
      resetFormRef.value?.setSuccess(true)
    } else {
      resetFormRef.value?.setError(result.error)
    }
  } catch {
    resetFormRef.value?.setError(t('auth.service.generic'))
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <AuthScene :wide="currentView === 'register'">
    <nav class="auth-nav" :aria-label="t('auth.nav.label')">
      <button v-if="currentView === 'reset'" class="auth-back" :disabled="isBusy" @click="backToLogin">
        <AuthIcon name="back" /> {{ t('auth.nav.backToLogin') }}
      </button>
      <template v-else>
      <button class="auth-nav__item" :class="{ 'is-active': currentTab === 'login' }" :aria-current="currentTab === 'login' ? 'page' : undefined"
        :disabled="isBusy" @click="handleTabChange('login')">{{ t('auth.nav.login') }}</button>
      <button class="auth-nav__item" :class="{ 'is-active': currentTab === 'register' }" :aria-current="currentTab === 'register' ? 'page' : undefined"
        :disabled="isBusy" @click="handleTabChange('register')">{{ t('auth.nav.register') }}</button>
      </template>
    </nav>
        <!-- Forms with Transition -->
        <div class="auth-form-container">
          <Transition name="racer" @before-leave="el => el.setAttribute('inert', '')">
            <AuthLoginForm 
              v-if="currentView === 'login'"
              key="login"
              ref="loginFormRef"
              :loading="isBusy"
              @submit="handleLogin"
              @forgot-password="showResetPassword"
            />

            <AuthRegisterForm 
              v-else-if="currentView === 'register'"
              key="register"
              ref="registerFormRef"
              :loading="isBusy"
              @submit="handleRegister"
            />

            <AuthResetPasswordForm 
              v-else
              key="reset"
              ref="resetFormRef"
              hide-back
              :loading="isBusy"
              @submit="handleResetPassword"
              @back="backToLogin"
            />
          </Transition>
        </div>
  </AuthScene>
</template>
