<script setup lang="ts">
import { PRODUCT } from '../../../shared/productIdentity'
import { onBeforeUnmount, onMounted, ref } from 'vue'
type Result = { ok: boolean; url?: string; reason?: string; running?: boolean }
type Bridge = { pitwallV4Local?: (action: string) => Promise<Result> }
const url = ref(''), error = ref(''), loading = ref(false)
let timer: ReturnType<typeof setInterval> | undefined
const bridge = () => (window as unknown as { electronAPI?: Bridge }).electronAPI
async function start() {
  const api = bridge()?.pitwallV4Local
  if (!api) { error.value = `Apri questa pagina nell’app ${PRODUCT.displayName} sul PC dove gira ACC. Dal browser puoi usare V4 online per inviare la strategia al pilota.`; return }
  loading.value = true; error.value = ''
  try {
    const result = await api('start')
    if (!result.ok || !result.url) throw new Error(result.reason || 'Servizio V4 non disponibile.')
    const parsed = new URL(result.url)
    if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1') throw new Error('Indirizzo servizio non valido.')
    url.value = result.url
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { loading.value = false }
}
async function stop() {
  url.value = ''
  await bridge()?.pitwallV4Local?.('stop').catch(() => {})
}
onMounted(() => {
  void start()
  timer = setInterval(async () => {
    if (!url.value) return
    try {
      const result = await bridge()?.pitwallV4Local?.('status')
      if (!result?.ok || !result.running) { url.value = ''; error.value = 'Servizio V4 arrestato: nessun reinvio automatico.' }
    } catch { url.value = ''; error.value = 'Collegamento locale interrotto.' }
  }, 1000)
})
onBeforeUnmount(() => { clearInterval(timer); void stop() })
</script>
<template>
  <section class="v4-local" aria-label="V4 locale">
    <p>V4 locale · agisce soltanto su ACC di questo PC. Finché il pannello è aperto, le altre automazioni MFD sono bloccate.</p>
    <button v-if="url" type="button" @click="stop">Arresta V4</button>
    <button v-else type="button" :disabled="loading" @click="start">{{ loading ? 'Avvio in corso…' : 'Avvia V4 locale' }}</button>
    <p v-if="error" role="alert">{{ error }}</p>
    <iframe v-if="url" :src="url" title="Pannello originale strategia MFD" sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer" />
  </section>
</template>
<style scoped>
.v4-local { padding: 16px; color: #ddd; }
button { min-height: 44px; padding: 8px 16px; margin-bottom: 12px; }
iframe { display: block; width: 100%; height: calc(100vh - 200px); min-height: 640px; border: 1px solid #34383d; background: #0b0d0e; }
</style>
