<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { renderSpotterPhrase } from '~/services/spotter/spotterPhraseRenderer'
import type { SpotterPhraseKey } from '~/config/spotterPhrases'
import { trainingOverlayCatalog, trainingOverlayOrder, type TrainingOverlayId } from '~/config/trainingOverlayCatalog'
import type { VoiceScript, VoiceScriptScenario, VoiceScriptStep } from '~/config/voiceScript'

definePageMeta({
  layout: 'dashboard',
  middleware: 'dev-tools'
})

interface ServerVoice {
  id: string
  name?: string
  engine?: string
  gender?: string
  quality?: string
  description?: string
  lang?: string
  language?: string
}

const TTS_SERVER = 'http://localhost:5111'
const SERVER_TIMEOUT_MS = 2500
const KOKORO_ITALIAN_VOICE_IDS = ['if_sara', 'im_nicola']
const KOKORO_BOOT_POLL_MS = 3000
const KOKORO_BOOT_MAX_MS = 120_000

// ─── Stato server/voci ────────────────────────────────────────────────────────
const serverVoices = ref<ServerVoice[]>([])
const serverState = ref<'checking' | 'online' | 'starting' | 'offline'>('checking')
const serverMessage = ref('Controllo server locale...')
const previewVoiceId = ref('if_sara')
let bootPollHandle: ReturnType<typeof setTimeout> | null = null

// Cronometro avvio motore (PIP-138): dà la sensazione che "sta succedendo
// qualcosa" mentre Kokoro carica, invece di un "Avvio..." muto.
const bootElapsed = ref(0)
let bootTickHandle: ReturnType<typeof setInterval> | null = null
function startBootTimer() {
  bootElapsed.value = 0
  if (bootTickHandle) clearInterval(bootTickHandle)
  bootTickHandle = setInterval(() => { bootElapsed.value += 1 }, 1000)
}
function stopBootTimer() {
  if (bootTickHandle) { clearInterval(bootTickHandle); bootTickHandle = null }
}

// ─── Copione (fonte unica, PIP-98) ────────────────────────────────────────────
const script = ref<VoiceScript | null>(null)
const scriptDirty = ref(false)
const scriptStatus = ref('')
const selectedTrainingId = ref<TrainingOverlayId>('qualifying')
const selectedModeId = ref<'short30' | 'full60'>('short30')
const showScenarios = ref(false)

// Stato per riga (PIP-138): una sola fonte tipizzata invece di stringhe sparse.
type RowState = 'idle' | 'saving' | 'generating' | 'done' | 'error'
const rowTasks = ref<Record<string, { state: RowState; message: string }>>({})

// Toast grafici: feedback visibile anche scrollando (PIP-138).
const toasts = ref<Array<{ id: number; text: string; type: 'success' | 'error' }>>([])
let toastSeq = 0
function pushToast(text: string, type: 'success' | 'error') {
  const id = ++toastSeq
  toasts.value.push({ id, text, type })
  setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id) }, 3500)
}
function rowState(entry: VoiceScriptStep | VoiceScriptScenario): RowState {
  return rowTasks.value[rowKey(entry)]?.state ?? 'idle'
}
function rowBusy(entry: VoiceScriptStep | VoiceScriptScenario): boolean {
  const s = rowState(entry)
  return s === 'saving' || s === 'generating'
}

// ─── Player ───────────────────────────────────────────────────────────────────
const customText = ref('')
const speechSpeed = ref(1.15)
const isSpeaking = ref(false)
const statusMessage = ref('')
const activeServerAudio = ref<HTMLAudioElement | null>(null)

// ─── Spotter demo ─────────────────────────────────────────────────────────────
const spotterTarget = ref<'ahead' | 'behind'>('ahead')
const spotterTrend = ref<'gaining' | 'losing' | 'stable'>('gaining')
const spotterDeltaMs = ref(250)
const spotterSector = ref<1 | 2 | 3>(2)

