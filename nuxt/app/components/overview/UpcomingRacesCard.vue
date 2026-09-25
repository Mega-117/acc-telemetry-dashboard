<script setup lang="ts">
import { CirclePlus, Ellipsis, ExternalLink, Pencil, Trash2, X } from '@lucide/vue'
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { overviewEntryKey } from '~/services/auth/overviewEntryPreparation'
import { usePresentationInterval } from '~/composables/usePresentationVisibility'
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
const entry = inject(overviewEntryKey, null)
let loadRevision = 0
const calendarLoadError = ref(false)
const isLoading = ref(false)
const isSaving = ref(false)
const errorMessage = ref('')
const modalMode = ref<ModalMode>('create')
const selectedEvent = ref<RaceCalendarEvent | null>(null)
const isModalOpen = ref(false)
const nowMs = ref(Date.now())
const clockActivity = usePresentationInterval(() => { nowMs.value = Date.now() }, 60_000)
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
  isModalOpen.value = false
}

function resetClosedModal() {
  // Keep the outgoing content stable; a quick reopen must retain its new draft.
  if (isModalOpen.value) return
  errorMessage.value = ''
  selectedEvent.value = null
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
  const revision = ++loadRevision
  const uid = props.userId
  calendarLoadError.value = false
  if (!uid) {
    events.value = []
    isLoading.value = false
    return
  }
  isLoading.value = true
  try {
    const prepared = entry?.value?.takeEvents(uid)
    const result = await (prepared || loadRaceCalendarEvents(uid, 25))
    if (revision === loadRevision) events.value = result
  } catch {
    if (revision === loadRevision) calendarLoadError.value = true
  } finally {
    if (revision === loadRevision) isLoading.value = false
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
    isModalOpen.value = false
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
  clockActivity.start()
})

