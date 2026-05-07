<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { doc } from 'firebase/firestore'
import { db } from '~/config/firebase'
import { ACC_CAR_OPTIONS, ACC_TRACK_OPTIONS } from '~/constants/accCatalog'
import CoachRaceCalendarPanel from '~/components/coach/CoachRaceCalendarPanel.vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { trackedGetDoc } from '~/composables/useFirebaseTracker'
import {
  countCoachLessons,
  createCoachLesson,
  loadCoachLessonsPage,
  updateCoachLesson,
  type CoachFeedbackItem,
  type CoachFeedbackType,
  type CoachLesson,
  type CoachLessonFilters,
  type CoachLessonsPage
} from '~/repositories/coachLessonsRepository'

const props = defineProps<{
  pilotId: string
  pilotName?: string
}>()

interface PilotPrivateProfile {
  equipment?: Record<string, unknown>
}

const { currentUser, userDisplayName } = useFirebaseAuth()
const CUSTOM_OPTION = '__custom__'
const durationPresets = [
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
  { label: '60 min', value: 60 },
  { label: '75 min', value: 75 },
  { label: '90 min', value: 90 },
  { label: '120 min', value: 120 }
]

const lessons = ref<CoachLesson[]>([])
const selectedLesson = ref<CoachLesson | null>(null)
const pilotProfile = ref<PilotPrivateProfile | null>(null)
const isLoading = ref(false)
const isLoadingProfile = ref(false)
const isLoadingLessonCount = ref(false)
const isSaving = ref(false)
const errorMessage = ref('')
const isSetupOpen = ref(false)
const editingLessonId = ref<string | null>(null)
const selectedDurationPreset = ref<number | string>(60)
const isLoadingMoreLessons = ref(false)
const lessonPageCursor = ref<CoachLessonsPage['cursor']>(null)
const hasMoreLessons = ref(false)
const totalLessonsCount = ref(0)
const historyFilters = ref<CoachLessonFilters>({
  trackName: '',
  carName: ''
})

const form = ref({
  lessonAt: '',
  trackName: '',
  carName: '',
  durationMinutes: 60,
  initialBestLap: '',
  finalBestLap: '',
  trackTitanPilotUrl: '',
  trackTitanReferenceUrl: '',
  recordingUrl: '',
  writtenNotes: '',
  feedbackType: 'issue' as CoachFeedbackType,
  feedbackTurn: '',
  feedbackCategory: 'Entrata curva',
  feedbackMessage: ''
})

const feedbackDraft = ref<CoachFeedbackItem[]>([])
const isEditingLesson = computed(() => Boolean(editingLessonId.value))
const activeLesson = computed(() => selectedLesson.value)
const equipment = computed(() => pilotProfile.value?.equipment || {})
const canSaveLesson = computed(() => Boolean(form.value.lessonAt && form.value.trackName.trim()) && !isSaving.value)
const hasActiveHistoryFilters = computed(() => Boolean(
  historyFilters.value.trackName?.trim()
  || historyFilters.value.carName?.trim()
))

const hardwareRows = computed(() => [
  { label: 'Volante / base', value: equipment.value.volante },
  { label: 'Corona', value: equipment.value.corona },
  { label: 'Pedaliera', value: equipment.value.pedaliera },
  { label: 'Rig', value: equipment.value.struttura }
].filter((row) => hasDisplayValue(row.value)))

const setupRows = computed(() => [
  { label: 'SEN', value: equipment.value.sensitivity, suffix: 'deg' },
  { label: 'FFB', value: equipment.value.forceFeedbackStrength, suffix: '%' },
  { label: 'FFS', value: equipment.value.forceFeedbackScale },
  { label: 'NDP', value: equipment.value.naturalDamper, suffix: '%' },
  { label: 'NFR', value: equipment.value.naturalFriction, suffix: '%' },
  { label: 'NIN', value: equipment.value.naturalInertia, suffix: '%' },
  { label: 'INT', value: equipment.value.interpolationFilter },
  { label: 'FEI', value: equipment.value.forceEffectIntensity },
  { label: 'FOR', value: equipment.value.forceEffectStrength, suffix: '%' },
  { label: 'SPR', value: equipment.value.springEffectStrength, suffix: '%' },
  { label: 'DPR', value: equipment.value.damperEffectStrength, suffix: '%' },
  { label: 'BRF', value: equipment.value.brakeForce, suffix: '%' },
  { label: 'TC default', value: equipment.value.tcDefault },
  { label: 'ABS default', value: equipment.value.absDefault }
].filter((row) => hasDisplayValue(row.value)))

const hasEquipmentContext = computed(() => hardwareRows.value.length > 0 || setupRows.value.length > 0)

function lessonLinksFor(lesson: CoachLesson) {
  return [
    { label: 'TrackTitan pilota', url: lesson.trackTitanPilotUrl },
    { label: 'TrackTitan coach', url: lesson.trackTitanReferenceUrl },
    { label: 'Registrazione', url: lesson.recordingUrl }
  ].filter((link) => Boolean(link.url))
}

const feedbackTypeLabels: Record<CoachFeedbackType, string> = {
  issue: 'Errore',
  action: 'Azione',
  positive: 'Positivo'
}