const spotterPhraseKey = computed<SpotterPhraseKey>(() => {
  if (spotterTarget.value === 'ahead' && spotterTrend.value === 'gaining') return 'aheadGaining'
  if (spotterTarget.value === 'ahead' && spotterTrend.value === 'losing') return 'aheadLosing'
  if (spotterTarget.value === 'ahead') return 'aheadStable'
  if (spotterTrend.value === 'gaining') return 'behindClosing'
  if (spotterTrend.value === 'losing') return 'behindDropping'
  return 'behindStable'
})

const spotterPreviewText = computed(() =>
  renderSpotterPhrase({
    key: spotterPhraseKey.value,
    deltaMs: spotterDeltaMs.value,
    sector: spotterSector.value,
    random: () => 0,
  })
)

// ─── Derivati copione ─────────────────────────────────────────────────────────
const trainingTabs = computed(() => trainingOverlayOrder.map(id => ({
  id,
  label: trainingOverlayCatalog[id].label,
})))

const selectedTraining = computed(() => trainingOverlayCatalog[selectedTrainingId.value])

/** Step in ordine di esecuzione, uniti alle frasi del copione. */
const stepRows = computed(() => {
  if (!script.value) return []
  const mode = selectedTraining.value.modes[selectedModeId.value]
  return mode.steps.map((step, index) => {
    const entry = script.value!.steps.find(s =>
      s.trainingId === selectedTrainingId.value && s.modeId === selectedModeId.value && s.stepId === step.id)
    return { step, index, entry }
  })
})

const scenarioRows = computed(() => script.value?.scenarios ?? [])

function stepWavName(entry: VoiceScriptStep, voice: string) {
  return `step-${entry.trainingId}-${entry.modeId}-${entry.stepId}-${voice}.wav`
}

function scenarioWavName(entry: VoiceScriptScenario, voice: string) {
  return `${entry.id}-${voice}.wav`
}

function rowKey(entry: VoiceScriptStep | VoiceScriptScenario) {
  return 'stepId' in entry ? `${entry.trainingId}/${entry.modeId}/${entry.stepId}` : `scenario/${entry.id}`
}

