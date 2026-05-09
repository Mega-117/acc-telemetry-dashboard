<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { loadCoachLessons, type CoachFeedbackItem, type CoachFeedbackType, type CoachLesson } from '~/repositories/coachLessonsRepository'

const { currentUser } = useFirebaseAuth()

const lessons = ref<CoachLesson[]>([])
const selectedLesson = ref<CoachLesson | null>(null)
const isLoading = ref(false)
const loadedUserId = ref('')
const trackFilter = ref('')
const carFilter = ref('')
const hasAutoSelectedInitialLesson = ref(false)

const filteredLessons = computed(() => {
  const track = trackFilter.value.trim().toLowerCase()
  const car = carFilter.value.trim().toLowerCase()

  return lessons.value.filter((lesson) => {
    const trackName = (lesson.trackName || '').toLowerCase()
    const carName = (lesson.carName || '').toLowerCase()
    return (!track || trackName.includes(track)) && (!car || carName.includes(car))
  })
})
const hasActiveFilters = computed(() => Boolean(trackFilter.value.trim() || carFilter.value.trim()))
const visibleLessonsLabel = computed(() => {
  if (!hasActiveFilters.value) return `${lessons.value.length} lezioni`
  return `${filteredLessons.value.length} di ${lessons.value.length} lezioni`
})
const activeLesson = computed(() => {
  if (selectedLesson.value && filteredLessons.value.some((lesson) => lesson.id === selectedLesson.value?.id)) {
    return selectedLesson.value
  }
  return null
})
const lessonLinks = computed(() => {
  if (!activeLesson.value) return []
  return [
    { label: 'TrackTitan pilota', url: activeLesson.value.trackTitanPilotUrl },
    { label: 'TrackTitan coach', url: activeLesson.value.trackTitanReferenceUrl },
    { label: 'Registrazione', url: activeLesson.value.recordingUrl }
  ].filter((link) => Boolean(link.url))
})

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

