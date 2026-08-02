<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  CLIENT_DIAGNOSTIC_COMPONENT_OPTIONS,
  CLIENT_DIAGNOSTICS_PAGE_SIZE,
  deleteExpiredClientDiagnostics,
  diagnosticRetentionCutoffMs,
  loadClientDiagnosticsPage,
  type ClientDiagnosticItem,
  type ClientDiagnosticsFilters,
  type ClientDiagnosticsPage
} from '~/repositories/clientDiagnosticsRepository'
import type { ClientDiagnosticSeverity } from '~/services/monitoring/clientDiagnosticsService'
import {
  buildDiagnosticDateRange,
  diagnosticsViewState,
  formatItalianDiagnosticDate,
  paginationTokens,
  type DiagnosticPeriodPreset
} from '~/utils/diagnosticsPresentation'

definePageMeta({
  layout: 'coach',
  middleware: ['admin-only']
})

const events = ref<ClientDiagnosticItem[]>([])
const total = ref(0)
const currentPage = ref(1)
const isPending = ref(true)
const errorMessage = ref('')
const componentFilter = ref('all')
const severityFilter = ref<'all' | ClientDiagnosticSeverity>('all')
const periodPreset = ref<DiagnosticPeriodPreset>('7d')
const customStart = ref('')
const customEnd = ref('')
const selected = ref<ClientDiagnosticItem | null>(null)
const isCleanupRunning = ref(false)
const cleanupMessage = ref('')
const cleanupError = ref(false)

const pageCache = new Map<number, ClientDiagnosticsPage>()
let requestVersion = 0
let reloadTimer: ReturnType<typeof setTimeout> | null = null

const activeRange = computed(() => buildDiagnosticDateRange(
  periodPreset.value,
  customStart.value,
  customEnd.value
))
const activeFilters = computed<ClientDiagnosticsFilters | null>(() => {
  if (!activeRange.value) return null
  return {
    component: componentFilter.value === 'all' ? undefined : componentFilter.value,
    severity: severityFilter.value === 'all' ? undefined : severityFilter.value,
    ...activeRange.value
  }
})
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / CLIENT_DIAGNOSTICS_PAGE_SIZE)))
const pageTokens = computed(() => paginationTokens(currentPage.value, totalPages.value))
const viewState = computed(() => diagnosticsViewState({
  pending: isPending.value,
  hasEvents: events.value.length > 0,
  hasError: Boolean(errorMessage.value)
}))
const componentOptions = computed(() => [...new Set([
  ...CLIENT_DIAGNOSTIC_COMPONENT_OPTIONS,
  ...events.value.map(event => event.component)
])].sort())

function friendlyLoadError(): string {
  return 'Impossibile caricare la diagnostica. Controlla la connessione e riprova.'
}

async function fetchPage(pageNumber: number, version: number): Promise<ClientDiagnosticsPage | null> {
  const cached = pageCache.get(pageNumber)
  if (cached) return cached
  const filters = activeFilters.value
  if (!filters) return null
  const page = await loadClientDiagnosticsPage({
    filters,
    pageNumber,
  })
  if (version !== requestVersion) return null
  pageCache.set(pageNumber, page)
  return page
}

async function loadPage(pageNumber: number, options: { preserveRows?: boolean } = {}) {
  const filters = activeFilters.value
  if (!filters) {
    errorMessage.value = 'Seleziona un intervallo personalizzato valido.'
    return
  }

  const version = ++requestVersion
  isPending.value = true
  errorMessage.value = ''
  if (!options.preserveRows) events.value = []

  try {
    const requestedPage = await fetchPage(pageNumber, version)
    if (version !== requestVersion) return
    if (!requestedPage) return
    events.value = requestedPage.events
    total.value = requestedPage.total
    currentPage.value = Math.min(pageNumber, Math.max(1, Math.ceil(requestedPage.total / CLIENT_DIAGNOSTICS_PAGE_SIZE)))
    if (selected.value && !events.value.some(event => event.eventId === selected.value?.eventId)) {
      selected.value = null
    }
  } catch {
    if (version === requestVersion) errorMessage.value = friendlyLoadError()
  } finally {
    if (version === requestVersion) isPending.value = false
  }
}