function feedbackTypeLabel(type: CoachFeedbackType): string {
  return feedbackTypeLabels[type] || 'Feedback'
}

function feedbackContext(item: CoachFeedbackItem): string {
  const parts = []
  if (item.turn) parts.push(/^curva/i.test(item.turn) ? item.turn : `Curva ${item.turn}`)
  if (item.category) parts.push(item.category)
  return parts.join(' - ')
}

function feedbackSummary(item: CoachFeedbackItem): string {
  return [feedbackTypeLabel(item.type), feedbackContext(item), item.message].filter(Boolean).join(' - ')
}

function parseLapToMs(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const match = trimmed.match(/^(\d+):([0-5]?\d)(?:[.,](\d{1,3}))?$/)
  if (!match) return null
  const minutes = Number(match[1])
  const seconds = Number(match[2])
  const millis = Number((match[3] || '0').padEnd(3, '0').slice(0, 3))
  return minutes * 60000 + seconds * 1000 + millis
}

function formatLap(ms?: number | null): string {
  if (!ms) return '-'
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  const millis = Math.floor(ms % 1000)
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

function formatLapForInput(ms?: number | null): string {
  const formatted = formatLap(ms)
  return formatted === '-' ? '' : formatted
}

function toDatetimeLocalValue(value: string): string {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return value.slice(0, 16)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const offsetMs = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function formatDate(value: string): string {
  if (!value) return 'Data non impostata'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

function hasDisplayValue(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== ''
}

function displayValue(value?: unknown, suffix = ''): string {
  if (!hasDisplayValue(value)) return '-'
  const normalized = String(value).trim()
  return suffix ? `${normalized}${suffix}` : normalized
}

function addFeedback() {
  errorMessage.value = ''
  if (!form.value.feedbackCategory.trim() || !form.value.feedbackMessage.trim()) {
    errorMessage.value = 'Categoria e nota feedback sono obbligatorie.'
    return
  }

  feedbackDraft.value = [
    ...feedbackDraft.value,
    {
      type: form.value.feedbackType,
      turn: form.value.feedbackTurn.trim(),
      category: form.value.feedbackCategory.trim(),
      message: form.value.feedbackMessage.trim()
    }
  ]

  form.value.feedbackTurn = ''
  form.value.feedbackMessage = ''
}

function removeFeedback(index: number) {
  feedbackDraft.value = feedbackDraft.value.filter((_, itemIndex) => itemIndex !== index)
}

function resetForm() {
  form.value = {
    lessonAt: '',
    trackName: '',
    carName: '',
    durationMinutes: 60,
    initialBestLap: '',
    finalBestLap: '',
    trackTitanPilotUrl: '',
    trackTitanReferenceUrl: '',
    recordingUrl: '',
    writtenNotes: '',
    feedbackType: 'issue',
    feedbackTurn: '',
    feedbackCategory: 'Entrata curva',
    feedbackMessage: ''
  }
  feedbackDraft.value = []
  selectedDurationPreset.value = 60
}

function syncCatalogSelections() {
  selectedDurationPreset.value = durationPresets.some((preset) => preset.value === Number(form.value.durationMinutes))
    ? Number(form.value.durationMinutes)
    : CUSTOM_OPTION
}

function selectDuration(value: number | string) {
  selectedDurationPreset.value = value
  if (value !== CUSTOM_OPTION) {
    form.value.durationMinutes = Number(value)
  }
}

function selectDurationFromEvent(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  selectDuration(value === CUSTOM_OPTION ? CUSTOM_OPTION : Number(value))
}

function toggleLesson(lesson: CoachLesson) {
  selectedLesson.value = activeLesson.value?.id === lesson.id ? null : lesson
}

function showMoreLessons() {
  void loadMoreLessons()
}

function resetHistoryFilters() {
  historyFilters.value = {
    trackName: '',
    carName: ''
  }
  void refreshLessons()
}

function trackFlag(trackName?: string): string {
  const name = (trackName || '').toLowerCase()
  if (name.includes('barcelona') || name.includes('valencia')) return 'es'
  if (name.includes('brands') || name.includes('donington') || name.includes('oulton') || name.includes('snetterton') || name.includes('silverstone')) return 'gb'
  if (name.includes('cota') || name.includes('indianapolis') || name.includes('watkins') || name.includes('laguna')) return 'us'
  if (name.includes('hungaroring')) return 'hu'
  if (name.includes('imola') || name.includes('misano') || name.includes('monza') || name.includes('mugello')) return 'it'
  if (name.includes('kyalami')) return 'za'
  if (name.includes('nurburgring') || name.includes('nordschleife') || name.includes('hockenheim')) return 'de'
  if (name.includes('paul ricard')) return 'fr'
  if (name.includes('spa')) return 'be'
  if (name.includes('suzuka') || name.includes('fuji')) return 'jp'
  if (name.includes('zandvoort') || name.includes('zanvoort')) return 'nl'
  if (name.includes('red bull')) return 'at'
  return 'fallback'
}

function startEditLesson(lesson: CoachLesson) {
  errorMessage.value = ''
  editingLessonId.value = lesson.id
  selectedLesson.value = lesson
  form.value = {
    lessonAt: toDatetimeLocalValue(lesson.lessonAt),
    trackName: lesson.trackName || '',
    carName: lesson.carName || '',
    durationMinutes: Number(lesson.durationMinutes || 60),
    initialBestLap: formatLapForInput(lesson.initialBestLapMs),
    finalBestLap: formatLapForInput(lesson.finalBestLapMs),
    trackTitanPilotUrl: lesson.trackTitanPilotUrl || '',
    trackTitanReferenceUrl: lesson.trackTitanReferenceUrl || '',
    recordingUrl: lesson.recordingUrl || '',
    writtenNotes: lesson.writtenNotes || '',
    feedbackType: 'issue',
    feedbackTurn: '',
    feedbackCategory: 'Entrata curva',
    feedbackMessage: ''
  }
  feedbackDraft.value = [...lesson.feedbackItems]
  syncCatalogSelections()
}

function cancelEditLesson() {
  editingLessonId.value = null
  errorMessage.value = ''
  resetForm()
}

async function refreshLessons() {
  isLoading.value = true
  try {
    const page = await loadCoachLessonsPage(props.pilotId, historyFilters.value)
    lessons.value = page.lessons
    lessonPageCursor.value = page.cursor
    hasMoreLessons.value = page.hasMore
    selectedLesson.value = lessons.value[0] || null
  } finally {
    isLoading.value = false
  }
}

async function refreshLessonCount() {
  isLoadingLessonCount.value = true
  try {
    totalLessonsCount.value = await countCoachLessons(props.pilotId)
  } finally {
    isLoadingLessonCount.value = false
  }
}

async function loadMoreLessons() {
  if (isLoadingMoreLessons.value || !hasMoreLessons.value) return
  isLoadingMoreLessons.value = true
  try {
    const page = await loadCoachLessonsPage(props.pilotId, historyFilters.value, 10, lessonPageCursor.value)
    lessons.value = [...lessons.value, ...page.lessons]
    lessonPageCursor.value = page.cursor
    hasMoreLessons.value = page.hasMore
  } finally {
    isLoadingMoreLessons.value = false
  }
}

async function loadPilotProfile() {
  isLoadingProfile.value = true
  try {
    const snap = await trackedGetDoc(doc(db, 'users', props.pilotId), 'CoachLessonsPanel')
    pilotProfile.value = snap.exists() ? (snap.data() as PilotPrivateProfile) : null
  } finally {
    isLoadingProfile.value = false
  }
}

async function saveLesson() {
  if (!currentUser.value || isSaving.value) return
  errorMessage.value = ''

  if (!form.value.lessonAt || !form.value.trackName.trim()) {
    errorMessage.value = 'Data lezione e pista sono obbligatorie.'
    return
  }

  const initialBestLapMs = parseLapToMs(form.value.initialBestLap)
  const finalBestLapMs = parseLapToMs(form.value.finalBestLap)

  if ((form.value.initialBestLap && !initialBestLapMs) || (form.value.finalBestLap && !finalBestLapMs)) {
    errorMessage.value = 'Usa formato tempo giro tipo 1:47.235.'
    return
  }

  isSaving.value = true
  try {
    const lessonPayload = {
      lessonAt: form.value.lessonAt,
      trackName: form.value.trackName,
      carName: form.value.carName,
      durationMinutes: Number(form.value.durationMinutes || 0),
      initialBestLapMs,
      finalBestLapMs,
      trackTitanPilotUrl: form.value.trackTitanPilotUrl,
      trackTitanReferenceUrl: form.value.trackTitanReferenceUrl,
      recordingUrl: form.value.recordingUrl,
      writtenNotes: form.value.writtenNotes,
      feedbackItems: feedbackDraft.value
    }

    const updatedLessonId = editingLessonId.value
    if (updatedLessonId) {
      await updateCoachLesson(props.pilotId, updatedLessonId, lessonPayload)
    } else {
      await createCoachLesson(props.pilotId, {
        coachId: currentUser.value.uid,
        coachName: userDisplayName.value || currentUser.value.email || 'Coach',
        ...lessonPayload
      })
    }

    editingLessonId.value = null
    resetForm()
    await Promise.all([refreshLessons(), refreshLessonCount()])
    if (updatedLessonId) {
      selectedLesson.value = lessons.value.find((lesson) => lesson.id === updatedLessonId) || lessons.value[0] || null
    }
  } finally {
    isSaving.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadPilotProfile(), refreshLessons(), refreshLessonCount()])
})
</script>

<template>
  <div class="coach-lessons-panel">
    <header class="panel-header">
      <div>
        <h2>Lezioni coach</h2>
      </div>
    </header>

    <section class="pilot-context-card">
      <div class="context-head">
        <div>
          <h3>Contesto pilota</h3>
          <p>Hardware e gare pianificate.</p>
        </div>
        <span v-if="isLoadingProfile">Caricamento...</span>
      </div>

      <div class="pilot-context-grid">
        <div class="pilot-equipment-column">
          <div v-if="hasEquipmentContext" class="equipment-summary">
            <div v-if="hardwareRows.length" class="context-group">
              <span class="context-label">Hardware</span>
              <div class="context-chips">
                <div v-for="row in hardwareRows" :key="row.label" class="context-chip" :title="displayValue(row.value)">
                  <span>{{ row.label }}</span>
                  <strong>{{ displayValue(row.value) }}</strong>
                </div>
              </div>
            </div>

            <div v-if="setupRows.length" class="context-group">
              <button class="accordion-trigger" type="button" @click="isSetupOpen = !isSetupOpen">
                <span>Setup base</span>
                <strong>{{ isSetupOpen ? 'Chiudi' : 'Apri' }}</strong>
              </button>
              <Transition name="context-expand">
                <div v-if="isSetupOpen" class="context-chips context-chips--dense">
                  <div v-for="row in setupRows" :key="row.label" class="context-chip" :title="displayValue(row.value, row.suffix)">
                    <span>{{ row.label }}</span>
                    <strong>{{ displayValue(row.value, row.suffix) }}</strong>
                  </div>
                </div>
              </Transition>
            </div>
          </div>
          <div v-else class="compact-empty">Attrezzatura non configurata.</div>
        </div>

        <CoachRaceCalendarPanel :pilot-id="pilotId" />
      </div>
    </section>

    <div class="lessons-grid">
      <section class="lesson-form-card">
        <div class="lesson-form-heading">
          <div>
            <h3>{{ isEditingLesson ? 'Modifica lezione' : 'Nuova lezione' }}</h3>
            <span v-if="feedbackDraft.length" class="form-substatus">{{ feedbackDraft.length }} feedback aggiunti</span>
          </div>
          <button v-if="isEditingLesson" class="ghost-action ghost-action--compact" type="button" @click="cancelEditLesson">
            Annulla modifica
          </button>
        </div>
        <form class="lesson-form" @submit.prevent="saveLesson">
          <section class="lesson-form-section">
            <span class="section-label">Sessione</span>
            <div class="form-row form-row--schedule">
              <label>
                <span>Data e ora</span>
                <input v-model="form.lessonAt" type="datetime-local" />
              </label>
              <label class="duration-field">
                <span>Durata</span>
                <select :value="selectedDurationPreset" @change="selectDurationFromEvent">
                  <option v-for="preset in durationPresets" :key="preset.value" :value="preset.value">
                    {{ preset.label }}
                  </option>
                  <option :value="CUSTOM_OPTION">Custom</option>
                </select>
                <input
                  v-if="selectedDurationPreset === CUSTOM_OPTION"
                  v-model.number="form.durationMinutes"
                  type="number"
                  min="1"
                  step="5"
                  placeholder="Minuti"
                />
              </label>
            </div>

            <div class="form-row form-row--main">
              <label>
                <span>Pista</span>
                <input v-model="form.trackName" list="acc-track-options" type="text" placeholder="Cerca o scrivi pista" />
                <datalist id="acc-track-options">
                  <option v-for="track in ACC_TRACK_OPTIONS" :key="track.id" :value="track.name" />
                </datalist>
              </label>
              <label>
                <span>Vettura</span>
                <input v-model="form.carName" list="acc-car-options" type="text" placeholder="Cerca o scrivi vettura" />
                <datalist id="acc-car-options">
                  <option v-for="car in ACC_CAR_OPTIONS" :key="car.id" :value="car.name" :label="car.category" />
                </datalist>
              </label>
            </div>

            <div class="form-row form-row--laps">
              <label>
                <span>Best iniziale</span>
                <input v-model="form.initialBestLap" type="text" placeholder="1:48.200" />
              </label>
              <label>
                <span>Best finale</span>
                <input v-model="form.finalBestLap" type="text" placeholder="1:47.650" />
              </label>
            </div>
          </section>

          <section class="lesson-form-section lesson-form-section--quiet">
            <span class="section-label">Risorse</span>
            <div class="form-row form-row--links">
              <label>
                <span>TrackTitan pilota</span>
                <input v-model="form.trackTitanPilotUrl" type="url" placeholder="https://..." />
              </label>
              <label>
                <span>TrackTitan coach</span>
                <input v-model="form.trackTitanReferenceUrl" type="url" placeholder="https://..." />
              </label>
              <label>
                <span>Registrazione</span>
                <input v-model="form.recordingUrl" type="url" placeholder="https://..." />
              </label>
            </div>

            <label>
              <span>Note scritte</span>
              <textarea v-model="form.writtenNotes" rows="3" placeholder="Sintesi della lezione, contesto, obiettivo prossimo..." />
            </label>
          </section>

          <section class="feedback-builder">
            <span class="section-label">Feedback</span>
            <div class="form-row form-row--three">
              <label>
                <span>Tipo</span>
                <select v-model="form.feedbackType">
                  <option value="issue">Errore</option>
                  <option value="action">Azione</option>
                  <option value="positive">Positivo</option>
                </select>
              </label>
              <label>
                <span>Curva</span>
                <input v-model="form.feedbackTurn" type="text" placeholder="Opzionale" />
              </label>
              <label>
                <span>Categoria</span>
                <select v-model="form.feedbackCategory">
                  <option>Commento generale</option>
                  <option>Entrata curva</option>
                  <option>Punto di frenata</option>
                  <option>Rilascio freno</option>
                  <option>Corda</option>
                  <option>Uscita curva</option>
                  <option>Gestione traffico</option>
                  <option>Costanza passo</option>
                </select>
              </label>
            </div>
            <label>
              <span>Feedback diretto</span>
              <input v-model="form.feedbackMessage" type="text" placeholder="Errore: entrata troppo veloce, anticipa il rilascio freno." />
            </label>
            <button class="ghost-action" type="button" @click="addFeedback">Aggiungi feedback</button>
          </section>

          <div v-if="feedbackDraft.length" class="feedback-draft">
            <div v-for="(item, index) in feedbackDraft" :key="index" class="draft-row">
              <span>{{ feedbackSummary(item) }}</span>
              <button type="button" @click="removeFeedback(index)">Rimuovi</button>
            </div>
          </div>

          <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p>
          <div class="form-actions">
            <button class="primary-action" type="submit" :disabled="!canSaveLesson">
              {{ isSaving ? 'Salvataggio...' : isEditingLesson ? 'Salva modifiche' : 'Salva lezione' }}
            </button>
            <button v-if="isEditingLesson" class="ghost-action" type="button" @click="cancelEditLesson">Annulla</button>
          </div>
        </form>
      </section>

      <section class="lesson-history-card">
        <div class="lesson-history-heading">
          <h3>Storico lezioni</h3>
          <span class="lesson-total-count">{{ isLoadingLessonCount ? '...' : `${totalLessonsCount} lezioni` }}</span>
        </div>
        <form class="history-filters" @submit.prevent="refreshLessons">
          <label>
            <span>Pista</span>
            <input v-model="historyFilters.trackName" list="history-track-options" type="text" placeholder="Filtra pista" />
            <datalist id="history-track-options">
              <option v-for="track in ACC_TRACK_OPTIONS" :key="track.id" :value="track.name" />
            </datalist>
          </label>
          <label>
            <span>Vettura</span>
            <input v-model="historyFilters.carName" list="history-car-options" type="text" placeholder="Filtra vettura" />
            <datalist id="history-car-options">
              <option v-for="car in ACC_CAR_OPTIONS" :key="car.id" :value="car.name" :label="car.category" />
            </datalist>
          </label>
          <div class="history-filter-actions">
            <button class="ghost-action ghost-action--compact" type="submit" :disabled="isLoading">Filtra</button>
            <button v-if="hasActiveHistoryFilters" class="ghost-action ghost-action--compact" type="button" @click="resetHistoryFilters">
              Reset
            </button>
          </div>
        </form>
        <div v-if="isLoading" class="empty-state">Caricamento lezioni...</div>
        <div v-else-if="lessons.length === 0" class="empty-state">Nessuna lezione registrata.</div>
        <template v-else>
          <div class="lesson-list">
            <article
              v-for="lesson in lessons"
              :key="lesson.id"
              class="lesson-accordion"
              :class="{ 'lesson-accordion--open': activeLesson?.id === lesson.id }"
            >
              <button type="button" class="lesson-row" @click="toggleLesson(lesson)">
                <span class="lesson-row__track">
                  <span class="track-flag" :class="`track-flag--${trackFlag(lesson.trackName)}`" aria-hidden="true"></span>
                  <span>{{ lesson.trackName }}</span>
                </span>
                <span v-if="lesson.carName" class="lesson-row__car">{{ lesson.carName }}</span>
                <span class="lesson-row__date">{{ formatDate(lesson.lessonAt) }}</span>
                <svg class="lesson-row__chevron" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M6 8L10 12L14 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>

              <Transition name="lesson-detail-transition">
                <div v-if="activeLesson?.id === lesson.id" class="lesson-detail">
                  <header>
                    <div>
                      <span class="detail-kicker">Dettaglio lezione</span>
                      <h4>Analisi sessione</h4>
                      <p>Informazioni operative registrate dal coach.</p>
                    </div>
                    <button class="ghost-action ghost-action--compact" type="button" @click="startEditLesson(lesson)">
                      Modifica
                    </button>
                  </header>
                  <div class="lesson-detail__body">
                    <div class="meta-grid">
                      <div><span>Durata</span><strong>{{ lesson.durationMinutes }} min</strong></div>
                      <div><span>Coach</span><strong>{{ displayValue(lesson.coachName) }}</strong></div>
                    </div>
                    <div class="lap-grid">
                      <div><span>Best iniziale</span><strong>{{ formatLap(lesson.initialBestLapMs) }}</strong></div>
                      <div><span>Best finale</span><strong>{{ formatLap(lesson.finalBestLapMs) }}</strong></div>
                    </div>
                    <div v-if="lessonLinksFor(lesson).length" class="resource-links">
                      <a v-for="link in lessonLinksFor(lesson)" :key="link.label" :href="link.url" target="_blank" rel="noopener noreferrer">
                        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                          <path d="M8 12L12 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                          <path d="M9 6L10.4 4.6C11.8 3.2 14 3.2 15.4 4.6C16.8 6 16.8 8.2 15.4 9.6L14 11" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                          <path d="M11 14L9.6 15.4C8.2 16.8 6 16.8 4.6 15.4C3.2 14 3.2 11.8 4.6 10.4L6 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                        </svg>
                        {{ link.label }}
                      </a>
                    </div>
                    <p v-if="lesson.writtenNotes" class="written-note">{{ lesson.writtenNotes }}</p>
                    <div class="feedback-list">
                      <div v-for="(item, index) in lesson.feedbackItems" :key="index" class="feedback-item" :class="`feedback-item--${item.type}`">
                        <div class="feedback-item__head">
                          <span class="feedback-badge">{{ feedbackTypeLabel(item.type) }}</span>
                          <strong>{{ feedbackContext(item) || 'Feedback generale' }}</strong>
                        </div>
                        <span>{{ item.message }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Transition>
            </article>
          </div>
          <button v-if="hasMoreLessons" class="show-more-action" type="button" @click="showMoreLessons">
            {{ isLoadingMoreLessons ? 'Caricamento...' : 'Mostra altre lezioni' }}
          </button>
        </template>
      </section>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

.coach-lessons-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
  color: #fff;
}

.panel-header,
.context-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 18px;

  h2,
  h3 {
    margin: 0 0 6px;
  }

  h2 {
    font-size: 24px;
  }

  h3 {
    font-size: 18px;
  }

  p,
  span {
    margin: 0;
    color: rgba(255, 255, 255, 0.52);
    font-size: 14px;
  }
}

