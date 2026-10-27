<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { usagePreference } from '~/services/usage/usageClient'
import { useI18n } from '~/i18n'

const { t } = useI18n()
const enabled = ref<boolean | null>(null), busy = ref(false), message = ref('')
async function load() {
  busy.value = true
  try { enabled.value = (await usagePreference()).enabled; message.value = '' }
  catch { message.value = t('privacy.preference.unavailable') }
  finally { busy.value = false }
}
async function change(event: Event) {
  const next = (event.target as HTMLInputElement).checked
  busy.value = true; message.value = ''
  if (!next) enabled.value = false
  try { enabled.value = (await usagePreference(next)).enabled }
  catch { message.value = next ? t('privacy.preference.enableNotConfirmed') : t('privacy.usage.stoppedOffline') }
  finally { busy.value = false }
}
function preferenceChanged(event: Event) {
  if (event instanceof StorageEvent && event.key !== null && !event.key.startsWith('rc-usage-disabled:') && !event.key.startsWith('rc-usage-pending-disable:')) return
  if (!busy.value) void load()
}
onMounted(() => {
  void load()
  window.addEventListener('storage', preferenceChanged)
  window.addEventListener('rc-usage-preference', preferenceChanged)
})
onBeforeUnmount(() => {
  window.removeEventListener('storage', preferenceChanged)
  window.removeEventListener('rc-usage-preference', preferenceChanged)
})
</script>
<template>
  <section class="usage-preference">
    <label><input type="checkbox" :checked="enabled === true" :disabled="busy || enabled === null" @change="change"> {{ t('privacy.usage.label') }}</label>
    <p>{{ t('privacy.usage.text') }}</p>
    <p>{{ t('privacy.usage.notCollected') }}</p>
    <p v-if="message" role="status">{{ message }} <button v-if="enabled === null" :disabled="busy" @click="load">{{ t('privacy.preference.retry') }}</button></p>
  </section>
</template>
<style scoped>
.usage-preference { border-top: 1px solid #ffffff20; margin-top: 24px; padding-top: 16px; }
label { display: flex; gap: 8px; align-items: center; font-weight: 600; } input { accent-color: var(--color-primary, #ff6b35); }
p { font-size: 13px; opacity: .75; line-height: 1.5; margin-top: 12px; }
</style>
