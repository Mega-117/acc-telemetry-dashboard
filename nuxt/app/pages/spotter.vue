<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { spotterVoiceOptions, useSpotterVoiceSettings } from '~/composables/useSpotterVoiceSettings'
import { useVoiceLabRuntime } from '~/composables/useVoiceLabRuntime'
import { resolveTrackVoiceReferenceAudioPath } from '~/services/spotter/trackVoiceReferences'
import SessionModePicker from '~/components/spotter/SessionModePicker.vue'

definePageMeta({ layout: 'dashboard' })

type VoiceId = 'if_sara' | 'im_nicola'
type RuntimeState = 'checking' | 'online' | 'starting' | 'offline' | 'error'

interface TrackVoicePoint {
  id: string
  track: string
  type?: string
  normalized_car_position: number
  label?: string
  text?: string
  audio_path?: string
  audio_voice?: string
  audio_paths?: Partial<Record<VoiceId | string, string>>
  speed?: number
  enabled?: boolean
}

interface TrackVoicePointCatalog {
  tracks: string[]
  points: TrackVoicePoint[]
}

const { isAdmin } = useFirebaseAuth()
const voiceLabRuntime = useVoiceLabRuntime()
const {
  selectedVoice,
  voiceLabel,
  referencesEnabled,
  coachEnabled,
  referenceSessionModes,
  lapTimeSessionModes,
  selectVoice,
  toggleReferences,
  toggleCoach,
  setReferenceSessionModes,
  setLapTimeSessionModes,
} = useSpotterVoiceSettings()
const selectedTrack = ref('Spa')
const catalog = ref<TrackVoicePointCatalog>({ tracks: ['Spa'], points: [] })
const catalogBusy = ref(false)
const catalogError = ref('')
const runtimeState = ref<RuntimeState>('checking')
const runtimeMessage = ref('Controllo motore vocale...')


const availableTracks = computed(() => {
  const tracks = catalog.value.tracks.length ? catalog.value.tracks : ['Spa']
  return tracks.includes('Spa') ? tracks : ['Spa', ...tracks]
})
const selectedTrackPoints = computed(() => catalog.value.points
  .filter(point => point.track === selectedTrack.value && point.type === 'braking_reference')
)
const activeReferences = computed(() => selectedTrackPoints.value.filter(point => point.enabled !== false))
const readyReferences = computed(() => activeReferences.value.filter(point => resolveTrackVoiceReferenceAudioPath(point, selectedVoice.value)))
const missingReferences = computed(() => Math.max(0, activeReferences.value.length - readyReferences.value.length))
const disabledReferences = computed(() => selectedTrackPoints.value.filter(point => point.enabled === false).length)
const referenceStatusLabel = computed(() => {
  if (!selectedTrackPoints.value.length) return 'Nessun riferimento registrato'
  if (!activeReferences.value.length) return 'Tutti i riferimenti sono disattivati'
  if (missingReferences.value === 0) return 'Audio riferimenti pronto'
  return 'Audio da rigenerare'
})
const referenceVoiceLabLink = computed(() => `/dev-voice-lab?section=references&track=${encodeURIComponent(selectedTrack.value)}`)


async function loadCatalog() {
  catalogBusy.value = true
  catalogError.value = ''
  try {
    catalog.value = await voiceLabRuntime.readVoicePoints<TrackVoicePointCatalog>()
    if (!availableTracks.value.includes(selectedTrack.value)) selectedTrack.value = availableTracks.value[0] || 'Spa'
  } catch (error: any) {
    catalogError.value = error?.data?.statusMessage || error?.message || 'Riferimenti non disponibili'
  } finally {
    catalogBusy.value = false
  }
}

async function checkRuntime() {
  runtimeState.value = 'checking'
  try {
    const data = await voiceLabRuntime.kokoroReady() as { state: RuntimeState; message?: string }
    runtimeState.value = data.state
    runtimeMessage.value = data.message || (data.state === 'online' ? 'Motore vocale online.' : 'Motore vocale non pronto.')
  } catch (error: any) {
    runtimeState.value = 'offline'
    runtimeMessage.value = error?.data?.statusMessage || error?.message || 'Motore vocale non disponibile.'
  }
}

