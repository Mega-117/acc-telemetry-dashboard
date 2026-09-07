<script setup lang="ts">
// ============================================
// RegisterForm - Form di registrazione
// ============================================

import { computed, ref } from 'vue'
import AuthField from './AuthField.vue'
import AuthIcon from './AuthIcon.vue'
import { emailDomainHintMessage } from '~/utils/emailDomainHint'

withDefaults(defineProps<{
  loading?: boolean
}>(), {
  loading: false
})

const firstName = ref('')
const lastName = ref('')
const nickname = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const error = ref('')

const emit = defineEmits<{
  submit: [data: { firstName: string; lastName: string; nickname: string; email: string; password: string }]
}>()

const domainHint = computed(() => emailDomainHintMessage(email.value))

const handleSubmit = () => {
  // Reset error
  error.value = ''

  // Validazione client-side
  if (!firstName.value.trim()) {
    error.value = 'Inserisci il tuo nome.'
    return
  }
  if (!lastName.value.trim()) {
    error.value = 'Inserisci il tuo cognome.'
    return
  }
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
    firstName: firstName.value.trim(),
    lastName: lastName.value.trim(),
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
  reset: () => {
    firstName.value = ''
    lastName.value = ''
    nickname.value = ''
    email.value = ''
    password.value = ''
    confirmPassword.value = ''
    error.value = ''
  }
})
</script>

<template>
  <form class="auth-form" @submit.prevent="handleSubmit">
    <div class="name-row">
      <AuthField
        v-model="firstName"
        label="Nome"
        type="text"
        placeholder="Nome"
        autocomplete="given-name"
        @input="clearError"
      />
      <AuthField
        v-model="lastName"
        label="Cognome"
        type="text"
        placeholder="Cognome"
        autocomplete="family-name"
        @input="clearError"
      />
    </div>

    <AuthField
      v-model="nickname"
      label="Nickname"
      type="text"
      placeholder="Visibile agli altri"
      autocomplete="username"
      :maxlength="20"
      @input="clearError"
    />

    <AuthField
      v-model="email"
      label="Email"
      type="email"
      placeholder="nome@esempio.it"
      autocomplete="email"
      @input="clearError"
    />

    <!--
      Avviso, non blocco: e' il momento in cui un refuso nel dominio costa meno
      da correggere. Dopo la registrazione lo stesso errore lascia l'account
      irraggiungibile (PIP-372).
    -->
    <p v-if="domainHint" class="domain-hint">{{ domainHint }}</p>

    <AuthField
      v-model="password"
      label="Password"
      type="password"
      placeholder="Almeno 6 caratteri"
      autocomplete="new-password"
      @input="clearError"
    />

    <AuthField
      v-model="confirmPassword"
      label="Conferma password"
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
      <span>REGISTRATI</span><AuthIcon name="arrow" />
    </UiBaseButton>
  </form>
</template>