async function resetAndLoad(options: { preserveRows?: boolean } = {}) {
  pageCache.clear()
  currentPage.value = 1
  await loadPage(1, options)
}

function scheduleFilterReload() {
  if (periodPreset.value === 'custom' && (!customStart.value || !customEnd.value)) return
  if (reloadTimer) clearTimeout(reloadTimer)
  reloadTimer = setTimeout(() => {
    void resetAndLoad()
  }, 0)
}

async function refreshEvents() {
  await resetAndLoad({ preserveRows: true })
}

async function goToPage(pageNumber: number) {
  if (pageNumber < 1 || pageNumber > totalPages.value || pageNumber === currentPage.value) return
  await loadPage(pageNumber)
}

function resetFilters() {
  componentFilter.value = 'all'
  severityFilter.value = 'all'
  periodPreset.value = '7d'
  customStart.value = ''
  customEnd.value = ''
}

async function runCleanup() {
  isCleanupRunning.value = true
  cleanupMessage.value = ''
  cleanupError.value = false
  try {
    const deleted = await deleteExpiredClientDiagnostics({
      cutoffMs: diagnosticRetentionCutoffMs()
    })
    cleanupMessage.value = `Eliminati ${deleted} eventi diagnostici più vecchi di 30 giorni.`
    await resetAndLoad({ preserveRows: true })
  } catch {
    cleanupError.value = true
    cleanupMessage.value = 'Pulizia non completata. Riprova senza cambiare i filtri.'
  } finally {
    isCleanupRunning.value = false
  }
}

watch(
  [componentFilter, severityFilter, periodPreset, customStart, customEnd],
  scheduleFilterReload
)
onMounted(() => resetAndLoad())
</script>

