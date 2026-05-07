<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import {
  createRaceCalendarEvent,
  loadRaceCalendarEvents,
  type RaceCalendarEvent
} from '~/repositories/raceCalendarRepository'

const props = defineProps<{
  pilotId: string
}>()

const { currentUser } = useFirebaseAuth()

const events = ref<RaceCalendarEvent[]>([])
const isLoading = ref(false)
const isSaving = ref(false)
const isAdding = ref(false)
const errorMessage = ref('')
const form = ref({
  title: '',
  startsAt: '',
  trackName: '',
  carName: '',
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

function resetForm() {
  form.value = {
    title: '',
    startsAt: '',
    trackName: '',
    carName: '',
    simGridUrl: '',
    raceUrl: ''
  }
}

function openForm() {
  errorMessage.value = ''
  isAdding.value = true
}

function closeForm() {
  errorMessage.value = ''
  resetForm()
  isAdding.value = false
}

async function refreshEvents() {
  isLoading.value = true
  try {
    events.value = await loadRaceCalendarEvents(props.pilotId, 8)
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
    await createRaceCalendarEvent(props.pilotId, {
      ...form.value,
      createdBy: currentUser.value.uid,
      createdByRole: 'coach'
    })
    closeForm()
    await refreshEvents()
  } finally {
    isSaving.value = false
  }
}

onMounted(refreshEvents)
</script>

<template>
  <section class="race-panel">
    <div class="section-head">
      <div>
        <h3>Prossime gare</h3>
        <p>Programma del pilota.</p>
      </div>
      <button v-if="!isAdding" class="ghost-action" type="button" @click="openForm">Aggiungi</button>
      <button v-else class="ghost-action" type="button" @click="closeForm">Annulla</button>
    </div>

    <div class="race-list">
      <div v-if="isLoading" class="empty-state">Caricamento calendario...</div>
      <div v-else-if="upcomingEvents.length === 0" class="empty-state">Nessuna gara salvata.</div>
      <template v-else>
        <article v-for="event in upcomingEvents" :key="event.id" class="event-row">
          <div class="event-date">{{ formatEventDate(event.startsAt) }}</div>
          <div class="event-main">
            <h4>{{ event.title }}</h4>
            <p>{{ event.trackName }}<span v-if="event.carName"> - {{ event.carName }}</span></p>
          </div>
          <div class="event-links">
            <a v-if="event.simGridUrl" :href="event.simGridUrl" target="_blank" rel="noopener noreferrer">SimGrid</a>
            <a v-if="event.raceUrl" :href="event.raceUrl" target="_blank" rel="noopener noreferrer">Gara</a>
          </div>
        </article>
      </template>
    </div>

    <form v-if="isAdding" class="event-form" @submit.prevent="addEvent">
      <div class="form-row">
        <label>
          <span>Titolo gara</span>
          <input v-model="form.title" type="text" placeholder="Es. Gara team" />
        </label>
        <label>
          <span>Data e ora</span>
          <input v-model="form.startsAt" type="datetime-local" />
        </label>
      </div>

      <div class="form-row">
        <label>
          <span>Pista</span>
          <input v-model="form.trackName" type="text" placeholder="Es. Spa-Francorchamps" />
        </label>
        <label>
          <span>Vettura</span>
          <input v-model="form.carName" type="text" placeholder="Es. Ferrari 296 GT3" />
        </label>
      </div>

      <div class="form-row">
        <label>
          <span>SimGrid</span>
          <input v-model="form.simGridUrl" type="url" placeholder="https://..." />
        </label>
        <label>
          <span>Link gara</span>
          <input v-model="form.raceUrl" type="url" placeholder="Briefing, Discord, sito evento..." />
        </label>
      </div>

      <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p>
      <button class="primary-action" type="submit" :disabled="isSaving">
        {{ isSaving ? 'Aggiungo...' : 'Aggiungi gara al pilota' }}
      </button>
    </form>
  </section>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

.race-panel {
  min-width: 0;
}

.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 14px;

  h3 {
    margin: 0 0 5px;
    font-size: 17px;
  }

  p {
    margin: 0;
    color: rgba(255, 255, 255, 0.52);
    font-size: 13px;
  }
}

.race-list,
.event-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.event-row {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 12px;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 10px;
}

.event-date {
  color: $racing-orange;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.25;
}

.event-main {
  min-width: 0;

  h4 {
    margin: 0 0 5px;
    color: #fff;
    font-size: 15px;
    line-height: 1.2;
  }

  p {
    margin: 0;
    color: rgba(255, 255, 255, 0.56);
    font-size: 12px;
  }
}

.event-links {
  display: flex;
  gap: 8px;

  a {
    color: #60a5fa;
    font-size: 12px;
    font-weight: 700;
    text-decoration: none;
  }
}

.event-form {
  margin-top: 14px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 12px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
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

input {
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

  &[type='datetime-local']::-webkit-calendar-picker-indicator {
    filter: invert(1);
    opacity: 0.82;
    cursor: pointer;
  }
}

.ghost-action,
.primary-action {
  min-height: 38px;
  padding: 0 14px;
  border-radius: 9px;
  font-family: $font-primary;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.ghost-action {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.74);
}

.primary-action {
  align-self: flex-start;
  background: linear-gradient(135deg, $racing-red, $racing-orange);
  border: 0;
  color: #fff;

  &:disabled {
    cursor: wait;
    opacity: 0.62;
  }
}

.form-error {
  margin: 0;
  color: #f87171;
  font-size: 13px;
}

.empty-state {
  padding: 18px;
  border: 1px dashed rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  color: rgba(255, 255, 255, 0.48);
  text-align: center;
}

@media (max-width: 900px) {
  .event-row,
  .form-row {
    grid-template-columns: 1fr;
  }
}
</style>
