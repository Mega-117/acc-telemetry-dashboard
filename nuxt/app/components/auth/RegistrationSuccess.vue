<script setup lang="ts">
// ============================================
// RegistrationSuccess - Email Verification Screen
// ============================================

import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AuthIcon from './AuthIcon.vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { emailDomainHintMessage } from '~/utils/emailDomainHint'

defineProps<{
  email: string
  requireEmailVerification: boolean
}>()

const emit = defineEmits<{
  goToDashboard: []
  resendEmail: []
}>()

// Firebase Auth
const { checkEmailVerified, resendVerificationEmail, changeVerificationEmail } = useFirebaseAuth()

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
      emailChangeError.value = result.error || 'Errore durante il cambio email'
    }
  } catch {
    emailChangeError.value = 'Errore durante il cambio email'
  } finally {
    isSubmittingEmail.value = false
  }
}

const isResendDisabled = computed(() => (
  isResending.value || resendSuccess.value || resendCooldown.value > 0
))

const resendButtonText = computed(() => {
  if (isResending.value) return 'Invio in corso...'
  if (resendSuccess.value) return '✓ Email inviata'
  if (resendCooldown.value > 0) return `Rinvia tra ${resendCooldown.value}s`
  return 'Rinvia email di verifica'
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
      resendError.value = result.error || 'Errore invio email'
    }

    if (result.success) emit('resendEmail')
  } catch {
    resendError.value = 'Errore invio email'
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
      verificationMessage.value = result.error || 'Email non ancora verificata. Clicca il link ricevuto via email e riprova.'
    }
    return result
  } catch {
    const error = 'Errore durante il controllo della verifica'
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
    <h2 class="verify-title">Verifica la tua email</h2>

    <!-- Email -->
    <p class="verify-email">{{ email }}</p>

    <!-- Instructions -->
    <div class="verify-box">
      <p class="verify-text">Apri il link nell'email per attivare l'account.</p>
      <p class="verify-hint">Controlla anche la cartella spam.</p>
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
        <span class="spinner"></span> Controllo...
      </template>
      <template v-else>
        <span>Ho confermato l'email</span><AuthIcon name="arrow" />
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
        Ti abbiamo inviato un link al nuovo indirizzo (controlla anche lo spam).
        L'email dell'account cambierà solo dopo che avrai aperto quel link:
        poi rientra con il nuovo indirizzo.
      </p>

      <template v-else>
        <button
          v-if="!isEditingEmail"
          class="email-fix__toggle"
          :disabled="isEmailChangeBusy"
          @click="toggleEmailEditor"
        >
          Email sbagliata? Correggila
        </button>

        <form v-else class="email-fix__form" @submit.prevent="handleChangeEmail">
          <input
            v-model="newEmail"
            class="email-fix__input"
            type="email"
            placeholder="Nuovo indirizzo email"
            aria-label="Nuovo indirizzo email"
            autocomplete="email"
            :disabled="isSubmittingEmail"
          >

          <p v-if="newEmailDomainHint" class="email-fix__hint">{{ newEmailDomainHint }}</p>

          <div v-if="emailChangeError" class="error-message">{{ emailChangeError }}</div>

          <button class="email-fix__submit" type="submit" :disabled="isEmailChangeBusy">
            {{ isSubmittingEmail ? 'Invio in corso...' : 'Invia il link al nuovo indirizzo' }}
          </button>

          <button
            class="email-fix__toggle"
            type="button"
            :disabled="isSubmittingEmail"
            @click="toggleEmailEditor"
          >
            Annulla
          </button>
        </form>
      </template>
    </div>
  </div>
</template>
