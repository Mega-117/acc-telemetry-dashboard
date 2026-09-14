<script setup lang="ts">
import { onMounted, ref } from 'vue'

type StartupState = { supported: boolean; enabled: boolean }
type StartupApi = {
  windowsStartupGet?: () => Promise<StartupState>
  windowsStartupSet?: (enabled: boolean) => Promise<StartupState>
}
const state = ref<StartupState | null>(null)
const busy = ref(false)
const error = ref('')
const saved = ref(false)
const api = (): StartupApi | undefined => (window as Window & { electronAPI?: StartupApi }).electronAPI

async function load() {
  busy.value = true
  error.value = ''
  try {
    const bridge = api()
    if (!bridge?.windowsStartupGet || !bridge.windowsStartupSet) {
      error.value = 'Aggiorna il programma per gestire l’avvio automatico.'
      return
    }
    state.value = await bridge.windowsStartupGet()
  } catch {
    error.value = 'Non è stato possibile leggere l’impostazione. Riprova.'
  } finally { busy.value = false }
}

async function change(event: Event) {
  const input = event.target as HTMLInputElement
  const enabled = input.checked
  input.checked = state.value?.enabled === true
  if (busy.value || !state.value?.supported) return
  busy.value = true
  saved.value = false
  error.value = ''
  try {
    const bridge = api()
    if (!bridge?.windowsStartupSet) throw new Error('unavailable')
    state.value = await bridge.windowsStartupSet(enabled)
    saved.value = true
  } catch {
    error.value = 'La modifica non è stata confermata. Controlla l’impostazione e riprova.'
    try { state.value = await api()?.windowsStartupGet?.() ?? state.value } catch { /* keep last confirmed state */ }
  } finally { busy.value = false }
}

onMounted(load)
</script>

<template>
  <section class="startup-panel" aria-labelledby="startup-title" :aria-busy="busy">
    <h2 id="startup-title">Avvio</h2>
    <p>Decidi come avviare Racer Core quando accedi a Windows.</p>
    <label class="startup-option">
      <span>
        <strong>Avvia con Windows</strong>
        <small>Avvia il programma in background, nell’area di notifica, all’accesso al tuo account Windows.</small>
      </span>
      <input type="checkbox" role="switch" :checked="state?.enabled === true"
        :disabled="busy || !state?.supported" @change="change">
    </label>
    <p v-if="state && !state.supported" class="startup-note">Disponibile nella versione installata per Windows.</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-else-if="saved" role="status">Impostazione salvata.</p>
    <p v-else-if="busy" role="status">Aggiornamento…</p>
    <button v-if="error" type="button" :disabled="busy" @click="load">Riprova</button>
  </section>
</template>

<style scoped lang="scss">
.startup-panel { padding: 24px; border: 1px solid rgba(255,255,255,.07); border-radius: 14px; background: #14141b; }
h2 { margin: 0 0 8px; font-size: 24px; }
p, small { color: #a0a0ac; line-height: 1.5; }
.startup-option { display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-top: 26px; padding: 18px 0; border-top: 1px solid rgba(255,255,255,.08); cursor: pointer; }
strong, small { display: block; } small { margin-top: 7px; }
input { flex-shrink: 0; width: 22px; height: 22px; accent-color: #ff4d3d; cursor: pointer; }
input:disabled { cursor: default; }
[role="alert"] { color: #ffb7ae; }
button { padding: 9px 16px; border: 1px solid #555; border-radius: 8px; background: #24242f; color: #fff; cursor: pointer; }
</style>
