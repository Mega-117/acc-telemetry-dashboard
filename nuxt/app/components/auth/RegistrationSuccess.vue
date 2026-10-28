<script setup lang="ts">
// ============================================
// RegistrationSuccess - Email Verification Screen
// ============================================

import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AuthIcon from './AuthIcon.vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { emailDomainHintMessage } from '~/utils/emailDomainHint'
import { useI18n } from '~/i18n'

const { t } = useI18n()

defineProps<{
  email: string
  requireEmailVerification: boolean
}>()

const emit = defineEmits<{
  goToDashboard: []
  resendEmail: []
}>()

// Firebase Auth
const { checkEmailVerified, resendVerificationEmail, changeVerificationEmail, logout } = useFirebaseAuth()

// PIP-670: a way out of this screen (another account, or verify later). Signing out brings the
// shell back to the login form through the auth status, as any logout does.
const isLeaving = ref(false)
const handleBackToLogin = async () => {
  if (isLeaving.value) return
  isLeaving.value = true
  try { await logout() } finally { isLeaving.value = false }
}

// State
const RESEND_COOLDOWN_SECONDS = 60
const isResending = ref(false)
const resendSuccess = ref(false)
const resendError = ref<string | null>(null)
const resendCooldown = ref(0)
const isChecking = ref(false)
const verificationError = ref(false)
const verificationMessage = ref('')
let resendCooldownTimer: ReturnType<typeof setInterval> | null = null

// --- Correzione dell'indirizzo (PIP-372) ---
// Senza questa via d'uscita, chi ha sbagliato il dominio in registrazione resta
// bloccato qui per sempre: non riceve la mail e non ha modo di correggere,
// quindi l'unica soluzione e' un intervento manuale con l'Admin SDK.
const isEditingEmail = ref(false)
const newEmail = ref('')
const isSubmittingEmail = ref(false)
const emailChangeError = ref('')
const emailChangeSent = ref(false)

const newEmailDomainHint = computed(() => emailDomainHintMessage(newEmail.value))

// Una sola azione auth alla volta, come per le altre di questa schermata.
const isEmailChangeBusy = computed(() => (
  isSubmittingEmail.value || isChecking.value || isResending.value
))

const toggleEmailEditor = () => {
  isEditingEmail.value = !isEditingEmail.value
  emailChangeError.value = ''

  if (!isEditingEmail.value) newEmail.value = ''
}

const handleChangeEmail = async () => {
  if (isEmailChangeBusy.value) return

  isSubmittingEmail.value = true
  emailChangeError.value = ''

  try {
    const result = await changeVerificationEmail(newEmail.value)

    if (result.success) {
      emailChangeSent.value = true
      isEditingEmail.value = false
      newEmail.value = ''
    } else {
      emailChangeError.value = result.error || t('auth.verify.changeError')
    }
  } catch {
    emailChangeError.value = t('auth.verify.changeError')
  } finally {
    isSubmittingEmail.value = false
  }
}

const isResendDisabled = computed(() => (
  isResending.value || resendSuccess.value || resendCooldown.value > 0
))

const resendButtonText = computed(() => {
  if (isResending.value) return t('auth.verify.sending')
  if (resendSuccess.value) return t('auth.verify.resent')
  if (resendCooldown.value > 0) return t('auth.verify.resendIn', { seconds: resendCooldown.value })
  return t('auth.verify.resend')
})

const stopResendCooldown = () => {
  if (!resendCooldownTimer) return
  clearInterval(resendCooldownTimer)
  resendCooldownTimer = null
}

const startResendCooldown = () => {
  stopResendCooldown()
  resendCooldown.value = RESEND_COOLDOWN_SECONDS
  resendCooldownTimer = setInterval(() => {
    resendCooldown.value = Math.max(0, resendCooldown.value - 1)

    if (resendCooldown.value <= 0) {
      stopResendCooldown()
    }
  }, 1000)
}

onBeforeUnmount(() => {
  stopResendCooldown()
  if (typeof window !== 'undefined') {
    window.removeEventListener('focus', handleVerificationRecoverySignal)
    window.removeEventListener('online', handleVerificationRecoverySignal)
  }
})

const handleResendEmail = async () => {
  if (isResendDisabled.value || isChecking.value) return

  isResending.value = true
  resendError.value = null
  verificationError.value = false
  verificationMessage.value = ''
  
  try {
    const result = await resendVerificationEmail()

    if (result.success && result.alreadyVerified) {
      emit('goToDashboard')
      return
    }

    if (result.success) {
      resendSuccess.value = true
      setTimeout(() => resendSuccess.value = false, 3000)
      startResendCooldown()
    } else {
      resendError.value = result.error || t('auth.verify.resendError')
    }

    if (result.success) emit('resendEmail')
  } catch {
    resendError.value = t('auth.verify.resendError')
  } finally {
    isResending.value = false
  }
}

