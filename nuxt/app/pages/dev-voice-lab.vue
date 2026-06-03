<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

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

interface VoiceOption {
  id: string
  name: string
  engine: string
  lang: string
  localOnly: boolean
  description: string
  raw: ServerVoice
}

const TTS_SERVER = 'http://localhost:5111'
const SERVER_TIMEOUT_MS = 2500
const KOKORO_ITALIAN_VOICE_IDS = ['if_sara', 'im_nicola']

const qualificationPhrases = [
  { id: 'qual_start_1', situation: 'V1 - Avvio allenamento', label: 'Box radio', voice: 'if_sara', speed: 1.12, text: 'Qualifica avviata. Pochi giri, massima pulizia.' },
  { id: 'qual_start_2', situation: 'V1 - Avvio allenamento', label: 'Obiettivo', voice: 'im_nicola', speed: 1.14, text: 'Obiettivo semplice: un valido forte.' },
  { id: 'qual_start_3', situation: 'V1 - Avvio allenamento', label: 'Metodo', voice: 'if_sara', speed: 1.08, text: 'Prima stabilita, poi attacco.' },
  { id: 'qual_start_4', situation: 'V1 - Avvio allenamento', label: 'Pressione', voice: 'im_nicola', speed: 1.16, text: 'Pressione alta, margine sotto controllo.' },
  { id: 'qual_start_5', situation: 'V1 - Avvio allenamento', label: 'Focus', voice: 'if_sara', speed: 1.1, text: 'Niente caos. Giro valido, poi si spinge.' },

  { id: 'warmup_1', situation: 'V1 - Warm-up', label: 'Scalda', voice: 'if_sara', speed: 1.04, text: 'Warm-up. Scalda gomme e freni.' },
  { id: 'warmup_2', situation: 'V1 - Warm-up', label: 'Riferimenti', voice: 'im_nicola', speed: 1.08, text: 'Fissa i riferimenti. Non cercare il tempo.' },
  { id: 'warmup_3', situation: 'V1 - Warm-up', label: 'Rotondo', voice: 'if_sara', speed: 1.02, text: 'Guida rotonda. Niente cordoli inutili.' },
  { id: 'warmup_4', situation: 'V1 - Warm-up', label: 'Spazio', voice: 'im_nicola', speed: 1.08, text: 'Costruisci spazio. Prepara il giro.' },
  { id: 'warmup_5', situation: 'V1 - Warm-up', label: 'Stabile', voice: 'if_sara', speed: 1.04, text: 'Macchina stabile. Frenata pulita.' },

  { id: 'stint_start_1', situation: 'V1 - Inizio stint qualifica', label: 'Out lap', voice: 'if_sara', speed: 1.12, text: 'Stint aperto. Out lap ordinato.' },
  { id: 'stint_start_2', situation: 'V1 - Inizio stint qualifica', label: 'Primo valido', voice: 'im_nicola', speed: 1.16, text: 'Primo target: chiudi un valido.' },
  { id: 'stint_start_3', situation: 'V1 - Inizio stint qualifica', label: 'Curva uno', voice: 'if_sara', speed: 1.14, text: 'Curva uno pulita. Non buttare il giro.' },
  { id: 'stint_start_4', situation: 'V1 - Inizio stint qualifica', label: 'Deciso', voice: 'im_nicola', speed: 1.18, text: 'Freno deciso, corda pulita, gas progressivo.' },
  { id: 'stint_start_5', situation: 'V1 - Inizio stint qualifica', label: 'Esegui', voice: 'if_sara', speed: 1.12, text: 'Esegui il piano. Un giro alla volta.' },

  { id: 'time_1', situation: 'V1 - Avvisi tempo', label: 'Dieci passati', voice: 'if_sara', speed: 1.08, text: 'Dieci minuti passati. Controlla il ritmo.' },
  { id: 'time_2', situation: 'V1 - Avvisi tempo', label: 'Meta blocco', voice: 'im_nicola', speed: 1.1, text: 'Meta blocco. Serve un valido pulito.' },
  { id: 'time_3', situation: 'V1 - Avvisi tempo', label: 'Cinque rimasti', voice: 'if_sara', speed: 1.14, text: 'Cinque minuti. Scegli il tentativo buono.' },
  { id: 'time_4', situation: 'V1 - Avvisi tempo', label: 'Due rimasti', voice: 'im_nicola', speed: 1.18, text: 'Due minuti. Giro valido, niente tagli.' },
  { id: 'time_5', situation: 'V1 - Avvisi tempo', label: 'Ultima chance', voice: 'if_sara', speed: 1.2, text: 'Ultima chance. Composto fino alla linea.' },

  { id: 'pause_1', situation: 'V1 - Pausa reset', label: 'Una cosa', voice: 'if_sara', speed: 1.02, text: 'Pausa. Scegli una sola correzione.' },
  { id: 'pause_2', situation: 'V1 - Pausa reset', label: 'Respira', voice: 'im_nicola', speed: 1, text: 'Respira. Rientra ordinato.' },
  { id: 'pause_3', situation: 'V1 - Pausa reset', label: 'Priorita', voice: 'if_sara', speed: 1.04, text: 'Priorita chiara. Non cambiare tutto.' },
  { id: 'pause_4', situation: 'V1 - Pausa reset', label: 'Reset', voice: 'im_nicola', speed: 1.08, text: 'Reset rapido. Prossimo blocco piu pulito.' },
  { id: 'pause_5', situation: 'V1 - Pausa reset', label: 'Rientro', voice: 'if_sara', speed: 1.04, text: 'Rientra semplice. Frena, gira, esci.' },

  { id: 'step_done_1', situation: 'V1 - Fine stint', label: 'Chiuso', voice: 'if_sara', speed: 1.04, text: 'Stint chiuso. Segna il miglior valido.' },
  { id: 'step_done_2', situation: 'V1 - Fine stint', label: 'Review', voice: 'im_nicola', speed: 1.08, text: 'Blocco finito. Trova il punto perso.' },
  { id: 'step_done_3', situation: 'V1 - Fine stint', label: 'Non forzare', voice: 'if_sara', speed: 1.04, text: 'Stop al blocco. Non forzare oltre.' },
  { id: 'step_done_4', situation: 'V1 - Fine stint', label: 'Dati', voice: 'im_nicola', speed: 1.08, text: 'Controlla il dato. Poi riparti pulito.' },
  { id: 'step_done_5', situation: 'V1 - Fine stint', label: 'Conferma', voice: 'if_sara', speed: 1.02, text: 'Buono. Conferma il metodo nel prossimo stint.' },

  { id: 'session_done_1', situation: 'V1 - Fine allenamento', label: 'Fine', voice: 'if_sara', speed: 1, text: 'Allenamento completato. Salva il best valido.' },
  { id: 'session_done_2', situation: 'V1 - Fine allenamento', label: 'Recap', voice: 'im_nicola', speed: 1.06, text: 'Sessione finita. Guarda best e invalidi.' },
  { id: 'session_done_3', situation: 'V1 - Fine allenamento', label: 'Metodo', voice: 'if_sara', speed: 1.02, text: 'Chiudi qui. Tieni il metodo che ha funzionato.' },
  { id: 'session_done_4', situation: 'V1 - Fine allenamento', label: 'Prossimo', voice: 'im_nicola', speed: 1.08, text: 'Prossima sessione: una correzione sola.' },
  { id: 'session_done_5', situation: 'V1 - Fine allenamento', label: 'Archivio', voice: 'if_sara', speed: 1.02, text: 'Archivia il lavoro. Il prossimo step e chiaro.' }
]

