<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { doc } from 'firebase/firestore'
import { db } from '~/config/firebase'
import CoachRaceCalendarPanel from '~/components/coach/CoachRaceCalendarPanel.vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { trackedGetDoc } from '~/composables/useFirebaseTracker'
import {
  createCoachLesson,
  loadCoachLessons,
  type CoachFeedbackItem,
  type CoachFeedbackType,
  type CoachLesson
} from '~/repositories/coachLessonsRepository'

const props = defineProps<{
  pilotId: string
  pilotName?: string
}>()

interface PilotPrivateProfile {
  equipment?: Record<string, unknown>
}

const { currentUser, userDisplayName } = useFirebaseAuth()

const lessons = ref<CoachLesson[]>([])
const selectedLesson = ref<CoachLesson | null>(null)
const pilotProfile = ref<PilotPrivateProfile | null>(null)
const isLoading = ref(false)
const isLoadingProfile = ref(false)
const isSaving = ref(false)
const errorMessage = ref('')
const isSetupOpen = ref(false)

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
const activeLesson = computed(() => selectedLesson.value || lessons.value[0] || null)
const equipment = computed(() => pilotProfile.value?.equipment || {})

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

const lessonLinks = computed(() => {
  if (!activeLesson.value) return []
  return [
    { label: 'TrackTitan pilota', url: activeLesson.value.trackTitanPilotUrl },
    { label: 'TrackTitan coach', url: activeLesson.value.trackTitanReferenceUrl },
    { label: 'Registrazione', url: activeLesson.value.recordingUrl }
  ].filter((link) => Boolean(link.url))
})

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

async function refreshLessons() {
  isLoading.value = true
  try {
    lessons.value = await loadCoachLessons(props.pilotId)
    selectedLesson.value = lessons.value[0] || null
  } finally {
    isLoading.value = false
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
    await createCoachLesson(props.pilotId, {
      coachId: currentUser.value.uid,
      coachName: userDisplayName.value || currentUser.value.email || 'Coach',
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
    })

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
    await refreshLessons()
  } finally {
    isSaving.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadPilotProfile(), refreshLessons()])
})
</script>

<template>
  <div class="coach-lessons-panel">
    <header class="panel-header">
      <div>
        <h2>Lezioni coach</h2>
        <p>{{ pilotName || 'Pilota' }} - area operativa condivisa con il pilota</p>
      </div>
      <span>{{ lessons.length }} lezioni</span>
    </header>

    <section class="pilot-context-card">
      <div class="context-head">
        <div>
          <h3>Scheda pilota</h3>
          <p>Informazioni rapide sul pilota seguito e sulle prossime gare.</p>
        </div>
        <span v-if="isLoadingProfile">Caricamento...</span>
      </div>

      <div class="pilot-context-grid">
        <div class="pilot-equipment-column">
          <div v-if="hasEquipmentContext" class="equipment-summary">
            <div v-if="hardwareRows.length" class="context-group">
              <span class="context-label">Hardware</span>
              <div class="context-chips">
                <div v-for="row in hardwareRows" :key="row.label" class="context-chip">
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
              <div v-if="isSetupOpen" class="context-chips context-chips--dense">
                <div v-for="row in setupRows" :key="row.label" class="context-chip">
                  <span>{{ row.label }}</span>
                  <strong>{{ displayValue(row.value, row.suffix) }}</strong>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="compact-empty">Attrezzatura non configurata.</div>
        </div>

        <CoachRaceCalendarPanel :pilot-id="pilotId" />
      </div>
    </section>

    <div class="lessons-grid">
      <section class="lesson-form-card">
        <h3>Nuova lezione</h3>
        <form class="lesson-form" @submit.prevent="saveLesson">
          <div class="form-row">
            <label>
              <span>Data e ora</span>
              <input v-model="form.lessonAt" type="datetime-local" />
            </label>
            <label>
              <span>Durata</span>
              <input v-model.number="form.durationMinutes" type="number" min="1" step="5" />
            </label>
          </div>

          <div class="form-row">
            <label>
              <span>Pista</span>
              <input v-model="form.trackName" type="text" placeholder="Es. Monza" />
            </label>
            <label>
              <span>Vettura</span>
              <input v-model="form.carName" type="text" placeholder="Es. Ferrari 296 GT3" />
            </label>
          </div>

          <div class="form-row">
            <label>
              <span>Best iniziale</span>
              <input v-model="form.initialBestLap" type="text" placeholder="1:48.200" />
            </label>
            <label>
              <span>Best finale</span>
              <input v-model="form.finalBestLap" type="text" placeholder="1:47.650" />
            </label>
          </div>

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
            <textarea v-model="form.writtenNotes" rows="4" placeholder="Sintesi della lezione, contesto, obiettivo prossimo..." />
          </label>

          <div class="feedback-builder">
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
                <input v-model="form.feedbackTurn" type="text" placeholder="Curva 3" />
              </label>
              <label>
                <span>Categoria</span>
                <select v-model="form.feedbackCategory">
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
          </div>

          <div v-if="feedbackDraft.length" class="feedback-draft">
            <div v-for="(item, index) in feedbackDraft" :key="index" class="draft-row">
              <span>{{ item.turn || item.category }} - {{ item.message }}</span>
              <button type="button" @click="removeFeedback(index)">Rimuovi</button>
            </div>
          </div>

          <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p>
          <button class="primary-action" type="submit" :disabled="isSaving">
            {{ isSaving ? 'Salvataggio...' : 'Salva lezione' }}
          </button>
        </form>
      </section>

      <section class="lesson-history-card">
        <h3>Storico</h3>
        <div v-if="isLoading" class="empty-state">Caricamento lezioni...</div>
        <div v-else-if="lessons.length === 0" class="empty-state">Nessuna lezione registrata.</div>
        <template v-else>
          <div class="lesson-list">
            <button
              v-for="lesson in lessons"
              :key="lesson.id"
              type="button"
              class="lesson-row"
              :class="{ 'lesson-row--active': activeLesson?.id === lesson.id }"
              @click="selectedLesson = lesson"
            >
              <span>{{ lesson.trackName }}</span>
              <small>{{ formatDate(lesson.lessonAt) }}</small>
            </button>
          </div>

          <article v-if="activeLesson" class="lesson-detail">
            <header>
              <div>
                <h4>{{ activeLesson.trackName }}</h4>
                <p>{{ formatDate(activeLesson.lessonAt) }} - {{ activeLesson.durationMinutes }} min</p>
              </div>
            </header>
            <div class="meta-grid">
              <div><span>Vettura</span><strong>{{ displayValue(activeLesson.carName) }}</strong></div>
              <div><span>Coach</span><strong>{{ displayValue(activeLesson.coachName) }}</strong></div>
            </div>
            <div class="lap-grid">
              <div><span>Best iniziale</span><strong>{{ formatLap(activeLesson.initialBestLapMs) }}</strong></div>
              <div><span>Best finale</span><strong>{{ formatLap(activeLesson.finalBestLapMs) }}</strong></div>
            </div>
            <div v-if="lessonLinks.length" class="resource-links">
              <a v-for="link in lessonLinks" :key="link.label" :href="link.url" target="_blank" rel="noopener noreferrer">
                {{ link.label }}
              </a>
            </div>
            <p v-if="activeLesson.writtenNotes" class="written-note">{{ activeLesson.writtenNotes }}</p>
            <div class="feedback-list">
              <div v-for="(item, index) in activeLesson.feedbackItems" :key="index" class="feedback-item" :class="`feedback-item--${item.type}`">
                <strong>{{ item.turn || item.category }}</strong>
                <span>{{ item.message }}</span>
              </div>
            </div>
          </article>
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
  gap: 14px;
}

