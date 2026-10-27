<script setup lang="ts">
// PIP-650: consent to the reference library. PIP-658: off for new accounts (chosen on the first-run privacy
// screen, server default in library.mjs); the team kept it on. Switching it off takes your laps out of the
// library at once; the online archive of your own laps is not touched.
import { onMounted, ref } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { getLibraryPreference, setLibraryPreference } from '~/services/telemetry/lapsArchiveClient'
import { useI18n } from '~/i18n'

const { currentUser } = useFirebaseAuth()
const { t } = useI18n()
const deps = { getToken: async () => (await currentUser.value?.getIdToken()) ?? null }
const enabled = ref<boolean | null>(null), busy = ref(false), message = ref('')
async function load() {
  busy.value = true
  try { enabled.value = await getLibraryPreference(deps); message.value = '' }
  catch { message.value = t('privacy.preference.unavailable') }
  finally { busy.value = false }
}
async function change(event: Event) {
  const next = (event.target as HTMLInputElement).checked
  busy.value = true; message.value = ''
  try { enabled.value = await setLibraryPreference(next, deps) }
  catch { message.value = next ? t('privacy.preference.enableNotConfirmed') : t('privacy.library.disableNotConfirmed') }
  finally { busy.value = false }
}
onMounted(() => { void load() })
</script>
<template>
  <section class="lap-library-preference">
    <label><input type="checkbox" :checked="enabled === true" :disabled="busy || enabled === null" @change="change"> {{ t('privacy.library.label') }}</label>
    <p>{{ t('privacy.library.text') }}</p>
    <p>{{ t('privacy.library.offText') }}</p>
    <p v-if="message" role="status">{{ message }} <button v-if="enabled === null" :disabled="busy" @click="load">{{ t('privacy.preference.retry') }}</button></p>
  </section>
</template>
<style scoped>
.lap-library-preference { border-top: 1px solid #ffffff20; margin-top: 24px; padding-top: 16px; }
label { display: flex; gap: 8px; align-items: center; font-weight: 600; } input { accent-color: var(--color-primary, #ff6b35); }
p { font-size: 13px; opacity: .75; line-height: 1.5; margin-top: 12px; }
</style>
