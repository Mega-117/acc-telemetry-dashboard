<script setup lang="ts">
// ============================================
// ResetPasswordForm - Form recupero password
// ============================================

import { ref } from 'vue'

const email = ref('')
const error = ref('')
const success = ref(false)
const loading = ref(false)

const emit = defineEmits<{
  submit: [email: string]
  back: []
}>()

const handleSubmit = () => {
  error.value = ''
  
  if (!email.value.trim()) {
    error.value = 'Inserisci la tua email.'
    return
  }
  
  emit('submit', email.value.trim())
}

const clearError = () => {
  error.value = ''
}

// Esporre metodi per il parent
defineExpose({
  setError: (msg: string) => { error.value = msg },
  setLoading: (val: boolean) => { loading.value = val },
  setSuccess: (val: boolean) => { success.value = val },
  reset: () => {
    email.value = ''
    error.value = ''
    success.value = false
    loading.value = false
  }
})
</script>

<template>
  <div class="reset-form">
    <!-- Success State -->
    <div v-if="success" class="reset-success">
      <span class="reset-success__icon">✅</span>
      <p class="reset-success__text">
        Email inviata! Controlla la tua casella di posta (anche spam).
      </p>
      <UiBaseButton variant="link" @click="emit('back')">
        ← Torna al login
      </UiBaseButton>
    </div>
    
    <!-- Form State -->
    <form v-else class="auth-form" @submit.prevent="handleSubmit">
      <h3 class="reset-form__title">Recupera Password</h3>
      <p class="reset-form__description">
        Inserisci la tua email. Ti invieremo un link per reimpostare la password.
        <br><small>Controlla anche la cartella spam.</small>
      </p>
      
      <UiBaseInput
        v-model="email"
        type="email"
        placeholder="Email"
        autocomplete="email"
        @input="clearError"
      />
      
      <UiFormError :message="error" :visible="!!error" />
      
      <UiBaseButton 
        type="submit" 
        variant="primary"
        :loading="loading"
      >
        INVIA LINK
      </UiBaseButton>
      
      <UiBaseButton variant="link" @click="emit('back')">
        ← Torna al login
      </UiBaseButton>
    </form>
  </div>
</template>

<style lang="scss" scoped>
@use '~/assets/scss/variables' as *;

.reset-form {
  animation: authFadeIn 0.3s ease forwards;
  
  &__title {
    font-size: $font-size-xl;
    font-weight: $font-weight-semibold;
    color: var(--text-primary);
    margin: 0 0 $spacing-sm 0;
    text-align: center;
  }
  
  &__description {
    font-size: $font-size-sm;
    color: var(--text-secondary);
    text-align: center;
    margin: 0 0 $spacing-md 0;
    line-height: 1.5;
    
    small {
      color: var(--text-muted);
      font-size: $font-size-xs;
    }
  }
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
}

.reset-success {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: $spacing-md;
  text-align: center;
  padding: $spacing-md 0;
  
  &__icon {
    font-size: 3rem;
    animation: successPop 0.5s ease forwards;
  }
  
  &__text {
    color: var(--text-secondary);
    font-size: $font-size-sm;
    line-height: 1.5;
  }
}

@keyframes authFadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes successPop {
  0% { transform: scale(0); opacity: 0; }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); opacity: 1; }
}
</style>
