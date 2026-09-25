<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ChevronDown } from '@lucide/vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { spotterVoiceOptions, useSpotterVoiceSettings } from '~/composables/useSpotterVoiceSettings'
import { useVoiceLabRuntime } from '~/composables/useVoiceLabRuntime'
import { resolveTrackVoiceReferenceAudioPath } from '~/services/spotter/trackVoiceReferences'
import { presentVoiceRuntimeMessage } from '~/services/spotter/voiceRuntimePresentation'
import { usePublicPath } from '~/composables/usePublicPath'
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
const { getPublicPath } = usePublicPath()
const voiceLabRuntime = useVoiceLabRuntime()
const {
  selectedVoice,
  pressureWarningsEnabled,
  pressureWarningSessionModes,
  togglePressureWarnings,
  setPressureWarningSessionModes,
  voiceLabel,
  referencesEnabled,
  coachEnabled,
  adaptiveCoachEnabled,
  adaptiveCoachSessionModes,
  adaptiveCoachMode,
  toggleAdaptiveCoach,
  setAdaptiveCoachSessionModes,
  setAdaptiveCoachMode,
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
    runtimeMessage.value = presentVoiceRuntimeMessage(
      data.message,
      data.state === 'online' ? 'Motore vocale online.' : 'Motore vocale non pronto.',
    )
  } catch (error: any) {
    runtimeState.value = 'offline'
    runtimeMessage.value = presentVoiceRuntimeMessage(
      error?.data?.statusMessage || error?.message,
    )
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
        <h1>Avvisi vocali</h1>
      </header>
      <div class="spotter-grid">
        <div class="spotter-main">
          <section
            class="voice-profile racing-panel"
            aria-label="Profilo operativo"
          >
            <h2>Profilo operativo</h2>
            <div
              class="voice-options"
              role="group"
              aria-label="Voce predefinita"
            >
              <button
                v-for="voice in spotterVoiceOptions"
                :key="voice.id"
                type="button"
                class="voice-card"
                :class="{ 'is-active': selectedVoice === voice.id }"
                :aria-pressed="selectedVoice === voice.id"
                @click="selectVoice(voice.id)"
              >
                <img
                  :src="getPublicPath(`/images/voices/${voice.id === 'if_sara' ? 'sara' : 'nicola'}.png`)"
                  alt=""
                />
                <span class="voice-name">{{ voice.label }}</span>
                <span class="voice-wave" aria-hidden="true"><i v-for="(height, index) in [6,14,24,38,22,12,18,10,8,25,40,28,18,12,16,8]" :key="index" :style="{ height: `${height}px` }"></i></span>
              </button>
            </div>
          </section>
          <section
            class="features racing-panel"
            aria-label="Funzionalità vocali"
          >
            <div class="feature-head">
              <span>Funzionalità</span><span>Sessioni abilitate</span>
            </div>
            <div class="feature-row">
              <h3>Riferimenti pista</h3>
              <div class="feature-control">
                <UiRacingSwitch
                  :model-value="referencesEnabled"
                  label="Riferimenti pista"
                  @update:model-value="toggleReferences"
                />
              </div>
              <SessionModePicker
                :model-value="referenceSessionModes"
                label="Sessioni abilitate per i riferimenti pista"
                @update:model-value="setReferenceSessionModes"
              />
            </div>
            <div class="feature-row">
              <h3>Feedback coach</h3>
              <div class="feature-control">
                <UiRacingSwitch
                  :model-value="adaptiveCoachEnabled"
                  label="Feedback coach"
                  @update:model-value="toggleAdaptiveCoach"
                />
                <div class="select-shell"><select
                  class="racing-select"
                  aria-label="Modalità feedback coach"
                  :value="adaptiveCoachMode"
                  :disabled="!adaptiveCoachEnabled"
                  @change="setAdaptiveCoachMode(($event.target as HTMLSelectElement).value as 'focus' | 'all')"
                >
                  <option value="focus">
                    Focus curva
                  </option><option value="all">
                    Tutte le curve
                  </option>
                </select><ChevronDown :size="14" aria-hidden="true" /></div>
              </div>
              <SessionModePicker
                :model-value="adaptiveCoachSessionModes"
                label="Sessioni abilitate per il feedback coach"
                @update:model-value="setAdaptiveCoachSessionModes"
              />
            </div>
            <div class="feature-row">
              <h3>Avvisi giro</h3>
              <div class="feature-control">
                <UiRacingSwitch
                  :model-value="coachEnabled"
                  label="Avvisi giro"
                  @update:model-value="toggleCoach"
                />
              </div>
              <SessionModePicker
                :model-value="lapTimeSessionModes"
                label="Sessioni abilitate per gli avvisi giro"
                @update:model-value="setLapTimeSessionModes"
              />
            </div>
            <div class="feature-row">
              <h3 title="Correzioni pressioni alla fine del terzo giro di ogni stint">
                Avvisi pressioni
              </h3>
              <div class="feature-control">
                <UiRacingSwitch
                  :model-value="pressureWarningsEnabled"
                  label="Avvisi pressioni"
                  @update:model-value="togglePressureWarnings"
                />
              </div>
              <SessionModePicker
                :model-value="pressureWarningSessionModes"
                label="Sessioni abilitate per gli avvisi pressioni"
                @update:model-value="setPressureWarningSessionModes"
              />
            </div>
          </section>
        </div>
        <section class="reference-panel racing-panel">
          <h2>Riferimenti pista</h2>
          <div class="select-shell"><select
            v-model="selectedTrack"
            class="racing-select"
            aria-label="Pista riferimenti"
          >
            <option
              v-for="track in availableTracks"
              :key="track"
              :value="track"
            >
              {{ track }}
            </option>
          </select><ChevronDown :size="14" aria-hidden="true" /></div>
          <dl class="reference-metrics">
            <div><dt>Attivi</dt><dd>{{ activeReferences.length }}</dd></div>
            <div><dt>Pronti con {{ voiceLabel }}</dt><dd>{{ readyReferences.length }}</dd></div>
            <div :class="{ 'is-warning': missingReferences > 0 }">
              <dt>Da rigenerare</dt><dd>{{ missingReferences }}</dd>
            </div>
            <div><dt>Disattivati</dt><dd>{{ disabledReferences }}</dd></div>
          </dl>
          <p
            v-if="catalogError"
            class="panel-error"
            role="alert"
          >
            {{ catalogError }}
          </p>
          <div class="reference-status">
            <span>{{ catalogBusy ? 'Caricamento…' : referenceStatusLabel }}</span><button
              type="button"
              :disabled="catalogBusy"
              @click="loadCatalog"
            >
              Aggiorna
            </button>
          </div>
          <NuxtLink
            class="racing-button racing-button--primary"
            :to="referenceVoiceLabLink"
          >
            Gestisci in Voice Lab
          </NuxtLink>
        </section>
      </div>
          <p
            class="runtime-status"
            role="status"
            :class="{ 'is-warning': runtimeState !== 'online' }"
          >
            {{ runtimeMessage }}
          </p>
          <nav
            v-if="isAdmin"
            class="admin-links"
            aria-label="Strumenti voce"
          >
            <NuxtLink to="/dev-voice-lab?section=script">
              Copione allenamenti
            </NuxtLink>
            <NuxtLink to="/dev-voice-lab?section=script&scenario=pressureAdjustmentNeeded">
              Personalizza avviso pressioni
            </NuxtLink>
          </nav>
    </section>
  </LayoutPageContainer>
</template>

<style lang="scss" scoped>
.spotter-page { color: #eee; padding-bottom: 32px; }
.spotter-page .racing-select { appearance: none; width: 100%; min-height: 40px; padding: 8px 34px 8px 12px; border: 1px solid #ffffff55; border-radius: 0; background: #08090b; color: #ddd; color-scheme: dark; }
.spotter-hero h1 { margin: 0 0 26px; font-size: 34px; font-weight: 650; }
.spotter-grid { display: grid; grid-template-columns: minmax(0,1fr) 300px; gap: 22px; align-items: stretch; }
.spotter-main { min-width: 0; display: flex; flex-direction: column; }.racing-panel { border: 1px solid #ffffff40; background: #00000018; }
h2 { margin: 0; padding-left: 14px; border-left: 3px solid var(--racing-race); color: var(--racing-race); font-size: 16px; font-weight: 500; text-transform: uppercase; }
.voice-profile { display: grid; grid-template-columns: 180px minmax(0,1fr); align-items: center; gap: 22px; padding: 16px; margin-bottom: 14px; }
.voice-options { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.voice-card { position: relative; height: 120px; overflow: hidden; padding: 1px; border: 0; background: #777; clip-path: polygon(10px 0,calc(100% - 10px) 0,100% 10px,100% calc(100% - 10px),calc(100% - 10px) 100%,10px 100%,0 calc(100% - 10px),0 10px); color: #fff; cursor: pointer; }
.voice-card img { width: 100%; height: 100%; object-fit: cover; filter: grayscale(1) brightness(.65); clip-path: inherit; }
.voice-card .voice-name { position: absolute; top: 20px; left: 20px; font: italic 700 22px 'Racer Display',sans-serif; text-transform: uppercase; text-shadow: 0 2px 8px #000; }
.voice-card.is-active { background: #00ec9d; }.voice-card.is-active img { filter: none; }.voice-card:focus-visible { background: #fff; outline: none; }.voice-card:hover img { filter: brightness(1.1); }
.feature-head,.feature-row { display: grid; grid-template-columns: minmax(150px,.85fr) minmax(245px,1.15fr) minmax(285px,1.35fr); gap: 22px; align-items: center; padding: 20px; }
.feature-head { padding-block: 13px; font-size: 11px; text-transform: uppercase; color: #aaa; }.feature-head span:last-child { grid-column: 3; }
.feature-row { border-top: 1px solid #ffffff25; min-height: 84px; }.feature-row h3 { margin: 0; border-left: 3px solid var(--racing-race); padding-left: 12px; font-size: 13px; font-weight: 500; text-transform: uppercase; }
.feature-control { display: flex; align-items: center; gap: 20px; min-height: 46px; border-left: 1px solid #ffffff45; padding-left: 22px; }.feature-control select { min-width: 0; width: 145px; font-size: 11px; padding-left: 10px; }
.reference-panel { padding: 24px 20px; display: flex; flex-direction: column; }.reference-panel > .select-shell { width: 100%; margin-top: 24px; }
.reference-metrics { margin: 28px 0 16px; flex: 1; display: flex; flex-direction: column; }.reference-metrics div { flex: 1; display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 70px; border-top: 1px solid #ffffff35; }.reference-metrics dt { font-size: 12px; text-transform: uppercase; color: #bfc7cc; }.reference-metrics dd { margin: 0; font-size: 26px; font-weight: 650; }
.reference-panel .racing-button { width: 100%; font-size: 13px; }.reference-status { display: flex; gap: 8px; align-items: center; justify-content: space-between; margin-bottom: 16px; font-size: 10px; color: #aaa; }.reference-status button { border: 0; background: none; color: #ddd; cursor: pointer; text-decoration: underline; }
.runtime-status { margin: 12px 0; color: #9caaa2; font-size: 11px; }.is-warning,.panel-error { color: var(--racing-qualify); }.admin-links { display: flex; gap: 20px; font-size: 11px; }.admin-links a { color: #aaa; }
@media(max-width: 1250px) { .spotter-grid { grid-template-columns: 1fr; }.reference-panel { max-width: 540px; }.feature-head,.feature-row { grid-template-columns: minmax(150px,.85fr) minmax(245px,1.15fr) minmax(285px,1.35fr); } }
@media(max-width: 780px) { .voice-profile { grid-template-columns: 1fr; }.feature-head { display: none; }.feature-row { grid-template-columns: 1fr auto; }.feature-row :deep(.session-mode-picker) { grid-column: 1 / -1; }.feature-control { justify-content: flex-end; }.voice-card { height: 110px; }.spotter-hero h1 { font-size: 28px; } }

.features { flex: 1; display: flex; flex-direction: column; }.feature-row { flex: 1; min-height: 92px; }
.feature-row :deep(.session-mode-picker) { border-left: 1px solid #ffffff45; padding-left: 22px; }
.feature-head span:last-child { border-left: 1px solid #ffffff45; padding-left: 22px; }
.select-shell { position: relative; min-width: 0; }.select-shell > svg { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); pointer-events: none; color: #ddd; }
.voice-card .voice-wave { position: absolute; left: 20px; bottom: 16px; display: flex; align-items: center; gap: 4px; height: 40px; color: #a5a5a5; }.voice-wave i { display: block; width: 2px; background: currentColor; }.voice-card.is-active .voice-wave { color: #21ff83; filter: drop-shadow(0 0 4px #21ff8340); }
@media(max-width: 1250px) { .reference-panel { max-width: none; }.reference-metrics { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); column-gap: 24px; } }
@media(max-width: 780px) { .feature-row { gap: 18px; }.feature-control { border: 0; padding-left: 0; }.feature-row :deep(.session-mode-picker) { padding: 14px 0 0; border-left: 0; border-top: 1px solid #ffffff25; }.voice-card .voice-wave { gap: 3px; left: 16px; }.reference-metrics { display: flex; } }
</style>
