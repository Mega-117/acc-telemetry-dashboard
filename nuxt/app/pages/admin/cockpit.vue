<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  loadAdminCockpitSnapshot,
  type AdminCockpitSnapshot,
} from '~/repositories/adminCockpitRepository'
import { getClientHeartbeatStatus } from '~/services/monitoring/clientHeartbeatService'
import { normalizePilotDirectoryText } from '~/utils/pilotDirectoryFields'

definePageMeta({
  layout: 'coach',
  middleware: ['admin-only'],
})

useHead({ title: 'Cockpit admin · ACC Suite' })

const snapshot = ref<AdminCockpitSnapshot | null>(null)
const loading = ref(true)
const errorMessage = ref('')
const searchTerm = ref('')
const contactFilter = ref('all')
const healthFilter = ref('all')

const filteredRows = computed(() => {
  const search = normalizePilotDirectoryText(searchTerm.value)
  return (snapshot.value?.rows || []).filter((row) => {
    const searchable = normalizePilotDirectoryText([
      row.pilot.uid,
      row.pilot.firstName,
      row.pilot.lastName,
      row.pilot.nickname,
      row.installation?.installationId,
      row.installation?.suiteVersion,
      row.installation?.components.launcher,
      row.installation?.components.logger,
      row.installation?.components.webapp,
      row.installation?.components.kokoroRuntime,
      row.installation?.health.reasonCode,
      row.installation?.migration.code,
    ].filter(Boolean).join(' '))
    if (search && !searchable.includes(search)) return false

    if (contactFilter.value !== 'all') {
      const contact = getClientHeartbeatStatus(row.installation?.lastContactAt)
      if (contactFilter.value === 'missing' && row.installation) return false
      if (contactFilter.value !== 'missing' && contact !== contactFilter.value) return false
    }

    if (healthFilter.value !== 'all') {
      if (!row.installation) return healthFilter.value === 'unknown'
      const status = row.installation.health.status.toLowerCase()
      if (healthFilter.value === 'attention') {
        return ['degraded', 'error', 'failed', 'blocked'].some((value) => status.includes(value))
          || row.installation.updateState === 'pending'
          || ['partial', 'error', 'failed', 'blocked'].some((value) => row.installation!.migration.status.includes(value))
      }
      if (healthFilter.value !== status) return false
    }
    return true
  })
})

const filtersActive = computed(() => (
  Boolean(searchTerm.value)
  || contactFilter.value !== 'all'
  || healthFilter.value !== 'all'
))

async function loadSnapshot() {
  loading.value = true
  errorMessage.value = ''
  try {
    snapshot.value = await loadAdminCockpitSnapshot()
  } catch (error: any) {
    errorMessage.value = error?.message || 'Impossibile leggere le proiezioni runtime.'
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  searchTerm.value = ''
  contactFilter.value = 'all'
  healthFilter.value = 'all'
}

onMounted(loadSnapshot)
</script>

<template>
  <div class="cockpit-page">
    <header class="page-header">
      <div>
        <p class="context-line">Amministrazione · fotografia runtime</p>
        <h1>Cockpit installazioni</h1>
        <p>Versioni, ultimo contatto e stato operativo delle installazioni ACC Suite.</p>
      </div>
      <button type="button" class="refresh-button" :disabled="loading" @click="loadSnapshot">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 11a8 8 0 10-2.34 5.66M20 4v7h-7" />
        </svg>
        {{ loading ? 'Aggiornamento…' : 'Aggiorna fotografia' }}
      </button>
    </header>

    <section class="metric-strip" aria-label="Riepilogo fotografia">
      <div class="metric metric--primary">
        <span>Installazioni</span>
        <strong>{{ snapshot?.installationCount ?? '—' }}</strong>
        <small>report per-installazione letti</small>
      </div>
      <div class="metric">
        <span>Profili</span>
        <strong>{{ snapshot?.pilotCount ?? '—' }}</strong>
        <small>nella fotografia unita</small>
      </div>
      <div class="metric">
        <span>Richiedono attenzione</span>
        <strong>{{ snapshot?.attentionCount ?? '—' }}</strong>
        <small>update, health o migrazione</small>
      </div>
      <div class="budget-note">
        <span>Budget lettura</span>
        <strong class="mono">{{ snapshot?.budget.readRequests ?? 2 }} query · max {{ snapshot?.budget.maxDocuments ?? 300 }} doc</strong>
        <small>0 listener · 0 scritture</small>
      </div>
    </section>

    <p v-if="snapshot?.coverageLimited" class="coverage-notice" role="status">
      Fotografia bounded: è stato raggiunto almeno un limite di lettura. Filtri e totali descrivono solo i dati caricati.
    </p>

    <section class="filter-bar" aria-label="Filtri installazioni">
      <label class="search-field">
        <span>Cerca</span>
        <input
          v-model="searchTerm"
          type="search"
          placeholder="Pilota, UID, installationId, versione o errore"
        />
      </label>
      <label>
        <span>Ultimo contatto</span>
        <select v-model="contactFilter">
          <option value="all">Tutti</option>
          <option value="recent">Recente</option>
          <option value="stale">Oltre 60 min</option>
          <option value="unknown">Sconosciuto</option>
          <option value="missing">Nessun report</option>
        </select>
      </label>
      <label>
        <span>Stato</span>
        <select v-model="healthFilter">
          <option value="all">Tutti</option>
          <option value="healthy">Healthy</option>
          <option value="attention">Richiede attenzione</option>
          <option value="unknown">Sconosciuto</option>
        </select>
      </label>
      <button v-if="filtersActive" type="button" class="reset-button" @click="resetFilters">
        Azzera filtri
      </button>
      <span class="result-count">{{ filteredRows.length }} risultati</span>
    </section>

    <AdminCockpitTable
      :rows="filteredRows"
      :loading="loading"
      :error="errorMessage"
      @retry="loadSnapshot"
    />
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/scss/variables' as *;

.cockpit-page { color: $text-primary; }

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: $spacing-lg;
  margin-bottom: $spacing-md;
}

