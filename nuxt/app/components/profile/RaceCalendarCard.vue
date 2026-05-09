<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import {
  createRaceCalendarEvent,
  deleteRaceCalendarEvent,
  loadRaceCalendarEvents,
  updateRaceCalendarEvent,
  type RaceCalendarEvent
} from '~/repositories/raceCalendarRepository'

const { currentUser } = useFirebaseAuth()

const events = ref<RaceCalendarEvent[]>([])
const isLoading = ref(false)
const isSaving = ref(false)
const isAdding = ref(false)
const errorMessage = ref('')
const editingEventId = ref('')
const form = ref({
  title: '',
  startsAt: '',
  trackName: '',
  carName: '',
  simGridUrl: '',
  raceUrl: ''
})
const loadedUserId = ref('')

const upcomingEvents = computed(() => events.value.filter((event) => event.startsAt))
const formTitle = computed(() => editingEventId.value ? 'Modifica gara' : 'Nuova gara')
const submitLabel = computed(() => {
  if (isSaving.value) return editingEventId.value ? 'Salvo...' : 'Aggiungo...'
  return editingEventId.value ? 'Salva modifiche' : 'Aggiungi evento'
})

function formatEventDay(value: string): string {
  if (!value) return 'Data'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'short'
  }).format(date)
}

function formatEventTime(value: string): string {
  if (!value) return '--:--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('it-IT', {
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
  editingEventId.value = ''
  isAdding.value = true
}

function closeForm() {
  errorMessage.value = ''
  editingEventId.value = ''
  resetForm()
  isAdding.value = false
}

function startEditEvent(event: RaceCalendarEvent) {
  errorMessage.value = ''
  editingEventId.value = event.id
  form.value = {
    title: event.title || '',
    startsAt: event.startsAt || '',
    trackName: event.trackName || '',
    carName: event.carName || '',
    simGridUrl: event.simGridUrl || '',
    raceUrl: event.raceUrl || ''
  }
  isAdding.value = true
}

async function refreshEvents(userId = currentUser.value?.uid || '') {
  if (!userId) return
  isLoading.value = true
  try {
    events.value = await loadRaceCalendarEvents(userId)
    loadedUserId.value = userId
  } finally {
    isLoading.value = false
  }
}

