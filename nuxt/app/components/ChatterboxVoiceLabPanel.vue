<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { CHATTERBOX_DEFAULT_PROSODY } from '#shared/chatterboxProsody'

interface ChatterboxVoice {
  id: string
  name: string
  kind: 'default' | 'sample'
}

type RuntimeState = 'checking' | 'starting' | 'online' | 'offline' | 'error'

const text = ref('Frena con decisione, rilascia il pedale con dolcezza e porta velocità dentro la curva.')
const exaggeration = ref(CHATTERBOX_DEFAULT_PROSODY.exaggeration)
const cfgWeight = ref(CHATTERBOX_DEFAULT_PROSODY.cfgWeight)
const voices = ref<ChatterboxVoice[]>([])
const selectedVoice = ref('__default__')
const voiceDir = ref('')
const runtimeState = ref<RuntimeState>('checking')
const runtimeMessage = ref('Controllo Chatterbox...')
const isSpeaking = ref(false)
const audioUrl = ref('')
const audioEl = ref<HTMLAudioElement | null>(null)
let disposed = false

function errorMessage(error: any, fallback: string) {
  return error?.data?.statusMessage || error?.statusMessage || error?.message || fallback
}

async function loadVoices() {
  try {
    const catalog = await $fetch<{ voices: ChatterboxVoice[]; voiceDir: string }>('/api/dev/chatterbox-voices')
    voices.value = catalog.voices
    voiceDir.value = catalog.voiceDir
    if (!voices.value.some(voice => voice.id === selectedVoice.value)) selectedVoice.value = '__default__'
  } catch (error: any) {
    runtimeState.value = 'error'
    runtimeMessage.value = errorMessage(error, 'Catalogo voci Chatterbox non disponibile.')
  }
}

async function readRuntime() {
  const status = await $fetch<{ state: Exclude<RuntimeState, 'checking'>; message?: string }>('/api/dev/chatterbox-ready')
  runtimeState.value = status.state
  runtimeMessage.value = status.message || (
    status.state === 'online' ? 'Chatterbox pronto.'
    : status.state === 'starting' ? 'Caricamento modello in corso...'
    : status.state === 'offline' ? 'Chatterbox non avviato.'
    : 'Chatterbox non disponibile.'
  )
  return status.state
}

async function waitUntilReady() {
  const deadline = Date.now() + 300_000
  while (!disposed && Date.now() < deadline) {
    const state = await readRuntime()
    if (state === 'online' || state === 'error') return state
    await new Promise(resolve => setTimeout(resolve, 2500))
  }
  if (!disposed) {
    runtimeState.value = 'error'
    runtimeMessage.value = 'Avvio oltre 5 minuti. Controlla chatterbox_tts_err.log e riprova.'
  }
  return runtimeState.value
}

async function ensureRuntime() {
  try {
    const state = await readRuntime()
    if (state === 'online') return true
    runtimeState.value = 'starting'
    if (state === 'error') {
      await $fetch('/api/dev/chatterbox-stop', { method: 'POST' }).catch(() => undefined)
    }
    runtimeMessage.value = 'Avvio Chatterbox Multilingual V3... Il primo download può richiedere alcuni minuti.'
    await $fetch('/api/dev/chatterbox-start', { method: 'POST' })
    return await waitUntilReady() === 'online'
  } catch (error: any) {
    runtimeState.value = 'error'
    runtimeMessage.value = errorMessage(error, 'Avvio Chatterbox fallito.')
    return false
  }
}

function revokeAudio() {
  if (audioUrl.value) URL.revokeObjectURL(audioUrl.value)
  audioUrl.value = ''
}

async function listen() {
  const cleanText = text.value.trim()
  if (!cleanText || isSpeaking.value) return
  isSpeaking.value = true
  try {
    if (!await ensureRuntime()) return
    runtimeMessage.value = 'Genero l\'anteprima italiana...'
    const blob = await $fetch<Blob>('/api/dev/chatterbox-speak', {
      method: 'POST',
      body: {
        text: cleanText,
        voice: selectedVoice.value,
        exaggeration: exaggeration.value,
        cfgWeight: cfgWeight.value,
      },
      responseType: 'blob',
      timeout: 180_000,
    })
    revokeAudio()
    audioUrl.value = URL.createObjectURL(blob)
    runtimeMessage.value = 'Anteprima pronta (non salvata).'
    await nextTick()
    await audioEl.value?.play().catch(() => undefined)
  } catch (error: any) {
    runtimeState.value = 'error'
    runtimeMessage.value = errorMessage(error, 'Sintesi Chatterbox fallita.')
  } finally {
    isSpeaking.value = false
  }
}

onMounted(async () => {
  await loadVoices()
  await ensureRuntime()
})

onBeforeUnmount(() => {
  disposed = true
  revokeAudio()
})
</script>

