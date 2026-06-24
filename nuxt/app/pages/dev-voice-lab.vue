<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAppNotifications } from '~/composables/useAppNotifications'
import { useKokoroVoiceLabLifecycle } from '~/composables/useKokoroVoiceLabLifecycle'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import type { SpotterVoiceId } from '~/composables/useSpotterVoiceSettings'
import { trainingOverlayCatalog, trainingOverlayOrder, type TrainingOverlayId } from '~/config/trainingOverlayCatalog'
import type { VoiceScript, VoiceScriptScenario, VoiceScriptStep } from '~/config/voiceScript'
import {
  LAP_TIME_AUDIO_DEFAULT_SPEED,
  LAP_TIME_AUDIO_MAX_TENTHS,
  LAP_TIME_AUDIO_MIN_TENTHS,
  buildLapTimeVoiceEntry,
  type LapTimeAudioVoice,
  type LapTimeVoiceEntry,
} from '~/services/overlay/lapTimeAnnouncer'
import { resolveTrackVoiceReferenceAudioPath } from '~/services/spotter/trackVoiceReferences'

definePageMeta({
  layout: 'dashboard'
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

interface LapTimeCatalogRow extends LapTimeVoiceEntry {
  exists: boolean
  bytes: number
  updatedAt: string | null
}

interface TrackVoicePoint {
  id: string
  track: string
  car?: string
  type?: string
  normalized_car_position: number
  label?: string
  text?: string
  audio_path?: string
  audio_voice?: string
  audio_paths?: Record<string, string>
  speed?: number
  enabled?: boolean
  timing_offset_sec?: number | null
  created_at?: string
}

interface TrackVoicePointCatalog {
  tracks: string[]
  points: TrackVoicePoint[]
}

const TTS_SERVER = 'http://localhost:5111'
const KOKORO_ITALIAN_VOICE_IDS: SpotterVoiceId[] = ['if_sara', 'im_nicola']
const KOKORO_BOOT_POLL_MS = 3000
const KOKORO_BOOT_MAX_MS = 120_000

// ─── Stato server/voci ────────────────────────────────────────────────────────
const serverVoices = ref<ServerVoice[]>([])
const serverState = ref<'checking' | 'online' | 'starting' | 'offline' | 'error'>('checking')
const serverMessage = ref('Controllo server locale...')
const previewVoiceId = ref('if_sara')
let bootPollHandle: ReturnType<typeof setTimeout> | null = null
let voiceLabMounted = false
const appNotifications = useAppNotifications()
const kokoroLifecycle = useKokoroVoiceLabLifecycle()
const voiceLabRuntime = useVoiceLabRuntime()
const route = useRoute()
const { isAdmin } = useFirebaseAuth()
const hasFullVoiceLabAccess = computed(() => isAdmin.value)
const isReferenceOnlyMode = computed(() => !hasFullVoiceLabAccess.value)

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
const pendingRegenKeys = ref<string[]>([])
const batchBusy = ref(false)
const batchStatus = ref('')
const voiceLabSection = ref<'script' | 'references'>(route.query.section === 'references' ? 'references' : 'script')

// Stato per riga (PIP-138): una sola fonte tipizzata invece di stringhe sparse.
type RowState = 'idle' | 'saving' | 'generating' | 'done' | 'error'
const rowTasks = ref<Record<string, { state: RowState; message: string }>>({})

type ToastTimer = ReturnType<typeof setTimeout>
const toastTimers: ToastTimer[] = []

// Toast grafici: feedback visibile anche scrollando (PIP-138).
const toasts = ref<Array<{ id: number; text: string; type: 'success' | 'error' }>>([])
let toastSeq = 0
function pushToast(text: string, type: 'success' | 'error') {
  const id = ++toastSeq
  toasts.value.push({ id, text, type })
  const timer = setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id) }, 3500)
  toastTimers.push(timer)
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
const previewAudioEl = ref<HTMLAudioElement | null>(null)
const previewAudioUrl = ref('')
const previewAudioObjectUrl = ref('')
const previewAudioLabel = ref('')
const previewAudioStatus = ref('')
const previewAudioError = ref('')

// ─── Libreria tempi giro (PIP-155) ───────────────────────────────────────────
const lapTimeVoiceId = ref<LapTimeAudioVoice>('if_sara')
const lapTimeSpeed = ref(LAP_TIME_AUDIO_DEFAULT_SPEED)
const lapTimeFromTenths = ref(900) // 1:30.0, punto comodo per QA rapido.
const lapTimeToTenths = ref(909) // 1:30.9
const lapTimeRows = ref<LapTimeCatalogRow[]>([])
const lapTimeCatalogBusy = ref(false)
const lapTimeCatalogStatus = ref('')
const lapTimeCatalogError = ref('')
const lapTimeGeneratingKey = ref('')
const LAP_TIME_BATCH_LIMIT = 20


function clampLapTimeRange() {
  lapTimeFromTenths.value = Math.max(LAP_TIME_AUDIO_MIN_TENTHS, Math.min(LAP_TIME_AUDIO_MAX_TENTHS, Math.floor(Number(lapTimeFromTenths.value) || LAP_TIME_AUDIO_MIN_TENTHS)))
  lapTimeToTenths.value = Math.max(LAP_TIME_AUDIO_MIN_TENTHS, Math.min(LAP_TIME_AUDIO_MAX_TENTHS, Math.floor(Number(lapTimeToTenths.value) || LAP_TIME_AUDIO_MIN_TENTHS)))
  if (lapTimeFromTenths.value > lapTimeToTenths.value) {
    lapTimeToTenths.value = lapTimeFromTenths.value
  }
}