const serverVoices = ref<VoiceOption[]>([])
const selectedVoiceId = ref('')
const customText = ref(qualificationPhrases[0]!.text)
const speechSpeed = ref(qualificationPhrases[0]!.speed)
const serverState = ref<'checking' | 'online' | 'offline'>('checking')
const serverMessage = ref('Controllo server locale...')
const isSpeaking = ref(false)
const statusMessage = ref('')
const activeServerAudio = ref<HTMLAudioElement | null>(null)

const selectedVoice = computed(() => {
  return serverVoices.value.find((voice) => voice.id === selectedVoiceId.value) || null
})

const voiceCounters = computed(() => {
  return {
    total: serverVoices.value.length,
    italian: serverVoices.value.length
  }
})

const phraseGroups = computed(() => {
  const groups = new Map<string, typeof qualificationPhrases>()
  for (const phrase of qualificationPhrases) {
    const group = groups.get(phrase.situation) || []
    group.push(phrase)
    groups.set(phrase.situation, group)
  }
  return Array.from(groups.entries()).map(([situation, phrases]) => ({ situation, phrases }))
})

function normalizeLanguage(lang: string) {
  return (lang || 'unknown').split('-')[0]!.toLowerCase()
}

function getServerVoiceLanguage(voice: ServerVoice) {
  return voice.lang || voice.language || inferLanguageFromVoiceId(voice.id) || 'unknown'
}

