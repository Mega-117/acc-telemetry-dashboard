<script setup lang="ts">
// PIP-659: "Account e sicurezza" in the Profile, working: name, surname and nickname (saved everywhere they
// appear, profileIdentityService), email change by confirmation link (the address changes only after the link
// is opened), password reset by email. The password is asked only for the email change (Firebase requires a
// recent sign-in).
import { ref, watch } from 'vue'
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { loadOwnerDocument } from '~/repositories/ownerDocumentRepository'
import { saveProfileNames, validateProfileNames } from '~/services/auth/profileIdentityService'
import { useI18n } from '~/i18n'

const { currentUser, changeVerificationEmail, resetPassword, updateCachedUserProfile } = useFirebaseAuth()
const { t } = useI18n()
const firstName = ref(''), lastName = ref(''), nickname = ref(''), savedNickname = ref<string | null>(null)
const newEmail = ref(''), emailPassword = ref('')
const busy = ref<'names' | 'email' | 'password' | null>(null)
const notice = ref<{ area: 'names' | 'email' | 'password', ok: boolean, text: string } | null>(null)

// Codex: in the desktop program the Profile can open before the cloud sign-in returns: load when it arrives.
watch(() => currentUser.value?.uid, (uid) => { if (uid) void load(uid) }, { immediate: true })

async function load(uid: string) {
  try {
    const data = ((await loadOwnerDocument(uid)).data ?? {}) as Record<string, unknown>
    firstName.value = String(data.firstName ?? '')
    lastName.value = String(data.lastName ?? '')
    nickname.value = String(data.nickname ?? currentUser.value?.displayName ?? '')
    savedNickname.value = nickname.value || null
  } catch { notice.value = { area: 'names', ok: false, text: t('profile.identity.loadError') } }
}

async function saveNames() {
  const user = currentUser.value
  if (!user || busy.value) return
  const input = { firstName: firstName.value, lastName: lastName.value, nickname: nickname.value }
  const invalid = validateProfileNames(input)
  if (invalid) { notice.value = { area: 'names', ok: false, text: invalid }; return }
  busy.value = 'names'; notice.value = null
  try {
    const patch = await saveProfileNames(user, input, savedNickname.value)
    savedNickname.value = patch.nickname
    updateCachedUserProfile(user.uid, { firstName: patch.firstName, lastName: patch.lastName, nickname: patch.nickname })
    notice.value = { area: 'names', ok: true, text: t('profile.identity.saved') }
  } catch { notice.value = { area: 'names', ok: false, text: t('profile.identity.saveError') } }
  finally { busy.value = null }
}

async function changeEmail() {
  const user = currentUser.value
  if (!user?.email || busy.value) return
  if (!emailPassword.value) { notice.value = { area: 'email', ok: false, text: t('profile.identity.passwordRequired') }; return }
  busy.value = 'email'; notice.value = null
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, emailPassword.value))
    const result = await changeVerificationEmail(newEmail.value)
    notice.value = result.success
      ? { area: 'email', ok: true, text: t('profile.identity.emailLinkSent', { email: newEmail.value.trim() }) }
      : { area: 'email', ok: false, text: result.error || t('profile.identity.sendFailed') }
    if (result.success) { emailPassword.value = ''; newEmail.value = '' }
  } catch (e) {
    const code = (e as { code?: string })?.code || ''
    notice.value = { area: 'email', ok: false, text: code.includes('wrong-password') || code.includes('invalid-credential') ? t('profile.identity.wrongPassword') : t('profile.identity.sendFailedRetry') }
  } finally { busy.value = null }
}

async function sendPasswordReset() {
  const email = currentUser.value?.email
  if (!email || busy.value) return
  busy.value = 'password'; notice.value = null
  const result = await resetPassword(email)
  notice.value = result.success
    ? { area: 'password', ok: true, text: t('profile.identity.resetSent', { email }) }
    : { area: 'password', ok: false, text: result.error || t('profile.identity.sendFailed') }
  busy.value = null
}
</script>

