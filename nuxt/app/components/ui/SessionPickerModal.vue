<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  formatTrackName,
  formatLapTime,
  formatTime,
  formatCarName,
  getSessionTypeLabel
} from '~/utils/telemetryFormat'
import type { SessionDocument } from '~/types/telemetry'
import { useTelemetryGateway } from '~/composables/useTelemetryGateway'
import { useSessionPickerPages } from '~/composables/useSessionPickerPages'
import { onHistoryTrack } from '~/services/projections/vehicleHistory'
import { sessionGame, sessionFilterType } from '~/services/telemetry/gameIdentity'
import { sessionTiming } from '~/services/telemetry/fuelHistorySummary'
import { X } from '@lucide/vue'
import { parseLapShareLink } from '~/services/telemetry/lapShareLink'
import { loadPublicNickname } from '~/repositories/publicProfileRepository'
import { useI18n } from '~/i18n'

const { t, intlLocale } = useI18n()

const props = defineProps<{
  isOpen: boolean
  currentTrack: string
  currentTrackId?: string
  gameId?: string
  excludeSessionId: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'select', sessionId: string, userId?: string, nickname?: string): void
  /** PIP-652: one field for every link: a lap link goes to the Telemetria as a reference. */
  (e: 'lap', link: string): void
}>()

const telemetryGateway = useTelemetryGateway()
const pages = useSessionPickerPages(
  (page, pageSize, reset) => telemetryGateway.getSessionsPage(undefined, {}, page, pageSize, reset),
  () => props.isOpen,
)
const { sessions: modalSessions, loading: isLoadingSessions, hasMore: hasMoreSessions, loadError: sessionsLoadError } = pages

// === SHARED LINK INPUT ===
const sharedLink = ref('')
const linkError = ref('')
const isLoadingLink = ref(false)

// Parse shared link to extract sessionId and userId
function parseSharedLink(url: string): { sessionId: string, userId: string } | null {
  // Pattern: /sessioni/SESSION_ID?userId=USER_ID
  const match = url.match(/\/sessioni\/([^?]+)\?userId=([^&]+)/)
  if (match && match[1] && match[2]) return { sessionId: match[1], userId: match[2] }
  return null
}

// PIP-652: a session link can also be opened (the desktop app has no address bar).
const sessionLink = computed(() => parseSharedLink(sharedLink.value))
// A new link clears the old error (it would also hide "oppure apri la sessione").
watch(sharedLink, () => { linkError.value = '' })
function openSharedSession() {
  const parsed = sessionLink.value
  if (!parsed) return
  emit('close')
  void navigateTo(`/sessioni/${encodeURIComponent(parsed.sessionId)}?userId=${encodeURIComponent(parsed.userId)}`)
}

async function loadSharedLink() {
  linkError.value = ''
  // A lap link: the Telemetria loads it as the reference (it checks track and validity there).
  if (parseLapShareLink(sharedLink.value)) {
    emit('lap', sharedLink.value.trim())
    sharedLink.value = ''
    emit('close')
    return
  }

  const parsed = parseSharedLink(sharedLink.value)
  if (!parsed) {
    linkError.value = t('sessions.picker.linkUnknown')
    return
  }
  
  isLoadingLink.value = true
  
  try {
    // 1. Fetch session from external user
    const data = await telemetryGateway.getSessionDetail(parsed.sessionId, parsed.userId, {
      warmupSessions: false
    })
    
    if (!data) {
      linkError.value = t('sessions.picker.notFound')
      return
    }
    
    // 2. Check track match
    const sessionTrack = (data.session_info?.track || '').toLowerCase().replace(/[^a-z0-9]/g, '_')
    const currentTrackNorm = props.currentTrack.toLowerCase().replace(/[^a-z0-9]/g, '_')
    
    if (!sessionTrack.includes(currentTrackNorm) && !currentTrackNorm.includes(sessionTrack)) {
      linkError.value = t('sessions.picker.trackMismatch', { track: data.session_info?.track || t('sessions.picker.unknown'), current: props.currentTrack })
      return
    }
    
    // 3. Fetch nickname
    // PIP-652: the public nickname (readable by everyone signed in): another driver's profile is private.
    const nickname = (await loadPublicNickname(parsed.userId)) || t('sessions.picker.driver')
    
    // 4. Emit with userId and nickname
    emit('select', parsed.sessionId, parsed.userId, nickname)
    emit('close')
    
  } catch (e: any) {
    console.error('[SHARE] Error loading shared session:', e)
    linkError.value = e?.code === 'permission-denied' 
      ? t('sessions.picker.denied')
      : t('sessions.picker.loadError')
  } finally {
    isLoadingLink.value = false
  }
}