// ─── Server Kokoro: stato + autostart ────────────────────────────────────────
async function probeServer(): Promise<boolean> {
  try {
    const response = await fetch(`${TTS_SERVER}/voices`, { signal: AbortSignal.timeout(SERVER_TIMEOUT_MS) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    const voices = Array.isArray(data?.voices) ? data.voices : []
    serverVoices.value = voices.filter((v: ServerVoice) => KOKORO_ITALIAN_VOICE_IDS.includes(v.id))
    return serverVoices.value.length > 0
  } catch {
    serverVoices.value = []
    return false
  }
}

async function ensureKokoro() {
  serverState.value = 'checking'
  serverMessage.value = 'Controllo motore vocale...'
  if (await probeServer()) {
    serverState.value = 'online'
    serverMessage.value = `Sara e Nicola pronte su ${TTS_SERVER}.`
    return
  }

  // Autostart (PIP-100): il dev server lancia Kokoro come processo figlio.
  serverState.value = 'starting'
  serverMessage.value = 'Carico il modello neurale (primo avvio fino a ~1 min)...'
  startBootTimer()
  try {
    await $fetch('/api/dev/kokoro-start', { method: 'POST' })
  } catch (error: any) {
    stopBootTimer()
    serverState.value = 'offline'
    serverMessage.value = `Avvio automatico fallito: ${error?.data?.statusMessage || error?.message || 'errore'}. Avvio manuale: npm run voice:kokoro`
    return
  }

  const deadline = Date.now() + KOKORO_BOOT_MAX_MS
  const poll = async () => {
    if (await probeServer()) {
      stopBootTimer()
      serverState.value = 'online'
      serverMessage.value = `Sara e Nicola pronte su ${TTS_SERVER}.`
      return
    }
    if (Date.now() > deadline) {
      stopBootTimer()
      serverState.value = 'offline'
      serverMessage.value = 'Il motore vocale non ha risposto in tempo. Avvio manuale: npm run voice:kokoro'
      return
    }
    bootPollHandle = setTimeout(poll, KOKORO_BOOT_POLL_MS)
  }
  bootPollHandle = setTimeout(poll, KOKORO_BOOT_POLL_MS)
}

// ─── Copione: carica / salva ──────────────────────────────────────────────────
async function loadScript() {
  try {
    script.value = await $fetch<VoiceScript>('/api/dev/voice-script')
    scriptDirty.value = false
    scriptStatus.value = ''
  } catch (error: any) {
    scriptStatus.value = `Caricamento copione fallito: ${error?.message || 'errore'}`
  }
}

function markDirty() {
  scriptDirty.value = true
}

async function saveScript() {
  if (!script.value) return
  scriptStatus.value = 'Salvataggio...'
  try {
    await $fetch('/api/dev/voice-script', { method: 'POST', body: script.value })
    scriptDirty.value = false
    scriptStatus.value = 'Copione salvato. Ricorda di rigenerare i WAV delle frasi modificate.'
  } catch (error: any) {
    scriptStatus.value = `Salvataggio fallito: ${error?.data?.statusMessage || error?.message || 'errore'}`
  }
}

// ─── Sintesi: ascolto e rigenerazione ────────────────────────────────────────
async function synthesize(text: string, voice: string, speed: number): Promise<Blob> {
  const url = `${TTS_SERVER}/speak?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(voice)}&speed=${encodeURIComponent(String(speed))}`
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.blob()
}

async function playBlob(blob: Blob) {
  const audioUrl = URL.createObjectURL(blob)
  const audio = new Audio(audioUrl)
  activeServerAudio.value = audio
  await new Promise<void>((resolve) => {
    audio.onended = () => { URL.revokeObjectURL(audioUrl); resolve() }
    audio.onerror = () => { URL.revokeObjectURL(audioUrl); resolve() }
    void audio.play().catch(() => resolve())
  })
  if (activeServerAudio.value === audio) activeServerAudio.value = null
}

async function playText(text: string, speed: number) {
  if (serverState.value !== 'online' || isSpeaking.value || !text.trim()) return
  isSpeaking.value = true
  statusMessage.value = ''
  try {
    await playBlob(await synthesize(text.trim(), previewVoiceId.value, speed))
  } catch (error: any) {
    statusMessage.value = `Sintesi non riuscita: ${error?.message || 'errore'}`
  } finally {
    isSpeaking.value = false
  }
}

async function playEntry(entry: VoiceScriptStep | VoiceScriptScenario) {
  await playText(entry.text, entry.speed ?? script.value?.defaultSpeed ?? 1.15)
}

async function playCustom() {
  await playText(customText.value, speechSpeed.value)
}

async function playSpotterPreview() {
  customText.value = spotterPreviewText.value
  speechSpeed.value = 1.08
  await playCustom()
}

function stopVoice() {
  if (activeServerAudio.value) {
    activeServerAudio.value.pause()
    activeServerAudio.value.currentTime = 0
    activeServerAudio.value = null
  }
  isSpeaking.value = false
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

/**
 * Azione unica (PIP-138): salva il copione se serve, poi rigenera i WAV
 * (entrambe le voci) della frase. Niente più ordine "salva → rigenera" a mano.
 */
async function saveAndRegenerate(entry: VoiceScriptStep | VoiceScriptScenario) {
  if (serverState.value !== 'online') return
  const key = rowKey(entry)
  const label = 'stepId' in entry ? entry.stepId : entry.id
  try {
    if (scriptDirty.value) {
      rowTasks.value[key] = { state: 'saving', message: 'Salvo copione...' }
      await $fetch('/api/dev/voice-script', { method: 'POST', body: script.value })
      scriptDirty.value = false
      scriptStatus.value = ''
    }
    const speed = entry.speed ?? script.value?.defaultSpeed ?? 1.15
    const voices = script.value?.voices ?? KOKORO_ITALIAN_VOICE_IDS
    for (const voice of voices) {
      rowTasks.value[key] = { state: 'generating', message: `Rigenero ${voice}...` }
      const filename = 'stepId' in entry ? stepWavName(entry, voice) : scenarioWavName(entry, voice)
      const blob = await synthesize(entry.text.trim(), voice, speed)
      await $fetch('/api/dev/voice-wav', {
        method: 'POST',
        body: { filename, dataBase64: await blobToBase64(blob) },
      })
    }
    rowTasks.value[key] = { state: 'done', message: 'WAV aggiornato ✓' }
    pushToast(`${label}: WAV rigenerato ✓`, 'success')
  } catch (error: any) {
    const msg = error?.data?.statusMessage || error?.message || 'sintesi fallita'
    rowTasks.value[key] = { state: 'error', message: `Errore: ${msg}` }
    pushToast(`${label}: rigenerazione fallita`, 'error')
  }
}

onMounted(async () => {
  await nextTick()
  await Promise.all([ensureKokoro(), loadScript()])
})

onBeforeUnmount(() => {
  stopVoice()
  stopBootTimer()
  if (bootPollHandle) clearTimeout(bootPollHandle)
})
</script>

<template>
  <LayoutPageContainer>
    <section class="voice-lab">
      <header class="voice-hero">
        <div>
          <span class="voice-kicker">Offline voice lab</span>
          <h1>Kokoro Voice Lab</h1>
          <p>
            Editor del copione vocale dell'overlay: modifica una frase, ascoltala e rigenera i WAV
            senza toccare codice. Fonte unica: <code>app/config/voiceScript.json</code>.
            Server locale su <code>{{ TTS_SERVER }}</code> (avvio automatico).
          </p>
        </div>
        <div class="server-card" :class="`server-card--${serverState === 'starting' ? 'checking' : serverState}`">
          <span class="server-card__label"><i class="server-dot" :class="`server-dot--${serverState}`" />Motore vocale</span>
          <strong>{{ serverState === 'online' ? 'Online' : serverState === 'offline' ? 'Offline' : `Avvio… ${bootElapsed}s` }}</strong>
          <p>{{ serverMessage }}</p>
          <p v-if="serverState !== 'online'" class="server-hint">«Ascolta» e «Salva e rigenera» sono attivi solo a motore <strong>Online</strong>.</p>
          <button type="button" :disabled="serverState === 'checking' || serverState === 'starting'" @click="ensureKokoro">
            {{ serverState === 'starting' || serverState === 'checking' ? 'Avvio in corso…' : 'Riprova' }}
          </button>
        </div>
      </header>

      <section class="script-editor">
        <div class="editor-toolbar">
          <div class="training-tabs">
            <button
              v-for="tab in trainingTabs"
              :key="tab.id"
              type="button"
              :class="{ 'is-active': selectedTrainingId === tab.id }"
              @click="selectedTrainingId = tab.id"
            >
              {{ tab.label }}
            </button>
          </div>
          <div class="mode-tabs">
            <button type="button" :class="{ 'is-active': selectedModeId === 'short30' }" @click="selectedModeId = 'short30'">30 min</button>
            <button type="button" :class="{ 'is-active': selectedModeId === 'full60' }" @click="selectedModeId = 'full60'">60 min</button>
          </div>
          <div class="voice-toggle">
            <span>Anteprima</span>
            <button type="button" :class="{ 'is-active': previewVoiceId === 'if_sara' }" @click="previewVoiceId = 'if_sara'">Sara</button>
            <button type="button" :class="{ 'is-active': previewVoiceId === 'im_nicola' }" @click="previewVoiceId = 'im_nicola'">Nicola</button>
          </div>
          <button type="button" class="primary save-btn" :disabled="!scriptDirty" @click="saveScript">
            {{ scriptDirty ? 'Salva copione' : 'Copione salvato' }}
          </button>
        </div>
        <p v-if="scriptStatus" class="status-message">{{ scriptStatus }}</p>

        <div v-if="!script" class="empty-state">Carico il copione...</div>

        <div v-else class="phrase-rows">
          <article v-for="row in stepRows" :key="row.step.id" class="phrase-row">
            <header>
              <span class="step-order">{{ row.index + 1 }}</span>
              <strong>{{ row.step.title }}</strong>
              <small>{{ row.step.durationMinutes }} min</small>
            </header>
            <template v-if="row.entry">
              <textarea v-model="row.entry.text" rows="2" maxlength="280" @input="markDirty" />
              <footer>
                <label>
                  Velocità
                  <input v-model.number="row.entry.speed" type="number" min="0.8" max="1.5" step="0.02" :placeholder="String(script.defaultSpeed)" @input="markDirty">
                </label>
                <span class="row-status" :class="`row-status--${rowState(row.entry)}`">{{ rowTasks[rowKey(row.entry)]?.message || '' }}</span>
                <button type="button" :disabled="serverState !== 'online' || isSpeaking" @click="playEntry(row.entry)">Ascolta</button>
                <button type="button" class="primary" :disabled="serverState !== 'online' || rowBusy(row.entry)" @click="saveAndRegenerate(row.entry)">
                  {{ rowBusy(row.entry) ? '…' : 'Salva e rigenera' }}
                </button>
              </footer>
            </template>
            <p v-else class="missing-entry">Frase mancante nel copione per questo step (aggiungerla in voiceScript.json).</p>
          </article>

          <button type="button" class="scenario-title" @click="showScenarios = !showScenarios">
            {{ showScenarios ? '▾' : '▸' }} Frasi di scenario (tutti gli allenamenti) · {{ scenarioRows.length }}
          </button>
          <template v-if="showScenarios">
            <article v-for="entry in scenarioRows" :key="entry.id" class="phrase-row phrase-row--scenario">
              <header>
                <strong>{{ entry.id }}</strong>
              </header>
              <textarea v-model="entry.text" rows="2" maxlength="280" @input="markDirty" />
              <footer>
                <label>
                  Velocità
                  <input v-model.number="entry.speed" type="number" min="0.8" max="1.5" step="0.02" @input="markDirty">
                </label>
                <span class="row-status" :class="`row-status--${rowState(entry)}`">{{ rowTasks[rowKey(entry)]?.message || '' }}</span>
                <button type="button" :disabled="serverState !== 'online' || isSpeaking" @click="playEntry(entry)">Ascolta</button>
                <button type="button" class="primary" :disabled="serverState !== 'online' || rowBusy(entry)" @click="saveAndRegenerate(entry)">
                  {{ rowBusy(entry) ? '…' : 'Salva e rigenera' }}
                </button>
              </footer>
            </article>
          </template>
        </div>
      </section>

      <section class="playground">
        <div class="playground-head">
          <div>
            <span class="voice-kicker">Prova libera</span>
            <h2>Testo libero con {{ previewVoiceId === 'if_sara' ? 'Sara' : 'Nicola' }}</h2>
          </div>
          <div class="play-actions">
            <button type="button" class="secondary" :disabled="!isSpeaking" @click="stopVoice">Stop</button>
            <button type="button" class="primary" :disabled="serverState !== 'online' || !customText.trim() || isSpeaking" @click="playCustom">
              {{ isSpeaking ? 'In lettura...' : 'Play' }}
            </button>
          </div>
        </div>

        <textarea
          v-model="customText"
          rows="4"
          maxlength="420"
          placeholder="Scrivi una frase da provare..."
        />

        <div class="voice-controls">
          <label>
            Velocità
            <input v-model.number="speechSpeed" type="range" min="0.8" max="1.5" step="0.02">
            <strong>{{ speechSpeed.toFixed(2) }}x</strong>
          </label>
        </div>

        <section class="spotter-simulator">
          <div class="panel-head">
            <div>
              <span class="voice-kicker">Spotter demo</span>
              <h2>Evento gara simulato</h2>
            </div>
            <div class="play-actions">
              <button type="button" class="primary" :disabled="serverState !== 'online' || isSpeaking" @click="playSpotterPreview">
                Play spotter
              </button>
            </div>
          </div>

          <div class="spotter-controls">
            <label>
              Target
              <select v-model="spotterTarget">
                <option value="ahead">Pilota davanti</option>
                <option value="behind">Pilota dietro</option>
              </select>
            </label>
            <label>
              Trend
              <select v-model="spotterTrend">
                <option value="gaining">Guadagni / recupera</option>
                <option value="losing">Perdi / perde</option>
                <option value="stable">Stabile</option>
              </select>
            </label>
            <label>
              Delta ms
              <input v-model.number="spotterDeltaMs" type="number" min="0" max="2200" step="50">
            </label>
            <label>
              Settore
              <select v-model.number="spotterSector">
                <option :value="1">Settore 1</option>
                <option :value="2">Settore 2</option>
                <option :value="3">Settore 3</option>
              </select>
            </label>
          </div>

          <p class="spotter-preview">{{ spotterPreviewText }}</p>
        </section>

        <p v-if="statusMessage" class="status-message">{{ statusMessage }}</p>
      </section>

      <transition-group name="toast" tag="div" class="toast-container">
        <div v-for="t in toasts" :key="t.id" class="toast" :class="`toast--${t.type}`">{{ t.text }}</div>
      </transition-group>
    </section>
  </LayoutPageContainer>
</template>

<style scoped lang="scss">
@use '@/assets/scss/variables' as *;

.voice-lab {
  display: grid;
  gap: 22px;
}

.voice-hero,
.script-editor,
.playground,
.server-card {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.035);
}

.voice-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 22px;
  align-items: stretch;
  padding: 28px;
  border-radius: $radius-lg;

  h1 {
    margin: 8px 0 10px;
    color: #fff;
    font-size: 42px;
    line-height: 1;
    letter-spacing: 0;
  }

  p {
    max-width: 820px;
    margin: 0;
    color: rgba(255, 255, 255, 0.68);
    line-height: 1.6;
  }

  code {
    color: #fef3c7;
  }
}

.voice-kicker {
  color: rgba(255, 255, 255, 0.52);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.server-card {
  display: grid;
  align-content: start;
  gap: 8px;
  padding: 18px;
  border-radius: $radius-md;

  span {
    color: rgba(255, 255, 255, 0.58);
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
  }

  strong {
    color: #fff;
    font-size: 28px;
  }

  p {
    min-height: 44px;
    color: rgba(255, 255, 255, 0.64);
    font-size: 13px;
  }

  button {
    justify-self: start;
  }
}

.server-card--online {
  border-color: rgba($accent-success, 0.42);
}

.server-card--offline {
  border-color: rgba($accent-warning, 0.38);
}

.server-card--checking {
  border-color: rgba(253, 230, 138, 0.4);
}

.server-card__label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.server-card .server-hint {
  min-height: 0;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;

  strong {
    font-size: inherit;
    color: rgba(255, 255, 255, 0.85);
  }
}

.server-dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.4);
}

