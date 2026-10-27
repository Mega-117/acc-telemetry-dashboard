<script setup lang="ts">
// ============================================
// ResetPasswordForm - Form recupero password
// ============================================

import { computed, ref } from 'vue'
import AuthField from './AuthField.vue'
import { useI18n } from '~/i18n'
import AuthIcon from './AuthIcon.vue'
import { emailDomainHintMessage } from '~/utils/emailDomainHint'

const { t } = useI18n()

withDefaults(defineProps<{
  loading?: boolean
  hideBack?: boolean
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
    error.value = t('auth.errors.emailRequired')
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
    <Transition name="racer" @before-leave="el => el.setAttribute('inert', '')">
    <!-- Success State -->
    <div v-if="success" key="success" class="reset-success">
      <AuthIcon name="check" class="reset-success__icon" />
      <h2 class="reset-success__title">{{ t('auth.reset.sentTitle') }}</h2>
      <!--
        Esito volutamente condizionale: per non rivelare quali indirizzi sono
        registrati, Firebase risponde "ok" anche quando non spedisce nulla, e
        l'app non ha modo di sapere quale dei due casi si sia verificato.
        Dichiarare l'invio sarebbe una bugia proprio verso chi ha sbagliato a
        digitare l'indirizzo, cioe' chi ha piu' bisogno di capire (PIP-297).
      -->
      <p class="reset-success__text">
        {{ t('auth.reset.sentText') }}
      </p>
      <p class="reset-success__hint">{{ t('auth.reset.spamHint') }}</p>
      <UiBaseButton variant="primary" :disabled="loading" @click="emit('back')">
        <span>{{ t('auth.reset.backToLogin') }}</span><UiRacingIcon name="chevron" :size="26" class="auth-btn-arrow" />
      </UiBaseButton>
    </div>

    <!-- Form State -->
    <div v-else key="request">
      <UiBaseButton v-if="!hideBack" variant="link" class="auth-back" :disabled="loading" @click="emit('back')">
        <AuthIcon name="back" /> {{ t('auth.reset.backToLogin') }}
      </UiBaseButton>
      <form class="auth-form" @submit.prevent="handleSubmit">
      <h3 class="reset-form__title">{{ t('auth.reset.title') }}</h3>
      <p class="reset-form__description">
        {{ t('auth.reset.description') }}
      </p>

      <AuthField
        v-model="email"
        :label="t('auth.field.email')"
        type="email"
        :placeholder="t('auth.field.emailPlaceholder')"
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
        <span>{{ t('auth.reset.submit') }}</span><UiRacingIcon name="chevron" :size="26" class="auth-btn-arrow" />
      </UiBaseButton>

      </form>
    </div>
    </Transition>
  </div>
</template>
