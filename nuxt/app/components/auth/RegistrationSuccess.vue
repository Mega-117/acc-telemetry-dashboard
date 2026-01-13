<script setup lang="ts">
// ============================================
// RegistrationSuccess - Email Verification Screen
// ============================================

import { ref } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'

const props = defineProps<{
  email: string
  requireEmailVerification: boolean
}>()

const emit = defineEmits<{
  goToDashboard: []
  resendEmail: []
}>()

// Firebase Auth
const { checkEmailVerified, resendVerificationEmail } = useFirebaseAuth()

// State
const isResending = ref(false)
const resendSuccess = ref(false)
const resendError = ref<string | null>(null)
const isChecking = ref(false)
const verificationError = ref(false)

const handleResendEmail = async () => {
  isResending.value = true
  resendError.value = null
  verificationError.value = false
  
  const result = await resendVerificationEmail()
  
  isResending.value = false
  
  if (result.success) {
    resendSuccess.value = true
    setTimeout(() => resendSuccess.value = false, 3000)
  } else {
    resendError.value = result.error || 'Errore invio email'
  }
  
  emit('resendEmail')
}

const handleCheckVerification = async () => {
  isChecking.value = true
  verificationError.value = false
  
  const result = await checkEmailVerified()
  
  isChecking.value = false
  
  if (result.verified) {
    emit('goToDashboard')
  } else {
    verificationError.value = true
  }
}
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
      Email non verificata
    </div>

    <!-- Resend Error Message -->
    <div v-if="resendError" class="error-message resend-error">
      {{ resendError }}
    </div>

    <!-- Main CTA Button -->
    <button 
      class="verify-btn"
      :class="{ 'verify-btn--loading': isChecking }"
      :disabled="isChecking"
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
      :disabled="isResending || resendSuccess"
      @click="handleResendEmail"
    >
      <template v-if="isResending">Invio in corso...</template>
      <template v-else-if="resendSuccess">✓ Email inviata</template>
      <template v-else>Rinvia email di verifica</template>
    </button>
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