onMounted(() => {
  void Promise.all([loadCatalog(), checkRuntime()])
})
</script>

<template>
  <LayoutPageContainer>
    <section class="spotter-page">
      <header class="spotter-hero">
        <span class="spotter-kicker">Spotter</span>
        <h1>Avvisi vocali</h1>
        <p>Decidi quali avvisi usare in pista. Il Voice Lab resta il posto dove modificare testi e generare WAV.</p>
      </header>

      <div class="spotter-grid">
        <section class="spotter-panel spotter-panel--wide">
          <header class="panel-head">
            <div>
              <span class="spotter-kicker">Impostazioni voce</span>
              <h2>Profilo operativo</h2>
            </div>
            <span class="status-pill" :class="`status-pill--${runtimeState}`">
              {{ runtimeState === 'online' ? 'Motore online' : runtimeState === 'checking' ? 'Controllo...' : 'Motore offline' }}
            </span>
          </header>

          <div class="settings-grid">
            <article class="setting-block">
              <span>Voce predefinita</span>
              <strong>{{ voiceLabel }}</strong>
              <div class="segmented-control" aria-label="Voce predefinita">
                <button
                  v-for="voice in spotterVoiceOptions"
                  :key="voice.id"
                  type="button"
                  :class="{ 'is-active': selectedVoice === voice.id }"
                  @click="selectVoice(voice.id)"
                >
                  {{ voice.label }}
                </button>
              </div>
            </article>

            <article class="setting-block">
              <span>Riferimenti pista</span>
              <strong>{{ referencesEnabled ? 'Attivi' : 'Disattivi' }}</strong>
              <button type="button" class="toggle-button" :class="{ 'is-active': referencesEnabled }" @click="toggleReferences">
                {{ referencesEnabled ? 'Disattiva riferimenti' : 'Attiva riferimenti' }}
              </button>
              <SessionModePicker
                :model-value="referenceSessionModes"
                label="Sessioni abilitate per i riferimenti pista"
                @update:model-value="setReferenceSessionModes"
              />
            </article>

            <article class="setting-block">
              <span>Avvisi giro</span>
              <strong>{{ coachEnabled ? 'Attivo' : 'Disattivo' }}</strong>
              <button type="button" class="toggle-button" :class="{ 'is-active': coachEnabled }" @click="toggleCoach">
                {{ coachEnabled ? 'Disattiva avvisi' : 'Attiva avvisi' }}
              </button>
              <SessionModePicker
                :model-value="lapTimeSessionModes"
                label="Sessioni abilitate per gli avvisi giro"
                @update:model-value="setLapTimeSessionModes"
              />
            </article>
          </div>
          <p class="panel-note">{{ runtimeMessage }}</p>
        </section>

        <section class="spotter-panel spotter-panel--wide">
          <header class="panel-head">
            <div>
              <span class="spotter-kicker">Riferimenti pista</span>
              <h2>{{ selectedTrack }}</h2>
            </div>
            <label class="track-select">
              Pista
              <select v-model="selectedTrack">
                <option v-for="track in availableTracks" :key="track" :value="track">{{ track }}</option>
              </select>
            </label>
          </header>

          <div class="metric-grid">
            <div class="metric-card">
              <span>Attivi</span>
              <strong>{{ activeReferences.length }}</strong>
            </div>
            <div class="metric-card">
              <span>Pronti con {{ voiceLabel }}</span>
              <strong>{{ readyReferences.length }}</strong>
            </div>
            <div class="metric-card" :class="{ 'is-warning': missingReferences > 0 }">
              <span>Da rigenerare</span>
              <strong>{{ missingReferences }}</strong>
            </div>
            <div class="metric-card">
              <span>Disattivati</span>
              <strong>{{ disabledReferences }}</strong>
            </div>
          </div>

          <div class="status-row">
            <span>{{ referenceStatusLabel }}</span>
            <button type="button" class="secondary" :disabled="catalogBusy" @click="loadCatalog">Aggiorna</button>
            <NuxtLink class="spotter-action" :to="referenceVoiceLabLink">Gestisci in Voice Lab</NuxtLink>
          </div>
          <p v-if="catalogError" class="panel-error">{{ catalogError }}</p>
        </section>

        <section v-if="isAdmin" class="spotter-panel">
          <span class="spotter-kicker">Allenamenti</span>
          <h2>Audio coach</h2>
          <p>Gli step degli allenamenti usano WAV pre-generati. La scelta voce richiede rigenerazione audio nel Voice Lab.</p>
          <NuxtLink v-if="isAdmin" class="spotter-action" to="/dev-voice-lab?section=script">Gestisci copione</NuxtLink>
          <span v-else class="locked-note">Copione allenamenti disponibile solo admin.</span>
        </section>

        <section v-if="isAdmin" class="spotter-panel">
          <span class="spotter-kicker">Voice Lab</span>
          <h2>Laboratorio audio</h2>
          <p>Modifica testi, ascolta anteprime, abilita/disabilita singole righe e genera le tracce WAV.</p>
          <NuxtLink class="spotter-action" to="/dev-voice-lab?section=references">Apri Voice Lab</NuxtLink>
        </section>
      </div>
    </section>
  </LayoutPageContainer>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

