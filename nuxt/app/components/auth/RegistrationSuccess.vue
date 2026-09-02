<script setup lang="ts">
// ============================================
// RegistrationSuccess - Email Verification Screen
// ============================================

import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
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
    <div class="verify-icon">📧</div>

    <!-- Title -->
    <h2 class="verify-title">Verifica la tua email</h2>

    <!-- Email -->
    <p class="verify-email">{{ email }}</p>

    <!-- Instructions -->
    <div class="verify-box">
      <p class="verify-text">Clicca il link nell'email per attivare l'account.</p>
      <p class="verify-hint">Controlla anche Spam</p>
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
        Ho confermato l'email
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

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

// Local aliases for readability
$font-family: $font-primary;
$color-racing-red: $racing-red;
$color-racing-orange: $racing-orange;
$color-racing-gold: $racing-gold;
$color-success: $accent-success;
$color-error: $accent-danger;
$gradient-racing: linear-gradient(135deg, $color-racing-red 0%, $color-racing-orange 60%, $color-racing-gold 100%);

.email-verification {
  text-align: center;
  animation: fadeIn 0.4s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

// === ICON ===
.verify-icon {
  font-size: 48px;
  margin-bottom: 20px;
}

// === TYPOGRAPHY ===
.verify-title {
  font-family: $font-family;
  font-size: 22px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 8px;
  line-height: 1.3;
}

.verify-email {
  font-family: $font-family;
  font-size: 15px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 24px;
}

// === INSTRUCTIONS BOX ===
.verify-box {
  padding: 20px 24px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  margin-bottom: 24px;
}

.verify-text {
  font-family: $font-family;
  font-size: 15px;
  color: rgba(255, 255, 255, 0.8);
  line-height: 1.6;
  margin-bottom: 12px;
}

.verify-hint {
  font-family: $font-family;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.4);
}

// === ERROR MESSAGE ===
.error-message {
  padding: 12px 16px;
  margin-bottom: 20px;
  background: rgba($color-error, 0.1);
  border: 1px solid rgba($color-error, 0.3);
  border-radius: 10px;
  font-family: $font-family;
  font-size: 14px;
  color: $color-error;
  animation: shake 0.4s ease;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-6px); }
  40%, 80% { transform: translateX(6px); }
}

// === MAIN BUTTON ===
.verify-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  padding: 14px 20px;
  background: $gradient-racing;
  border: none;
  border-radius: 10px;
  font-family: $font-family;
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  cursor: pointer;
  box-shadow: 0 0 24px rgba($color-racing-red, 0.25);
  transition: all 0.25s ease;

  &:hover:not(:disabled) {
    box-shadow: 0 0 40px rgba($color-racing-red, 0.35);
  }

  &:disabled {
    opacity: 0.8;
    cursor: wait;
  }

  &--loading {
    background: rgba(255, 255, 255, 0.1);
    box-shadow: none;
  }
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

// === RESEND BUTTON ===
.resend-btn {
  display: block;
  width: 100%;
  margin-top: 16px;
  padding: 12px;
  background: none;
  border: none;
  font-family: $font-family;
  font-size: 14px;
  color: $color-racing-red;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    color: $color-racing-orange;
  }

  &:disabled {
    color: rgba(255, 255, 255, 0.4);
    cursor: not-allowed;
  }
}

// === EMAIL FIX ===
.email-fix {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);

  &__sent {
    font-family: $font-family;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.6);
    line-height: 1.6;
  }

  &__toggle {
    display: block;
    width: 100%;
    padding: 8px;
    background: none;
    border: none;
    font-family: $font-family;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.5);
    text-decoration: underline;
    cursor: pointer;
    transition: color 0.2s ease;

    &:hover:not(:disabled) {
      color: rgba(255, 255, 255, 0.8);
    }

    &:disabled {
      color: rgba(255, 255, 255, 0.25);
      cursor: not-allowed;
    }
  }

  &__form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  &__input {
    width: 100%;
    padding: 12px 14px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    font-family: $font-family;
    font-size: 14px;
    color: #fff;

    &::placeholder {
      color: rgba(255, 255, 255, 0.35);
    }

    &:focus {
      outline: none;
      border-color: rgba($color-racing-red, 0.6);
    }
  }

  // Avviso, non errore: l'utente puo' comunque proseguire.
  &__hint {
    font-family: $font-family;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
    text-align: left;
  }

  &__submit {
    width: 100%;
    padding: 12px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 10px;
    font-family: $font-family;
    font-size: 14px;
    font-weight: 600;
    color: #fff;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.12);
    }

    &:disabled {
      opacity: 0.6;
      cursor: wait;
    }
  }
}

// === DEV MOCK TOGGLE ===
.dev-mock {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px dashed rgba(255, 255, 255, 0.1);

  label {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-family: $font-family;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.4);
    cursor: pointer;

    input {
      accent-color: $color-success;
    }
  }
}
</style>