.server-dot--online { background: $accent-success; }
.server-dot--offline { background: $accent-warning; }

.server-dot--checking,
.server-dot--starting {
  background: #fde68a;
  animation: row-pulse 1s ease-in-out infinite;
}

.script-editor {
  display: grid;
  gap: 16px;
  padding: 22px;
  border-radius: $radius-lg;
}

.editor-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.training-tabs,
.mode-tabs,
.voice-toggle {
  display: inline-flex;
  gap: 6px;
  align-items: center;

  span {
    color: rgba(255, 255, 255, 0.5);
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
  }

  button.is-active {
    border-color: rgba($racing-orange, 0.72);
    background: rgba($racing-orange, 0.16);
    color: #fff;
  }
}

.save-btn {
  margin-left: auto;
}

.phrase-rows {
  display: grid;
  gap: 12px;
}

.scenario-title {
  justify-self: start;
  margin: 14px 0 0;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.78);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-align: left;
  text-transform: uppercase;
}

.phrase-row {
  display: grid;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: $radius-md;
  background: rgba(0, 0, 0, 0.18);

  header {
    display: flex;
    gap: 10px;
    align-items: center;

    strong {
      color: #fff;
      font-size: 14px;
    }

    small {
      color: rgba(255, 255, 255, 0.5);
    }
  }

  textarea {
    min-height: 44px;
  }

  footer {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 14px;
    align-items: center;

    label {
      display: inline-flex;
      gap: 8px;
      align-items: center;
      color: rgba(255, 255, 255, 0.58);
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
    }

    input,
    select {
      min-height: 32px;
      padding: 0 8px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: $radius-sm;
      background: #15151d;
      color: #fff;
    }

    input {
      width: 72px;
    }
  }
}