// Filter sessions by same track, exclude current session
function isComparable(s: SessionDocument): boolean {
  // Exclude current session
  if (s.sessionId === props.excludeSessionId) return false
  if (props.gameId && sessionGame(s) !== props.gameId) return false
  if (props.currentTrackId) return onHistoryTrack(s, props.currentTrackId)

  // Match track
  const trackNorm = props.currentTrack.toLowerCase().replace(/[^a-z0-9]/g, '_')
  const sessionTrack = (s.meta?.track || '').toLowerCase().replace(/[^a-z0-9]/g, '_')
  return sessionTrack.includes(trackNorm) || trackNorm.includes(sessionTrack)
}

const filteredSessions = computed(() => {
  return modalSessions.value
    .filter(isComparable)
    .map(s => {
      const timing = sessionTiming(s)
      const filterType = sessionFilterType(s)
      return {
        id: s.sessionId,
        date: formatDateShort(s.meta?.date_start || ''),
        time: formatTime(s.meta?.date_start || ''),
        type: filterType === null ? 'sessione' : getSessionTypeLabel(filterType),
        car: formatCarName(s.meta?.car || ''),
        laps: s.summary?.laps || 0,
        stints: s.summary?.stintCount ?? 0,
        bestQualy: timing.qualyMs ? formatLapTime(timing.qualyMs) : null,
        bestRace: timing.raceMs ? formatLapTime(timing.raceMs) : null
      }
    })
})

function formatDateShort(dateStr: string): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  const day = date.getDate()
  const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']
  // Italian keeps its own short months; other languages use the browser's (same order: day month year).
  if (intlLocale.value === 'it-IT' || Number.isNaN(date.getTime())) return `${day} ${months[date.getMonth()]} ${date.getFullYear()}`
  return date.toLocaleDateString(intlLocale.value, { day: 'numeric', month: 'short', year: 'numeric' })
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = { practice: 'PRACTICE', qualify: 'QUALIFY', race: 'RACE', sessione: t('sessions.type.unknown') }
  return labels[type] || type.toUpperCase()
}

function selectSession(sessionId: string) {
  emit('select', sessionId)
  emit('close')
}

function closeModal() {
  emit('close')
}

// A real dialog: focus goes into the link field on open, Tab stays inside, Escape closes, and focus goes back
// to the button that opened it.
const modalEl = ref<HTMLElement | null>(null)
const linkInput = ref<HTMLInputElement | null>(null)
let openedFrom: HTMLElement | null = null
function onModalKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); closeModal(); return }
  if (event.key !== 'Tab' || !modalEl.value) return
  const focusable = [...modalEl.value.querySelectorAll<HTMLElement>('button:not([disabled]), input, [href]')]
  const first = focusable[0], last = focusable[focusable.length - 1]
  if (!first || !last) return
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}

watch(
  () => props.isOpen,
  async (isOpen) => {
    if (typeof window === 'undefined') return
    if (isOpen) {
      openedFrom = document.activeElement as HTMLElement | null
      void nextTick(() => (linkInput.value ?? modalEl.value)?.focus())
      await pages.loadFirst()
    } else {
      pages.reset()
      openedFrom?.focus?.()
      openedFrom = null
    }
  },
  { immediate: true }
)
</script>