function lapTimeClockLabel(tenths: number) {
  const totalSeconds = Math.floor(tenths / 10)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}.${tenths % 10}`
}

const lapTimeRangeCount = computed(() => Math.max(0, lapTimeToTenths.value - lapTimeFromTenths.value + 1))
const lapTimeGeneratedCount = computed(() => lapTimeRows.value.filter(row => row.exists).length)
const lapTimeBatchTooLarge = computed(() => lapTimeRangeCount.value > LAP_TIME_BATCH_LIMIT)
const lapTimePreviewEntry = computed(() => buildLapTimeVoiceEntry(lapTimeFromTenths.value, lapTimeVoiceId.value, lapTimeSpeed.value))

// ─── Riferimenti frenata per pista (PIP-204) ─────────────────────────────────
const selectedReferenceTrack = ref('Spa')
const referenceVoiceId = ref<SpotterVoiceId>('if_sara')
const referenceCatalog = ref<TrackVoicePointCatalog>({ tracks: ['Spa'], points: [] })
const referencesBusy = ref(false)
const referencesStatus = ref('')
const referencesError = ref('')
const referencesBatchBusy = ref(false)
const referenceTasks = ref<Record<string, { state: RowState; message: string }>>({})

const availableReferenceTracks = computed(() => {
  const tracks = referenceCatalog.value.tracks.length ? referenceCatalog.value.tracks : ['Spa']
  return tracks.includes('Spa') ? tracks : ['Spa', ...tracks]
})

const referenceRows = computed(() => referenceCatalog.value.points
  .filter(point => point.track === selectedReferenceTrack.value && point.type === 'braking_reference')
  .map((point, index) => ({
    ...point,
    label: point.label?.trim() || `Riferimento ${index + 1}`,
    text: point.text ?? `Riferimento ${index + 1}`,
    speed: point.speed ?? 1.15,
    audio_voice: referenceVoiceId.value,
    audio_path: referenceAudioPath(point, referenceVoiceId.value),
    timing_offset_sec: clampReferenceTimingOffset(point.timing_offset_sec),
  }))
)

function referenceAudioPath(entry: TrackVoicePoint, voice: SpotterVoiceId = referenceVoiceId.value) {
  return resolveTrackVoiceReferenceAudioPath(entry, voice)
}

function referenceRowState(entry: TrackVoicePoint): RowState {
  return referenceTasks.value[entry.id]?.state ?? 'idle'
}

function referenceRowBusy(entry: TrackVoicePoint): boolean {
  const s = referenceRowState(entry)
  return s === 'saving' || s === 'generating'
}

function patchReferenceRow(entry: TrackVoicePoint, patch: Partial<TrackVoicePoint>) {
  referenceCatalog.value = {
    ...referenceCatalog.value,
    points: referenceCatalog.value.points.map(point =>
      point.id === entry.id ? { ...point, ...patch } : point
    ),
  }
  if (referenceTasks.value[entry.id]?.state === 'done') {
    referenceTasks.value[entry.id] = { state: 'idle', message: 'Da salvare' }
  }
}

function referenceWavName(entry: TrackVoicePoint, voice: SpotterVoiceId) {
  return `${entry.id}-${voice}.wav`
}

function updateReferenceText(entry: TrackVoicePoint, event: Event) {
  patchReferenceRow(entry, { text: (event.target as HTMLTextAreaElement).value })
}

function updateReferenceSpeed(entry: TrackVoicePoint, event: Event) {
  const speed = Number((event.target as HTMLInputElement).value)
  patchReferenceRow(entry, { speed: Number.isFinite(speed) ? speed : 1.15 })
}

const REFERENCE_TIMING_OFFSETS = [-3, -2, -1, 0, 1, 2, 3]

function clampReferenceTimingOffset(value: unknown) {
  const offset = Math.round(Number(value) || 0)
  return Math.max(-3, Math.min(3, offset))
}

function referenceTimingLabel(offset: number | null | undefined) {
  const value = clampReferenceTimingOffset(offset)
  if (value < 0) return `Anticipa ${Math.abs(value)}s`
  if (value > 0) return `Ritarda ${value}s`
  return 'Puntuale'
}

function updateReferenceTimingOffset(entry: TrackVoicePoint, event: Event) {
  patchReferenceRow(entry, { timing_offset_sec: clampReferenceTimingOffset((event.target as HTMLSelectElement).value) })
}

function resetReferenceTimingOffset(entry: TrackVoicePoint) {
  patchReferenceRow(entry, { timing_offset_sec: 0 })
}

function toggleReferenceEnabled(entry: TrackVoicePoint) {
  patchReferenceRow(entry, { enabled: entry.enabled === false })
}

function setReferenceVoice(voice: SpotterVoiceId) {
  if (!KOKORO_ITALIAN_VOICE_IDS.includes(voice)) return
  referenceVoiceId.value = voice
  referencesStatus.value = `Voce riferimenti: ${voice === 'im_nicola' ? 'Nicola' : 'Sara'}. Genera tutte crea comunque Sara e Nicola.`
}

function syncReferenceVoiceFromTrack() {
  const voices = referenceCatalog.value.points
    .filter(point => point.track === selectedReferenceTrack.value && point.type === 'braking_reference')
    .map(point => point.audio_voice)
    .filter((voice): voice is SpotterVoiceId => Boolean(voice && KOKORO_ITALIAN_VOICE_IDS.includes(voice as SpotterVoiceId)))
  const uniqueVoices = Array.from(new Set(voices))
  if (uniqueVoices.length === 1) referenceVoiceId.value = uniqueVoices[0]!
}

function changeReferenceTrack() {
  syncReferenceVoiceFromTrack()
  referencesStatus.value = `${referenceRows.value.length} riferimenti caricati per ${selectedReferenceTrack.value}.`
}

async function loadReferences() {
  referencesBusy.value = true
  referencesError.value = ''
  referencesStatus.value = 'Carico riferimenti...'
  try {
    referenceCatalog.value = await voiceLabRuntime.readVoicePoints<TrackVoicePointCatalog>()
    if (!availableReferenceTracks.value.includes(selectedReferenceTrack.value)) {
      selectedReferenceTrack.value = availableReferenceTracks.value[0] || 'Spa'
    }
    syncReferenceVoiceFromTrack()
    referencesStatus.value = `${referenceRows.value.length} riferimenti caricati per ${selectedReferenceTrack.value}.`
  } catch (error: any) {
    referencesError.value = `Riferimenti non caricati: ${error?.data?.statusMessage || error?.message || 'errore'}`
  } finally {
    referencesBusy.value = false
  }
}

function referenceAudioPaths(entry: TrackVoicePoint) {
  const audioPaths = { ...(entry.audio_paths || {}) }
  if (entry.audio_path && KOKORO_ITALIAN_VOICE_IDS.includes(entry.audio_voice as SpotterVoiceId)) {
    audioPaths[entry.audio_voice as SpotterVoiceId] = entry.audio_path
  }
  return audioPaths
}

function withReferenceAudioPath(entry: TrackVoicePoint, voice: SpotterVoiceId, path: string): TrackVoicePoint {
  const audioPaths = referenceAudioPaths(entry)
  if (path) audioPaths[voice] = path
  else delete audioPaths[voice]
  return { ...entry, audio_paths: audioPaths, audio_path: path, audio_voice: voice }
}

async function saveReference(entry: TrackVoicePoint, voice: SpotterVoiceId = referenceVoiceId.value): Promise<boolean> {
  const audioPath = referenceAudioPath(entry, voice)
  const normalizedEntry = { ...entry, audio_paths: referenceAudioPaths(entry), audio_path: audioPath, audio_voice: voice, enabled: entry.enabled !== false, timing_offset_sec: clampReferenceTimingOffset(entry.timing_offset_sec) }
  referenceTasks.value[entry.id] = { state: 'saving', message: 'Salvo...' }
  try {
    await voiceLabRuntime.writeVoicePoints({ points: [normalizedEntry] })
    patchReferenceRow(entry, normalizedEntry)
    referenceTasks.value[entry.id] = { state: 'done', message: 'Salvato' }
    return true
  } catch (error: any) {
    referenceTasks.value[entry.id] = { state: 'error', message: error?.data?.statusMessage || error?.message || 'errore' }
    return false
  }
}

async function playReference(entry: TrackVoicePoint) {
  if (entry.enabled === false) return
  const text = entry.text ?? ''
  const audioPath = referenceAudioPath(entry)
  if (!text.trim() && !audioPath) return
  const label = `${entry.label || text || 'Riferimento'} - ${referenceVoiceId.value === 'im_nicola' ? 'Nicola' : 'Sara'}`
  if (audioPath) {
    await playAudioSource(`${audioPath}?t=${Date.now()}`, label)
    return
  }
  await playBlob(await synthesize(text, referenceVoiceId.value, entry.speed ?? 1.15), label)
}

async function generateReference(entry: TrackVoicePoint, voice: SpotterVoiceId = referenceVoiceId.value) {
  if (serverState.value !== 'online') return false
  const text = (entry.text ?? '').trim()
  if (entry.enabled === false || !text) {
    const skippedEntry = withReferenceAudioPath({ ...entry, text: entry.text ?? '', enabled: entry.enabled !== false }, voice, '')
    patchReferenceRow(entry, skippedEntry)
    await saveReference(skippedEntry, voice)
    referenceTasks.value[entry.id] = { state: 'done', message: entry.enabled === false ? 'Disattivato' : 'Vuoto' }
    return true
  }
  referenceTasks.value[entry.id] = { state: 'generating', message: `Genero ${voice}...` }
  kokoroLifecycle.beginWork()
  try {
    const blob = await synthesize(text, voice, entry.speed ?? 1.15)
    const response = await voiceLabRuntime.saveReferenceWav({
      track: entry.track,
      filename: referenceWavName(entry, voice),
      dataBase64: await blobToBase64(blob),
    })
    const savedEntry = withReferenceAudioPath({ ...entry, enabled: true }, voice, response.path)
    patchReferenceRow(entry, savedEntry)
    await saveReference(savedEntry, voice)
    referenceTasks.value[entry.id] = { state: 'done', message: `WAV ${voice === 'im_nicola' ? 'Nicola' : 'Sara'} aggiornato` }
    pushToast(`${entry.label || entry.text}: WAV ${voice === 'im_nicola' ? 'Nicola' : 'Sara'} generato`, 'success')
    return true
  } catch (error: any) {
    referenceTasks.value[entry.id] = { state: 'error', message: error?.data?.statusMessage || error?.message || 'errore' }
    pushToast('Generazione riferimento fallita', 'error')
    return false
  } finally {
    kokoroLifecycle.endWork()
    handleKokoroWorkSettled()
  }
}

function latestReferenceRow(id: string) {
  return referenceRows.value.find(point => point.id === id)
}

async function resetAllReferenceTimingOffsets() {
  if (referencesBatchBusy.value || !referenceRows.value.length) return
  referencesBatchBusy.value = true
  referencesError.value = ''
  let ok = 0
  try {
    for (const row of referenceRows.value) {
      const current = latestReferenceRow(row.id) || row
      const resetEntry = { ...current, timing_offset_sec: 0 }
      patchReferenceRow(current, { timing_offset_sec: 0 })
      if (await saveReference(resetEntry)) ok += 1
    }
    referencesStatus.value = `Timing ripristinato su ${ok}/${referenceRows.value.length} riferimenti.`
    if (ok === referenceRows.value.length) pushToast(`Timing riferimenti ${selectedReferenceTrack.value}: reset a 0s`, 'success')
  } finally {
    referencesBatchBusy.value = false
  }
}

async function generateAllReferences() {
  if (serverState.value !== 'online' || referencesBatchBusy.value || !referenceRows.value.length) return
  referencesBatchBusy.value = true
  referencesError.value = ''
  let ok = 0
  const total = referenceRows.value.length * KOKORO_ITALIAN_VOICE_IDS.length
  try {
    for (let i = 0; i < referenceRows.value.length; i += 1) {
      const rowId = referenceRows.value[i]!.id
      for (const voice of KOKORO_ITALIAN_VOICE_IDS) {
        const current = latestReferenceRow(rowId) || referenceRows.value[i]!
        referencesStatus.value = `Genero riferimenti ${ok + 1}/${total}...`
        if (await generateReference(current, voice)) ok += 1
      }
    }
    referencesStatus.value = `Generate ${ok}/${total} tracce Sara e Nicola per ${selectedReferenceTrack.value}.`
    if (ok === total) pushToast(`Riferimenti ${selectedReferenceTrack.value}: WAV Sara e Nicola generati`, 'success')
    else pushToast(`Generate ${ok}/${total}: controlla le righe in errore`, 'error')
  } finally {
    referencesBatchBusy.value = false
  }
}
async function loadLapTimeCatalog() {
  clampLapTimeRange()
  lapTimeCatalogBusy.value = true
  lapTimeCatalogError.value = ''
  lapTimeCatalogStatus.value = 'Carico libreria tempi...'
  try {
    const query = new URLSearchParams({
      voice: lapTimeVoiceId.value,
      fromTenths: String(lapTimeFromTenths.value),
      toTenths: String(lapTimeToTenths.value),
    })
    const data = await $fetch<{ entries: LapTimeCatalogRow[] }>(`/api/dev/lap-time-voice-catalog?${query.toString()}`)
    lapTimeRows.value = data.entries
    lapTimeCatalogStatus.value = `${lapTimeGeneratedCount.value}/${lapTimeRows.value.length} WAV pronti nella vista.`
  } catch (error: any) {
    lapTimeCatalogError.value = `Libreria tempi non caricata: ${error?.data?.statusMessage || error?.message || 'errore'}`
    lapTimeRows.value = []
  } finally {
    lapTimeCatalogBusy.value = false
    handleKokoroWorkSettled()
  }
}

async function playLapTimeEntry(entry: LapTimeCatalogRow | LapTimeVoiceEntry) {
  if (isSpeaking.value) return
  const needsSynthesis = !('exists' in entry) || !entry.exists
  if (needsSynthesis && serverState.value !== 'online') {
    lapTimeCatalogError.value = 'Per ascoltare una traccia mancante serve Kokoro online.'
    return
  }
  isSpeaking.value = true
  kokoroLifecycle.beginWork()
  lapTimeCatalogError.value = ''
  const label = `${lapTimeClockLabel(entry.tenths)} - ${lapTimeVoiceId.value === 'if_sara' ? 'Sara' : 'Nicola'}`
  try {
    if ('exists' in entry && entry.exists) {
      await playAudioSource(`${entry.path}?t=${Date.now()}`, label)
    } else {
      await playBlob(await synthesize(entry.text, lapTimeVoiceId.value, lapTimeSpeed.value), label)
    }
  } catch (error: any) {
    lapTimeCatalogError.value = `Ascolto tempo non riuscito: ${error?.message || 'errore'}`
  } finally {
    isSpeaking.value = false
    kokoroLifecycle.endWork()
    handleKokoroWorkSettled()
  }
}

async function generateLapTimeRange(fromTenths: number, toTenths: number, force = true) {
  if (serverState.value !== 'online' || lapTimeCatalogBusy.value) return
  const count = toTenths - fromTenths + 1
  if (count > LAP_TIME_BATCH_LIMIT) {
    lapTimeCatalogError.value = `Batch troppo grande: massimo ${LAP_TIME_BATCH_LIMIT} tracce per richiesta.`
    return
  }
  lapTimeCatalogBusy.value = true
  kokoroLifecycle.beginWork()
  lapTimeCatalogError.value = ''
  lapTimeCatalogStatus.value = `Genero ${count} tracce tempo...`
  try {
    await $fetch('/api/dev/lap-time-voice-generate', {
      method: 'POST',
      body: {
        voice: lapTimeVoiceId.value,
        fromTenths,
        toTenths,
        speed: lapTimeSpeed.value,
        force,
      },
    })
    lapTimeCatalogStatus.value = `Generate ${count} tracce tempo.`
    pushToast(`Tempi giro rigenerati (${count})`, 'success')
    await loadLapTimeCatalog()
  } catch (error: any) {
    lapTimeCatalogError.value = `Generazione tempi fallita: ${error?.data?.statusMessage || error?.message || 'errore'}`
    pushToast('Generazione tempi giro fallita', 'error')
  } finally {
    lapTimeCatalogBusy.value = false
    kokoroLifecycle.endWork()
    handleKokoroWorkSettled()
  }
}

async function generateLapTimeEntry(entry: LapTimeCatalogRow) {
  lapTimeGeneratingKey.value = entry.key
  try {
    await generateLapTimeRange(entry.tenths, entry.tenths, true)
  } finally {
    lapTimeGeneratingKey.value = ''
  }
}

async function generateVisibleLapTimes() {
  clampLapTimeRange()
  await generateLapTimeRange(lapTimeFromTenths.value, lapTimeToTenths.value, true)
}

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

const visibleEntries = computed(() => stepRows.value
  .map(row => row.entry)
  .filter((entry): entry is VoiceScriptStep => Boolean(entry)))

const pendingVisibleEntries = computed(() =>
  visibleEntries.value.filter(entry => pendingRegenKeys.value.includes(rowKey(entry)))
)

const mainSaveLabel = computed(() => {
  if (batchBusy.value) return 'Rigenero modifiche...'
  if (pendingVisibleEntries.value.length > 0) return `Salva e rigenera modifiche (${pendingVisibleEntries.value.length})`
  if (scriptDirty.value) return 'Salva copione'
  return 'Tutto salvato'
})

const mainSaveDisabled = computed(() => {
  if (batchBusy.value) return true
  if (pendingVisibleEntries.value.length > 0) return serverState.value !== 'online'
  return !scriptDirty.value
})

function stepWavName(entry: VoiceScriptStep, voice: string) {
  return `step-${entry.trainingId}-${entry.modeId}-${entry.stepId}-${voice}.wav`
}

function scenarioWavName(entry: VoiceScriptScenario, voice: string) {
  return `${entry.id}-${voice}.wav`
}

function rowKey(entry: VoiceScriptStep | VoiceScriptScenario) {
  return 'stepId' in entry ? `${entry.trainingId}/${entry.modeId}/${entry.stepId}` : `scenario/${entry.id}`
}

function markPendingRegen(entry: VoiceScriptStep | VoiceScriptScenario) {
  const key = rowKey(entry)
  if (!pendingRegenKeys.value.includes(key)) pendingRegenKeys.value = [...pendingRegenKeys.value, key]
  if (rowTasks.value[key]?.state === 'done') rowTasks.value[key] = { state: 'idle', message: 'Da rigenerare' }
}

function clearPendingRegen(entry: VoiceScriptStep | VoiceScriptScenario) {
  const key = rowKey(entry)
  pendingRegenKeys.value = pendingRegenKeys.value.filter(k => k !== key)
}

function markDirty(entry?: VoiceScriptStep | VoiceScriptScenario) {
  scriptDirty.value = true
  batchStatus.value = ''
  if (entry) markPendingRegen(entry)
}

// ─── Server Kokoro: stato + autostart ────────────────────────────────────────
async function probeServer(): Promise<'ready' | 'warming' | 'error' | 'offline'> {
  try {
    const data = await voiceLabRuntime.kokoroReady() as { state: 'online' | 'starting' | 'offline' | 'error'; message?: string; voices?: ServerVoice[] }
    serverMessage.value = data.message || serverMessage.value
    if (data.state === 'online') {
      const voices = Array.isArray(data.voices) ? data.voices : []
      serverVoices.value = voices.filter((v: ServerVoice) => KOKORO_ITALIAN_VOICE_IDS.includes(v.id as SpotterVoiceId))
      return serverVoices.value.length > 0 ? 'ready' : 'error'
    }
    serverVoices.value = []
    if (data.state === 'starting') return 'warming'
    return data.state
  } catch {
    serverVoices.value = []
    return 'offline'
  }
}

async function ensureKokoro() {
  serverState.value = 'checking'
  serverMessage.value = 'Controllo motore vocale...'
  const initialProbe = await probeServer()
  if (initialProbe === 'ready') {
    serverState.value = 'online'
    serverMessage.value = `Sara e Nicola pronte su ${TTS_SERVER}: sintesi verificata.`
    appNotifications.push('Motore vocale Kokoro online.', 'success')
    return
  }
  if (initialProbe === 'warming') {
    serverState.value = 'starting'
    startBootTimer()
  }

  // Autostart (PIP-100): il dev server lancia Kokoro come processo figlio.
  if (initialProbe !== 'warming') {
    serverState.value = 'starting'
    serverMessage.value = 'Avvio Kokoro e scaldo il modello con una sintesi reale...'
    startBootTimer()
    try {
      const startResult = await voiceLabRuntime.kokoroStart() as { status?: string; message?: string }
      if (startResult?.status === 'error') throw new Error(startResult.message || 'Avvio Kokoro fallito')
    } catch (error: any) {
      stopBootTimer()
      serverState.value = 'error'
      serverMessage.value = `Avvio automatico fallito: ${error?.data?.statusMessage || error?.message || 'errore'}. Dettagli in kokoro_tts_err.log.`
      return
    }
  }

  const deadline = Date.now() + KOKORO_BOOT_MAX_MS
  const poll = async () => {
    const probe = await probeServer()
    if (probe === 'ready') {
      stopBootTimer()
      serverState.value = 'online'
      serverMessage.value = `Sara e Nicola pronte su ${TTS_SERVER}: sintesi verificata.`
      appNotifications.push('Motore vocale Kokoro online.', 'success')
      return
    }
    if (probe === 'error') {
      stopBootTimer()
      serverState.value = 'error'
      return
    }
    if (Date.now() > deadline) {
      stopBootTimer()
      serverState.value = 'offline'
      serverMessage.value = 'Il motore vocale non ha completato il warmup in tempo. Dettagli in kokoro_tts_err.log.'
      return
    }
    bootPollHandle = setTimeout(poll, KOKORO_BOOT_POLL_MS)
  }
  bootPollHandle = setTimeout(poll, KOKORO_BOOT_POLL_MS)
}

function handleKokoroWorkSettled() {
  if (!voiceLabMounted) {
    kokoroLifecycle.scheduleShutdown('work-complete')
  }
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

async function saveScript() {
  if (!script.value) return
  scriptStatus.value = 'Salvataggio...'
  try {
    await $fetch('/api/dev/voice-script', { method: 'POST', body: script.value })
    scriptDirty.value = false
    scriptStatus.value = 'Copione salvato.'
  } catch (error: any) {
    scriptStatus.value = `Salvataggio fallito: ${error?.data?.statusMessage || error?.message || 'errore'}`
  }
}

// ─── Sintesi: ascolto e rigenerazione ────────────────────────────────────────
function kokoroSpeakUrl(text: string, voice: string, speed: number) {
  return voiceLabRuntime.kokoroSpeakUrl(text, voice, speed)
}

async function synthesize(text: string, voice: string, speed: number): Promise<Blob> {
  return await voiceLabRuntime.synthesize(text, voice, speed)
}

function revokePreviewAudio() {
  if (previewAudioObjectUrl.value) {
    URL.revokeObjectURL(previewAudioObjectUrl.value)
    previewAudioObjectUrl.value = ''
  }
  previewAudioUrl.value = ''
}

async function playBlob(blob: Blob, label: string) {
  const audioUrl = URL.createObjectURL(blob)
  await playAudioSource(audioUrl, label, true)
}

async function playAudioSource(sourceUrl: string, label: string, isObjectUrl = false) {
  if (activeServerAudio.value) {
    activeServerAudio.value.pause()
    activeServerAudio.value.currentTime = 0
  }

  revokePreviewAudio()
  if (isObjectUrl) previewAudioObjectUrl.value = sourceUrl
  previewAudioError.value = ''
  previewAudioLabel.value = label
  previewAudioStatus.value = 'Audio pronto. Provo a riprodurlo...'
  previewAudioUrl.value = sourceUrl
  await nextTick()

  const audio = previewAudioEl.value
  if (!audio) {
    previewAudioStatus.value = 'Audio pronto nel player.'
    previewAudioError.value = 'Player non inizializzato: usa il controllo audio appena compare.'
    return
  }

  activeServerAudio.value = audio

  try {
    audio.currentTime = 0
    audio.load()
    audio.onended = () => {
      previewAudioStatus.value = 'Audio completato.'
    }
    audio.onerror = () => {
      const code = audio.error?.code ? ` codice ${audio.error.code}` : ''
      previewAudioStatus.value = 'Audio non riproducibile.'
      previewAudioError.value = `Il player non riesce a leggere questa sorgente audio${code}.`
    }
    await audio.play()
    const duration = Number.isFinite(audio.duration) ? ` (${audio.duration.toFixed(1)}s)` : ''
    previewAudioStatus.value = `Riproduzione in corso${duration}.`
  } catch (error: any) {
    if (error?.name === 'NotAllowedError') {
      previewAudioStatus.value = 'Audio pronto nel player. Premi Play se il browser non lo avvia automaticamente.'
      previewAudioError.value = ''
      return
    }
    previewAudioStatus.value = 'Audio pronto nel player.'
    previewAudioError.value = `Riproduzione automatica non riuscita: ${error?.message || 'errore'}. Kokoro ha generato il WAV; prova il player manuale.`
  }
}

async function playText(text: string, speed: number, label = 'Anteprima') {
  if (serverState.value !== 'online' || isSpeaking.value || !text.trim()) return
  isSpeaking.value = true
  kokoroLifecycle.beginWork()
  statusMessage.value = ''
  previewAudioError.value = ''
  previewAudioLabel.value = label
  previewAudioStatus.value = 'Genero anteprima...'
  try {
    await playBlob(await synthesize(text.trim(), previewVoiceId.value, speed), label)
  } catch (error: any) {
    previewAudioStatus.value = ''
    previewAudioError.value = `Sintesi non riuscita: ${error?.message || 'errore'}`
    statusMessage.value = previewAudioError.value
  } finally {
    isSpeaking.value = false
    kokoroLifecycle.endWork()
    handleKokoroWorkSettled()
  }
}

async function playEntry(entry: VoiceScriptStep | VoiceScriptScenario) {
  const label = 'stepId' in entry
    ? `${entry.trainingId} / ${entry.modeId} / ${entry.stepId} - ${previewVoiceId.value === 'if_sara' ? 'Sara' : 'Nicola'}`
    : `${entry.id} - ${previewVoiceId.value === 'if_sara' ? 'Sara' : 'Nicola'}`
  await playText(entry.text, entry.speed ?? script.value?.defaultSpeed ?? 1.15, label)
}

async function playCustom() {
  await playText(customText.value, speechSpeed.value, `Prova libera - ${previewVoiceId.value === 'if_sara' ? 'Sara' : 'Nicola'}`)
}


function stopVoice() {
  if (activeServerAudio.value) {
    activeServerAudio.value.onended = null
    activeServerAudio.value.pause()
    activeServerAudio.value.currentTime = 0
    activeServerAudio.value = null
  }
  if (previewAudioEl.value) {
    previewAudioEl.value.pause()
    previewAudioEl.value.currentTime = 0
  }
  previewAudioStatus.value = previewAudioUrl.value ? 'Audio fermato. Puoi riascoltarlo dal player.' : ''
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
async function saveAndRegenerate(
  entry: VoiceScriptStep | VoiceScriptScenario,
  options: { toast?: boolean } = {}
): Promise<boolean> {
  if (serverState.value !== 'online') return false
  const shouldToast = options.toast ?? true
  const key = rowKey(entry)
  const label = 'stepId' in entry ? entry.stepId : entry.id
  kokoroLifecycle.beginWork()
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
    clearPendingRegen(entry)
    if (shouldToast) pushToast(`${label}: WAV rigenerato ✓`, 'success')
    handleKokoroWorkSettled()
    kokoroLifecycle.endWork()
    return true
  } catch (error: any) {
    const msg = error?.data?.statusMessage || error?.message || 'sintesi fallita'
    rowTasks.value[key] = { state: 'error', message: `Errore: ${msg}` }
    if (shouldToast) pushToast(`${label}: rigenerazione fallita`, 'error')
    handleKokoroWorkSettled()
    kokoroLifecycle.endWork()
    return false
  }
}

async function saveAndRegeneratePendingVisible() {
  if (serverState.value !== 'online' || batchBusy.value) return
  const entries = pendingVisibleEntries.value
  if (!entries.length) return

  batchBusy.value = true
  batchStatus.value = `Rigenerazione modifiche: 0/${entries.length}`
  let ok = 0
  try {
    for (let i = 0; i < entries.length; i++) {
      batchStatus.value = `Rigenerazione modifiche: ${i + 1}/${entries.length}`
      if (await saveAndRegenerate(entries[i]!, { toast: false })) ok += 1
    }
    batchStatus.value = `${ok}/${entries.length} rigenerate`
    if (ok === entries.length) pushToast(`Modifiche sezione rigenerate ✓ (${ok})`, 'success')
    else pushToast(`Rigenerate ${ok}/${entries.length}: controlla le righe in errore`, 'error')
  } finally {
    batchBusy.value = false
    handleKokoroWorkSettled()
  }
}

async function saveMainChanges() {
  if (pendingVisibleEntries.value.length > 0) {
    await saveAndRegeneratePendingVisible()
    return
  }
  await saveScript()
}

watch(isReferenceOnlyMode, (referenceOnly) => {
  if (referenceOnly) voiceLabSection.value = 'references'
}, { immediate: true })

onMounted(async () => {
  voiceLabMounted = true
  kokoroLifecycle.enterVoiceLab()
  await nextTick()
  if (hasFullVoiceLabAccess.value) {
    await Promise.all([ensureKokoro(), loadScript(), loadReferences()])
    await loadLapTimeCatalog()
    return
  }
  await Promise.all([ensureKokoro(), loadReferences()])
})

onBeforeUnmount(() => {
  voiceLabMounted = false
  kokoroLifecycle.leaveVoiceLab()
  stopVoice()
  revokePreviewAudio()
  stopBootTimer()
  if (bootPollHandle) clearTimeout(bootPollHandle)
  for (const timer of toastTimers) clearTimeout(timer)
})
</script>

<template>
  <LayoutPageContainer>
    <section class="voice-lab">
      <header class="voice-hero">
        <div>
          <span class="voice-kicker">Motore vocale</span>
          <h1>Kokoro Voice Lab</h1>
          <p v-if="hasFullVoiceLabAccess">
            Editor del copione vocale dell'overlay: modifica una frase, ascoltala e rigenera i WAV
            senza toccare codice. Fonte unica: <code>app/config/voiceScript.json</code>.
            Server locale su <code>{{ TTS_SERVER }}</code> (avvio automatico).
          </p>
          <p v-else>
            Gestisci le tracce audio dei riferimenti pista. Il motore vocale Kokoro viene avviato localmente quando serve generare o ascoltare un riferimento.
          </p>
        </div>
        <div class="server-card" :class="`server-card--${serverState === 'starting' ? 'checking' : serverState}`" data-testid="voice-lab-server-card">
          <span class="server-card__label"><i class="server-dot" :class="`server-dot--${serverState}`" />Motore vocale</span>
          <strong>{{ serverState === 'online' ? 'Online' : serverState === 'offline' ? 'Offline' : serverState === 'error' ? 'Errore' : `Avvio… ${bootElapsed}s` }}</strong>
          <p>{{ serverMessage }}</p>
          <p v-if="serverState !== 'online'" class="server-hint">«Ascolta» e «Salva e rigenera» sono attivi solo a motore <strong>Online</strong>.</p>
          <button v-if="serverState !== 'online'" type="button" :disabled="serverState === 'checking' || serverState === 'starting'" @click="ensureKokoro">
            {{ serverState === 'starting' || serverState === 'checking' ? 'Avvio in corso…' : 'Riprova avvio' }}
          </button>
        </div>
      </header>

      <nav v-if="hasFullVoiceLabAccess" class="lab-section-tabs" aria-label="Voice Lab sezioni">
        <button type="button" :class="{ 'is-active': voiceLabSection === 'script' }" @click="voiceLabSection = 'script'">Copione</button>
        <button type="button" :class="{ 'is-active': voiceLabSection === 'references' }" @click="voiceLabSection = 'references'">Riferimenti</button>
      </nav>

      <section v-if="hasFullVoiceLabAccess && voiceLabSection === 'script'" class="script-editor">
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
          <button type="button" class="primary save-btn" :disabled="mainSaveDisabled" @click="saveMainChanges">
            {{ mainSaveLabel }}
          </button>
        </div>
        <p v-if="scriptStatus" class="status-message">{{ scriptStatus }}</p>
        <p v-if="batchStatus" class="status-message status-message--compact">{{ batchStatus }}</p>

        <section v-if="previewAudioStatus || previewAudioError || previewAudioUrl" class="audio-preview">
          <div>
            <span class="voice-kicker">Ultima anteprima</span>
            <strong>{{ previewAudioLabel || 'Nessuna anteprima' }}</strong>
            <p v-if="previewAudioStatus">{{ previewAudioStatus }}</p>
            <p v-if="previewAudioError" class="audio-preview__error">{{ previewAudioError }}</p>
          </div>
          <audio
            v-if="previewAudioUrl"
            ref="previewAudioEl"
            controls
            :src="previewAudioUrl"
            @play="previewAudioStatus = 'Riproduzione in corso.'"
            @ended="previewAudioStatus = 'Audio completato.'"
          />
        </section>

        <div v-if="!script" class="empty-state">Carico il copione...</div>

        <div v-else class="phrase-rows">
          <article v-for="row in stepRows" :key="row.step.id" class="phrase-row">
            <header>
              <span class="step-order">{{ row.index + 1 }}</span>
              <strong>{{ row.step.title }}</strong>
              <small>{{ row.step.durationMinutes }} min</small>
            </header>
            <template v-if="row.entry">
              <textarea v-model="row.entry.text" rows="2" maxlength="280" @input="markDirty(row.entry)" />
              <footer>
                <label>
                  Velocità
                  <input v-model.number="row.entry.speed" type="number" min="0.8" max="1.5" step="0.02" :placeholder="String(script.defaultSpeed)" @input="markDirty(row.entry)">
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
              <textarea v-model="entry.text" rows="2" maxlength="280" @input="markDirty(entry)" />
              <footer>
                <label>
                  Velocità
                  <input v-model.number="entry.speed" type="number" min="0.8" max="1.5" step="0.02" @input="markDirty(entry)">
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

      <section v-else class="reference-editor" data-testid="voice-reference-editor">
        <div class="panel-head">
          <div>
            <span class="voice-kicker">Riferimenti frenata</span>
            <h2>Riferimenti</h2>
            <p>Seleziona la pista e genera le tracce audio Sara e Nicola dai punti registrati in allenamento.</p>
          </div>
          <div class="reference-track-select">
            <label>
              Pista
              <select v-model="selectedReferenceTrack" @change="changeReferenceTrack">
                <option v-for="track in availableReferenceTracks" :key="track" :value="track">{{ track }}</option>
              </select>
            </label>
            <div class="voice-toggle voice-toggle--compact">
              <span>Voce</span>
              <button type="button" :class="{ 'is-active': referenceVoiceId === 'if_sara' }" :disabled="referencesBatchBusy" @click="setReferenceVoice('if_sara')">Sara</button>
              <button type="button" :class="{ 'is-active': referenceVoiceId === 'im_nicola' }" :disabled="referencesBatchBusy" @click="setReferenceVoice('im_nicola')">Nicola</button>
            </div>
            <button type="button" class="secondary" :disabled="referencesBusy || referencesBatchBusy" @click="loadReferences">Aggiorna</button>
            <button type="button" class="secondary" :disabled="referencesBusy || referencesBatchBusy || !referenceRows.length" @click="resetAllReferenceTimingOffsets">Reset timing</button>
            <button type="button" class="primary" :disabled="serverState !== 'online' || referencesBatchBusy || !referenceRows.length" @click="generateAllReferences">
              {{ referencesBatchBusy ? 'Genero...' : 'Genera Sara + Nicola' }}
            </button>
          </div>
        </div>

        <section v-if="previewAudioStatus || previewAudioError || previewAudioUrl" class="audio-preview">
          <div>
            <span class="voice-kicker">Ultima anteprima</span>
            <strong>{{ previewAudioLabel || 'Nessuna anteprima' }}</strong>
            <p v-if="previewAudioStatus">{{ previewAudioStatus }}</p>
            <p v-if="previewAudioError" class="audio-preview__error">{{ previewAudioError }}</p>
          </div>
          <audio
            v-if="previewAudioUrl"
            ref="previewAudioEl"
            controls
            :src="previewAudioUrl"
            @play="previewAudioStatus = 'Riproduzione in corso.'"
            @ended="previewAudioStatus = 'Audio completato.'"
          />
        </section>

        <p v-if="referencesStatus" class="status-message status-message--compact">{{ referencesStatus }}</p>
        <p v-if="referencesError" class="status-message status-message--compact">{{ referencesError }}</p>

        <div v-if="!referenceRows.length" class="empty-state">Nessun riferimento registrato per {{ selectedReferenceTrack }}.</div>
        <div v-else class="reference-rows">
          <article v-for="(entry, index) in referenceRows" :key="entry.id" class="reference-row">
            <header>
              <span class="step-order">{{ index + 1 }}</span>
              <div>
                <strong>{{ entry.label }}</strong>
                <small v-if="hasFullVoiceLabAccess">posizione {{ entry.normalized_car_position.toFixed(5) }} · {{ entry.car || 'auto n/d' }}</small>
              </div>
              <span class="lap-time-state" :class="{ 'is-ready': Boolean(entry.audio_path) && entry.enabled !== false }">
                {{ entry.enabled === false ? 'Disattivo' : entry.audio_path ? 'WAV pronto' : 'Manca WAV per voce' }}
              </span>
            </header>
            <textarea :value="entry.text" rows="2" maxlength="280" @input="updateReferenceText(entry, $event)" />
            <footer>
              <label>
                Velocita
                <input :value="entry.speed" type="number" min="0.8" max="1.5" step="0.02" @input="updateReferenceSpeed(entry, $event)">
              </label>
              <span class="reference-control-divider" aria-hidden="true"></span>
              <label>
                Timing
                <select :value="clampReferenceTimingOffset(entry.timing_offset_sec)" @change="updateReferenceTimingOffset(entry, $event)">
                  <option v-for="offset in REFERENCE_TIMING_OFFSETS" :key="offset" :value="offset">
                    {{ referenceTimingLabel(offset) }}
                  </option>
                </select>
              </label>
              <span class="reference-control-divider" aria-hidden="true"></span>
              <button type="button" class="secondary" :disabled="referenceRowBusy(entry) || clampReferenceTimingOffset(entry.timing_offset_sec) === 0" @click="resetReferenceTimingOffset(entry)">Reset</button>
              <span class="reference-control-divider" aria-hidden="true"></span>
              <button type="button" :class="{ 'is-active': entry.enabled !== false }" :disabled="referenceRowBusy(entry)" @click="toggleReferenceEnabled(entry)">
                {{ entry.enabled === false ? 'Disattivo' : 'Attivo' }}
              </button>

              <span class="row-status" :class="`row-status--${referenceRowState(entry)}`">{{ referenceTasks[entry.id]?.message || '' }}</span>
              <button type="button" :disabled="entry.enabled === false || isSpeaking || (!entry.audio_path && (!entry.text?.trim() || serverState !== 'online'))" @click="playReference(entry)">Ascolta</button>
              <button type="button" :disabled="referenceRowBusy(entry)" @click="saveReference(entry)">Salva</button>
              <button type="button" class="primary" :disabled="serverState !== 'online' || referencesBatchBusy || referenceRowBusy(entry)" @click="generateReference(entry)">
                {{ referenceRowBusy(entry) ? '...' : 'Genera voce' }}
              </button>
            </footer>
          </article>
        </div>
      </section>

      <section v-if="hasFullVoiceLabAccess" class="lap-time-library" data-testid="lap-time-library">
        <div class="panel-head">
          <div>
            <span class="voice-kicker">Tempi giro</span>
            <h2>Libreria audio pre-generata</h2>
            <p>
              Range runtime: {{ lapTimeClockLabel(LAP_TIME_AUDIO_MIN_TENTHS) }} - {{ lapTimeClockLabel(LAP_TIME_AUDIO_MAX_TENTHS) }}.
              Il testo e' read-only: per cambiarne la formula serve una modifica codice.
            </p>
          </div>
          <div class="play-actions">
            <button type="button" class="secondary" :disabled="lapTimeCatalogBusy" @click="loadLapTimeCatalog">Aggiorna</button>
            <button
              type="button"
              class="primary"
              :disabled="serverState !== 'online' || lapTimeCatalogBusy || lapTimeBatchTooLarge"
              @click="generateVisibleLapTimes"
            >
              {{ lapTimeCatalogBusy ? 'Genero...' : 'Rigenera vista' }}
            </button>
          </div>
        </div>

        <div class="lap-time-controls">
          <div class="voice-toggle">
            <span>Voce</span>
            <button type="button" :class="{ 'is-active': lapTimeVoiceId === 'if_sara' }" @click="lapTimeVoiceId = 'if_sara'; loadLapTimeCatalog()">Sara</button>
            <button type="button" :class="{ 'is-active': lapTimeVoiceId === 'im_nicola' }" @click="lapTimeVoiceId = 'im_nicola'; loadLapTimeCatalog()">Nicola</button>
          </div>
          <label>
            Da
            <input v-model.number="lapTimeFromTenths" type="number" :min="LAP_TIME_AUDIO_MIN_TENTHS" :max="LAP_TIME_AUDIO_MAX_TENTHS" step="1" @change="loadLapTimeCatalog">
            <strong>{{ lapTimeClockLabel(lapTimeFromTenths) }}</strong>
          </label>
          <label>
            A
            <input v-model.number="lapTimeToTenths" type="number" :min="LAP_TIME_AUDIO_MIN_TENTHS" :max="LAP_TIME_AUDIO_MAX_TENTHS" step="1" @change="loadLapTimeCatalog">
            <strong>{{ lapTimeClockLabel(lapTimeToTenths) }}</strong>
          </label>
          <label>
            Velocita
            <input v-model.number="lapTimeSpeed" type="range" min="0.8" max="1.5" step="0.02">
            <strong>{{ lapTimeSpeed.toFixed(2) }}x</strong>
          </label>
        </div>

        <div class="lap-time-summary">
          <span>{{ lapTimeGeneratedCount }}/{{ lapTimeRows.length }} WAV pronti</span>
          <span>{{ lapTimeRangeCount }} tracce nella vista</span>
          <span v-if="lapTimeBatchTooLarge" class="lap-time-warning">Batch UI massimo: {{ LAP_TIME_BATCH_LIMIT }}</span>
          <span v-else>Batch UI pronto</span>
        </div>
        <p v-if="lapTimeCatalogStatus" class="status-message status-message--compact">{{ lapTimeCatalogStatus }}</p>
        <p v-if="lapTimeCatalogError" class="status-message status-message--compact">{{ lapTimeCatalogError }}</p>

        <article class="lap-time-preview">
          <div>
            <span class="voice-kicker">Esempio formula</span>
            <strong>{{ lapTimeClockLabel(lapTimePreviewEntry.tenths) }}</strong>
            <p>{{ lapTimePreviewEntry.text }}</p>
          </div>
          <button type="button" :disabled="serverState !== 'online' || isSpeaking" @click="playLapTimeEntry(lapTimePreviewEntry)">Ascolta esempio</button>
        </article>

        <div class="lap-time-rows">
          <article v-for="entry in lapTimeRows" :key="`${entry.key}-${entry.voice}`" class="lap-time-row" :class="{ 'is-missing': !entry.exists }">
            <div>
              <strong>{{ lapTimeClockLabel(entry.tenths) }}</strong>
              <p>{{ entry.text }}</p>
            </div>
            <span class="lap-time-state" :class="{ 'is-ready': entry.exists }">
              {{ entry.exists ? 'WAV pronto' : 'Manca WAV' }}
            </span>
            <div class="play-actions">
              <button type="button" :disabled="isSpeaking || (!entry.exists && serverState !== 'online')" @click="playLapTimeEntry(entry)">Ascolta</button>
              <button
                type="button"
                class="primary"
                :disabled="serverState !== 'online' || lapTimeCatalogBusy"
                @click="generateLapTimeEntry(entry)"
              >
                {{ lapTimeGeneratingKey === entry.key ? '...' : 'Rigenera' }}
              </button>
            </div>
          </article>
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
.reference-editor,
.lap-time-library,
.playground,
.server-card {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.035);
}

.voice-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 320px);
  gap: 18px;
  align-items: stretch;
  padding: 24px;
  border-radius: $radius-lg;

  h1 {
    margin: 8px 0 10px;
    color: #fff;
    font-size: 34px;
    line-height: 1;
    letter-spacing: 0;
  }

  p {
    max-width: 820px;
    margin: 0;
    color: rgba(255, 255, 255, 0.68);
    line-height: 1.5;
  }

  code {
    color: #fef3c7;
  }
}

.voice-kicker {
  color: rgba(255, 255, 255, 0.52);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0;
  text-transform: uppercase;
}

.server-card {
  display: grid;
  align-content: start;
  gap: 10px;
  padding: 16px;
  border-radius: $radius-md;

  span {
    color: rgba(255, 255, 255, 0.58);
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
  }

  strong {
    color: #fff;
    font-size: 24px;
  }

  p {
    min-height: 0;
    margin: 0;
    color: rgba(255, 255, 255, 0.64);
    font-size: 13px;
    line-height: 1.45;
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
  padding: 20px;
  border-radius: $radius-lg;
}

.lap-time-library {
  display: grid;
  gap: 14px;
  padding: 20px;
  border-radius: $radius-lg;
}

.editor-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.training-tabs,
.mode-tabs,
.lab-section-tabs,
.voice-toggle {
  display: inline-flex;
  flex-wrap: wrap;
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
  min-width: 188px;
}

.audio-preview {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 360px);
  gap: 14px;
  align-items: center;
  padding: 14px;
  border: 1px solid rgba($accent-success, 0.22);
  border-radius: $radius-md;
  background: rgba($accent-success, 0.055);

  strong {
    display: block;
    margin-top: 4px;
    overflow: hidden;
    color: #fff;
    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  p {
    margin: 6px 0 0;
    color: rgba(255, 255, 255, 0.68);
    font-size: 13px;
  }

  audio {
    width: 100%;
    min-width: 0;
  }
}

.audio-preview__error {
  color: #fde68a !important;
}

.phrase-rows,
.reference-rows {
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
  letter-spacing: 0;
  text-align: left;
  text-transform: uppercase;
}

.phrase-row,
.reference-row {
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
    gap: 8px;
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

    label strong {
      color: #fff;
      font-size: 11px;
      text-transform: none;
      white-space: nowrap;
    }
  }
}

.reference-row {
    .reference-control-divider {
    width: 1px;
    height: 28px;
    background: rgba(255, 255, 255, 0.16);
  }

  header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
  }

  small {
    display: block;
    margin-top: 3px;
    color: rgba(255, 255, 255, 0.52);
    font-size: 12px;
  }
}

.reference-track-select {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  align-items: end;

  label {
    display: grid;
    gap: 5px;
    color: rgba(255, 255, 255, 0.62);
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
  }

  select {
    min-height: 36px;
    padding: 0 10px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: $radius-sm;
    background: #15151d;
    color: #fff;
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
  min-width: 128px;
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
  padding: 20px;
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

.lap-time-controls {
  display: grid;
  grid-template-columns: minmax(180px, auto) repeat(2, minmax(140px, 180px)) minmax(240px, 1fr);
  gap: 10px;
  align-items: center;

  label {
    display: grid;
    grid-template-columns: auto minmax(72px, 1fr) auto;
    gap: 8px;
    align-items: center;
    color: rgba(255, 255, 255, 0.62);
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
  }

  input {
    min-height: 34px;
    min-width: 0;
    padding: 0 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: $radius-sm;
    background: #15151d;
    color: #fff;
  }

  input[type='range'] {
    padding: 0;
  }

  strong {
    color: #fff;
    font-size: 12px;
    text-align: right;
    white-space: nowrap;
  }
}

.lap-time-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  span {
    display: inline-flex;
    min-height: 28px;
    padding: 0 10px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: $radius-sm;
    align-items: center;
    color: rgba(255, 255, 255, 0.72);
    font-size: 12px;
    font-weight: 800;
  }
}

.lap-time-warning {
  border-color: rgba($accent-warning, 0.42) !important;
  color: #fde68a !important;
}

.lap-time-preview,
.lap-time-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: $radius-md;
  background: rgba(0, 0, 0, 0.18);

  strong {
    color: #fff;
  }

  p {
    margin: 4px 0 0;
    color: rgba(255, 255, 255, 0.68);
    line-height: 1.45;
  }
}

.lap-time-rows {
  display: grid;
  gap: 8px;
  max-height: 520px;
  overflow: auto;
  padding-right: 4px;
}

.lap-time-row {
  grid-template-columns: minmax(0, 1fr) minmax(96px, auto) auto;

  &.is-missing {
    border-color: rgba($accent-warning, 0.24);
  }
}

.lap-time-state {
  color: #fde68a;
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;

  &.is-ready {
    color: $accent-success;
  }
}

button {
  display: inline-flex;
  min-height: 36px;
  padding: 0 13px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: $radius-sm;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.84);
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 900;
  line-height: 1;
  text-align: center;
  white-space: nowrap;
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

  &:disabled {
    border-color: rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.54);
    opacity: 1;
  }
}

.secondary {
  background: rgba(255, 255, 255, 0.04);
}

@media (max-width: 1040px) {
  .voice-hero {
    grid-template-columns: 1fr;
  }

  .audio-preview {
    grid-template-columns: 1fr;
  }

  .save-btn {
    width: 100%;
    margin-left: 0;
  }


  .lap-time-controls,
  .lap-time-preview,
  .lap-time-row {
    grid-template-columns: 1fr;
  }
}
</style>