<template>
  <section class="profile-card identity-card" aria-labelledby="identity-title">
    <div class="card-head"><h3 id="identity-title" class="card-title">{{ t('profile.identity.title') }}</h3></div>

    <div class="identity-grid">
    <form class="identity-block" @submit.prevent="saveNames">
      <h4>{{ t('profile.identity.personal') }}</h4>
      <div class="identity-row">
        <label class="identity-field"><span>{{ t('profile.identity.firstName') }}</span><input v-model="firstName" type="text" autocomplete="given-name" :disabled="busy !== null"></label>
        <label class="identity-field"><span>{{ t('profile.identity.lastName') }}</span><input v-model="lastName" type="text" autocomplete="family-name" :disabled="busy !== null"></label>
      </div>
      <label class="identity-field"><span>{{ t('profile.identity.nickname') }} <small>{{ t('profile.identity.nicknameHint') }}</small></span><input v-model="nickname" type="text" maxlength="20" autocomplete="username" :disabled="busy !== null"></label>
      <div class="identity-actions">
        <p v-if="notice?.area === 'names'" :class="notice.ok ? 'is-ok' : 'is-error'" role="status">{{ notice.text }}</p>
        <button type="submit" class="rc-btn rc-btn--compact" :disabled="busy !== null">{{ busy === 'names' ? t('profile.identity.saving') : t('profile.identity.save') }}</button>
      </div>
    </form>

    <form class="identity-block" @submit.prevent="changeEmail">
      <h4>{{ t('profile.identity.email') }}</h4>
      <p class="identity-help">{{ t('profile.identity.currentBefore') }}<strong>{{ currentUser?.email || '—' }}</strong>{{ t('profile.identity.currentAfter') }}</p>
      <label class="identity-field"><span>{{ t('profile.identity.newAddress') }}</span><input v-model="newEmail" type="email" :placeholder="t('auth.field.emailPlaceholder')" autocomplete="email" :disabled="busy !== null"></label>
      <label class="identity-field"><span>{{ t('profile.identity.currentPassword') }}</span><input v-model="emailPassword" type="password" autocomplete="current-password" :disabled="busy !== null"></label>
      <div class="identity-actions">
        <p v-if="notice?.area === 'email'" :class="notice.ok ? 'is-ok' : 'is-error'" role="status">{{ notice.text }}</p>
        <button type="submit" class="rc-btn rc-btn--compact" :disabled="busy !== null || !newEmail.trim()">{{ busy === 'email' ? t('profile.identity.sending') : t('profile.identity.changeEmail') }}</button>
      </div>
    </form>

    <div class="identity-block">
      <h4>{{ t('profile.identity.password') }}</h4>
      <p class="identity-help">{{ t('profile.identity.passwordHelp') }}</p>
      <div class="identity-actions">
        <p v-if="notice?.area === 'password'" :class="notice.ok ? 'is-ok' : 'is-error'" role="status">{{ notice.text }}</p>
        <button type="button" class="rc-btn rc-btn--compact" :disabled="busy !== null" @click="sendPasswordReset">{{ busy === 'password' ? t('profile.identity.sending') : t('profile.identity.resetPassword') }}</button>
      </div>
    </div>
    </div>
  </section>
</template>

<style scoped>
.identity-card { display: flex; flex-direction: column; }
/* The same card title as the other Profile cards (their scoped style does not reach inside this component). */
.card-head { margin-bottom: 18px; }
.card-title { margin: 0; color: rgba(255, 255, 255, 0.92); font-size: 16px; font-weight: 550; border-left: 3px solid var(--racing-race); padding-left: 14px; }
/* Three side-by-side blocks on wide screens, one column below: each block reads top to bottom with its own action. */
.identity-grid { display: grid; grid-template-columns: 1.4fr 1fr 1fr; }
.identity-block { display: flex; flex-direction: column; gap: 12px; min-width: 0; padding: 4px 24px; border-left: 1px solid #ffffff1a; }
.identity-block:first-child { padding-left: 0; border-left: 0; }
.identity-block:last-child { padding-right: 0; }
.identity-block h4 { margin: 0; color: #fff; font: italic 700 13px/1.2 'Racer Display', sans-serif; letter-spacing: .04em; text-transform: uppercase; }
.identity-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.identity-field { display: grid; gap: 6px; min-width: 0; }
.identity-field > span { color: #ccc; font-size: 12px; font-weight: 500; letter-spacing: .3px; }
.identity-field small { margin-left: 6px; color: #888; font-size: 11px; font-weight: 400; }
.identity-field input { height: 42px; padding: 0 12px; border: 1px solid #ffffff30; border-radius: 0; background: #ffffff04; color: #fff; font-size: 14px; }
.identity-field input:hover { border-color: #ffffff65; }
.identity-field input:focus { border-color: #ff0024; outline: 1px solid #ff0024; outline-offset: 1px; }
.identity-help { margin: 0; color: #a9a9b3; font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; }
.identity-help strong { color: #e6e6ea; font-weight: 600; }
.identity-actions { display: flex; align-items: center; justify-content: flex-end; gap: 12px; flex-wrap: wrap; margin-top: auto; padding-top: 4px; }
.identity-actions p { flex: 1 1 160px; margin: 0; font-size: 12.5px; }
.is-ok { color: #6ee7a8; }
.is-error { color: #ff9aaa; }
@media (max-width: 1100px) {
  .identity-grid { grid-template-columns: 1fr; }
  .identity-block, .identity-block:first-child, .identity-block:last-child { padding: 16px 0; border-left: 0; border-top: 1px solid #ffffff1a; }
  .identity-block:first-child { padding-top: 0; border-top: 0; }
}
@media (max-width: 640px) { .identity-row { grid-template-columns: 1fr; } }
</style>
