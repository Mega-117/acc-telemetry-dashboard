<script setup lang="ts">
import { CirclePlus, X } from '@lucide/vue'
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { overviewEntryKey } from '~/services/auth/overviewEntryPreparation'
import { usePresentationInterval } from '~/composables/usePresentationVisibility'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { useRuntimeCapabilityGate } from '~/composables/useRuntimeCapabilityGate'
import {
  createRaceCalendarEvent,
  deleteRaceCalendarEvent,
  loadRaceCalendarEvents,
  loadUpcomingRaceCalendarEvents,
  updateRaceCalendarEvent,
  type RaceCalendarEvent,
  type RaceCalendarEventInput,
} from '~/repositories/raceCalendarRepository'
import { gameLabel } from '~/services/telemetry/gameCatalog'
import { preparePage } from '~/services/ui/pagePreparation'
import { getRaceCalendarCountdown } from '~/utils/raceCalendarCountdown'
import { validateRaceForm, type RaceFormErrors, type RaceFormField } from '~/utils/raceCalendarForm'
import RaceDateTimePicker from './RaceDateTimePicker.vue'
import RaceFieldError from './RaceFieldError.vue'
import RaceOptionsMenu from './RaceOptionsMenu.vue'
import { useI18n } from '~/i18n'

const props = defineProps<{
  userId: string | null | undefined
  racing?: boolean
  gameId?: string
  initialEvents?: RaceCalendarEvent[]
  initialUserId?: string
}>()

const emit = defineEmits<{ loading: [value: boolean] }>()
type ModalMode = 'create' | 'edit' | 'delete'
const { t, intlLocale } = useI18n()

const { currentUser, userRole, cloudSessionReady } = useFirebaseAuth()
const runtimeWriteGate = useRuntimeCapabilityGate().gate('cloudWrite')
const cloudWriteGate = computed(() => cloudSessionReady.value ? runtimeWriteGate.value
  : { allowed: false, message: t('overview.races.reconnect') })

const events = ref<RaceCalendarEvent[]>(props.initialUserId === props.userId ? props.initialEvents || [] : [])
const entry = inject(overviewEntryKey, null)
let loadRevision = 0
const calendarLoadError = ref(false)
const isLoading = ref(false)
watch(isLoading, value => emit('loading', value), { immediate: true, flush: 'sync' })
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
      return (!props.gameId || (event.gameId || 'acc') === props.gameId) && Number.isFinite(startsAtMs) && startsAtMs >= now
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
  if (modalMode.value === 'delete') return t('overview.races.delete')
  if (modalMode.value === 'edit') return t('overview.races.edit')
  return t('overview.races.add')
})
const modalSubmitLabel = computed(() => {
  if (isSaving.value) return t('overview.races.saving')
  if (modalMode.value === 'delete') return t('overview.races.confirmDelete')
  if (modalMode.value === 'edit') return t('overview.races.confirmEdit')
  return t('overview.races.add')
})

