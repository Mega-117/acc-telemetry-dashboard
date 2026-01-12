<script setup lang="ts">
// ============================================
// RegisterForm - Form di registrazione
// ============================================

import { ref } from 'vue'

const nickname = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const error = ref('')
const loading = ref(false)

const emit = defineEmits<{
  submit: [data: { nickname: string; email: string; password: string }]
}>()

const handleSubmit = () => {
  // Reset error
  error.value = ''
  
  // Validazione client-side
  if (!nickname.value.trim()) {
    error.value = 'Scegli un nickname.'
    return
  }
  if (nickname.value.trim().length < 3) {
    error.value = 'Il nickname deve essere di almeno 3 caratteri.'
    return
  }
  if (!email.value.trim()) {
    error.value = 'Inserisci la tua email.'
    return
  }
  if (!password.value) {
    error.value = 'Inserisci una password.'
    return
  }
  if (password.value.length < 6) {
    error.value = 'La password deve essere di almeno 6 caratteri.'
    return
  }
  if (!confirmPassword.value) {
    error.value = 'Conferma la password.'
    return
  }
  if (password.value !== confirmPassword.value) {
    error.value = 'Le password non coincidono.'
    return
  }
  
  emit('submit', {
    nickname: nickname.value.trim(),
    email: email.value.trim(),
    password: password.value
  })
}

const clearError = () => {
  error.value = ''
}

// Esporre metodi per il parent
defineExpose({
  setError: (msg: string) => { error.value = msg },
  setLoading: (val: boolean) => { loading.value = val },
  reset: () => {
    nickname.value = ''
    email.value = ''
    password.value = ''
    confirmPassword.value = ''
    error.value = ''
    loading.value = false
  }
})
</script>

<template>
  <form class="auth-form" @submit.prevent="handleSubmit">
    <UiBaseInput
      v-model="nickname"
      type="text"
      placeholder="Nickname"
      autocomplete="username"
      :maxlength="20"
      @input="clearError"
    />
    
    <UiBaseInput
      v-model="email"
      type="email"
      placeholder="Email"
      autocomplete="email"
      @input="clearError"
    />
    
    <UiBaseInput
      v-model="password"
      type="password"
      placeholder="Password (min. 6 caratteri)"
      autocomplete="new-password"
      @input="clearError"
    />
    
    <UiBaseInput
      v-model="confirmPassword"
      type="password"
      placeholder="Conferma Password"
      autocomplete="new-password"
      @input="clearError"
    />
    
    <UiFormError :message="error" :visible="!!error" />
    
    <UiBaseButton 
      type="submit" 
      variant="primary"
      :loading="loading"
    >
      REGISTRATI
    </UiBaseButton>
  </form>
</template>

<style lang="scss" scoped>
@use '~/assets/scss/variables' as *;

.auth-form {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
  animation: authFadeIn 0.3s ease forwards;
}

@keyframes authFadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