async function saveEvent() {
  if (!currentUser.value || isSaving.value) return
  errorMessage.value = ''

  if (!form.value.title.trim() || !form.value.startsAt || !form.value.trackName.trim()) {
    errorMessage.value = 'Titolo, data e pista sono obbligatori.'
    return
  }

  isSaving.value = true
  try {
    if (editingEventId.value) {
      await updateRaceCalendarEvent(currentUser.value.uid, editingEventId.value, form.value)
    } else {
      await createRaceCalendarEvent(currentUser.value.uid, {
        ...form.value,
        createdBy: currentUser.value.uid
      })
    }
    closeForm()
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

watch(
  () => currentUser.value?.uid,
  async (userId) => {
    if (!userId || userId === loadedUserId.value) return
    await refreshEvents(userId)
  },
  { immediate: true }
)

function handleCacheInvalidated(event: Event) {
  const detail = (event as CustomEvent<{ uid?: string | null; scope?: string }>).detail || {}
  const userId = currentUser.value?.uid || ''
  if (!userId) return
  if (detail.uid && detail.uid !== userId) return
  if (detail.scope && !['all', 'calendar', 'manual-refresh'].includes(detail.scope)) return
  void refreshEvents(userId)
}

onMounted(() => {
  window.addEventListener('acc:telemetry-cache-invalidated', handleCacheInvalidated)
})

onBeforeUnmount(() => {
  window.removeEventListener('acc:telemetry-cache-invalidated', handleCacheInvalidated)
})
</script>

<template>
  <section class="profile-card calendar-card">
    <div class="card-head">
      <h3 class="card-title">Calendario gare</h3>
      <div class="card-actions">
        <span class="card-count">{{ upcomingEvents.length }} eventi</span>
        <button v-if="!isAdding" class="secondary-action" type="button" @click="openForm">Aggiungi</button>
        <button v-else class="secondary-action" type="button" @click="closeForm">Annulla</button>
      </div>
    </div>

    <div class="calendar-layout">
      <div class="event-list">
        <div v-if="isLoading" class="empty-state">Caricamento calendario...</div>
        <div v-else-if="upcomingEvents.length === 0" class="calendar-empty-state">
          <div>
            <strong>Nessuna gara pianificata</strong>
            <span>Il prossimo evento comparira in questa lista.</span>
          </div>
          <button v-if="!isAdding" class="inline-action" type="button" @click="openForm">Pianifica gara</button>
        </div>
        <template v-else>
          <article v-for="event in upcomingEvents" :key="event.id" class="event-row">
            <div class="event-date">
              <span>{{ formatEventDay(event.startsAt) }}</span>
              <strong>{{ formatEventTime(event.startsAt) }}</strong>
            </div>
            <div class="event-main">
              <h4 :title="event.title">{{ event.title }}</h4>
              <div class="event-meta">
                <span :title="event.trackName"><strong>Pista</strong>{{ event.trackName }}</span>
                <span v-if="event.carName" :title="event.carName"><strong>Vettura</strong>{{ event.carName }}</span>
              </div>
              <div class="event-links">
                <a v-if="event.simGridUrl" :href="event.simGridUrl" target="_blank" rel="noopener">SimGrid</a>
                <a v-if="event.raceUrl" :href="event.raceUrl" target="_blank" rel="noopener">Discord / link gara</a>
              </div>
            </div>
            <div class="event-actions">
              <button class="text-action" type="button" @click="startEditEvent(event)">Modifica</button>
              <button class="icon-action" type="button" title="Rimuovi evento" @click="removeEvent(event.id)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15" />
                </svg>
              </button>
            </div>
          </article>
        </template>
      </div>

      <Transition name="event-form-expand">
        <form v-if="isAdding" class="event-form" @submit.prevent="saveEvent">
          <h4>{{ formTitle }}</h4>
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

          <label class="form-group">
            <span>Vettura</span>
            <input v-model="form.carName" type="text" placeholder="Es. Ferrari 296 GT3" />
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
            {{ submitLabel }}
          </button>
        </form>
      </Transition>
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

.card-actions {
  display: flex;
  align-items: center;
  gap: 12px;
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
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.event-form,
.event-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.event-form h4 {
  margin: 0;
  color: #fff;
  font-size: 15px;
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

.secondary-action {
  min-height: 36px;
  padding: 0 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 9px;
  color: rgba(255, 255, 255, 0.74);
  font-family: $font-primary;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.form-error {
  margin: 0;
  color: #f87171;
  font-size: 13px;
}

.empty-state {
  padding: 18px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px dashed rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  color: rgba(255, 255, 255, 0.48);
  text-align: center;
}

.calendar-empty-state {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  min-height: 74px;
  padding: 16px 18px;
  background:
    linear-gradient(135deg, rgba($racing-orange, 0.045), rgba(255, 255, 255, 0.018)),
    rgba(255, 255, 255, 0.025);
  border: 1px dashed rgba(255, 255, 255, 0.13);
  border-radius: 12px;

  div {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 5px;
  }

  strong {
    color: rgba(255, 255, 255, 0.84);
    font-size: 15px;
  }

  span {
    color: rgba(255, 255, 255, 0.46);
    font-size: 13px;
  }
}

.inline-action {
  flex: 0 0 auto;
  min-height: 36px;
  padding: 0 13px;
  background: rgba($racing-orange, 0.1);
  border: 1px solid rgba($racing-orange, 0.26);
  border-radius: 9px;
  color: $racing-orange;
  font-family: $font-primary;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;

  &:hover {
    background: rgba($racing-orange, 0.15);
    border-color: rgba($racing-orange, 0.42);
  }
}

.event-form-expand-enter-active,
.event-form-expand-leave-active {
  overflow: hidden;
  transition: opacity 0.2s ease, transform 0.2s ease, max-height 0.26s ease;
}

.event-form-expand-enter-from,
.event-form-expand-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-5px);
}

.event-form-expand-enter-to,
.event-form-expand-leave-from {
  max-height: 520px;
  opacity: 1;
  transform: translateY(0);
}

.event-row {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 12px;
}

.event-date {
  display: flex;
  flex-direction: column;
  gap: 3px;
  color: $racing-orange;
  line-height: 1.3;

  span {
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
  }

  strong {
    color: #fff;
    font-size: 15px;
  }
}

.event-main {
  min-width: 0;

  h4 {
    margin: 0 0 4px;
    color: #fff;
    font-size: 16px;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.event-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  span {
    display: inline-flex;
    min-width: 0;
    max-width: 100%;
    gap: 6px;
    color: rgba(255, 255, 255, 0.58);
    font-size: 13px;
  }

  strong {
    color: rgba(255, 255, 255, 0.42);
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
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

    &:hover {
      color: #93c5fd;
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }
}

.event-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.text-action {
  min-height: 34px;
  padding: 0 11px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 9px;
  color: rgba(255, 255, 255, 0.74);
  font-family: $font-primary;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;

  &:hover {
    color: #fff;
    border-color: rgba($racing-orange, 0.36);
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
  .event-row,
  .form-row {
    grid-template-columns: 1fr;
  }

  .event-actions {
    justify-content: flex-start;
  }

  .calendar-empty-state {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (prefers-reduced-motion: reduce) {
  .event-form-expand-enter-active,
  .event-form-expand-leave-active {
    transition: none;
  }

  .event-form-expand-enter-from,
  .event-form-expand-leave-to,
  .event-form-expand-enter-to,
  .event-form-expand-leave-from {
    transform: none;
  }
}
</style>