function inferLanguageFromVoiceId(id: string) {
  const normalized = id.toLowerCase()
  if (normalized.startsWith('it') || normalized.includes('italian') || normalized.includes('italiano')) return 'it-IT'
  if (normalized.startsWith('en') || normalized.includes('english')) return 'en-US'
  if (normalized.startsWith('es') || normalized.includes('spanish')) return 'es-ES'
  if (normalized.startsWith('fr') || normalized.includes('french')) return 'fr-FR'
  if (normalized.startsWith('de') || normalized.includes('german')) return 'de-DE'
  if (normalized.startsWith('pt') || normalized.includes('portuguese')) return 'pt-PT'
  if (normalized.startsWith('ja') || normalized.includes('japanese')) return 'ja-JP'
  if (normalized.startsWith('zh') || normalized.includes('chinese')) return 'zh-CN'
  return ''
}

function mapServerVoice(voice: ServerVoice): VoiceOption {
  const lang = getServerVoiceLanguage(voice)
  const engine = voice.engine || 'Local TTS'
  return {
    id: `server:${voice.id}`,
    name: voice.name || voice.id,
    engine,
    lang,
    localOnly: true,
    description: [voice.quality, voice.gender, voice.description].filter(Boolean).join(' - ') || 'Voce esposta dal server locale.',
    raw: voice
  }
}

