<script setup lang="ts">
// ============================================
// ResetPasswordForm - Form recupero password
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

const email = ref('')
const error = ref('')
const success = ref(false)

// Un refuso nel dominio qui e' invisibile: la richiesta "riesce" comunque e la
// mail non arriva mai. L'avviso e' l'unico segnale che l'utente puo' avere.
const domainHint = computed(() => emailDomainHintMessage(email.value))

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
  setSuccess: (val: boolean) => { success.value = val },
  reset: () => {
    email.value = ''
    error.value = ''
    success.value = false
  }
})
</script>

<template>
  <div class="reset-form">
    <!-- Success State -->
    <div v-if="success" class="reset-success">
      <AuthIcon name="check" class="reset-success__icon" />
      <h2 class="reset-success__title">Controlla la posta</h2>
      <!--
        Esito volutamente condizionale: per non rivelare quali indirizzi sono
        registrati, Firebase risponde "ok" anche quando non spedisce nulla, e
        l'app non ha modo di sapere quale dei due casi si sia verificato.
        Dichiarare l'invio sarebbe una bugia proprio verso chi ha sbagliato a
        digitare l'indirizzo, cioe' chi ha piu' bisogno di capire (PIP-297).
      -->
      <p class="reset-success__text">
        Se l'indirizzo è registrato, riceverai il link tra pochi istanti.
      </p>
      <p class="reset-success__hint">Controlla anche la cartella spam.</p>
      <UiBaseButton variant="primary" :disabled="loading" @click="emit('back')">
        <span>Torna al login</span><AuthIcon name="arrow" />
      </UiBaseButton>
    </div>

    <!-- Form State -->
    <template v-else>
      <UiBaseButton variant="link" class="auth-back" :disabled="loading" @click="emit('back')">
        <AuthIcon name="back" /> Torna al login
      </UiBaseButton>
      <form class="auth-form" @submit.prevent="handleSubmit">
      <h3 class="reset-form__title">Recupera Password</h3>
      <p class="reset-form__description">
        Ricevi il link per reimpostare la password.
      </p>

      <AuthField
        v-model="email"
        label="Email"
        type="email"
        placeholder="nome@esempio.it"
        autocomplete="email"
        @input="clearError"
      />

      <!-- Avviso, non blocco: un dominio raro ma valido deve poter passare. -->
      <p v-if="domainHint" class="reset-form__domain-hint">{{ domainHint }}</p>

      <UiFormError :message="error" :visible="!!error" />

      <UiBaseButton
        type="submit"
        variant="primary"
        :loading="loading"
      >
        <span>INVIA LINK</span><AuthIcon name="arrow" />
      </UiBaseButton>

      </form>
    </template>
  </div>
</template>