<template>
  <section class="chatterbox-panel" data-testid="chatterbox-voice-lab">
    <header class="chatterbox-panel__head">
      <div>
        <span class="chatterbox-kicker">Sandbox sperimentale · Italiano</span>
        <h2>Chatterbox</h2>
        <p>Scrivi una frase, scegli la voce e ascolta l'anteprima generata da Chatterbox Multilingual V3.</p>
      </div>
      <div class="runtime-badge" :class="`is-${runtimeState}`">
        <span aria-hidden="true" />
        {{ runtimeState === 'online' ? 'Online' : runtimeState === 'starting' || runtimeState === 'checking' ? 'Avvio…' : 'Offline' }}
      </div>
    </header>

    <div class="chatterbox-card">
      <label class="field field--text">
        <span>Testo da ascoltare</span>
        <textarea v-model="text" maxlength="600" rows="6" placeholder="Scrivi qui il testo italiano da ascoltare..." />
        <small>{{ text.length }}/600 caratteri</small>
      </label>

      <aside class="voice-picker">
        <label class="field">
          <span>Voce</span>
          <select v-model="selectedVoice" :disabled="isSpeaking">
            <option v-for="voice in voices" :key="voice.id" :value="voice.id">
              {{ voice.name }}{{ voice.kind === 'sample' ? ' · campione locale' : '' }}
            </option>
          </select>
        </label>
        <p class="voice-help">
          Predefinita oppure una voce ricavata da ogni <code>.wav</code> italiano presente nella cartella campioni.
        </p>
        <button type="button" class="secondary" :disabled="isSpeaking" @click="loadVoices">Aggiorna voci</button>
      </aside>
    </div>

    <ChatterboxProsodyControls
      v-model:exaggeration="exaggeration"
      v-model:cfg-weight="cfgWeight"
      :disabled="isSpeaking"
    />

    <footer class="chatterbox-actions">
      <div class="runtime-copy">
        <strong>{{ runtimeMessage }}</strong>
        <small v-if="voiceDir">Cartella voci: <code>{{ voiceDir }}</code></small>
      </div>
      <button type="button" class="listen-button" :disabled="!text.trim() || isSpeaking" @click="listen">
        <span aria-hidden="true">▶</span>
        {{ isSpeaking ? 'Generazione…' : 'Ascolta' }}
      </button>
    </footer>

    <audio v-if="audioUrl" ref="audioEl" class="audio-player" :src="audioUrl" controls />
  </section>
</template>

<style scoped>
.chatterbox-panel {
  display: grid;
  gap: 1.25rem;
  padding: 1.35rem;
  border: 1px solid rgba(214, 178, 91, .26);
  border-radius: 20px;
  background:
    radial-gradient(circle at 100% 0, rgba(214, 178, 91, .11), transparent 34%),
    rgba(12, 18, 25, .92);
}

.chatterbox-panel__head,
.chatterbox-actions {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.chatterbox-panel h2 { margin: .2rem 0 .35rem; font-size: 1.55rem; }
.chatterbox-panel p { margin: 0; color: #aeb9c6; }
.chatterbox-kicker { color: #d6b25b; font-size: .72rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }

.runtime-badge { display: inline-flex; align-items: center; gap: .45rem; padding: .5rem .7rem; border: 1px solid #374451; border-radius: 999px; color: #b9c2cd; font-size: .78rem; font-weight: 800; }
.runtime-badge span { width: .55rem; height: .55rem; border-radius: 50%; background: #78828d; }
.runtime-badge.is-online span { background: #51d18a; box-shadow: 0 0 12px rgba(81, 209, 138, .65); }
.runtime-badge.is-starting span,
.runtime-badge.is-checking span { background: #d6b25b; }
.runtime-badge.is-error span { background: #ff6b6b; }

.chatterbox-card { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(230px, .8fr); gap: 1rem; }
.field { display: grid; gap: .5rem; color: #edf2f7; font-weight: 750; }
.field textarea,
.field select { width: 100%; border: 1px solid #354453; border-radius: 12px; background: #101923; color: #f4f7fa; padding: .85rem; font: inherit; }
.field textarea { resize: vertical; min-height: 148px; line-height: 1.5; }
.field textarea:focus,
.field select:focus { outline: 2px solid rgba(214, 178, 91, .52); border-color: #d6b25b; }
.field small { justify-self: end; color: #7f8b98; font-weight: 500; }
.voice-picker { display: flex; flex-direction: column; gap: .85rem; padding: 1rem; border: 1px solid #293744; border-radius: 14px; background: rgba(8, 13, 19, .62); }
.voice-help { font-size: .82rem; line-height: 1.5; }
.voice-help code,
.runtime-copy code { color: #e2c777; }

button { border: 0; border-radius: 11px; padding: .75rem 1rem; font-weight: 850; cursor: pointer; }
button:disabled { opacity: .5; cursor: not-allowed; }
.secondary { align-self: flex-start; background: #233140; color: #e9eef4; }
.listen-button { display: inline-flex; align-items: center; gap: .55rem; min-width: 150px; justify-content: center; background: #d6b25b; color: #10151b; }
.runtime-copy { display: grid; gap: .35rem; min-width: 0; color: #dfe6ee; }
.runtime-copy small { overflow-wrap: anywhere; color: #7f8b98; }
.audio-player { width: 100%; height: 42px; }

@media (max-width: 760px) {
  .chatterbox-card { grid-template-columns: 1fr; }
  .chatterbox-panel__head,
  .chatterbox-actions { align-items: stretch; flex-direction: column; }
  .runtime-badge,
  .listen-button { align-self: stretch; justify-content: center; }
}
</style>