function formatEventDate(value: string): string {
  if (!value) return t('overview.races.noDate')
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(intlLocale.value, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

// Sottotitolo delle gare successive: stesse informazioni, iniziali maiuscole (Gio 03 Dic 2026, 21:00).
function formatShortDate(value: string): string {
  return formatEventDate(value).replace(/(^|\s)(\p{Ll})/gu, (_, space: string, letter: string) => space + letter.toUpperCase())
}

// Quanto manca a una gara successiva, senza contare sulle date: oggi, domani, tra N giorni.
function countdownText(event: RaceCalendarEvent): string {
  const countdown = getRaceCalendarCountdown(event.startsAt, new Date(nowMs.value))
  if (!countdown) return ''
  if (countdown.days === 0) return t('overview.races.today')
  return countdown.days === 1 ? t('overview.races.tomorrow') : t('overview.races.inDays', { days: countdown.days })
}

function resetForm() {
  fieldErrors.value = {}
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
  fieldErrors.value = {}
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

// PIP-641: a field's error sits under that field and goes away as soon as the field changes; errorMessage is
// left for the general ones (cloud unavailable, save failed), shown in the footer next to the buttons.
const fieldErrors = ref<RaceFormErrors>({})
watch(() => ({ ...form.value }), (now, before) => {
  for (const key of Object.keys(fieldErrors.value) as RaceFormField[]) {
    if (now[key] !== before[key]) delete fieldErrors.value[key]
  }
})
const fieldProps = (key: RaceFormField) => ({
  class: { 'is-invalid': !!fieldErrors.value[key] },
  'aria-invalid': fieldErrors.value[key] ? 'true' as const : undefined,
  'aria-describedby': `race-${key}-error`,
})

function validateForm(): RaceCalendarEventInput | null {
  fieldErrors.value = validateRaceForm(form.value, Date.now())
  if (Object.keys(fieldErrors.value).length) return null
  return {
    gameId: selectedEvent.value?.gameId || props.gameId || 'acc',
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
  if (!cloudSessionReady.value) { isLoading.value = false; return }
  if (!uid) {
    events.value = []
    isLoading.value = false
    return
  }
  isLoading.value = true
  try {
    const prepared = !props.gameId ? entry?.value?.takeEvents(uid) : null
    const result = await preparePage(() => props.gameId ? loadUpcomingRaceCalendarEvents(uid, props.gameId) : (prepared || loadRaceCalendarEvents(uid, 25)))
    if (revision === loadRevision) {
      if (result.ok) events.value = result.value
      else calendarLoadError.value = true
    }
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
    errorMessage.value = error?.message || t('overview.races.failed')
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
  () => [props.userId, props.gameId, cloudSessionReady.value],
  () => {
    events.value = []
    isModalOpen.value = false
    selectedEvent.value = null
    resetForm()
    void refreshEvents()
  },
  { immediate: !!props.gameId || !(props.initialEvents && props.initialUserId === props.userId), flush: 'sync' },
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
        <span v-if="!racing" class="eyebrow">{{ t('overview.races.calendar') }}</span>
        <h2 class="coach-title">{{ racing ? t('overview.races.nextRace') : t('overview.races.nextRaces') }}</h2>
      </div>
      <button class="race-action" type="button" :aria-label="t('overview.races.add')" :disabled="!cloudWriteGate.allowed" :title="cloudWriteGate.allowed ? t('overview.races.add') : cloudWriteGate.message" @click="openCreateModal"><CirclePlus v-if="racing" :size="32" :stroke-width="1.2" aria-hidden="true" /><span v-else>{{ t('overview.races.add') }}</span></button>
    </div>

    <div v-if="!cloudSessionReady" class="race-empty" role="status">{{ t('overview.races.offline') }}</div>
    <div v-else-if="isLoading" class="race-empty">{{ t('overview.races.loading') }}</div>
    <div v-else-if="calendarLoadError" class="race-empty" role="status">
      <span>{{ t('overview.races.unavailable') }}</span>
      <button type="button" class="race-action" @click="refreshEvents">{{ t('common.retry') }}</button>
    </div>
    <div v-else-if="!featuredEvent" class="race-empty">
      <strong>{{ t('overview.races.none') }}</strong>
      <span v-if="!racing">{{ t('overview.races.noneHint') }}</span>
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
        <RaceOptionsMenu
          v-if="racing" :label="t('overview.races.nextOptions')" :sim-grid-url="featuredEvent.simGridUrl" :race-url="featuredEvent.raceUrl"
          :disabled="!cloudWriteGate.allowed" @edit="openEditModal(featuredEvent)" @delete="openDeleteModal(featuredEvent)"
        />
        <div v-else class="race-row-actions">
          <a v-if="featuredEvent.simGridUrl" :href="featuredEvent.simGridUrl" target="_blank" rel="noopener">SimGrid</a>
          <a v-if="featuredEvent.raceUrl" :href="featuredEvent.raceUrl" target="_blank" rel="noopener">{{ t('overview.races.raceLink') }}</a>
          <button type="button" :disabled="!cloudWriteGate.allowed" :title="cloudWriteGate.allowed ? t('overview.races.edit') : cloudWriteGate.message" @click="openEditModal(featuredEvent)">{{ t('overview.races.editShort') }}</button>
          <button type="button" class="danger" :disabled="!cloudWriteGate.allowed" :title="cloudWriteGate.allowed ? t('overview.races.delete') : cloudWriteGate.message" @click="openDeleteModal(featuredEvent)">{{ t('overview.races.deleteShort') }}</button>
        </div>
      </article>

      <div v-if="secondaryEvents.length" class="race-list-block">
        <div v-if="!racing" class="race-list-header">
          <span>{{ secondaryEvents.length === 1 ? t('overview.races.followingOne') : t('overview.races.followingMany') }}</span>
          <strong>{{ secondaryEvents.length }}</strong>
        </div>
        <div class="race-list" :class="{ 'race-list--multiple': secondaryEvents.length > 1 }" :aria-label="t('overview.races.otherAria')">
          <article v-for="event in secondaryEvents" :key="event.id" class="compact-race">
            <div>
              <strong>{{ event.title }}<em v-if="countdownText(event)" class="compact-race__in"> · {{ countdownText(event) }}</em></strong>
              <span>{{ formatShortDate(event.startsAt) }} · {{ event.trackName }}</span>
            </div>
            <RaceOptionsMenu
              v-if="racing" compact :label="t('overview.races.options', { title: event.title })" :disabled="!cloudWriteGate.allowed"
              @edit="openEditModal(event)" @delete="openDeleteModal(event)"
            />
            <div v-else class="compact-actions">
              <button type="button" :disabled="!cloudWriteGate.allowed" :title="cloudWriteGate.allowed ? t('overview.races.edit') : cloudWriteGate.message" @click="openEditModal(event)">{{ t('overview.races.editShort') }}</button>
              <button type="button" class="danger" :disabled="!cloudWriteGate.allowed" :title="cloudWriteGate.allowed ? t('overview.races.delete') : cloudWriteGate.message" @click="openDeleteModal(event)">{{ t('overview.races.deleteShort') }}</button>
            </div>
          </article>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <Transition name="race-modal-motion" @after-leave="resetClosedModal">
      <div v-if="isModalOpen" class="race-modal-backdrop" :class="{ 'race-modal-backdrop--racing': racing }" @click.self="closeModal">
        <form class="race-modal" :class="{ 'race-modal--racing': racing }" novalidate role="dialog" aria-modal="true" :aria-label="modalTitle" @keydown.esc="closeModal" @submit.prevent="submitModal">
          <header>
            <div>
              <span class="eyebrow">{{ t('overview.races.calendar') }}<span v-if="gameId"> · {{ gameLabel(gameId) }}</span></span>
              <h2>{{ modalTitle }}</h2>
            </div>
            <button type="button" class="modal-close" :aria-label="t('common.close')" @click="closeModal"><X :size="20" aria-hidden="true" /></button>
          </header>

          <div v-if="modalMode === 'delete'" class="delete-confirm">
            <strong>{{ selectedEvent?.title }}</strong>
            <span>{{ selectedEvent ? formatEventDate(selectedEvent.startsAt) : '' }}</span>
            <p>{{ t('overview.races.deleteText') }}</p>
          </div>

          <template v-else>
            <label>
              <span>{{ t('overview.races.title') }}</span>
              <input v-model="form.title" type="text" :placeholder="t('overview.races.titlePlaceholder')" v-bind="fieldProps('title')" />
              <RaceFieldError id="race-title-error" :message="fieldErrors.title" />
            </label>
            <div class="form-row">
              <div class="race-field">
                <span id="race-startsAt-label">{{ t('overview.races.when') }}</span>
                <RaceDateTimePicker v-model="form.startsAt" :invalid="!!fieldErrors.startsAt" describedby="race-startsAt-label race-startsAt-error" />
                <RaceFieldError id="race-startsAt-error" :message="fieldErrors.startsAt" />
              </div>
              <label>
                <span>{{ t('overview.races.track') }}</span>
                <input v-model="form.trackName" type="text" :placeholder="t('overview.races.trackPlaceholder')" v-bind="fieldProps('trackName')" />
                <RaceFieldError id="race-trackName-error" :message="fieldErrors.trackName" />
              </label>
            </div>
            <label>
              <span>{{ t('overview.races.car') }} <small class="field-optional">{{ t('overview.races.optionalOne') }}</small></span>
              <input v-model="form.carName" type="text" :placeholder="t('overview.races.carPlaceholder')" />
            </label>
            <fieldset class="race-links">
              <legend>{{ t('overview.races.links') }} <small class="field-optional">{{ t('overview.races.optionalMany') }}</small></legend>
              <div class="form-row">
              <label>
                <span>SimGrid</span>
                <input v-model="form.simGridUrl" type="url" placeholder="https://www.thesimgrid.com/..." v-bind="fieldProps('simGridUrl')" />
                <RaceFieldError id="race-simGridUrl-error" :message="fieldErrors.simGridUrl" />
              </label>
              <label>
                <span>{{ t('overview.races.raceLink') }}</span>
                <input v-model="form.raceUrl" type="url" :placeholder="t('overview.races.linkPlaceholder')" v-bind="fieldProps('raceUrl')" />
                <RaceFieldError id="race-raceUrl-error" :message="fieldErrors.raceUrl" />
              </label>
              </div>
            </fieldset>
          </template>

          <footer>
            <!-- General errors (cloud, save failed) next to the buttons the user just pressed. -->
            <p class="footer-error" role="alert" aria-atomic="true"><Transition name="footer-error"><span v-if="errorMessage" class="form-error">{{ errorMessage }}</span></Transition></p>
            <button type="button" :class="racing ? 'rc-btn' : 'secondary-action'" :disabled="isSaving" @click="closeModal">{{ t('common.cancel') }}</button>
            <button :class="racing ? 'rc-btn rc-btn--primary' : ['primary-action', { danger: modalMode === 'delete' }]" type="submit" :disabled="isSaving || !cloudWriteGate.allowed" :title="cloudWriteGate.allowed ? modalSubmitLabel : cloudWriteGate.message">
              {{ modalSubmitLabel }}
            </button>
          </footer>
        </form>
      </div>
      </Transition>
    </Teleport>
  </section>
</template>

<style src="../../assets/scss/components/upcoming-races-card.scss" lang="scss" scoped>.upcoming-races-card--racing .race-empty { border: 0; background: transparent; border-radius: 0; padding: 12px 0; }
</style>

<style src="../../assets/scss/components/upcoming-races-card-racing.scss" lang="scss" scoped></style>