.context-line {
  margin: 0 0 $spacing-xs;
  color: var(--theme-accent-light);
  font-size: 11px;
  font-weight: $font-weight-semibold;
  letter-spacing: 0.02em;
}

h1 {
  margin: 0;
  font-family: $font-primary;
  font-size: 28px;
  font-weight: $font-weight-semibold;
  letter-spacing: -0.025em;
  text-wrap: balance;
}

.page-header p:last-child {
  margin: $spacing-sm 0 0;
  color: $text-secondary;
  font-size: $font-size-sm;
}

.refresh-button {
  display: inline-flex;
  align-items: center;
  gap: $spacing-sm;
  min-height: 44px;
  padding: $spacing-sm $spacing-md;
  color: $text-primary;
  font-family: $font-primary;
  font-weight: $font-weight-medium;
  background: rgba(var(--theme-accent-rgb), 0.1);
  border: 1px solid rgba(var(--theme-accent-rgb), 0.38);
  border-radius: $radius-sm;
  cursor: pointer;
  transition: background-color 120ms ease-out, border-color 120ms ease-out;
}

.refresh-button:hover:not(:disabled) {
  background: rgba(var(--theme-accent-rgb), 0.17);
  border-color: var(--theme-accent);
}

.refresh-button:focus-visible,
.filter-bar input:focus-visible,
.filter-bar select:focus-visible,
.reset-button:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}

.refresh-button:disabled {
  opacity: 0.55;
  cursor: wait;
}

.metric-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(140px, 1fr)) minmax(220px, 1.3fr);
  gap: $spacing-sm;
  margin-bottom: $spacing-md;
}

.metric,
.budget-note {
  min-height: 92px;
  padding: $spacing-md;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: $radius-md;
}

.metric--primary {
  background: rgba(var(--theme-accent-rgb), 0.075);
  border-color: rgba(var(--theme-accent-rgb), 0.28);
}

.metric span,
.budget-note span,
.metric small,
.budget-note small {
  display: block;
  color: $text-muted;
  font-size: 11px;
}

.metric strong {
  display: block;
  margin: $spacing-xs 0;
  color: $text-primary;
  font-size: 26px;
  font-weight: $font-weight-semibold;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.03em;
}

.metric--primary strong { color: var(--theme-accent-light); }

.budget-note {
  display: grid;
  align-content: center;
  gap: $spacing-xs;
}

.budget-note strong {
  color: $text-secondary;
  font-size: $font-size-xs;
  font-weight: $font-weight-medium;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', monospace;
  font-variant-numeric: tabular-nums slashed-zero;
}

.coverage-notice {
  margin: 0 0 $spacing-md;
  padding: $spacing-sm $spacing-md;
  color: #fcd34d;
  font-size: $font-size-xs;
  background: rgba($accent-warning, 0.075);
  border: 1px solid rgba($accent-warning, 0.22);
  border-radius: $radius-sm;
}

.filter-bar {
  display: flex;
  align-items: flex-end;
  gap: $spacing-sm;
  margin-bottom: $spacing-sm;
  padding: $spacing-sm;
  background: rgba(255, 255, 255, 0.018);
  border: 1px solid rgba(255, 255, 255, 0.075);
  border-radius: $radius-sm;
}

.filter-bar label {
  display: grid;
  gap: $spacing-xs;
  color: $text-muted;
  font-size: 11px;
}

.search-field {
  flex: 1;
  min-width: 280px;
}

.filter-bar input,
.filter-bar select {
  min-height: 40px;
  padding: $spacing-sm $spacing-md;
  color: $text-primary;
  font: inherit;
  background: $bg-secondary;
  border: 1px solid rgba(255, 255, 255, 0.11);
  border-radius: $radius-sm;
}

.filter-bar input::placeholder { color: $text-muted; }

.reset-button {
  min-height: 40px;
  padding: $spacing-sm;
  color: var(--theme-accent-light);
  font: inherit;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.result-count {
  margin: 0 $spacing-sm $spacing-sm auto;
  color: $text-muted;
  font-size: $font-size-xs;
  font-variant-numeric: tabular-nums;
}

@media (max-width: $breakpoint-lg) {
  .metric-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .filter-bar { flex-wrap: wrap; }
  .search-field { flex-basis: 100%; }
}

@media (max-width: $breakpoint-md) {
  .page-header { display: grid; }
  .metric-strip { grid-template-columns: 1fr; }
  .filter-bar { display: grid; }
  .search-field { min-width: 0; }
  .result-count { margin: $spacing-sm 0 0; }
}

@media (prefers-reduced-motion: reduce) {
  .refresh-button { transition: none; }
}
</style>
