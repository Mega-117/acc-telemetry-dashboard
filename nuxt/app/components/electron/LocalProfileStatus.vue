<script setup lang="ts">
import { ref } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'

const { localProfile, cloudSessionReady, authSessionStatus, login, resetPassword } = useFirebaseAuth()
const busy = ref(false)
const message = ref('')
async function reconnect(credentials: { email: string; password: string }) {
  busy.value = true
  message.value = ''
  try {
    const result = await login(credentials.email, credentials.password)
    if (!result.success) message.value = result.error || 'Connessione non riuscita. Puoi continuare in locale.'
  } finally { busy.value = false }
}
async function reset() {
  if (!localProfile.value?.email) return
  const result = await resetPassword(localProfile.value.email)
  message.value = result.success ? 'Email di recupero inviata.' : result.error || 'Recupero non disponibile.'
}
</script>

<template>
  <aside v-if="localProfile && (!cloudSessionReady || !localProfile.offlineReady)" class="local-profile-status" aria-label="Stato locale e cloud">
    <p v-if="!cloudSessionReady" role="status">
      <strong>Funzioni locali disponibili.</strong> Sincronizzazione in attesa.
      Lo storico mostra le sessioni disponibili su questo computer; le funzioni condivise richiedono il cloud.
    </p>
    <p v-if="!localProfile.offlineReady">
      Questa versione di sviluppo non è preparata per il riavvio offline.
    </p>
    <details v-if="!cloudSessionReady && authSessionStatus !== 'initializing'">
      <summary>Ricollega il cloud</summary>
      <p>Accedi con {{ localProfile.email }}. Puoi continuare a usare il programma senza ricollegarti.</p>
      <AuthLoginForm :loading="busy" @submit="reconnect" @forgot-password="reset" />
      <p v-if="message" role="alert">{{ message }}</p>
    </details>
  </aside>
</template>

<style scoped>
.local-profile-status { position: relative; z-index: 50; flex: none; padding: 8px 20px; color: #f5e6c9; background: #332a1e; border-bottom: 1px solid #796344; font-size: 13px; }
p { margin: 4px 0; }
summary { cursor: pointer; text-decoration: underline; }
details[open] { max-width: 420px; padding-bottom: 12px; }
</style>