.spotter-page {
  padding: 32px 0 56px;
  color: #f7fbff;
}

.spotter-hero {
  max-width: 920px;
  margin-bottom: 28px;
}

.spotter-kicker {
  display: block;
  margin-bottom: 8px;
  color: $racing-orange;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.spotter-hero h1,
.spotter-panel h2 {
  margin: 0 0 10px;
  letter-spacing: 0;
}

.spotter-hero p,
.spotter-panel p,
.panel-note,
.locked-note {
  margin: 0;
  color: rgba(255, 255, 255, 0.68);
  line-height: 1.55;
}

.spotter-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.spotter-panel {
  display: grid;
  gap: 18px;
  padding: 22px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.035);
}

.spotter-panel--wide {
  grid-column: 1 / -1;
}

.panel-head,
.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.settings-grid,
.metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.metric-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.setting-block,
.metric-card {
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.18);
}

.setting-block span,
.metric-card span,
.track-select {
  color: rgba(255, 255, 255, 0.58);
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
}

.setting-block strong,
.metric-card strong {
  color: #fff;
  font-size: 24px;
}

.segmented-control {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.segmented-control button,
.toggle-button,
.secondary,
.track-select select {
  min-height: 38px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.07);
  color: #fff;
  font-weight: 800;
}

.segmented-control button.is-active,
.toggle-button.is-active {
  border-color: rgba(86, 211, 100, 0.55);
  background: rgba(86, 211, 100, 0.16);
}

.track-select {
  display: grid;
  gap: 6px;
}

.track-select select {
  padding: 0 10px;
}

.status-pill {
  padding: 7px 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.72);
  font-size: 12px;
  font-weight: 900;
}

.status-pill--online {
  border-color: rgba(86, 211, 100, 0.48);
  color: #d7ffe0;
}

.metric-card.is-warning {
  border-color: rgba(245, 158, 11, 0.42);
}

.spotter-action,
.secondary {
  width: fit-content;
  padding: 10px 14px;
  text-decoration: none;
}

.spotter-action {
  border-radius: 6px;
  background: linear-gradient(135deg, $racing-red, $racing-orange);
  color: #fff;
  font-weight: 800;
}

.panel-error {
  color: #fecaca;
}

@media (max-width: 900px) {
  .spotter-grid,
  .settings-grid,
  .metric-grid {
    grid-template-columns: 1fr;
  }

  .panel-head,
  .status-row {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