.pilot-context-card,
.lesson-form-card,
.lesson-history-card {
  padding: 24px;
  background: #121218;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
}

.pilot-context-card {
  padding: 20px 24px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.025), rgba(255, 255, 255, 0.012)),
    #101016;
}

.context-head {
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.055);
}

.meta-grid div,
.lap-grid div {
  min-width: 0;
  padding: 12px;
  background: rgba(255, 255, 255, 0.035);
  border-radius: 10px;

  span {
    display: block;
    margin-bottom: 6px;
    color: rgba(255, 255, 255, 0.45);
    font-size: 11px;
    text-transform: uppercase;
  }

  strong {
    display: block;
    overflow-wrap: anywhere;
    font-size: 13px;
  }
}

.equipment-summary {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pilot-context-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(360px, 0.95fr);
  gap: 24px;
  margin-top: 16px;
  align-items: start;
}

.pilot-equipment-column {
  min-width: 0;
}

.context-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.context-label {
  color: rgba(255, 255, 255, 0.45);
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
}

.context-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;

  &--dense .context-chip {
    width: 92px;
  }
}

.context-chip {
  width: 150px;
  max-width: 100%;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;

  span {
    display: block;
    margin-bottom: 4px;
    color: rgba(255, 255, 255, 0.42);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
  }

  strong {
    display: block;
    overflow: hidden;
    overflow-wrap: anywhere;
    font-size: 12px;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.accordion-trigger {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 36px;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  color: #fff;
  font-family: $font-primary;
  cursor: pointer;

  span {
    color: rgba(255, 255, 255, 0.62);
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
  }

  strong {
    color: $racing-orange;
    font-size: 12px;
  }
}

.compact-empty {
  margin-top: 0;
  padding: 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px dashed rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.48);
  font-size: 13px;
}

.lessons-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(360px, 0.95fr);
  gap: 24px;
}