<template>
  <div class="diagnostics-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">SYSTEM MONITORING</p>
        <h1>Diagnostica client</h1>
        <p>Errori sanitizzati ricevuti da frontend, Electron, launcher, updater e logger.</p>
      </div>
      <div class="header-actions">
        <button class="cleanup-button" :disabled="isCleanupRunning" @click="runCleanup">
          {{ isCleanupRunning ? 'Eliminazione…' : 'Elimina errori più vecchi di 30 giorni' }}
        </button>
        <button class="refresh-button" :disabled="isPending" @click="refreshEvents">
          {{ viewState === 'refreshing' ? 'Aggiornamento…' : 'Aggiorna' }}
        </button>
      </div>
    </header>

    <p class="retention-note">
      Pulizia manuale globale basata sul timestamp server; nessuna cancellazione automatica.
    </p>
    <p
      v-if="cleanupMessage"
      class="cleanup-message"
      :class="{ 'cleanup-message--error': cleanupError }"
      aria-live="polite"
    >
      {{ cleanupMessage }}
    </p>

    <section class="filters" aria-label="Filtri diagnostica">
      <label>
        Componente
        <select v-model="componentFilter">
          <option value="all">Tutti i componenti</option>
          <option v-for="component in componentOptions" :key="component" :value="component">
            {{ component }}
          </option>
        </select>
      </label>
      <label>
        Severità
        <select v-model="severityFilter">
          <option value="all">Tutte le severità</option>
          <option value="warning">Warning</option>
          <option value="error">Error</option>
          <option value="fatal">Fatal</option>
        </select>
      </label>
      <label>
        Periodo
        <select v-model="periodPreset">
          <option value="today">Oggi</option>
          <option value="7d">Ultimi 7 giorni</option>
          <option value="30d">Ultimi 30 giorni</option>
          <option value="custom">Intervallo personalizzato</option>
        </select>
      </label>
      <template v-if="periodPreset === 'custom'">
        <label>
          Dal
          <input v-model="customStart" type="date" :max="customEnd || undefined">
        </label>
        <label>
          Al
          <input v-model="customEnd" type="date" :min="customStart || undefined">
        </label>
      </template>
      <span class="page-summary">Totale {{ total }} · Pagina {{ currentPage }} di {{ totalPages }}</span>
    </section>

    <p v-if="errorMessage" class="error-banner" role="alert">
      <span>{{ errorMessage }}</span>
      <button @click="loadPage(currentPage, { preserveRows: true })">Riprova</button>
    </p>

    <div v-if="viewState === 'loading'" class="loading-list" aria-label="Caricamento diagnostica">
      <div v-for="index in 4" :key="index" class="loading-card" />
    </div>

    <section v-else-if="viewState === 'error'" class="empty-state">
      <h2>Diagnostica non disponibile</h2>
      <p>Riprova quando la connessione è stabile.</p>
      <button @click="loadPage(1)">Riprova</button>
    </section>

    <section v-else-if="viewState === 'empty'" class="empty-state">
      <h2>Nessun errore nei filtri selezionati</h2>
      <p>Allarga il periodo oppure torna ai filtri predefiniti.</p>
      <button @click="resetFilters">Azzera filtri</button>
    </section>

    <div v-else class="event-list" :aria-busy="viewState === 'refreshing'">
      <article
        v-for="event in events"
        :key="event.eventId"
        class="event-card"
        role="button"
        tabindex="0"
        @click="selected = event"
        @keydown.enter="selected = event"
        @keydown.space.prevent="selected = event"
      >
        <span class="severity" :class="`severity--${event.severity}`">{{ event.severity }}</span>
        <span class="event-main">
          <strong>{{ event.component }} · {{ event.code }}</strong>
          <span>{{ event.message }}</span>
          <small>
            {{ formatItalianDiagnosticDate(event.occurredAt) }} · v{{ event.suiteVersion || '?' }}
            · {{ event.channel || 'canale sconosciuto' }}
          </small>
        </span>
        <span class="pilot-name">{{ event.pilotNickname }}</span>
      </article>
    </div>

    <nav v-if="totalPages > 1 && viewState !== 'loading'" class="pagination" aria-label="Pagine diagnostica">
      <button :disabled="currentPage === 1 || isPending" @click="goToPage(currentPage - 1)">Precedente</button>
      <template v-for="(token, index) in pageTokens" :key="`${token}-${index}`">
        <span v-if="token === 'ellipsis'" class="pagination-ellipsis">…</span>
        <button
          v-else
          :class="{ 'is-current': token === currentPage }"
          :aria-current="token === currentPage ? 'page' : undefined"
          :disabled="isPending"
          @click="goToPage(token)"
        >
          {{ token }}
        </button>
      </template>
      <button :disabled="currentPage === totalPages || isPending" @click="goToPage(currentPage + 1)">Successiva</button>
    </nav>

    <div v-if="selected" class="detail-backdrop" @click.self="selected = null">
      <article class="detail-card">
        <button class="detail-close" aria-label="Chiudi dettagli" @click="selected = null">×</button>
        <p class="eyebrow">{{ selected.component }} · {{ selected.severity }}</p>
        <h2>{{ selected.code }}</h2>
        <p>{{ selected.message }}</p>
        <dl>
          <dt>Pilota</dt><dd>{{ selected.pilotNickname }}</dd>
          <dt>Data e ora</dt><dd>{{ formatItalianDiagnosticDate(selected.occurredAt) }}</dd>
          <dt>Versione</dt><dd>{{ selected.suiteVersion || 'sconosciuta' }}</dd>
          <dt>Ricevuto</dt><dd>{{ formatItalianDiagnosticDate(selected.receivedAt) }}</dd>
        </dl>
        <pre v-if="selected.stack">{{ selected.stack }}</pre>
        <pre v-if="Object.keys(selected.context || {}).length">{{ JSON.stringify(selected.context, null, 2) }}</pre>
      </article>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

