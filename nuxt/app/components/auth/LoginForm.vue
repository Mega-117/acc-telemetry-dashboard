<script setup lang="ts">
// ============================================
// LoginForm - Form di login
// ============================================

import { ref } from 'vue'
import AuthField from './AuthField.vue'
import AuthIcon from './AuthIcon.vue'

withDefaults(defineProps<{
  loading?: boolean
}>(), {
  loading: false
})

const email = ref('')
const password = ref('')
const error = ref('')

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
  reset: () => {
    email.value = ''
    password.value = ''
    error.value = ''
  }
})
</script>

<template>
  <form class="auth-form" @submit.prevent="handleSubmit">
    <AuthField
      v-model="email"
      label="Email"
      type="email"
      placeholder="nome@esempio.it"
      autocomplete="email"
      :error="!!error && error.includes('email')"
      @input="clearError"
    />

    <AuthField
      v-model="password"
      label="Password"
      type="password"
      placeholder="Password"
      autocomplete="current-password"
      :error="!!error && error.includes('password')"
      @input="clearError"
    />

    <UiFormError :message="error" :visible="!!error" />

    <UiBaseButton
      variant="link" class="auth-forgot"
      :disabled="loading"
      @click="emit('forgotPassword')"
    >
      Password dimenticata?
    </UiBaseButton>
    <UiBaseButton
      type="submit"
      variant="primary"
      :loading="loading"
    >
      <span>ACCEDI</span><AuthIcon name="arrow" />
    </UiBaseButton>


  </form>
</template>