.lesson-form-card,
.lesson-history-card {
  h3 {
    margin: 0;
    font-size: 18px;
  }
}

.lesson-form-heading,
.lesson-history-heading,
.form-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.lesson-form-heading,
.lesson-history-heading {
  justify-content: space-between;
  margin-bottom: 20px;
}

.lesson-total-count {
  flex: 0 0 auto;
  padding: 6px 10px;
  background: rgba($racing-orange, 0.08);
  border: 1px solid rgba($racing-orange, 0.22);
  border-radius: 999px;
  color: $racing-orange;
  font-size: 12px;
  font-weight: 900;
}

.form-substatus {
  display: block;
  margin-top: 5px;
  color: rgba(255, 255, 255, 0.42);
  font-size: 12px;
}

.lesson-form,
.lesson-list,
.feedback-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.lesson-form-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.018);
  border: 1px solid rgba(255, 255, 255, 0.055);
  border-radius: 12px;

  &--quiet {
    background: transparent;
  }
}

.section-label {
  color: rgba(255, 255, 255, 0.42);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;

  &--schedule {
    grid-template-columns: 1fr 1fr;
  }

  &--three {
    grid-template-columns: 120px 120px 1fr;
  }

  &--links {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.history-filters {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: 12px;
  align-items: end;
  margin-bottom: 16px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.018);
  border: 1px solid rgba(255, 255, 255, 0.055);
  border-radius: 12px;
}

.history-filter-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

label {
  display: flex;
  flex-direction: column;
  gap: 8px;

  span {
    color: rgba(255, 255, 255, 0.48);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
  }
}

input,
select,
textarea {
  min-height: 42px;
  padding: 0 13px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: #fff;
  font-family: $font-primary;
  font-size: 14px;

  &:focus {
    outline: none;
    border-color: rgba($racing-orange, 0.55);
  }
}

textarea {
  min-height: 98px;
  padding-top: 12px;
  resize: vertical;
}

option {
  background: #121218;
}

input[type='datetime-local']::-webkit-calendar-picker-indicator {
  filter: invert(1);
  opacity: 0.9;
}

.feedback-builder {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 12px;
}

.ghost-action,
.primary-action {
  align-self: flex-start;
  min-height: 40px;
  padding: 0 16px;
  border-radius: 10px;
  font-family: $font-primary;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.ghost-action {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.72);

  &--compact {
    min-height: 34px;
    padding: 0 12px;
    font-size: 12px;
  }
}

.primary-action {
  background: linear-gradient(135deg, $racing-red, $racing-orange);
  border: 0;
  color: #fff;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.62;
  }
}