.diagnostics-page { color: #fff; }
.page-header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; margin-bottom: 24px; }
.page-header h1 { margin: 4px 0 8px; font-family: $font-primary; font-size: 32px; }
.page-header p { margin: 0; color: rgba(255,255,255,.55); }
.eyebrow { color: #a78bfa !important; font-size: 11px; font-weight: 800; letter-spacing: 1.8px; }
.header-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; }
button, select, input { border: 1px solid rgba(255,255,255,.15); background: #1b1b27; color: #fff; border-radius: 8px; padding: 10px 14px; color-scheme: dark; }
button { cursor: pointer; }
button:disabled { cursor: not-allowed; opacity: .5; }
select option { color: #fff; background: #11111b; }
.cleanup-button { border-color: rgba(248,113,113,.45); color: #fecaca; }
.retention-note { margin: -12px 0 20px; color: rgba(255,255,255,.45); font-size: 12px; }
.cleanup-message { padding: 10px 14px; color: #bbf7d0; background: rgba(34,197,94,.08); border: 1px solid rgba(34,197,94,.2); border-radius: 8px; }
.cleanup-message--error { color: #fecaca; background: rgba(239,68,68,.08); border-color: rgba(239,68,68,.2); }
.filters { display: flex; align-items: end; flex-wrap: wrap; gap: 16px; padding: 16px; margin-bottom: 16px; background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.08); border-radius: 12px; }
.filters label { display: grid; gap: 6px; color: rgba(255,255,255,.65); font-size: 11px; }
.page-summary { margin-left: auto; color: rgba(255,255,255,.65); }
.event-list, .loading-list { display: grid; gap: 8px; }
.event-card { display: grid; grid-template-columns: 70px minmax(0, 1fr) minmax(130px, auto); gap: 14px; align-items: center; width: 100%; padding: 14px; color: #fff; text-align: left; background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.08); border-radius: 10px; cursor: pointer; }
.event-card:hover { border-color: rgba(167,139,250,.5); }
.severity { padding: 5px 7px; border-radius: 6px; font-size: 10px; font-weight: 800; text-align: center; text-transform: uppercase; background: rgba(239,68,68,.15); color: #fca5a5; }
.severity--warning { background: rgba(234,179,8,.15); color: #fde047; }
.severity--fatal { background: rgba(239,68,68,.28); color: #fff; }
.event-main { display: grid; gap: 4px; min-width: 0; }
.event-main > span { overflow: hidden; color: rgba(255,255,255,.7); text-overflow: ellipsis; white-space: nowrap; }
.event-main small { color: rgba(255,255,255,.5); }
.pilot-name { color: #c4b5fd; font-weight: 700; text-align: right; }
.loading-card { height: 82px; border: 1px solid rgba(255,255,255,.07); border-radius: 10px; background: linear-gradient(90deg, rgba(255,255,255,.03), rgba(255,255,255,.09), rgba(255,255,255,.03)); background-size: 200% 100%; animation: pulse 1.2s infinite; }
.empty-state, .error-banner { padding: 28px; text-align: center; color: rgba(255,255,255,.65); border: 1px solid rgba(255,255,255,.08); border-radius: 10px; }
.empty-state h2 { margin-top: 0; color: #fff; }
.error-banner { display: flex; align-items: center; justify-content: center; gap: 12px; color: #fca5a5; }
.pagination { display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 6px; margin-top: 20px; }
.pagination button { min-width: 42px; }
.pagination button.is-current { border-color: #a78bfa; background: rgba(139,92,246,.25); }
.pagination-ellipsis { color: rgba(255,255,255,.45); padding: 0 4px; }
.detail-backdrop { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 24px; background: rgba(0,0,0,.72); }
.detail-card { position: relative; width: min(760px, 100%); max-height: 85vh; overflow: auto; padding: 24px; background: #11111b; border: 1px solid rgba(167,139,250,.35); border-radius: 14px; }
.detail-close { position: absolute; top: 10px; right: 14px; border: 0; background: transparent; color: #fff; font-size: 28px; }
.detail-card dl { display: grid; grid-template-columns: 110px 1fr; gap: 8px; margin: 20px 0; }
.detail-card dt { color: rgba(255,255,255,.5); }
.detail-card dd { margin: 0; word-break: break-word; }
.detail-card pre { padding: 14px; overflow: auto; white-space: pre-wrap; background: #09090f; border-radius: 8px; color: #c4b5fd; }

@keyframes pulse {
  from { background-position: 100% 0; }
  to { background-position: -100% 0; }
}

@media (max-width: 760px) {
  .page-header { flex-direction: column; }
  .header-actions { justify-content: flex-start; }
  .page-summary { width: 100%; margin-left: 0; }
  .event-card { grid-template-columns: 70px minmax(0, 1fr); }
  .pilot-name { grid-column: 2; text-align: left; }
}
</style>