onBeforeUnmount(() => {
  loadRevision += 1
  window.removeEventListener('acc:telemetry-cache-invalidated', handleCacheInvalidated)
  clockActivity.stop()
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
    <div v-else-if="calendarLoadError" class="race-empty" role="status">
      <span>Calendario non disponibile.</span>
      <button type="button" class="race-action" @click="refreshEvents">Riprova</button>
    </div>
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
            <a v-if="featuredEvent.simGridUrl" :href="featuredEvent.simGridUrl" target="_blank" rel="noopener"><ExternalLink :size="17" aria-hidden="true" /><span>SimGrid</span></a>
            <a v-if="featuredEvent.raceUrl" :href="featuredEvent.raceUrl" target="_blank" rel="noopener"><ExternalLink :size="17" aria-hidden="true" /><span>Link gara</span></a>
            <button type="button" class="race-options__edit" :disabled="!cloudWriteGate.allowed" @click="openEditModal(featuredEvent)"><Pencil :size="17" aria-hidden="true" /><span>Modifica gara</span></button>
            <button type="button" class="race-options__delete" :disabled="!cloudWriteGate.allowed" @click="openDeleteModal(featuredEvent)"><Trash2 :size="17" aria-hidden="true" /><span>Elimina gara</span></button>
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
      <Transition name="race-modal-motion" @after-leave="resetClosedModal">
      <div v-if="isModalOpen" class="race-modal-backdrop" :class="{ 'race-modal-backdrop--racing': racing }" @click.self="closeModal">
        <form class="race-modal" :class="{ 'race-modal--racing': racing }" role="dialog" aria-modal="true" :aria-label="modalTitle" @keydown.esc="closeModal" @submit.prevent="submitModal">
          <header>
            <div>
              <span class="eyebrow">Calendario pilota</span>
              <h2>{{ modalTitle }}</h2>
            </div>
            <button type="button" class="modal-close" aria-label="Chiudi" @click="closeModal"><X :size="20" aria-hidden="true" /></button>
          </header>

          <div v-if="modalMode === 'delete'" class="delete-confirm">
            <strong>{{ selectedEvent?.title }}</strong>
            <span>{{ selectedEvent ? formatEventDate(selectedEvent.startsAt) : '' }}</span>
            <p>Conferma l'eliminazione della gara dal calendario.</p>
          </div>

          <template v-else>
            <label>
              <span>Titolo gara</span>
              <input v-model="form.title" type="text" placeholder="Es. Endurance Sprint" />
            </label>
            <div class="form-row">
              <label>
                <span>Data e ora</span>
                <input v-model="form.startsAt" type="datetime-local" />
              </label>
              <label>
                <span>Pista</span>
                <input v-model="form.trackName" type="text" placeholder="Es. Spa-Francorchamps" />
              </label>
            </div>
            <label>
              <span>Vettura <small class="field-optional">Facoltativa</small></span>
              <input v-model="form.carName" type="text" placeholder="Es. Ferrari 296 GT3" />
            </label>
            <fieldset class="race-links">
              <legend>Link utili <small class="field-optional">Facoltativi</small></legend>
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
            </fieldset>
          </template>

          <div v-if="racing || errorMessage" class="race-error-slot" :class="{ 'race-error-slot--reserved': racing }" aria-live="polite" aria-atomic="true">
            <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p>
          </div>

          <footer>
            <button type="button" class="secondary-action" :class="{ 'racing-button': racing }" :disabled="isSaving" @click="closeModal">Annulla</button>
            <button class="primary-action" :class="{ danger: modalMode === 'delete', 'racing-button racing-button--primary': racing }" type="submit" :disabled="isSaving || !cloudWriteGate.allowed" :title="cloudWriteGate.allowed ? modalSubmitLabel : cloudWriteGate.message">
              {{ modalSubmitLabel }}
            </button>
          </footer>
        </form>
      </div>
      </Transition>
    </Teleport>
  </section>
</template>

<style src="../../assets/scss/components/upcoming-races-card.scss" lang="scss" scoped></style>

<style scoped lang="scss">
.race-modal-motion-enter-active { transition: opacity 220ms ease; }
.race-modal-motion-leave-active { transition: opacity 160ms ease; }
.race-modal-motion-enter-active .race-modal { transition: transform 220ms cubic-bezier(.2,.7,.2,1); }
.race-modal-motion-leave-active .race-modal { transition: transform 160ms ease; }
.race-modal-motion-enter-from, .race-modal-motion-leave-to { opacity: 0; }
.race-modal-motion-enter-from .race-modal, .race-modal-motion-leave-to .race-modal { transform: translateY(10px) scale(.98); }
.race-error-slot--reserved { height: 56px; min-height: 56px; overflow: auto; }
@media (prefers-reduced-motion: reduce) {
  .race-modal-motion-enter-active, .race-modal-motion-leave-active,
  .race-modal-motion-enter-active .race-modal, .race-modal-motion-leave-active .race-modal { transition-duration: 1ms; }
  .race-modal-motion-enter-from .race-modal, .race-modal-motion-leave-to .race-modal { transform: none; }
}
.race-links { min-width: 0; margin: 0; padding: 14px 0 0; border: 0; border-top: 1px solid #ffffff24; }
.race-links legend { padding: 0 10px 0 0; color: #ddd; font-size: 12px; text-transform: uppercase; }
.field-optional { margin-left: 8px; color: #888; font-size: 11px; font-weight: 400; text-transform: none; letter-spacing: 0; }
.race-modal-backdrop--racing { background: #000b; backdrop-filter: blur(5px); }
:global(body:has(.electron-titlebar) .race-modal-backdrop--racing) { top: 36px; }
.race-modal--racing {
  width: min(680px, 100%); max-height: calc(100dvh - 84px); padding: 28px; gap: 20px;
  border-radius: 0; border-color: #ffffff65;
  background: radial-gradient(ellipse at top right, #6b001b30, transparent 65%), #090909;
  box-shadow: 0 24px 90px #000b;
  header { align-items: flex-start; padding-bottom: 20px; border-bottom: 1px solid #ffffff24; }
  .eyebrow { display: block; margin-bottom: 7px; color: #aaa; font-size: 11px; letter-spacing: 1.5px; font-weight: 500; }
  h2 { font: italic 700 28px/1.2 'Racer Display', sans-serif; text-transform: uppercase; }
  .modal-close { display: grid; place-items: center; width: 40px; height: 40px; flex-shrink: 0; border: 1px solid #ffffff65; border-radius: 0; background: transparent; }
  .modal-close:hover { color: #ff0024; border-color: #ff0024; }
  .form-row { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  label { min-width: 0; gap: 8px; }
  label > span { color: #ccc; font-size: 12px; font-weight: 500; letter-spacing: .3px; }
  input { width: 100%; min-width: 0; height: 46px; border-radius: 0; border-color: #ffffff30; background: #ffffff04; font-size: 14px; font-weight: 400; }
  input::placeholder { color: #888; }
  input:hover { border-color: #ffffff65; }
  input:focus { border-color: #ff0024; outline: 1px solid #ff0024; outline-offset: 1px; }
  button:focus-visible { outline: 2px solid #fff; outline-offset: -4px; }
  footer { flex-direction: row; justify-content: flex-end; gap: 12px; padding-top: 20px; border-top: 1px solid #ffffff24; }
  footer .racing-button { min-width: 156px; min-height: 46px; padding: 10px 22px; border-radius: 0; font: 500 14px/1.2 'Segoe UI', sans-serif; text-transform: uppercase; }
  .secondary-action { background: transparent; border: 1px solid #c9c9c9; color: #fff; }
  .primary-action { background: #ff0024; }
  .primary-action:hover:not(:disabled) { background: #d90020; }
  .secondary-action:hover:not(:disabled) { background: #ffffff12; }
  .delete-confirm { border-radius: 0; border-color: #ff002450; background: #ff00240a; padding: 18px; gap: 12px; }
  .form-error { color: #ff9aaa; padding: 12px; border-left: 2px solid #ff0024; background: #ff00240a; }
}
@media (max-width: 560px) {
  .race-modal-backdrop--racing { padding: 14px; }
  .race-modal--racing {
    max-height: calc(100dvh - 64px); padding: 20px; gap: 16px;
    .form-row { grid-template-columns: 1fr; }
    footer .racing-button { min-width: 0; flex: 1; padding-inline: 12px; }
    h2 { font-size: 24px; }
  }
}
.upcoming-races-card--racing {
  border: 1px solid rgba(255, 255, 255, 0.3960784314); border-radius: 0; background: transparent; box-shadow: none;
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
  .race-options[open] > summary { color: #ff0024; background: #ff002412; }
  .race-options[open] .race-options__menu { animation: race-menu-in 180ms ease-out both; }
  @keyframes race-menu-in {
    from { opacity: 0; transform: translateY(-6px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .race-options[open] .race-options__menu { animation: none; }
  }
  .race-options__menu {
    position: absolute; right: 0; top: calc(100% + 6px); width: 216px;
    max-width: calc(100vw - 48px); display: grid; gap: 2px;
    border: 1px solid #ffffff65; padding: 6px;
    background: radial-gradient(ellipse at top right, #62001628, transparent 75%), #090909;
    box-shadow: 0 12px 32px #000b;
  }
  .race-options__menu a, .race-options__menu button {
    display: flex; align-items: center; gap: 12px; min-height: 44px; width: 100%;
    text-align: left; padding: 10px 12px; color: #eee; background: transparent;
    border: 0; border-left: 2px solid transparent; border-radius: 0;
    text-decoration: none; font: 500 14px/1.3 'Segoe UI', sans-serif; cursor: pointer;
    transition: background-color 140ms ease, border-color 140ms ease;
  }
  .race-options__menu svg { flex-shrink: 0; color: #b4b4b4; }
  .race-options__menu a + .race-options__edit { border-top: 1px solid #ffffff24; margin-top: 4px; }
  .race-options__menu .race-options__delete { color: #ff7a8e; }
  .race-options__menu .race-options__delete svg { color: currentColor; }
  .race-options__menu a:hover, .race-options__menu button:hover:not(:disabled) { background: #ff002418; border-left-color: #ff0024; }
  .race-options__menu a:focus-visible, .race-options__menu button:focus-visible { outline: 1px solid #fff; outline-offset: -2px; background: #ffffff0a; }
  button:disabled { opacity: .4; cursor: default; }
  summary:focus-visible, button:focus-visible, a:focus-visible { outline: 2px solid white; outline-offset: 2px; }
  .race-list-block { border-top: 1px solid #ffffff25; }
  .race-list { max-height: 140px; overflow-y: auto; }
  .compact-race { background: transparent; border-radius: 0; }
}
</style>


