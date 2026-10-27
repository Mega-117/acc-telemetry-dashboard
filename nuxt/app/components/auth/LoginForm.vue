<script setup lang="ts">
// ============================================
// LoginForm - Form di login
// ============================================

import { ref } from 'vue'
import AuthField from './AuthField.vue'
import { useI18n } from '~/i18n'

const { t } = useI18n()

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
    error.value = t('auth.errors.emailRequired')
    return
  }
  if (!password.value) {
    error.value = t('auth.errors.passwordRequired')
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
      :label="t('auth.field.email')"
      type="email"
      :placeholder="t('auth.field.emailPlaceholder')"
      autocomplete="email"
      :error="!!error && error.includes('email')"
      @input="clearError"
    />

    <AuthField
      v-model="password"
      :label="t('auth.field.password')"
      type="password"
      :placeholder="t('auth.field.passwordPlaceholder')"
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
      {{ t('auth.login.forgot') }}
    </UiBaseButton>
    <UiBaseButton
      type="submit"
      variant="primary"
      :loading="loading"
    >
      <span aria-live="polite">{{ loading ? t('auth.login.submitting') : t('auth.login.submit') }}</span><UiRacingIcon name="chevron" :size="26" class="auth-btn-arrow" />
    </UiBaseButton>


  </form>
</template>