<template>
  <Teleport to="body">
    <!-- PIP-653: the same look as "Aggiungi gara" (Panoramica): the page dimmed and blurred behind, a see-through
         panel with the sections' light edge, square fields, one red action. -->
    <div v-if="isOpen" class="cmp-backdrop" @click.self="closeModal">
      <div ref="modalEl" class="cmp-modal" role="dialog" aria-modal="true" :aria-label="t('sessions.picker.title')" tabindex="-1" @keydown="onModalKeydown">
        <header>
          <div>
            <span class="eyebrow">{{ t('sessions.picker.eyebrow') }} · {{ formatTrackName(currentTrack) }}</span>
            <h2>{{ t('sessions.picker.title') }}</h2>
          </div>
          <button type="button" class="modal-close" :aria-label="t('common.close')" @click="closeModal"><X :size="20" aria-hidden="true" /></button>
        </header>

        <section class="cmp-link">
          <div class="cmp-field">
            <label for="cmp-link-input">{{ t('sessions.picker.linkLabel') }} <small>{{ t('sessions.picker.linkHint') }}</small></label>
            <div class="cmp-link-row">
              <input id="cmp-link-input" ref="linkInput" v-model="sharedLink" type="text" :placeholder="t('sessions.picker.linkPlaceholder')" spellcheck="false" autocomplete="off" @keyup.enter="loadSharedLink" />
              <button type="button" class="rc-btn rc-btn--primary" :disabled="isLoadingLink || !sharedLink" @click="loadSharedLink">
                <UiRacingIcon name="compare" :size="16" />{{ isLoadingLink ? t('sessions.picker.loadingLink') : t('sessions.picker.compare') }}
              </button>
            </div>
          </div>
          <p v-if="linkError" class="cmp-error" role="alert">{{ linkError }}</p>
          <!-- Only for a session link: open it instead of comparing (the desktop app has no address bar). -->
          <button v-if="sessionLink" type="button" class="cmp-open" @click="openSharedSession">{{ t('sessions.picker.openSession') }}</button>
        </section>

        <section class="cmp-sessions">
          <h3>{{ t('sessions.picker.yours') }} <small>{{ isLoadingSessions ? t('sessions.picker.loadingLower') : t('sessions.picker.onTrack', { count: filteredSessions.length }) }}</small></h3>
          <div class="cmp-list">
            <button v-for="session in filteredSessions" :key="session.id" type="button" class="session-row" @click="selectSession(session.id)">
              <span class="row-left">
                <span :class="['session-chip', `session-chip--${session.type}`]">{{ getTypeLabel(session.type) }}</span>
                <span class="session-date">{{ session.date }} · {{ session.time }}</span>
                <span class="session-car">{{ session.car }}</span>
              </span>
              <span class="row-right">
                <span class="stat">{{ t('sessions.picker.stat', { laps: session.laps, stints: session.stints }) }}</span>
                <span class="time time--qualy" :class="{ 'is-empty': !session.bestQualy }">{{ t('sessions.list.qualifyAbbr') }} {{ session.bestQualy || '—' }}</span>
                <span class="time time--race" :class="{ 'is-empty': !session.bestRace }">{{ t('sessions.list.raceAbbr') }} {{ session.bestRace || '—' }}</span>
              </span>
            </button>
            <p v-if="filteredSessions.length === 0 && !isLoadingSessions" class="spm-empty">
              {{ hasMoreSessions ? t('sessions.picker.noneRecent') : t('sessions.picker.noneOther') }}
            </p>
            <p v-if="sessionsLoadError" class="spm-empty">{{ t('sessions.picker.listError') }}</p>
            <button v-if="hasMoreSessions" type="button" class="rc-btn rc-btn--compact spm-load-more" :disabled="isLoadingSessions" @click="pages.loadMore">
              {{ isLoadingSessions ? t('sessions.picker.loading') : t('sessions.picker.loadMore') }}
            </button>
          </div>
        </section>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
