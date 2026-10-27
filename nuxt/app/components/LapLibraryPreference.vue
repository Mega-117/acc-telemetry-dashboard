<script setup lang="ts">
// PIP-650: consent to the reference library. PIP-658: off for new accounts (chosen on the first-run privacy
// screen, server default in library.mjs); the team kept it on. Switching it off takes your laps out of the
// library at once; the online archive of your own laps is not touched.
import { onMounted, ref } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { getLibraryPreference, setLibraryPreference } from '~/services/telemetry/lapsArchiveClient'

const { currentUser } = useFirebaseAuth()
const deps = { getToken: async () => (await currentUser.value?.getIdToken()) ?? null }
const enabled = ref<boolean | null>(null), busy = ref(false), message = ref('')
async function load() {
  busy.value = true
  try { enabled.value = await getLibraryPreference(deps); message.value = '' }
  catch { message.value = 'Preferenza non disponibile. Riprova.' }
  finally { busy.value = false }
}
async function change(event: Event) {
  const next = (event.target as HTMLInputElement).checked
  busy.value = true; message.value = ''
  try { enabled.value = await setLibraryPreference(next, deps) }
  catch { message.value = next ? 'Attivazione non confermata. Riprova.' : 'Disattivazione non confermata: riprova, i tuoi giri restano condivisi finché non va a buon fine.' }
  finally { busy.value = false }
}
onMounted(() => { void load() })
</script>
<template>
  <section class="lap-library-preference">
    <label><input type="checkbox" :checked="enabled === true" :disabled="busy || enabled === null" @change="change"> Condividi i miei giri come riferimento</label>
    <p>Il tuo giro migliore su ogni pista e auto può comparire, con il tuo nickname, tra i riferimenti degli altri piloti nella Telemetria. Solo giri validi e completi.</p>
    <p>Se la togli, i tuoi giri escono subito dai riferimenti. L'archivio dei tuoi giri resta tuo come prima.</p>
    <p v-if="message" role="status">{{ message }} <button v-if="enabled === null" :disabled="busy" @click="load">Riprova</button></p>
  </section>
</template>
<style scoped>
.lap-library-preference { border-top: 1px solid #ffffff20; margin-top: 24px; padding-top: 16px; }
label { display: flex; gap: 8px; align-items: center; font-weight: 600; } input { accent-color: var(--color-primary, #ff6b35); }
p { font-size: 13px; opacity: .75; line-height: 1.5; margin-top: 12px; }
</style>