.phrase-row--scenario {
  border-color: rgba($accent-success, 0.22);
}

.step-order {
  display: inline-grid;
  place-items: center;
  min-width: 24px;
  height: 24px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.72);
  font-size: 12px;
  font-weight: 900;
}

.row-status {
  margin-left: auto;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-status--saving,
.row-status--generating {
  color: #fde68a;
  animation: row-pulse 1s ease-in-out infinite;
}

.row-status--done {
  color: $accent-success;
}

.row-status--error {
  color: $accent-warning;
}

@keyframes row-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}

.toast-container {
  position: fixed;
  right: 22px;
  bottom: 22px;
  z-index: 50;
  display: grid;
  gap: 8px;
}

.toast {
  padding: 12px 16px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: $radius-md;
  background: #1b1b24;
  color: #fff;
  font-weight: 900;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.toast--success {
  border-color: rgba($accent-success, 0.55);
}

.toast--error {
  border-color: rgba($accent-warning, 0.55);
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(16px);
}

.missing-entry {
  margin: 0;
  color: #fde68a;
  font-size: 13px;
}

.playground {
  display: grid;
  align-content: start;
  gap: 18px;
  padding: 22px;
  border-radius: $radius-lg;
}

.panel-head,
.playground-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: start;

  h2 {
    margin: 4px 0 0;
    color: #fff;
    font-size: 22px;
    letter-spacing: 0;
  }

  p {
    margin: 5px 0 0;
    color: rgba(255, 255, 255, 0.58);
  }
}

