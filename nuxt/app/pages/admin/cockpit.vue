<script setup lang="ts">
import { PRODUCT } from '../../../shared/productIdentity'
import { computed, onMounted, ref } from 'vue'
import {
  installationNeedsAttention,
  loadAdminCockpitSnapshot,
  type AdminCockpitInstallation,
  type AdminCockpitSnapshot,
} from '~/repositories/adminCockpitRepository'
import {
  ACTIVE_WINDOW_DAYS,
  isActiveWithinDays,
  isOnLatestVersion,
  isTestOwner,
  latestVersionByChannel,
  summarizeStabilityPopulation,
} from '~/utils/adminInstallationScope'
import { getClientHeartbeatStatus } from '~/services/monitoring/clientHeartbeatService'
import { normalizePilotDirectoryText } from '~/utils/pilotDirectoryFields'

definePageMeta({
  layout: 'coach',
  middleware: ['admin-only'],
})

useHead({ title: `Cockpit admin · ${PRODUCT.displayName}` })

const snapshot = ref<AdminCockpitSnapshot | null>(null)
const loading = ref(true)
const errorMessage = ref('')
const searchTerm = ref('')
const contactFilter = ref('all')
const healthFilter = ref('all')
// Perimetro del cancello di stabilita': reali, attive negli ultimi 7 giorni, ultima versione
// del proprio canale. Sono filtri di lettura: nessun documento viene cancellato.
const hideTests = ref(true)
const activeOnly = ref(true)
const latestOnly = ref(true)
const now = ref(Date.now())

const allInstallations = computed<AdminCockpitInstallation[]>(() => (
  (snapshot.value?.rows || []).flatMap((row) => (row.installation ? [row.installation] : []))
))
const population = computed(() => summarizeStabilityPopulation(allInstallations.value, now.value))
const latestVersions = computed(() => latestVersionByChannel(
  allInstallations.value.filter((item) => !isTestOwner(item.ownerUid) && isActiveWithinDays(item, now.value)),
))
const latestSummary = computed(() => Object.entries(population.value.byChannel)
  .map(([channel, info]) => `${channel} ${info.version ?? '—'}`).join(' · ') || 'nessuna installazione attiva')
const scopedInstallations = computed(() => allInstallations.value.filter((item) => (
  !isTestOwner(item.ownerUid) && isActiveWithinDays(item, now.value)
  && isOnLatestVersion(item, latestVersions.value)
)))
const scopedAttention = computed(() => scopedInstallations.value.filter(installationNeedsAttention).length)
// Uno zero vale solo per le installazioni che hanno scritto di recente: le altre non hanno potuto
// segnalare problemi, quindi lo diciamo invece di lasciar credere che stiano bene.
const scopedWithoutRecentContact = computed(() => scopedInstallations.value.filter((item) => (
  getClientHeartbeatStatus(item.lastContactAt) !== 'recent'
)).length)

function passesScope(row: { installation: AdminCockpitInstallation | null }): boolean {
  const installation = row.installation
  if (!installation) return !activeOnly.value && !latestOnly.value
  if (hideTests.value && isTestOwner(installation.ownerUid)) return false
  if (activeOnly.value && !isActiveWithinDays(installation, now.value)) return false
  if (latestOnly.value && !isOnLatestVersion(installation, latestVersions.value)) return false
  return true
}

const filteredRows = computed(() => {
  const search = normalizePilotDirectoryText(searchTerm.value)
  return (snapshot.value?.rows || []).filter((row) => {
    if (!passesScope(row)) return false
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
  || !hideTests.value || !activeOnly.value || !latestOnly.value
  || contactFilter.value !== 'all'
  || healthFilter.value !== 'all'
))

async function loadSnapshot() {
  loading.value = true
  errorMessage.value = ''
  try {
    now.value = Date.now()
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
  hideTests.value = true
  activeOnly.value = true
  latestOnly.value = true
}

onMounted(loadSnapshot)
</script>

<template>
  <div class="cockpit-page">
    <header class="page-header">
      <div>
        <p class="context-line">Amministrazione · fotografia runtime</p>
        <h1>Cockpit installazioni</h1>
        <p>Versioni, ultimo contatto e stato operativo delle installazioni {{ PRODUCT.displayName }}.</p>
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
        <span>Contano per la settimana di stabilità</span>
        <strong>{{ snapshot ? population.counted : '—' }}</strong>
        <small>reali, attive negli ultimi {{ ACTIVE_WINDOW_DAYS }} giorni, ultima versione · {{ latestSummary }}</small>
      </div>
      <div class="metric">
        <span>Attive negli ultimi {{ ACTIVE_WINDOW_DAYS }} giorni</span>
        <strong>{{ snapshot ? population.active : '—' }}</strong>
        <small>{{ population.onLatest }} sull'ultima versione · {{ population.testHidden }} di prova escluse</small>
      </div>
      <div class="metric">
        <span>Richiedono attenzione</span>
        <strong>{{ snapshot ? scopedAttention : '—' }}</strong>
        <small>nel perimetro: update, health o migrazione</small>
        <small v-if="snapshot && scopedWithoutRecentContact > 0" class="metric-caveat">
          {{ scopedWithoutRecentContact }} senza contatto nelle ultime 2 ore: per loro lo stato può essere vecchio
        </small>
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
          <option value="stale">Oltre 2 ore</option>
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
      <fieldset class="scope-toggles">
        <legend>Perimetro</legend>
        <label><input v-model="hideTests" type="checkbox" /> Nascondi prove</label>
        <label><input v-model="activeOnly" type="checkbox" /> Solo attive {{ ACTIVE_WINDOW_DAYS }} g</label>
        <label><input v-model="latestOnly" type="checkbox" /> Solo ultima versione</label>
      </fieldset>
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
.metric small.metric-caveat { margin-top: 2px; color: #eab308; }

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

.scope-toggles {
  display: flex;
  gap: $spacing-md;
  margin: 0;
  padding: 0 $spacing-sm;
  border: 0;
  color: $text-secondary;
  font-size: $font-size-xs;
}

.scope-toggles legend { padding: 0; color: $text-muted; font-size: 11px; }
.scope-toggles label { display: flex; align-items: center; gap: $spacing-xs; min-height: 40px; }

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
