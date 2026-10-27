<script setup lang="ts">
// ============================================
// RegisterForm - Form di registrazione
// ============================================

import { computed, ref } from 'vue'
import AuthField from './AuthField.vue'
import { useI18n } from '~/i18n'
import { emailDomainHintMessage } from '~/utils/emailDomainHint'
import { PRIVACY_VERSION, TERMS_VERSION, legalPageUrl, type RegisterConsent } from '~/utils/legalVersions'

const { t } = useI18n()

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
// PIP-658: two separate, unticked boxes; both are needed to create the account.
const acceptTerms = ref(false)
const acceptPrivacy = ref(false)
const baseURL = useRuntimeConfig().app.baseURL
const termsUrl = legalPageUrl('termini', baseURL)
const privacyUrl = legalPageUrl('privacy', baseURL)

const emit = defineEmits<{
  submit: [data: { firstName: string; lastName: string; nickname: string; email: string; password: string; consent: RegisterConsent }]
}>()

const domainHint = computed(() => emailDomainHintMessage(email.value))

const handleSubmit = () => {
  // Reset error
  error.value = ''

  // Validazione client-side
  if (!firstName.value.trim()) {
    error.value = t('auth.errors.firstNameRequired')
    return
  }
  if (!lastName.value.trim()) {
    error.value = t('auth.errors.lastNameRequired')
    return
  }
  if (!nickname.value.trim()) {
    error.value = t('auth.errors.nicknameRequired')
    return
  }
  if (nickname.value.trim().length < 3) {
    error.value = t('auth.errors.nicknameShort')
    return
  }
  if (!email.value.trim()) {
    error.value = t('auth.errors.emailRequired')
    return
  }
  if (!password.value) {
    error.value = t('auth.errors.newPasswordRequired')
    return
  }
  if (password.value.length < 6) {
    error.value = t('auth.errors.passwordShort')
    return
  }
  if (!confirmPassword.value) {
    error.value = t('auth.errors.confirmRequired')
    return
  }
  if (password.value !== confirmPassword.value) {
    error.value = t('auth.errors.passwordMismatch')
    return
  }
  if (!acceptTerms.value || !acceptPrivacy.value) {
    error.value = t('auth.errors.consentRequired')
    return
  }

  emit('submit', {
    firstName: firstName.value.trim(),
    lastName: lastName.value.trim(),
    nickname: nickname.value.trim(),
    email: email.value.trim(),
    password: password.value,
    consent: { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, acceptedAt: new Date().toISOString() }
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
    acceptTerms.value = false
    acceptPrivacy.value = false
    error.value = ''
  }
})
</script>

<template>
  <form class="auth-form" @submit.prevent="handleSubmit">
    <div class="name-row">
      <AuthField
        v-model="firstName"
        :label="t('auth.field.firstName')"
        type="text"
        :placeholder="t('auth.field.firstName')"
        autocomplete="given-name"
        @input="clearError"
      />
      <AuthField
        v-model="lastName"
        :label="t('auth.field.lastName')"
        type="text"
        :placeholder="t('auth.field.lastName')"
        autocomplete="family-name"
        @input="clearError"
      />
    </div>

    <AuthField
      v-model="nickname"
      :label="t('auth.field.nickname')"
      type="text"
      :placeholder="t('auth.field.nicknamePlaceholder')"
      autocomplete="username"
      :maxlength="20"
      @input="clearError"
    />

    <AuthField
      v-model="email"
      :label="t('auth.field.email')"
      type="email"
      :placeholder="t('auth.field.emailPlaceholder')"
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
      :label="t('auth.field.password')"
      type="password"
      :placeholder="t('auth.field.newPasswordPlaceholder')"
      autocomplete="new-password"
      @input="clearError"
    />

    <AuthField
      v-model="confirmPassword"
      :label="t('auth.field.confirmPassword')"
      type="password"
      :placeholder="t('auth.field.confirmPasswordPlaceholder')"
      autocomplete="new-password"
      @input="clearError"
    />

    <div class="consent">
      <label class="consent__row">
        <input v-model="acceptTerms" type="checkbox" required @change="clearError">
        <span>{{ t('auth.consent.termsBefore') }}<a :href="termsUrl" target="_blank" rel="noopener">{{ t('auth.consent.termsLink') }}</a></span>
      </label>
      <label class="consent__row">
        <input v-model="acceptPrivacy" type="checkbox" required @change="clearError">
        <span>{{ t('auth.consent.privacyBefore') }}<a :href="privacyUrl" target="_blank" rel="noopener">{{ t('auth.consent.privacyLink') }}</a></span>
      </label>
    </div>

    <UiFormError :message="error" :visible="!!error" />

    <UiBaseButton
      type="submit"
      variant="primary"
      :loading="loading"
    >
      <span>{{ t('auth.register.submit') }}</span><UiRacingIcon name="chevron" :size="26" class="auth-btn-arrow" />
    </UiBaseButton>
  </form>
</template>

<style scoped>
.consent { display: grid; gap: 8px; margin: 4px 0 2px; }
.consent__row { display: flex; align-items: flex-start; gap: 10px; color: #c9c9d1; font-size: 13px; line-height: 1.4; cursor: pointer; }
.consent__row input { flex: none; width: 16px; height: 16px; margin: 1px 0 0; accent-color: #ff0024; cursor: pointer; }
.consent__row a { color: #fff; text-decoration: underline; text-underline-offset: 2px; }
.consent__row a:hover { color: #ff9aaa; }
</style>