async function loadServerVoices() {
  serverState.value = 'checking'
  serverMessage.value = 'Controllo server locale...'

  try {
    const response = await fetch(`${TTS_SERVER}/voices`, {
      signal: AbortSignal.timeout(SERVER_TIMEOUT_MS)
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const data = await response.json()
    const voices = Array.isArray(data?.voices) ? data.voices : []
    serverVoices.value = voices
      .filter((voice: ServerVoice) => KOKORO_ITALIAN_VOICE_IDS.includes(voice.id))
      .map(mapServerVoice)
    serverState.value = serverVoices.value.length > 0 ? 'online' : 'offline'
    serverMessage.value = serverVoices.value.length > 0
      ? `${serverVoices.value.length} voci Kokoro italiane pronte su ${TTS_SERVER}.`
      : `Server raggiunto, ma Sara e Nicola non sono disponibili.`
  } catch (error: any) {
    serverVoices.value = []
    serverState.value = 'offline'
    serverMessage.value = `Server locale non disponibile: ${error?.message || 'nessuna risposta'}.`
  }

  chooseDefaultVoice()
}

function chooseDefaultVoice() {
  if (selectedVoice.value) return

  const nextVoice = serverVoices.value.find((voice) => (voice.raw as ServerVoice).id === qualificationPhrases[0]!.voice) || serverVoices.value[0]

  if (nextVoice) {
    selectedVoiceId.value = nextVoice.id
  }
}

function selectPhrase(phrase: typeof qualificationPhrases[number]) {
  customText.value = phrase.text
  speechSpeed.value = phrase.speed
  const voice = serverVoices.value.find((option) => option.raw.id === phrase.voice)
  if (voice) selectedVoiceId.value = voice.id
}

function applyEnergyPreset(level: 'clean' | 'dynamic' | 'urgent') {
  if (level === 'clean') {
    speechSpeed.value = 1
    customText.value = 'Ciao pilota. Overlay pronto. Respira, scegli il punto di lavoro e partiamo.'
    return
  }

  if (level === 'dynamic') {
    speechSpeed.value = 1.1
    customText.value = 'Ok pilota, ci siamo! Run focus iniziato. Freno pulito, gas progressivo, sguardo avanti. Uno step alla volta!'
    return
  }

  speechSpeed.value = 1.16
  customText.value = 'Attenzione, ultimi due minuti! Resta concentrato. Niente giro della vita: pulizia, ritmo, chiudi forte questo blocco!'
}

async function playVoice() {
  const voice = selectedVoice.value
  const text = customText.value.trim()
  if (!voice || !text || isSpeaking.value) return

  statusMessage.value = ''
  await speakWithServer(voice, text)
}

async function speakWithServer(voice: VoiceOption, text: string) {
  isSpeaking.value = true
  try {
    const raw = voice.raw as ServerVoice
    const url = `${TTS_SERVER}/speak?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(raw.id)}&speed=${encodeURIComponent(String(speechSpeed.value))}`
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const blob = await response.blob()
    const audioUrl = URL.createObjectURL(blob)
    const audio = new Audio(audioUrl)
    activeServerAudio.value = audio
    audio.onended = () => {
      URL.revokeObjectURL(audioUrl)
      activeServerAudio.value = null
      isSpeaking.value = false
    }
    audio.onerror = () => {
      URL.revokeObjectURL(audioUrl)
      activeServerAudio.value = null
      isSpeaking.value = false
      statusMessage.value = 'Errore durante la riproduzione audio.'
    }
    await audio.play()
  } catch (error: any) {
    isSpeaking.value = false
    statusMessage.value = `Sintesi locale non riuscita: ${error?.message || 'errore sconosciuto'}.`
  }
}

function stopVoice() {
  if (activeServerAudio.value) {
    activeServerAudio.value.pause()
    activeServerAudio.value.currentTime = 0
    activeServerAudio.value = null
  }
  isSpeaking.value = false
}

onMounted(async () => {
  await nextTick()
  await loadServerVoices()
})

onBeforeUnmount(() => {
  stopVoice()
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
            Pannello essenziale per testare solo le due voci italiane scelte: Kokoro Sara e Kokoro Nicola.
            Nessuna API cloud: il server locale gira su <code>{{ TTS_SERVER }}</code>.
          </p>
        </div>
        <div class="server-card" :class="`server-card--${serverState}`">
          <span>Local TTS server</span>
          <strong>{{ serverState === 'online' ? 'Online' : serverState === 'checking' ? 'Check' : 'Offline' }}</strong>
          <p>{{ serverMessage }}</p>
          <button type="button" @click="loadServerVoices">Ricarica</button>
        </div>
      </header>

      <section class="lab-grid">
        <aside class="voice-panel">
          <div class="panel-head">
            <div>
              <span class="voice-kicker">Voci finali</span>
              <h2>{{ voiceCounters.total }} Kokoro IT</h2>
            </div>
            <div class="counter-row">
              <span>{{ voiceCounters.italian }} italiane</span>
            </div>
          </div>

          <div class="voice-list">
            <button
              v-for="voice in serverVoices"
              :key="voice.id"
              type="button"
              class="voice-item"
              :class="{ 'is-selected': selectedVoiceId === voice.id }"
              @click="selectedVoiceId = voice.id"
            >
              <span>{{ voice.engine }}</span>
              <strong>{{ voice.name }}</strong>
              <small>{{ voice.lang }} - {{ voice.description }}</small>
            </button>
            <div v-if="serverVoices.length === 0" class="empty-state">
              Avvia il server Kokoro locale per caricare Sara e Nicola.
            </div>
          </div>
        </aside>

        <section class="playground">
          <div class="playground-head">
            <div>
              <span class="voice-kicker">Player</span>
              <h2>{{ selectedVoice?.name || 'Nessuna voce selezionata' }}</h2>
              <p v-if="selectedVoice">
                {{ selectedVoice.engine }} - {{ selectedVoice.lang }} - {{ selectedVoice.localOnly ? 'offline' : 'non locale' }}
              </p>
            </div>
            <div class="play-actions">
              <button type="button" class="secondary" :disabled="!isSpeaking" @click="stopVoice">Stop</button>
              <button type="button" class="primary" :disabled="!selectedVoice || !customText.trim() || isSpeaking" @click="playVoice">
                {{ isSpeaking ? 'In lettura...' : 'Play' }}
              </button>
            </div>
          </div>

          <textarea
            v-model="customText"
            rows="5"
            maxlength="420"
            placeholder="Scrivi una frase da leggere..."
          />

          <div class="voice-controls">
            <label>
              Energia / velocita
              <input v-model.number="speechSpeed" type="range" min="0.8" max="1.5" step="0.02">
              <strong>{{ speechSpeed.toFixed(2) }}x</strong>
            </label>
            <div class="energy-actions">
              <button type="button" @click="applyEnergyPreset('clean')">Pulito</button>
              <button type="button" @click="applyEnergyPreset('dynamic')">Dinamico</button>
              <button type="button" @click="applyEnergyPreset('urgent')">Ultimi minuti</button>
            </div>
          </div>

          <div class="phrase-grid">
            <section v-for="group in phraseGroups" :key="group.situation" class="phrase-section">
              <h3>{{ group.situation }}</h3>
              <button
                v-for="phrase in group.phrases"
                :key="phrase.id"
                type="button"
                @click="selectPhrase(phrase)"
              >
                <span>{{ phrase.label }}</span>
                <small>{{ phrase.text }}</small>
              </button>
            </section>
          </div>

          <p v-if="statusMessage" class="status-message">{{ statusMessage }}</p>
        </section>
      </section>
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
.lab-grid,
.engine-card,
.voice-panel,
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

.engine-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.engine-card {
  display: grid;
  gap: 8px;
  min-height: 172px;
  padding: 16px;
  border-radius: $radius-md;

  span {
    justify-self: start;
    padding: 4px 8px;
    border-radius: $radius-sm;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.72);
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
  }

  strong {
    color: #fff;
    font-size: 18px;
  }

  p,
  small {
    margin: 0;
    color: rgba(255, 255, 255, 0.62);
    line-height: 1.45;
  }
}

.engine-card--recommended {
  border-color: rgba($accent-success, 0.34);
}

.engine-card--avoid {
  opacity: 0.68;
}

.lab-grid {
  display: grid;
  grid-template-columns: 420px minmax(0, 1fr);
  gap: 0;
  overflow: hidden;
  border-radius: $radius-lg;
}

.voice-panel,
.playground {
  border: 0;
  border-radius: 0;
}

.voice-panel {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 14px;
  padding: 18px;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
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

.counter-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;

  span {
    padding: 5px 7px;
    border-radius: $radius-sm;
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.66);
    font-size: 11px;
    font-weight: 800;
  }
}

.filters {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: end;

  label {
    display: grid;
    gap: 6px;
    color: rgba(255, 255, 255, 0.58);
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
  }

  select {
    min-height: 34px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: $radius-sm;
    background: #15151d;
    color: #fff;
  }
}

.check-row {
  grid-template-columns: auto auto;
  align-items: center;
  min-height: 34px;
}

.voice-list {
  display: grid;
  gap: 8px;
  max-height: 540px;
  overflow: auto;
  padding-right: 4px;
}

.voice-item {
  display: grid;
  gap: 4px;
  width: 100%;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: $radius-sm;
  background: rgba(255, 255, 255, 0.035);
  color: #fff;
  text-align: left;

  span,
  small {
    overflow: hidden;
    color: rgba(255, 255, 255, 0.58);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    overflow: hidden;
    font-size: 15px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &.is-selected,
  &:hover {
    border-color: rgba($racing-orange, 0.58);
    background: rgba($racing-orange, 0.1);
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

.playground {
  display: grid;
  align-content: start;
  gap: 18px;
  padding: 22px;
}

.play-actions {
  display: flex;
  gap: 8px;
}

textarea {
  width: 100%;
  min-height: 136px;
  padding: 14px;
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

.energy-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.phrase-grid {
  display: grid;
  gap: 16px;

  .phrase-section {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  h3 {
    grid-column: 1 / -1;
    margin: 0;
    color: rgba(255, 255, 255, 0.78);
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  button {
    display: grid;
    gap: 6px;
    min-height: 92px;
    padding: 13px;
    text-align: left;

    span {
      color: #fff;
      font-weight: 900;
    }

    small {
      overflow: hidden;
      color: rgba(255, 255, 255, 0.6);
      line-height: 1.38;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
    }
  }
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
  .voice-hero,
  .lab-grid {
    grid-template-columns: 1fr;
  }

  .voice-panel {
    border-right: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .engine-grid,
  .phrase-section {
    grid-template-columns: 1fr;
  }
}
</style>