const reconcileVerification = async ({ showError }: { showError: boolean }) => {
  if (isChecking.value || isResending.value) return { verified: false, error: null }
  isChecking.value = true
  verificationError.value = false
  verificationMessage.value = ''
  
  try {
    const result = await checkEmailVerified()

    if (result.verified) {
      emit('goToDashboard')
    } else if (showError) {
      verificationError.value = true
      verificationMessage.value = result.error || t('auth.verify.notVerified')
    }
    return result
  } catch {
    const error = t('auth.verify.checkError')
    if (showError) {
      verificationError.value = true
      verificationMessage.value = error
    }
    return { verified: false, error }
  } finally {
    isChecking.value = false
  }
}

const handleCheckVerification = async () => {
  await reconcileVerification({ showError: true })
}

function handleVerificationRecoverySignal() {
  void reconcileVerification({ showError: false })
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handleVerificationRecoverySignal)
    window.addEventListener('online', handleVerificationRecoverySignal)
  }
  void reconcileVerification({ showError: false })
})
</script>

<template>
  <div class="email-verification">
    <!-- Icon -->
    <AuthIcon name="mail" class="verify-icon" />

    <!-- Title -->
    <h2 class="verify-title">{{ t('auth.verify.title') }}</h2>

    <!-- Email -->
    <p class="verify-email">{{ email }}</p>

    <!-- Instructions -->
    <div class="verify-box">
      <p class="verify-text">{{ t('auth.verify.text') }}</p>
      <p class="verify-hint">{{ t('auth.verify.spamHint') }}</p>
    </div>

    <!-- Error Message -->
    <div v-if="verificationError" class="error-message">
      {{ verificationMessage }}
    </div>

    <!-- Resend Error Message -->
    <div v-if="resendError" class="error-message resend-error">
      {{ resendError }}
    </div>

    <!-- Main CTA Button -->
    <button 
      class="verify-btn"
      :class="{ 'verify-btn--loading': isChecking }"
      :disabled="isChecking || isResending"
      @click="handleCheckVerification"
    >
      <template v-if="isChecking">
        <span class="spinner"></span> {{ t('auth.verify.checking') }}
      </template>
      <template v-else>
        <span>{{ t('auth.verify.confirmed') }}</span><UiRacingIcon name="chevron" :size="26" class="auth-btn-arrow" />
      </template>
    </button>

    <!-- Resend Link -->
    <button
      class="resend-btn"
      :disabled="isResendDisabled"
      @click="handleResendEmail"
    >
      {{ resendButtonText }}
    </button>

    <!-- Correzione indirizzo: l'uscita quando la posta non puo' arrivare -->
    <div class="email-fix">
      <p v-if="emailChangeSent" class="email-fix__sent">
        {{ t('auth.verify.changeSent') }}
      </p>

      <template v-else>
        <button
          v-if="!isEditingEmail"
          class="email-fix__toggle"
          :disabled="isEmailChangeBusy"
          @click="toggleEmailEditor"
        >
          {{ t('auth.verify.fixToggle') }}
        </button>

        <form v-else class="email-fix__form" @submit.prevent="handleChangeEmail">
          <input
            v-model="newEmail"
            class="email-fix__input"
            type="email"
            :placeholder="t('auth.verify.newEmail')"
            :aria-label="t('auth.verify.newEmail')"
            autocomplete="email"
            :disabled="isSubmittingEmail"
          >

          <p v-if="newEmailDomainHint" class="email-fix__hint">{{ newEmailDomainHint }}</p>

          <div v-if="emailChangeError" class="error-message">{{ emailChangeError }}</div>

          <button class="email-fix__submit" type="submit" :disabled="isEmailChangeBusy">
            {{ isSubmittingEmail ? t('auth.verify.sending') : t('auth.verify.sendToNew') }}
          </button>

          <button
            class="email-fix__toggle"
            type="button"
            :disabled="isSubmittingEmail"
            @click="toggleEmailEditor"
          >
            {{ t('auth.verify.cancel') }}
          </button>
        </form>
      </template>
    </div>

    <button class="email-fix__toggle verify-back" type="button" :disabled="isLeaving || isEmailChangeBusy" @click="handleBackToLogin">
      {{ t('auth.verify.backToLogin') }}
    </button>
  </div>
</template>