// PIP-653: the look of the Panoramica's "Aggiungi gara" modal (upcoming-races-card-racing.scss).
.cmp-backdrop { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 24px; background: #000000a6; backdrop-filter: blur(10px); }
:global(body:has(.electron-titlebar)) .cmp-backdrop { top: 36px; }
.cmp-modal {
  display: flex; flex-direction: column; gap: 20px; width: min(760px, 100%); max-height: calc(100dvh - 84px); padding: 28px; overflow: hidden;
  border: 1px solid var(--rc-section-line); background: #0a0a0da6; color: #fff;
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding-bottom: 20px; border-bottom: 1px solid var(--rc-section-line); }
  .eyebrow { display: block; margin-bottom: 7px; color: #aaa; font-size: 11px; letter-spacing: 1.5px; font-weight: 500; text-transform: uppercase; }
  h2 { margin: 0; font: italic 700 28px/1.2 'Racer Display', sans-serif; text-transform: uppercase; }
  // Hover: the white gets brighter (no red: red is for actions and errors).
  .modal-close { display: grid; place-items: center; width: 40px; height: 40px; flex-shrink: 0; border: 1px solid var(--rc-section-line); background: transparent; color: #ffffffc7; cursor: pointer;
    transition: color 140ms ease, border-color 140ms ease, background-color 140ms ease;
    &:hover { color: #fff; border-color: #ffffffa6; background: #ffffff12; } &:focus-visible { outline: 2px solid #fff; outline-offset: -4px; } }
}
.cmp-field { display: grid; gap: 8px; min-width: 0;
  > label { color: #ccc; font-size: 12px; font-weight: 500; letter-spacing: .3px; small { margin-left: 8px; color: #888; font-size: 11px; font-weight: 400; } } }
.cmp-link-row { display: flex; gap: 12px; align-items: stretch;
  input { flex: 1; min-width: 0; height: 46px; padding: 0 14px; border: 1px solid #ffffff30; border-radius: 0; background: #ffffff04; color: #fff; font-size: 14px;
    &::placeholder { color: #888; } &:hover { border-color: #ffffff65; } &:focus { border-color: #ff0024; outline: 1px solid #ff0024; outline-offset: 1px; } }
  .rc-btn { min-height: 46px; min-width: 156px; } }
.cmp-error { margin: 10px 0 0; padding: 8px 12px; border-left: 2px solid #ff0024; background: #ff00240a; color: #ff9aaa; font-size: 13px; }
.cmp-open { margin-top: 8px; padding: 0; border: 0; background: none; color: #ccc; font-size: 13px; text-decoration: underline; text-underline-offset: 3px; cursor: pointer;
  &:hover { color: #fff; } &:focus-visible { outline: 2px solid #fff; outline-offset: 2px; } }
.cmp-sessions { display: flex; flex-direction: column; gap: 12px; min-height: 0; padding-top: 20px; border-top: 1px solid var(--rc-section-line);
  h3 { margin: 0; font: italic 700 16px/1.2 'Racer Display', sans-serif; text-transform: uppercase; small { margin-left: 8px; color: #888; font: 400 12px 'Inter', sans-serif; text-transform: none; } } }
.cmp-list { display: grid; gap: 4px; min-height: 0; overflow-y: auto; padding-right: 2px; }
.session-row { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 12px 14px; border: 1px solid #ffffff14; background: #ffffff05; color: #e6e6ea; text-align: left; cursor: pointer;
  transition: background-color 140ms ease, border-color 140ms ease;
  &:hover { background: #ffffff10; border-color: #ffffff40; } &:focus-visible { outline: 2px solid #fff; outline-offset: -2px; } }
.row-left, .row-right { display: flex; align-items: center; gap: 12px; min-width: 0; }
.row-right { flex-shrink: 0; }
.session-chip { padding: 3px 8px; border: 1px solid currentColor; font: 700 10px 'Inter', sans-serif; letter-spacing: .06em; text-transform: uppercase;
  &--practice { color: var(--racing-practice); } &--qualify { color: var(--racing-qualify); } &--race { color: var(--racing-race); } &--sessione { color: #aaa; } }
.session-date { color: #fff; font-size: 13px; font-weight: 600; white-space: nowrap; }
.session-car { color: #aaa; font-size: 13px; overflow: hidden; white-space: nowrap; }
.stat { color: #888; font-size: 12px; white-space: nowrap; }
.time { min-width: 92px; font: italic 700 14px 'Racer Display', sans-serif; letter-spacing: .02em; text-align: right;
  &--qualy { color: var(--racing-qualify); } &--race { color: var(--racing-race); } &.is-empty { color: #555; } }
.spm-empty { margin: 8px 0; color: #888; font-size: 13px; }
.spm-load-more { justify-self: center; margin-top: 6px; }
@media (max-width: 640px) {
  .cmp-backdrop { padding: 14px; }
  .cmp-modal { max-height: calc(100dvh - 64px); padding: 20px; gap: 16px; h2 { font-size: 24px; } }
  .cmp-link-row { flex-direction: column; input { flex: 0 0 46px; } .rc-btn { min-width: 0; } }
  .session-row { flex-direction: column; align-items: flex-start; gap: 8px; }
  .row-left { flex-wrap: wrap; }
  .time { min-width: 0; text-align: left; }
}
</style>
