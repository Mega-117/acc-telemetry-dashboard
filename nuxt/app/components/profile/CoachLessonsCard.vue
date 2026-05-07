<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { loadCoachLessons, type CoachLesson } from '~/repositories/coachLessonsRepository'

const { currentUser } = useFirebaseAuth()

const lessons = ref<CoachLesson[]>([])
const selectedLesson = ref<CoachLesson | null>(null)
const isLoading = ref(false)

const activeLesson = computed(() => selectedLesson.value || lessons.value[0] || null)
const lessonLinks = computed(() => {
  if (!activeLesson.value) return []
  return [
    { label: 'TrackTitan pilota', url: activeLesson.value.trackTitanPilotUrl },
    { label: 'TrackTitan coach', url: activeLesson.value.trackTitanReferenceUrl },
    { label: 'Registrazione', url: activeLesson.value.recordingUrl }
  ].filter((link) => Boolean(link.url))
})

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

onMounted(async () => {
  if (!currentUser.value) return
  isLoading.value = true
  try {
    lessons.value = await loadCoachLessons(currentUser.value.uid)
  } finally {
    isLoading.value = false
  }
})
</script>

<template>
  <section class="profile-card lessons-card">
    <div class="card-head">
      <h3 class="card-title">Lezioni coach</h3>
      <span class="card-count">{{ lessons.length }} lezioni</span>
    </div>

    <div v-if="isLoading" class="empty-state">Caricamento lezioni...</div>
    <div v-else-if="lessons.length === 0" class="empty-state">Nessuna lezione registrata.</div>

    <div v-else class="lessons-layout">
      <div class="lessons-list">
        <template v-for="lesson in lessons" :key="lesson.id">
          <button
            class="lesson-row"
            :class="{ 'lesson-row--active': activeLesson?.id === lesson.id }"
            type="button"
            @click="selectedLesson = lesson"
          >
            <span>{{ lesson.trackName }}</span>
            <small>{{ formatDate(lesson.lessonAt) }}</small>
          </button>
        </template>
      </div>

      <article v-if="activeLesson" class="lesson-detail">
        <header>
          <div>
            <h4>{{ activeLesson.trackName }}</h4>
            <p>{{ formatDate(activeLesson.lessonAt) }} - {{ activeLesson.durationMinutes }} min</p>
          </div>
          <span>{{ activeLesson.coachName || 'Coach' }}</span>
        </header>

        <div class="meta-grid">
          <div>
            <span>Vettura</span>
            <strong>{{ displayValue(activeLesson.carName) }}</strong>
          </div>
          <div>
            <span>Coach</span>
            <strong>{{ displayValue(activeLesson.coachName) }}</strong>
          </div>
        </div>

        <div class="lap-grid">
          <div>
            <span>Best iniziale</span>
            <strong>{{ formatLap(activeLesson.initialBestLapMs) }}</strong>
          </div>
          <div>
            <span>Best finale</span>
            <strong>{{ formatLap(activeLesson.finalBestLapMs) }}</strong>
          </div>
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
    </div>
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
  margin-bottom: 22px;
}

.card-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.card-count {
  color: $racing-orange;
  font-size: 12px;
}

.empty-state {
  padding: 24px;
  border: 1px dashed rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  color: rgba(255, 255, 255, 0.48);
  text-align: center;
}

.lessons-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 22px;
}

.lessons-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  padding: 18px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;

  header {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
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

  header > span {
    color: #60a5fa;
    font-size: 13px;
    font-weight: 700;
  }
}

.meta-grid,
.lap-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
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
    font-size: 17px;
  }
}

.resource-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;

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
  }

  &--issue {
    border-left-color: #ef4444;
  }

  &--action {
    border-left-color: $racing-orange;
  }
}

@media (max-width: 900px) {
  .lessons-layout,
  .meta-grid,
  .lap-grid {
    grid-template-columns: 1fr;
  }
}
</style>
