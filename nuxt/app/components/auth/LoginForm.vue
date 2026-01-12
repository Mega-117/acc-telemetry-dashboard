<script setup lang="ts">
// ============================================
// LoginForm - Form di login
// ============================================

import { ref } from 'vue'

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

const emit = defineEmits<{
  submit: [credentials: { email: string; password: string }]
  forgotPassword: []
}>()

const handleSubmit = () => {
  // Reset error
  error.value = ''
  
  // Validazione client-side
  if (!email.value.trim()) {
    error.value = 'Inserisci la tua email.'
    return
  }
  if (!password.value) {
    error.value = 'Inserisci la password.'
    return
  }
  
  emit('submit', {
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
    email.value = ''
    password.value = ''
    error.value = ''
    loading.value = false
  }
})
</script>

<template>
  <form class="auth-form" @submit.prevent="handleSubmit">
    <UiBaseInput
      v-model="email"
      type="email"
      placeholder="Email"
      autocomplete="email"
      :error="!!error && error.includes('email')"
      @input="clearError"
    />
    
    <UiBaseInput
      v-model="password"
      type="password"
      placeholder="Password"
      autocomplete="current-password"
      :error="!!error && error.includes('password')"
      @input="clearError"
    />
    
    <UiFormError :message="error" :visible="!!error" />
    
    <UiBaseButton 
      type="submit" 
      variant="primary"
      :loading="loading"
    >
      ACCEDI
    </UiBaseButton>
    
    <UiBaseButton 
      variant="link"
      @click="emit('forgotPassword')"
    >
      Password dimenticata?
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