.feedback-draft {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 152px;
  overflow: auto;
  padding-right: 4px;
}

.draft-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 10px;
  background: rgba($racing-orange, 0.08);
  border-radius: 10px;

  span {
    color: rgba(255, 255, 255, 0.75);
    font-size: 12px;
    line-height: 1.35;
  }

  button {
    background: none;
    border: 0;
    color: #f87171;
    cursor: pointer;
  }
}

.show-more-action {
  align-self: center;
  min-height: 38px;
  padding: 0 14px;
  margin-top: 4px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  color: rgba(255, 255, 255, 0.72);
  font-family: $font-primary;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;

  &:hover {
    border-color: rgba($racing-orange, 0.32);
    color: #fff;
  }
}

.form-error {
  margin: 0;
  color: #f87171;
  font-size: 13px;
}

.empty-state {
  padding: 24px;
  border: 1px dashed rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  color: rgba(255, 255, 255, 0.48);
  text-align: center;
}

.lesson-row {
  display: grid;
  grid-template-columns: minmax(90px, 1fr) minmax(90px, 1fr) auto 22px;
  gap: 10px;
  align-items: center;
  width: 100%;
  min-height: 54px;
  padding: 0 14px;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 10px;
  color: #fff;
  font-family: $font-primary;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba($racing-orange, 0.2);
  }

  &__track {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    min-width: 0;
    overflow: hidden;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__car,
  &__date {
    min-width: 0;
    overflow: hidden;
    color: rgba(255, 255, 255, 0.45);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__chevron {
    width: 18px;
    height: 18px;
    color: rgba(255, 255, 255, 0.58);
    transition: transform 0.18s ease, color 0.18s ease;
  }
}

.track-flag {
  display: inline-block;
  position: relative;
  width: 20px;
  height: 13px;
  flex: 0 0 auto;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.24);
  border-radius: 2px;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.18);
  transform: translateZ(0);

  &--nl,
  &--hu,
  &--de,
  &--at,
  &--es {
    background: linear-gradient(180deg, var(--flag-a) 0 33%, var(--flag-b) 33% 67%, var(--flag-c) 67% 100%);
  }

  &--it,
  &--fr,
  &--be {
    background: linear-gradient(90deg, var(--flag-a) 0 33%, var(--flag-b) 33% 67%, var(--flag-c) 67% 100%);
  }

  &--nl {
    --flag-a: #ae1c28;
    --flag-b: #fff;
    --flag-c: #21468b;
  }

  &--hu {
    --flag-a: #ce2939;
    --flag-b: #fff;
    --flag-c: #477050;
  }

  &--de {
    --flag-a: #050505;
    --flag-b: #dd0000;
    --flag-c: #ffce00;
  }

  &--at {
    --flag-a: #ed2939;
    --flag-b: #fff;
    --flag-c: #ed2939;
  }

  &--es {
    --flag-a: #aa151b;
    --flag-b: #f1bf00;
    --flag-c: #aa151b;
  }

  &--it {
    --flag-a: #009246;
    --flag-b: #fff;
    --flag-c: #ce2b37;
  }

  &--fr {
    --flag-a: #0055a4;
    --flag-b: #fff;
    --flag-c: #ef4135;
  }

  &--be {
    --flag-a: #000;
    --flag-b: #ffd90c;
    --flag-c: #ef3340;
  }

  &--jp {
    background: radial-gradient(circle at 50% 50%, #bc002d 0 34%, transparent 35%), #fff;
  }

  &--us {
    background:
      linear-gradient(#3c3b6e 0 54%, transparent 54%),
      repeating-linear-gradient(to bottom, #b22234 0 7.7%, #fff 7.7% 15.4%);
    background-size: 46% 54%, 100% 100%;
    background-repeat: no-repeat;
  }

  &--gb {
    background:
      linear-gradient(27deg, transparent 0 43%, #fff 43% 48%, #c8102e 48% 53%, #fff 53% 58%, transparent 58%),
      linear-gradient(153deg, transparent 0 43%, #fff 43% 48%, #c8102e 48% 53%, #fff 53% 58%, transparent 58%),
      linear-gradient(to right, transparent 0 40%, #fff 40% 45%, #c8102e 45% 55%, #fff 55% 60%, transparent 60%),
      linear-gradient(to bottom, transparent 0 35%, #fff 35% 42%, #c8102e 42% 58%, #fff 58% 65%, transparent 65%),
      #012169;
  }

  &--za {
    background:
      linear-gradient(146deg, #000 0 24%, #ffb81c 24% 30%, #007a4d 30% 42%, transparent 42%),
      linear-gradient(34deg, #000 0 24%, #ffb81c 24% 30%, #007a4d 30% 42%, transparent 42%),
      linear-gradient(to bottom, #de3831 0 45%, #fff 45% 50%, #007a4d 50% 62%, #fff 62% 67%, #002395 67%);
  }

  &--fallback {
    background:
      linear-gradient(45deg, #fff 25%, transparent 25% 75%, #fff 75%),
      linear-gradient(45deg, #fff 25%, transparent 25% 75%, #fff 75%),
      #111;
    background-position: 0 0, 4px 4px;
    background-size: 8px 8px;
  }
}

.lesson-accordion {
  border-radius: 12px;
  border: 1px solid transparent;
  transition: border-color 0.18s ease, background 0.18s ease;

  &--open {
    background: rgba(255, 255, 255, 0.018);
    border-color: rgba($racing-orange, 0.22);

    .lesson-row {
      border-color: rgba($racing-orange, 0.32);
      background: rgba($racing-orange, 0.08);
      box-shadow: inset 0 -1px 0 rgba($racing-orange, 0.12);
    }

    .lesson-row__chevron {
      color: $racing-orange;
      transform: rotate(180deg);
    }
  }
}

.lesson-detail {
  overflow: hidden;
  margin-top: 0;
  padding: 16px 14px 14px;
  background:
    linear-gradient(180deg, rgba(96, 165, 250, 0.055), rgba(255, 255, 255, 0.02)),
    rgba(255, 255, 255, 0.018);
  border-radius: 0 0 12px 12px;

  header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
    padding-bottom: 14px;
  }

  h4 {
    margin: 0 0 5px;
    font-size: 17px;
  }

  p {
    margin: 0;
    color: rgba(255, 255, 255, 0.55);
    font-size: 13px;
  }

  .detail-kicker {
    display: block;
    margin-bottom: 5px;
    color: rgba(255, 255, 255, 0.42);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
}

.lesson-detail__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.lesson-detail-transition-enter-active,
.lesson-detail-transition-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease, max-height 0.24s ease;
}

.context-expand-enter-active,
.context-expand-leave-active {
  overflow: hidden;
  transition: opacity 0.18s ease, transform 0.18s ease, max-height 0.24s ease;
}

.context-expand-enter-from,
.context-expand-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-4px);
}

.context-expand-enter-to,
.context-expand-leave-from {
  max-height: 240px;
  opacity: 1;
  transform: translateY(0);
}

.lesson-detail-transition-enter-from,
.lesson-detail-transition-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-6px);
}

.lesson-detail-transition-enter-to,
.lesson-detail-transition-leave-from {
  max-height: 620px;
  opacity: 1;
  transform: translateY(0);
}

.meta-grid,
.lap-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin: 0;
}

.lap-grid strong {
  font-family: 'JetBrains Mono', monospace;
}

.resource-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;

  a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    border: 1px solid rgba($racing-orange, 0.26);
    border-radius: 999px;
    color: $racing-orange;
    font-size: 12px;
    font-weight: 700;
    text-decoration: none;
    transition: transform 0.16s ease, background 0.16s ease, border-color 0.16s ease;

    &:hover {
      transform: translateY(-1px);
      background: rgba($racing-orange, 0.12);
      border-color: rgba($racing-orange, 0.48);
    }

    svg {
      width: 13px;
      height: 13px;
      flex: 0 0 auto;
    }
  }
}

.written-note {
  padding: 13px;
  background: rgba(96, 165, 250, 0.08);
  border: 1px solid rgba(96, 165, 250, 0.18);
  border-radius: 10px;
  line-height: 1.5;
}

.feedback-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.035);
  border-left: 3px solid rgba(255, 255, 255, 0.18);

  strong {
    font-size: 12px;
  }

  &__head {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .feedback-badge {
    padding: 3px 7px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.74);
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
  }

  span {
    color: rgba(255, 255, 255, 0.62);
    font-size: 13px;
  }

  &--positive {
    border-left-color: #22c55e;

    .feedback-badge {
      background: rgba(34, 197, 94, 0.16);
      color: #4ade80;
    }
  }

  &--issue {
    border-left-color: #ef4444;

    .feedback-badge {
      background: rgba(239, 68, 68, 0.16);
      color: #f87171;
    }
  }

  &--action {
    border-left-color: $racing-orange;

    .feedback-badge {
      background: rgba($racing-orange, 0.16);
      color: $racing-orange;
    }
  }
}

@media (max-width: 1100px) {
  .lessons-grid,
  .pilot-context-grid,
  .form-row,
  .form-row--three,
  .form-row--links,
  .history-filters,
  .meta-grid,
  .lap-grid {
    grid-template-columns: 1fr;
  }

}

@media (prefers-reduced-motion: reduce) {
  .lesson-row,
  .lesson-accordion,
  .lesson-row__chevron,
  .lesson-detail-transition-enter-active,
  .lesson-detail-transition-leave-active,
  .context-expand-enter-active,
  .context-expand-leave-active {
    transition: none;
  }

  .lesson-detail-transition-enter-from,
  .lesson-detail-transition-leave-to,
  .lesson-detail-transition-enter-to,
  .lesson-detail-transition-leave-from,
  .context-expand-enter-from,
  .context-expand-leave-to,
  .context-expand-enter-to,
  .context-expand-leave-from {
    transform: none;
  }
}
</style>