.empty-state,
.status-message {
  padding: 14px;
  border-radius: $radius-sm;
  background: rgba($accent-warning, 0.1);
  color: #fde68a;
  line-height: 1.45;
}

.play-actions {
  display: flex;
  gap: 8px;
}

textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: $radius-md;
  background: rgba(0, 0, 0, 0.28);
  color: #fff;
  font: inherit;
  line-height: 1.55;
  resize: vertical;
}

.voice-controls {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: $radius-md;
  background: rgba(0, 0, 0, 0.18);

  label {
    display: grid;
    grid-template-columns: 150px minmax(160px, 1fr) 56px;
    gap: 12px;
    align-items: center;
    color: rgba(255, 255, 255, 0.7);
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
  }

  input {
    width: 100%;
  }

  strong {
    color: #fff;
    font-size: 13px;
    text-align: right;
  }
}

.spotter-simulator {
  display: grid;
  gap: 14px;
  padding: 16px;
  border: 1px solid rgba($accent-success, 0.22);
  border-radius: $radius-md;
  background: rgba($accent-success, 0.055);
}

.spotter-controls {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;

  label {
    display: grid;
    gap: 6px;
    color: rgba(255, 255, 255, 0.62);
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
  }

  select,
  input {
    min-height: 36px;
    min-width: 0;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: $radius-sm;
    background: #15151d;
    color: #fff;
  }

  input {
    padding: 0 10px;
  }
}

.spotter-preview {
  margin: 0;
  padding: 12px;
  border-radius: $radius-sm;
  background: rgba(0, 0, 0, 0.24);
  color: rgba(255, 255, 255, 0.82);
  line-height: 1.5;
}

button {
  min-height: 34px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: $radius-sm;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.84);
  font-weight: 900;
  cursor: pointer;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
}

.primary {
  border-color: rgba($racing-orange, 0.72);
  background: linear-gradient(90deg, $racing-red, $racing-orange);
  color: #fff;
}

.secondary {
  background: rgba(255, 255, 255, 0.04);
}

@media (max-width: 1040px) {
  .voice-hero {
    grid-template-columns: 1fr;
  }

  .spotter-controls {
    grid-template-columns: 1fr;
  }
}
</style>
