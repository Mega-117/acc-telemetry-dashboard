<script setup lang="ts">
import { CirclePlus, Ellipsis } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { useRuntimeCapabilityGate } from '~/composables/useRuntimeCapabilityGate'
import {
  createRaceCalendarEvent,
  deleteRaceCalendarEvent,
  loadRaceCalendarEvents,
  updateRaceCalendarEvent,
  type RaceCalendarEvent,
  type RaceCalendarEventInput,
} from '~/repositories/raceCalendarRepository'
import { getRaceCalendarCountdown } from '~/utils/raceCalendarCountdown'

const props = defineProps<{
  userId: string | null | undefined
  racing?: boolean
}>()

type ModalMode = 'create' | 'edit' | 'delete'

const { currentUser, userRole } = useFirebaseAuth()
const cloudWriteGate = useRuntimeCapabilityGate().gate('cloudWrite')

const events = ref<RaceCalendarEvent[]>([])
const isLoading = ref(false)
const isSaving = ref(false)
const errorMessage = ref('')
const modalMode = ref<ModalMode>('create')
const selectedEvent = ref<RaceCalendarEvent | null>(null)
const isModalOpen = ref(false)
const nowMs = ref(Date.now())
let clockTimer: number | null = null
const form = ref({
  title: '',
  startsAt: '',
  trackName: '',
  carName: '',
  simGridUrl: '',
  raceUrl: '',
})

const upcomingEvents = computed(() => {
  const now = nowMs.value
  return events.value
    .filter((event) => {
      const startsAtMs = Date.parse(event.startsAt)
      return Number.isFinite(startsAtMs) && startsAtMs >= now
    })
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
})

const featuredEvent = computed(() => upcomingEvents.value[0] || null)
const featuredCountdown = computed(() => featuredEvent.value
  ? getRaceCalendarCountdown(featuredEvent.value.startsAt, new Date(nowMs.value))
  : null,
)
const secondaryEvents = computed(() => upcomingEvents.value.slice(1))
const modalTitle = computed(() => {
  if (modalMode.value === 'delete') return 'Elimina gara'
  if (modalMode.value === 'edit') return 'Modifica gara'
  return 'Aggiungi gara'
})
const modalSubmitLabel = computed(() => {
  if (isSaving.value) return 'Salvataggio...'
  if (modalMode.value === 'delete') return 'Conferma eliminazione'
  if (modalMode.value === 'edit') return 'Conferma modifiche'
  return 'Aggiungi gara'
})

