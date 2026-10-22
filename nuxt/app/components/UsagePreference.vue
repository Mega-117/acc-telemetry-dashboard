<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { usagePreference } from '~/services/usage/usageClient'
const enabled = ref<boolean | null>(null), busy = ref(false), message = ref('')
async function load() {
  busy.value = true
  try { enabled.value = (await usagePreference()).enabled; message.value = '' }
  catch { message.value = 'Preferenza non disponibile. Riprova.' }
  finally { busy.value = false }
}
async function change(event: Event) {
  const next = (event.target as HTMLInputElement).checked
  busy.value = true; message.value = ''
  if (!next) enabled.value = false
  try { enabled.value = (await usagePreference(next)).enabled }
  catch { message.value = next ? 'Attivazione non confermata. Riprova.' : 'Raccolta fermata su questo dispositivo. La preferenza sarà sincronizzata appena torna la connessione.' }
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
    <label><input type="checkbox" :checked="enabled === true" :disabled="busy || enabled === null" @change="change"> Condividi statistiche di utilizzo</label>
    <p>Condividi tempi di utilizzo, sessioni e funzionalità usate, con i relativi esiti. La scelta vale per desktop e Pitwall web. I riepiloghi restano disponibili per 90 giorni.</p>
    <p>Non vengono raccolti screenshot, testo degli avvisi o telemetria dettagliata. La diagnostica tecnica resta separata.</p>
    <p v-if="message" role="status">{{ message }} <button v-if="enabled === null" :disabled="busy" @click="load">Riprova</button></p>
  </section>
</template>
<style scoped>
.usage-preference { border-top: 1px solid #ffffff20; margin-top: 24px; padding-top: 16px; }
label { display: flex; gap: 8px; align-items: center; font-weight: 600; } input { accent-color: var(--color-primary, #ff6b35); }
p { font-size: 13px; opacity: .75; line-height: 1.5; margin-top: 12px; }
</style>