function formatLap(ms?: number | null): string {
  if (!ms) return '-'
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  const millis = Math.floor(ms % 1000)
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

function displayValue(value?: string | null): string {
  return value?.trim() || '-'
}

function lessonTrackLabel(lesson: CoachLesson): string {
  return lesson.trackName?.trim() || 'Lezione'
}

function toggleLesson(lesson: CoachLesson) {
  selectedLesson.value = selectedLesson.value?.id === lesson.id ? null : lesson
}

function resetFilters() {
  trackFilter.value = ''
  carFilter.value = ''
}

async function refreshLessons(userId: string) {
  isLoading.value = true
  try {
    lessons.value = await loadCoachLessons(userId)
    loadedUserId.value = userId
    if (!hasAutoSelectedInitialLesson.value) {
      selectedLesson.value = lessons.value[0] || null
      hasAutoSelectedInitialLesson.value = true
    }
  } finally {
    isLoading.value = false
  }
}

watch(
  () => currentUser.value?.uid,
  async (userId) => {
    if (!userId || userId === loadedUserId.value) return
    await refreshLessons(userId)
  },
  { immediate: true }
)

function handleCacheInvalidated(event: Event) {
  const detail = (event as CustomEvent<{ uid?: string | null; scope?: string }>).detail || {}
  const userId = currentUser.value?.uid || ''
  if (!userId) return
  if (detail.uid && detail.uid !== userId) return
  if (detail.scope && !['all', 'coach-lessons', 'manual-refresh'].includes(detail.scope)) return
  hasAutoSelectedInitialLesson.value = false
  void refreshLessons(userId)
}

onMounted(() => {
  window.addEventListener('acc:telemetry-cache-invalidated', handleCacheInvalidated)
})

onBeforeUnmount(() => {
  window.removeEventListener('acc:telemetry-cache-invalidated', handleCacheInvalidated)
})
</script>

<template>
  <section class="profile-card lessons-card">
    <div class="card-head">
      <h3 class="card-title">Lezioni coach</h3>
      <span class="card-count">{{ visibleLessonsLabel }}</span>
    </div>

    <div v-if="isLoading" class="empty-state">Caricamento lezioni...</div>
    <div v-else-if="lessons.length === 0" class="empty-state">Nessuna lezione registrata.</div>

    <template v-else>
      <div class="lesson-filters" aria-label="Filtri storico lezioni">
        <label>
          <span>Pista</span>
          <input v-model="trackFilter" type="search" placeholder="Filtra pista" />
        </label>
        <label>
          <span>Vettura</span>
          <input v-model="carFilter" type="search" placeholder="Filtra vettura" />
        </label>
        <button v-if="hasActiveFilters" class="filter-reset" type="button" @click="resetFilters">
          Reset
        </button>
      </div>

      <div v-if="filteredLessons.length === 0" class="empty-state">Nessuna lezione corrisponde ai filtri.</div>

      <div v-else class="lessons-list">
      <article
        v-for="lesson in filteredLessons"
        :key="lesson.id"
        class="lesson-accordion"
        :class="{ 'lesson-accordion--open': activeLesson?.id === lesson.id }"
      >
        <button class="lesson-row" type="button" @click="toggleLesson(lesson)">
          <span class="lesson-row__field lesson-row__track" :title="lessonTrackLabel(lesson)">
            <small>Pista/sessione</small>
            <strong>{{ lessonTrackLabel(lesson) }}</strong>
          </span>
          <span class="lesson-row__field lesson-row__car" :title="displayValue(lesson.carName)">
            <small>Vettura</small>
            <span>{{ displayValue(lesson.carName) }}</span>
          </span>
          <span class="lesson-row__field lesson-row__date" :title="formatDate(lesson.lessonAt)">
            <small>Data lezione</small>
            <span>{{ formatDate(lesson.lessonAt) }}</span>
          </span>
          <span class="lesson-row__chevron" aria-hidden="true">
            <svg viewBox="0 0 20 20" focusable="false">
              <path d="M6 8l4 4 4-4" />
            </svg>
          </span>
        </button>

        <Transition name="lesson-expand">
          <div v-if="activeLesson?.id === lesson.id" class="lesson-detail">
            <div class="lesson-detail__intro">
              <div>
                <span>Dettaglio lezione</span>
                <h4>Analisi sessione</h4>
                <p>Informazioni operative registrate dal coach.</p>
              </div>
            </div>

            <div class="meta-grid">
              <div>
                <span>Durata</span>
                <strong>{{ lesson.durationMinutes }} min</strong>
              </div>
              <div>
                <span>Coach</span>
                <strong>{{ displayValue(lesson.coachName) }}</strong>
              </div>
              <div>
                <span>Vettura</span>
                <strong>{{ displayValue(lesson.carName) }}</strong>
              </div>
              <div>
                <span>Best iniziale</span>
                <strong>{{ formatLap(lesson.initialBestLapMs) }}</strong>
              </div>
              <div>
                <span>Best finale</span>
                <strong>{{ formatLap(lesson.finalBestLapMs) }}</strong>
              </div>
            </div>

            <div v-if="lessonLinks.length" class="resource-links">
              <a v-for="link in lessonLinks" :key="link.label" :href="link.url" target="_blank" rel="noopener noreferrer">
                <span aria-hidden="true">↗</span>
                {{ link.label }}
              </a>
            </div>

            <p v-if="lesson.writtenNotes" class="written-note">{{ lesson.writtenNotes }}</p>

            <div v-if="lesson.feedbackItems.length" class="feedback-list">
              <div v-for="(item, index) in lesson.feedbackItems" :key="index" class="feedback-item" :class="`feedback-item--${item.type}`">
                <div class="feedback-item__head">
                  <span class="feedback-badge">{{ feedbackTypeLabel(item.type) }}</span>
                  <strong>{{ feedbackContext(item) || 'Feedback generale' }}</strong>
                </div>
                <span>{{ item.message }}</span>
              </div>
            </div>
          </div>
        </Transition>
      </article>
      </div>
    </template>
  </section>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

.profile-card {
  padding: 28px;
  background: #121218;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
}

.card-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  margin-bottom: 18px;
}

.card-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.card-count {
  padding: 6px 10px;
  background: rgba($racing-orange, 0.1);
  border: 1px solid rgba($racing-orange, 0.24);
  border-radius: 999px;
  color: $racing-orange;
  font-size: 12px;
  font-weight: 800;
}