.pilot-context-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(360px, 1.05fr);
  gap: 24px;
  margin-top: 18px;
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
  gap: 8px;

  &--dense .context-chip {
    min-width: 92px;
  }
}

.context-chip {
  min-width: 150px;
  padding: 9px 10px;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 9px;

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
    overflow-wrap: anywhere;
    font-size: 12px;
  }
}

.accordion-trigger {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 40px;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
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
  margin-top: 14px;
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
    margin: 0 0 20px;
    font-size: 18px;
  }
}

.lesson-form,
.lesson-list,
.feedback-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 150px;
  gap: 12px;

  &--three {
    grid-template-columns: 120px 120px 1fr;
  }

  &--links {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
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
}

.primary-action {
  background: linear-gradient(135deg, $racing-red, $racing-orange);
  border: 0;
  color: #fff;

  &:disabled {
    cursor: wait;
    opacity: 0.62;
  }
}

.feedback-draft {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.draft-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  background: rgba($racing-orange, 0.08);
  border-radius: 10px;

  span {
    color: rgba(255, 255, 255, 0.75);
    font-size: 13px;
  }

  button {
    background: none;
    border: 0;
    color: #f87171;
    cursor: pointer;
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
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
  padding: 13px;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 10px;
  color: #fff;
  font-family: $font-primary;
  cursor: pointer;

  small {
    color: rgba(255, 255, 255, 0.45);
  }

  &--active {
    border-color: rgba($racing-orange, 0.42);
    background: rgba($racing-orange, 0.1);
  }
}

.lesson-detail {
  margin-top: 16px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;

  h4 {
    margin: 0 0 5px;
    font-size: 17px;
  }

  p {
    margin: 0;
    color: rgba(255, 255, 255, 0.55);
    font-size: 13px;
  }
}

.meta-grid,
.lap-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin: 14px 0;
}

.lap-grid strong {
  font-family: 'JetBrains Mono', monospace;
}

.resource-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;

  a {
    padding: 8px 10px;
    border: 1px solid rgba($racing-orange, 0.26);
    border-radius: 999px;
    color: $racing-orange;
    font-size: 12px;
    font-weight: 700;
    text-decoration: none;
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

  span {
    color: rgba(255, 255, 255, 0.62);
    font-size: 13px;
  }

  &--positive {
    border-left-color: #22c55e;
  }

  &--issue {
    border-left-color: #ef4444;
  }

  &--action {
    border-left-color: $racing-orange;
  }
}

@media (max-width: 1100px) {
  .lessons-grid,
  .pilot-context-grid,
  .form-row,
  .form-row--three,
  .form-row--links,
  .meta-grid,
  .lap-grid {
    grid-template-columns: 1fr;
  }

}
</style>