function formatEventDate(value: string): string {
  if (!value) return 'Data non impostata'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('it-IT', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function resetForm() {
  form.value = {
    title: '',
    startsAt: '',
    trackName: '',
    carName: '',
    simGridUrl: '',
    raceUrl: '',
  }
}

function hydrateForm(event: RaceCalendarEvent) {
  form.value = {
    title: event.title || '',
    startsAt: event.startsAt || '',
    trackName: event.trackName || '',
    carName: event.carName || '',
    simGridUrl: event.simGridUrl || '',
    raceUrl: event.raceUrl || '',
  }
}

function openCreateModal() {
  if (!cloudWriteGate.value.allowed) return
  errorMessage.value = ''
  selectedEvent.value = null
  modalMode.value = 'create'
  resetForm()
  isModalOpen.value = true
}

function openEditModal(event: RaceCalendarEvent) {
  if (!cloudWriteGate.value.allowed) return
  errorMessage.value = ''
  selectedEvent.value = event
  modalMode.value = 'edit'
  hydrateForm(event)
  isModalOpen.value = true
}

function openDeleteModal(event: RaceCalendarEvent) {
  if (!cloudWriteGate.value.allowed) return
  errorMessage.value = ''
  selectedEvent.value = event
  modalMode.value = 'delete'
  hydrateForm(event)
  isModalOpen.value = true
}

function closeModal() {
  if (isSaving.value) return
  errorMessage.value = ''
  selectedEvent.value = null
  isModalOpen.value = false
  resetForm()
}

function validateForm(): RaceCalendarEventInput | null {
  if (!form.value.title.trim() || !form.value.startsAt || !form.value.trackName.trim()) {
    errorMessage.value = 'Titolo, data e pista sono obbligatori.'
    return null
  }
  return {
    title: form.value.title,
    startsAt: form.value.startsAt,
    trackName: form.value.trackName,
    carName: form.value.carName,
    simGridUrl: form.value.simGridUrl,
    raceUrl: form.value.raceUrl,
    createdBy: currentUser.value?.uid,
    createdByRole: (userRole.value || 'pilot') as RaceCalendarEventInput['createdByRole'],
  }
}

async function refreshEvents() {
  if (!props.userId) {
    events.value = []
    return
  }
  isLoading.value = true
  try {
    events.value = await loadRaceCalendarEvents(props.userId, 25)
  } finally {
    isLoading.value = false
  }
}

async function submitModal() {
  if (!props.userId || isSaving.value) return
  errorMessage.value = ''
  if (!cloudWriteGate.value.allowed) {
    errorMessage.value = cloudWriteGate.value.message
    return
  }
  isSaving.value = true
  try {
    if (modalMode.value === 'delete') {
      if (!selectedEvent.value) return
      await deleteRaceCalendarEvent(props.userId, selectedEvent.value.id)
    } else {
      const payload = validateForm()
      if (!payload) return
      if (modalMode.value === 'edit' && selectedEvent.value) {
        await updateRaceCalendarEvent(props.userId, selectedEvent.value.id, payload)
      } else {
        await createRaceCalendarEvent(props.userId, payload)
      }
    }
    errorMessage.value = ''
    selectedEvent.value = null
    isModalOpen.value = false
    resetForm()
    await refreshEvents()
  } catch (error: any) {
    errorMessage.value = error?.message || 'Operazione non riuscita.'
  } finally {
    isSaving.value = false
  }
}

function handleCacheInvalidated(event: Event) {
  const detail = (event as CustomEvent<{ uid?: string | null; scope?: string }>).detail || {}
  if (!props.userId) return
  if (detail.uid && detail.uid !== props.userId) return
  if (detail.scope && !['all', 'calendar', 'manual-refresh'].includes(detail.scope)) return
  void refreshEvents()
}

watch(
  () => props.userId,
  () => void refreshEvents(),
  { immediate: true },
)

onMounted(() => {
  window.addEventListener('acc:telemetry-cache-invalidated', handleCacheInvalidated)
  clockTimer = window.setInterval(() => {
    nowMs.value = Date.now()
  }, 60_000)
})

onBeforeUnmount(() => {
  window.removeEventListener('acc:telemetry-cache-invalidated', handleCacheInvalidated)
  if (clockTimer !== null) window.clearInterval(clockTimer)
})
</script>

<template>
  <section class="upcoming-races-card coach-card" :class="{ 'upcoming-races-card--racing': racing }">
    <div class="coach-card__header race-header">
      <div>
        <span v-if="!racing" class="eyebrow">Calendario pilota</span>
        <h2 class="coach-title">{{ racing ? 'Prossima gara' : 'Prossime gare' }}</h2>
      </div>
      <button class="race-action" type="button" aria-label="Aggiungi gara" :disabled="!cloudWriteGate.allowed" :title="cloudWriteGate.allowed ? 'Aggiungi gara' : cloudWriteGate.message" @click="openCreateModal"><CirclePlus v-if="racing" :size="32" :stroke-width="1.5" aria-hidden="true" /><span v-else>Aggiungi gara</span></button>
    </div>

    <div v-if="isLoading" class="race-empty">Caricamento gare...</div>
    <div v-else-if="!featuredEvent" class="race-empty">
      <strong>Nessuna gara pianificata</strong>
      <span>Aggiungi la prossima gara per averla sempre in vista.</span>
    </div>
    <div v-else class="race-content">
      <article
        class="featured-race"
        :class="{ 'featured-race--with-list': secondaryEvents.length > 0 }"
      >
        <div
          v-if="featuredCountdown"
          class="race-countdown"
          :class="{ 'race-countdown--today': featuredCountdown.days === 0 }"
          role="status"
          aria-live="polite"
          :aria-label="featuredCountdown.ariaLabel"
        >
          <span class="race-countdown__label">{{ featuredCountdown.leadingLabel }}</span>
          <span class="race-countdown__metric">
            <strong class="race-countdown__value">{{ featuredCountdown.value }}</strong>
            <span v-if="featuredCountdown.unit" class="race-countdown__unit">{{ featuredCountdown.unit }}</span>
          </span>
          <span v-if="featuredCountdown.trailingLabel" class="race-countdown__suffix">
            {{ featuredCountdown.trailingLabel }}
          </span>
        </div>
        <div class="featured-race__main">
          <span class="race-date">{{ formatEventDate(featuredEvent.startsAt) }}</span>
          <h3>{{ featuredEvent.title }}</h3>
          <p>{{ featuredEvent.trackName }}<span v-if="featuredEvent.carName"> - {{ featuredEvent.carName }}</span></p>
        </div>
        <details v-if="racing" class="race-options">
          <summary aria-label="Opzioni prossima gara" title="Opzioni prossima gara"><Ellipsis :size="26" aria-hidden="true" /></summary>
          <div class="race-options__menu">
            <a v-if="featuredEvent.simGridUrl" :href="featuredEvent.simGridUrl" target="_blank" rel="noopener">SimGrid</a>
            <a v-if="featuredEvent.raceUrl" :href="featuredEvent.raceUrl" target="_blank" rel="noopener">Link gara</a>
            <button type="button" :disabled="!cloudWriteGate.allowed" @click="openEditModal(featuredEvent)">Modifica gara</button>
            <button type="button" :disabled="!cloudWriteGate.allowed" @click="openDeleteModal(featuredEvent)">Elimina gara</button>
          </div>
        </details>
        <div v-else class="race-row-actions">
          <a v-if="featuredEvent.simGridUrl" :href="featuredEvent.simGridUrl" target="_blank" rel="noopener">SimGrid</a>
          <a v-if="featuredEvent.raceUrl" :href="featuredEvent.raceUrl" target="_blank" rel="noopener">Link gara</a>
          <button type="button" :disabled="!cloudWriteGate.allowed" :title="cloudWriteGate.allowed ? 'Modifica gara' : cloudWriteGate.message" @click="openEditModal(featuredEvent)">Modifica</button>
          <button type="button" class="danger" :disabled="!cloudWriteGate.allowed" :title="cloudWriteGate.allowed ? 'Elimina gara' : cloudWriteGate.message" @click="openDeleteModal(featuredEvent)">Elimina</button>
        </div>
      </article>

      <div v-if="secondaryEvents.length" class="race-list-block">
        <div class="race-list-header">
          <span>{{ secondaryEvents.length === 1 ? 'Gara successiva' : 'Gare successive' }}</span>
          <strong>{{ secondaryEvents.length }}</strong>
        </div>
        <div class="race-list" aria-label="Altre gare pianificate">
          <article v-for="event in secondaryEvents" :key="event.id" class="compact-race">
            <div>
              <strong>{{ event.title }}</strong>
              <span>{{ formatEventDate(event.startsAt) }} - {{ event.trackName }}</span>
            </div>
            <div class="compact-actions">
              <button type="button" :disabled="!cloudWriteGate.allowed" :title="cloudWriteGate.allowed ? 'Modifica gara' : cloudWriteGate.message" @click="openEditModal(event)">Modifica</button>
              <button type="button" class="danger" :disabled="!cloudWriteGate.allowed" :title="cloudWriteGate.allowed ? 'Elimina gara' : cloudWriteGate.message" @click="openDeleteModal(event)">Elimina</button>
            </div>
          </article>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="isModalOpen" class="race-modal-backdrop" @click.self="closeModal">
        <form class="race-modal" :class="{ 'race-modal--racing': racing }" role="dialog" aria-modal="true" :aria-label="modalTitle" @keydown.esc="closeModal" @submit.prevent="submitModal">
          <header>
            <div>
              <span class="eyebrow">Calendario pilota</span>
              <h2>{{ modalTitle }}</h2>
            </div>
            <button type="button" class="modal-close" aria-label="Chiudi" @click="closeModal">&times;</button>
          </header>

          <div v-if="modalMode === 'delete'" class="delete-confirm">
            <strong>{{ selectedEvent?.title }}</strong>
            <span>{{ selectedEvent ? formatEventDate(selectedEvent.startsAt) : '' }}</span>
            <p>Conferma l'eliminazione della gara dal calendario.</p>
          </div>

          <template v-else>
            <div class="form-row">
              <label>
                <span>Titolo gara</span>
                <input v-model="form.title" type="text" placeholder="Es. Endurance Sprint" />
              </label>
              <label>
                <span>Data e ora</span>
                <input v-model="form.startsAt" type="datetime-local" />
              </label>
            </div>
            <label>
              <span>Pista</span>
              <input v-model="form.trackName" type="text" placeholder="Es. Spa-Francorchamps" />
            </label>
            <label>
              <span>Vettura</span>
              <input v-model="form.carName" type="text" placeholder="Es. Ferrari 296 GT3" />
            </label>
            <div class="form-row">
              <label>
                <span>SimGrid</span>
                <input v-model="form.simGridUrl" type="url" placeholder="https://www.thesimgrid.com/..." />
              </label>
              <label>
                <span>Link gara</span>
                <input v-model="form.raceUrl" type="url" placeholder="Briefing, Discord, sito evento..." />
              </label>
            </div>
          </template>

          <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p>

          <footer>
            <button type="button" class="secondary-action" :disabled="isSaving" @click="closeModal">Annulla</button>
            <button class="primary-action" :class="{ danger: modalMode === 'delete' }" type="submit" :disabled="isSaving || !cloudWriteGate.allowed" :title="cloudWriteGate.allowed ? modalSubmitLabel : cloudWriteGate.message">
              {{ modalSubmitLabel }}
            </button>
          </footer>
        </form>
      </div>
    </Teleport>
  </section>
</template>

<style src="../../assets/scss/components/upcoming-races-card.scss" lang="scss" scoped></style>

<style scoped lang="scss">
.race-modal--racing {
  border-radius: 0; border-color: #aaa; background: #101010;
  h2 { font-family: 'Racer Display', sans-serif; font-style: italic; text-transform: uppercase; }
  .primary-action { background: #ff0024; border-radius: 0; }
  input { border-radius: 0; }
}
.upcoming-races-card--racing {
  border: 1px solid #b4b4b4; border-radius: 0; background: transparent; box-shadow: none;
  min-height: 192px; max-height: none; padding: 18px; overflow: visible;
  .coach-title { font: italic 700 19px/1.3 'Racer Display', sans-serif; text-transform: uppercase; }
  .race-header { margin-bottom: 14px; }
  .race-action { display: grid; place-items: center; width: 40px; height: 40px; min-height: 40px; padding: 4px; border: 0; border-radius: 0; color: #fff; background: none; line-height: 1; }
  .race-action svg, summary svg { display: block; flex-shrink: 0; }
  .featured-race { position: relative; border: 0; background: transparent; border-radius: 0; padding: 0 0 8px; min-height: 116px;
    grid-template-columns: minmax(86px,.32fr) minmax(0,1fr); grid-template-areas: 'countdown main'; gap: 16px; }
  .race-countdown { padding-right: 16px; align-items: center; border-color: #ffffff80; }
  .race-countdown__label { order: 2; }
  .race-countdown__metric { margin: 0; flex-direction: column; align-items: center; gap: 5px; }
  .race-countdown__value { font: italic 700 76px/.9 'Racer Display', sans-serif; }
  .race-countdown__label, .race-countdown__unit, .race-countdown__suffix { color: #ddd; font-size: 10px; letter-spacing: 2px; font-weight: 500; }
  .race-countdown__suffix { display: none; }
  .race-countdown--today .race-countdown__value { font-size: 38px; color: #fff; }
  .race-date { font-size: 12px; color: #ddd; font-weight: 400; margin-bottom: 8px; }
  .featured-race h3 { font: italic 700 clamp(19px,1.8vw,29px)/1.15 'Racer Display', sans-serif; }
  .featured-race p { color: #ccc; font-size: 13px; margin-top: 8px; padding-right: 22px; }
  .race-options { position: absolute; bottom: -8px; right: 0; z-index: 10; }
  summary { display: grid; place-items: center; list-style: none; cursor: pointer; padding: 7px; width: 40px; height: 40px; }
  summary::-webkit-details-marker { display: none; }
  .race-options__menu { position: absolute; right: 0; top: 100%; min-width: 155px; display: grid; border: 1px solid #777; padding: 6px; background: #111; box-shadow: 0 12px 24px #0009; }
  .race-options__menu a, .race-options__menu button { text-align: left; padding: 10px; color: #eee; background: none; border: 0; text-decoration: none; font: 13px 'Segoe UI', sans-serif; cursor: pointer; }
  .race-options__menu a:hover, .race-options__menu button:hover { background: #ffffff15; }
  button:disabled { opacity: .4; cursor: default; }
  summary:focus-visible, button:focus-visible, a:focus-visible { outline: 2px solid white; outline-offset: 2px; }
  .race-list-block { border-top: 1px solid #ffffff25; }
  .race-list { max-height: 140px; overflow-y: auto; }
  .compact-race { background: transparent; border-radius: 0; }
}
</style>