.lesson-filters {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: 10px;
  align-items: end;
  margin: -2px 0 16px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 11px;

  label {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 5px;
  }

  span {
    color: rgba(255, 255, 255, 0.5);
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  input {
    min-width: 0;
    min-height: 36px;
    padding: 0 11px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    color: #fff;
    font-family: $font-primary;
    font-size: 14px;

    &::placeholder {
      color: rgba(255, 255, 255, 0.34);
    }

    &:focus {
      outline: none;
      border-color: rgba($racing-orange, 0.55);
    }
  }
}

.filter-reset {
  min-height: 36px;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.74);
  font-family: $font-primary;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;

  &:hover {
    color: #fff;
    border-color: rgba($racing-orange, 0.36);
  }
}

.empty-state {
  padding: 24px;
  border: 1px dashed rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  color: rgba(255, 255, 255, 0.48);
  text-align: center;
}

.lessons-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.lesson-accordion {
  overflow: hidden;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 12px;
  transition: border-color 0.18s ease, background 0.18s ease;

  &--open {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba($racing-orange, 0.42);

    .lesson-row {
      background: rgba($racing-orange, 0.11);
      border-color: rgba($racing-orange, 0.24);
    }

    .lesson-row__chevron {
      transform: rotate(180deg);
    }
  }
}

.lesson-row {
  display: grid;
  grid-template-columns: minmax(160px, 1.1fr) minmax(140px, 0.9fr) minmax(180px, 0.9fr) 24px;
  gap: 16px;
  align-items: center;
  width: 100%;
  padding: 15px 16px;
  background: transparent;
  border: 0;
  color: #fff;
  font-family: $font-primary;
  text-align: left;
  cursor: pointer;
  transition: background 0.18s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.045);
  }
}

.lesson-row__field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
  overflow: hidden;

  small {
    color: rgba(255, 255, 255, 0.42);
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.04em;
    line-height: 1;
    text-transform: uppercase;
  }

  strong,
  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.lesson-row__track {
  strong {
    font-size: 17px;
    font-weight: 800;
  }
}

.lesson-row__car,
.lesson-row__date {
  span {
    color: rgba(255, 255, 255, 0.58);
    font-size: 13px;
  }
}

.lesson-row__chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: $racing-orange;
  text-align: center;
  transition: transform 0.2s ease;

  svg {
    display: block;
    width: 16px;
    height: 16px;
  }

  path {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}

.lesson-detail {
  padding: 18px 16px 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);

  &__intro {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    margin: 0;
    padding-bottom: 16px;

    span {
      display: block;
      margin-bottom: 6px;
      color: rgba(255, 255, 255, 0.42);
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    h4 {
      margin: 0 0 5px;
      font-size: 18px;
    }

    p {
      margin: 0;
      color: rgba(255, 255, 255, 0.55);
      font-size: 13px;
    }
  }
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;

  div {
    padding: 14px;
    background: rgba(255, 255, 255, 0.035);
    border-radius: 10px;
  }

  span {
    display: block;
    margin-bottom: 6px;
    color: rgba(255, 255, 255, 0.45);
    font-size: 11px;
    text-transform: uppercase;
  }

  strong {
    font-family: 'JetBrains Mono', monospace;
    overflow-wrap: anywhere;
    font-size: 15px;
  }
}

.resource-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;

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
  }
}

.lesson-expand-enter-active,
.lesson-expand-leave-active {
  overflow: hidden;
  transition: opacity 0.2s ease, transform 0.2s ease, max-height 0.26s ease;
}

.lesson-expand-enter-from,
.lesson-expand-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-5px);
}

.lesson-expand-enter-to,
.lesson-expand-leave-from {
  max-height: 760px;
  opacity: 1;
  transform: translateY(0);
}

.written-note {
  padding: 14px;
  background: rgba(96, 165, 250, 0.08);
  border: 1px solid rgba(96, 165, 250, 0.18);
  border-radius: 10px;
  line-height: 1.5;
}

.feedback-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.feedback-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.035);
  border-left: 3px solid rgba(255, 255, 255, 0.18);

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

  strong {
    font-size: 12px;
    color: #fff;
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

@media (max-width: 900px) {
  .lesson-filters,
  .lesson-row,
  .meta-grid {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .lesson-accordion,
  .lesson-row,
  .lesson-row__chevron,
  .lesson-expand-enter-active,
  .lesson-expand-leave-active {
    transition: none;
  }

  .lesson-expand-enter-from,
  .lesson-expand-leave-to,
  .lesson-expand-enter-to,
  .lesson-expand-leave-from {
    transform: none;
  }
}
</style>
