<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import {
  createRaceCalendarEvent,
  deleteRaceCalendarEvent,
  loadRaceCalendarEvents,
  type RaceCalendarEvent
} from '~/repositories/raceCalendarRepository'

const { currentUser } = useFirebaseAuth()

const events = ref<RaceCalendarEvent[]>([])
const isLoading = ref(false)
const isSaving = ref(false)
const errorMessage = ref('')
const form = ref({
  title: '',
  startsAt: '',
  trackName: '',
  simGridUrl: '',
  raceUrl: ''
})

const upcomingEvents = computed(() => events.value.filter((event) => event.startsAt))

function formatEventDate(value: string): string {
  if (!value) return 'Data non impostata'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

async function refreshEvents() {
  if (!currentUser.value) return
  isLoading.value = true
  try {
    events.value = await loadRaceCalendarEvents(currentUser.value.uid)
  } finally {
    isLoading.value = false
  }
}

async function addEvent() {
  if (!currentUser.value || isSaving.value) return
  errorMessage.value = ''

  if (!form.value.title.trim() || !form.value.startsAt || !form.value.trackName.trim()) {
    errorMessage.value = 'Titolo, data e pista sono obbligatori.'
    return
  }

  isSaving.value = true
  try {
    await createRaceCalendarEvent(currentUser.value.uid, form.value)
    form.value = {
      title: '',
      startsAt: '',
      trackName: '',
      simGridUrl: '',
      raceUrl: ''
    }
    await refreshEvents()
  } finally {
    isSaving.value = false
  }
}

async function removeEvent(eventId: string) {
  if (!currentUser.value) return
  await deleteRaceCalendarEvent(currentUser.value.uid, eventId)
  events.value = events.value.filter((event) => event.id !== eventId)
}

onMounted(refreshEvents)
</script>

<template>
  <section class="profile-card calendar-card">
    <div class="card-head">
      <h3 class="card-title">Calendario gare</h3>
      <span class="card-count">{{ upcomingEvents.length }} eventi</span>
    </div>

    <div class="calendar-layout">
      <form class="event-form" @submit.prevent="addEvent">
        <div class="form-row">
          <label class="form-group">
            <span>Titolo gara</span>
            <input v-model="form.title" type="text" placeholder="Es. Endurance Sprint" />
          </label>
          <label class="form-group">
            <span>Data e ora</span>
            <input v-model="form.startsAt" type="datetime-local" />
          </label>
        </div>

        <label class="form-group">
          <span>Pista</span>
          <input v-model="form.trackName" type="text" placeholder="Es. Spa-Francorchamps" />
        </label>

        <div class="form-row">
          <label class="form-group">
            <span>Link SimGrid</span>
            <input v-model="form.simGridUrl" type="url" placeholder="https://www.thesimgrid.com/..." />
          </label>
          <label class="form-group">
            <span>Link gara</span>
            <input v-model="form.raceUrl" type="url" placeholder="Discord, sito evento, briefing..." />
          </label>
        </div>

        <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p>
        <button class="primary-action" type="submit" :disabled="isSaving">
          {{ isSaving ? 'Aggiungo...' : 'Aggiungi evento' }}
        </button>
      </form>

      <div class="event-list">
        <div v-if="isLoading" class="empty-state">Caricamento calendario...</div>
        <div v-else-if="upcomingEvents.length === 0" class="empty-state">Nessuna gara salvata.</div>
        <template v-else>
          <article v-for="event in upcomingEvents" :key="event.id" class="event-row">
            <div class="event-date">{{ formatEventDate(event.startsAt) }}</div>
            <div class="event-main">
              <h4>{{ event.title }}</h4>
              <p>{{ event.trackName }}</p>
              <div class="event-links">
                <a v-if="event.simGridUrl" :href="event.simGridUrl" target="_blank" rel="noopener">SimGrid</a>
                <a v-if="event.raceUrl" :href="event.raceUrl" target="_blank" rel="noopener">Gara</a>
              </div>
            </div>
            <button class="icon-action" type="button" title="Rimuovi evento" @click="removeEvent(event.id)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15" />
              </svg>
            </button>
          </article>
        </template>
      </div>
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
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
}

.card-title {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
}

.card-count {
  font-size: 12px;
  color: $racing-orange;
}

.calendar-layout {
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(320px, 1fr);
  gap: 24px;
}

.event-form,
.event-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;

  span {
    font-size: 11px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.5);
    text-transform: uppercase;
  }

  input {
    min-height: 44px;
    padding: 0 14px;
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

    &[type='datetime-local']::-webkit-calendar-picker-indicator {
      filter: invert(1);
      opacity: 0.82;
      cursor: pointer;
    }
  }

}

.primary-action {
  align-self: flex-start;
  min-height: 42px;
  padding: 0 18px;
  background: linear-gradient(135deg, $racing-red, $racing-orange);
  border: 0;
  border-radius: 10px;
  color: #fff;
  font-family: $font-primary;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    opacity: 0.65;
    cursor: wait;
  }
}

.form-error {
  margin: 0;
  color: #f87171;
  font-size: 13px;
}

.empty-state {
  padding: 24px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px dashed rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  color: rgba(255, 255, 255, 0.48);
  text-align: center;
}

.event-row {
  display: grid;
  grid-template-columns: 92px 1fr 36px;
  gap: 14px;
  align-items: center;
  padding: 14px;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 12px;
}

.event-date {
  color: $racing-orange;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.3;
}

.event-main {
  min-width: 0;

  h4 {
    margin: 0 0 4px;
    color: #fff;
    font-size: 14px;
  }

  p {
    margin: 0;
    color: rgba(255, 255, 255, 0.55);
    font-size: 13px;
  }
}

.event-links {
  display: flex;
  gap: 12px;
  margin-top: 8px;

  a {
    color: #60a5fa;
    font-size: 12px;
    text-decoration: none;
  }
}

.icon-action {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.28);
  border-radius: 9px;
  color: #f87171;
  cursor: pointer;

  svg {
    width: 17px;
    height: 17px;
  }
}

@media (max-width: 900px) {
  .calendar-layout,
  .form-row {
    grid-template-columns: 1fr;
  }
}
</style>
