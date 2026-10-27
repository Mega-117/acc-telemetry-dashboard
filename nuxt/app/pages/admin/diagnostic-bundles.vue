<script setup lang="ts">
import { PRODUCT } from '../../../shared/productIdentity'
import { computed, onMounted, ref } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import {
  formatBundleSize,
  listDiagnosticBundles,
  listRecentDiagnosticBundles,
  resolveDiagnosticsOrigin,
  saveDiagnosticBundle,
  type DiagnosticBundleItem
} from '~/repositories/diagnosticBundlesRepository'

definePageMeta({
  layout: 'coach',
  middleware: ['admin-only'],
})

useHead({ title: `Pacchetti diagnostici · ${PRODUCT.displayName}` })

const { currentUser } = useFirebaseAuth()
const items = ref<DiagnosticBundleItem[]>([])
const cursor = ref<string | null>(null)
const loading = ref(false)
const errorMessage = ref('')
const installationFilter = ref('')
const dateFilter = ref('')
const downloading = ref('')

const getToken = async () => (await currentUser.value?.getIdToken()) ?? null
// PIP-567: durante i collaudi il pannello puo' puntare a un Worker locale (NUXT_PUBLIC_DIAGNOSTICS_INGEST_URL).
const origin = resolveDiagnosticsOrigin(useRuntimeConfig().public.diagnosticsIngestUrl)
const deps = { getToken, origin }
// Decision 27/10: the pilot no longer sees a code; reports are found by pilot (uid) and time.
const reportsOnly = ref(false)
const pilotFilter = ref('')
const shown = computed(() => items.value.filter(item =>
  (!reportsOnly.value || item.kind === 'report') && (!pilotFilter.value || item.uploaderUid === pilotFilter.value)))
const totalBytes = computed(() => shown.value.reduce((sum, item) => sum + item.size, 0))

// PIP-591 (X-A05-39): conta solo la risposta dell'ultima richiesta; una piu' lenta, partita con
// filtri vecchi, non sovrascrive elenco e cursore.
let loadRevision = 0
// "Carica altri" continua la ricerca gia' fatta: filtri e cursore vanno insieme, anche se nel
// frattempo i campi sono stati modificati senza cercare.
const appliedFilters = ref({ installationId: '', date: '' })

async function load(append = false) {
  const revision = ++loadRevision
  loading.value = true
  errorMessage.value = ''
  try {
    const filters = append ? appliedFilters.value : { installationId: installationFilter.value, date: dateFilter.value }
    const page = await listDiagnosticBundles(deps, { ...filters, cursor: append ? cursor.value : null })
    if (revision !== loadRevision) return
    appliedFilters.value = filters
    items.value = append ? [...items.value, ...page.items] : page.items
    cursor.value = page.cursor
  } catch (error: any) {
    if (revision !== loadRevision) return
    errorMessage.value = error?.message || 'Impossibile leggere i pacchetti.'
  } finally {
    if (revision === loadRevision) loading.value = false
  }
}

async function download(item: DiagnosticBundleItem) {
  downloading.value = item.key
  errorMessage.value = ''
  try {
    await saveDiagnosticBundle(deps, item)
  } catch (error: any) {
    errorMessage.value = error?.message || 'Scarico non riuscito.'
  } finally {
    downloading.value = ''
  }
}

// PIP-661: the "Segnala problema" code is the package id (internal since 27/10: the pilot no longer sees it,
// it is still in the program's diary). Reports are recent: the newest
// pages are searched (up to 10) and only that package is shown.
const codeFilter = ref('')
async function findByCode() {
  const code = codeFilter.value.trim()
  if (!code) return
  const revision = ++loadRevision
  loading.value = true
  errorMessage.value = ''
  try {
    let next: string | null = null
    for (let page = 0; page < 10; page++) {
      const result = await listDiagnosticBundles(deps, { installationId: '', date: '', cursor: next })
      if (revision !== loadRevision) return
      const match = result.items.find(item => item.bundleId === code)
      if (match) { items.value = [match]; cursor.value = null; return }
      next = result.cursor
      if (!next) break
    }
    items.value = []
    errorMessage.value = 'Nessun pacchetto con questo codice tra i più recenti.'
  } catch (error) {
    if (revision === loadRevision) errorMessage.value = (error as Error)?.message || 'Ricerca non riuscita.'
  } finally {
    if (revision === loadRevision) loading.value = false
  }
}

/** All "Segnala problema" packages of the last 7 days, newest first (day index of the Worker). */
async function loadReports() {
  const revision = ++loadRevision
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await listRecentDiagnosticBundles(deps, { days: 7 })
    if (revision !== loadRevision) return
    items.value = result.items.filter(item => item.kind === 'report')
    cursor.value = null
    reportsOnly.value = true
  } catch (error) {
    if (revision === loadRevision) errorMessage.value = (error as Error)?.message || 'Impossibile leggere le segnalazioni.'
  } finally {
    if (revision === loadRevision) loading.value = false
  }
}

function pickPilot(item: DiagnosticBundleItem) {
  pilotFilter.value = pilotFilter.value === item.uploaderUid ? '' : (item.uploaderUid ?? '')
}

function pickInstallation(item: DiagnosticBundleItem) {
  installationFilter.value = item.installationId
  void load()
}

// I tipi creati dall'app desktop (diagnosticBundle.js); uno sconosciuto si mostra com'e'.
const KIND_LABELS: Record<string, string> = {
  daily: 'giornaliero', anomaly: 'anomalia', capture: 'cattura', shutdown: 'chiusura', report: 'segnalazione'
}

const timeFormat = new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'medium' })
const formatTime = (iso: string) => {
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? timeFormat.format(ms) : '—'
}

onMounted(() => load())
</script>

<template>
  <div class="bundles-page">
    <header class="page-header">
      <div>
        <p class="context-line">Amministrazione · cronologia delle installazioni</p>
        <h1>Pacchetti diagnostici</h1>
        <p>
          Cronologia compressa inviata da ogni installazione: uno al giorno, uno dopo ogni anomalia, uno alla chiusura
          dell'app e, su Windows 10, uno per ogni sessione di cattura della finestra di ACC.
          Si conservano 30 giorni. Il file scaricato è un gzip di righe JSON.
        </p>
      </div>
      <button type="button" class="action-button" :disabled="loading" @click="load()">
        {{ loading ? 'Aggiornamento…' : 'Aggiorna elenco' }}
      </button>
    </header>

    <section class="filter-bar" aria-label="Filtri pacchetti">
      <label class="search-field">
        <span>Installazione (ID completo)</span>
        <input v-model="installationFilter" type="search" placeholder="Tutte le installazioni" @keyup.enter="load()" />
      </label>
      <label>
        <span>Giorno</span>
        <input v-model="dateFilter" type="date" :disabled="!installationFilter.trim()" @change="load()" />
      </label>
      <button type="button" class="action-button" :disabled="loading" @click="load()">Cerca</button>
      <label class="search-field">
        <span>Codice segnalazione</span>
        <input v-model="codeFilter" type="search" placeholder="report-…" @keyup.enter="findByCode()" />
      </label>
      <button type="button" class="action-button" :disabled="loading || !codeFilter.trim()" @click="findByCode()">Trova</button>
      <button type="button" class="action-button" :disabled="loading" @click="loadReports()">Segnalazioni (7 giorni)</button>
      <label class="check-field"><input v-model="reportsOnly" type="checkbox"> Solo segnalazioni</label>
      <button v-if="pilotFilter" type="button" class="action-button" @click="pilotFilter = ''">Pilota {{ pilotFilter.slice(0, 8) }}… ✕</button>
      <span class="result-count">{{ shown.length }} pacchetti · {{ formatBundleSize(totalBytes) }}</span>
    </section>

    <p v-if="errorMessage" class="notice notice--error" role="alert">{{ errorMessage }}</p>
    <p v-else-if="!loading && shown.length === 0" class="notice" role="status">Nessun pacchetto per questi filtri.</p>

    <div v-if="shown.length" class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Ricevuto</th>
            <th>Tipo</th>
            <th>Installazione</th>
            <th>Pilota</th>
            <th>Giorno</th>
            <th>Versione</th>
            <th>Motivo</th>
            <th class="num">Dimensione</th>
            <th><span class="sr-only">Azioni</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in shown" :key="item.key">
            <td>{{ formatTime(item.uploadedAt) }}</td>
            <td><span class="kind" :class="`kind--${item.kind}`">{{ KIND_LABELS[item.kind] || item.kind }}</span></td>
            <td>
              <button type="button" class="link-button mono" :title="item.installationId" @click="pickInstallation(item)">
                {{ item.installationId.slice(0, 8) }}…
              </button>
            </td>
            <td>
              <button v-if="item.uploaderUid" type="button" class="link-button mono pilot-button" :title="item.uploaderUid" @click="pickPilot(item)">
                {{ item.uploaderUid.slice(0, 8) }}…
              </button>
              <span v-else class="muted">—</span>
            </td>
            <td class="mono">{{ item.date }}</td>
            <td class="mono" :title="item.channel || ''">{{ item.version || '—' }}<span v-if="item.channel" class="channel"> · {{ item.channel }}</span></td>
            <td class="mono muted" :title="item.os || ''">{{ item.trigger || '—' }}</td>
            <td class="num mono">{{ formatBundleSize(item.size) }}</td>
            <td class="actions">
              <button type="button" class="action-button" :disabled="downloading === item.key" @click="download(item)">
                {{ downloading === item.key ? 'Scarico…' : 'Scarica' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="cursor" class="more">
      <button type="button" class="action-button" :disabled="loading" @click="load(true)">Carica altri</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/scss/variables' as *;

.bundles-page { color: $text-primary; }

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
}

h1 {
  margin: 0;
  font-family: $font-primary;
  font-size: 28px;
  font-weight: $font-weight-semibold;
  letter-spacing: -0.025em;
}

.page-header p:last-child {
  max-width: 64ch;
  margin: $spacing-sm 0 0;
  color: $text-secondary;
  font-size: $font-size-sm;
}

.action-button {
  min-height: 40px;
  padding: $spacing-xs $spacing-md;
  color: $text-primary;
  font: inherit;
  background: rgba(var(--theme-accent-rgb), 0.1);
  border: 1px solid rgba(var(--theme-accent-rgb), 0.38);
  border-radius: $radius-sm;
  cursor: pointer;
}

.action-button:hover:not(:disabled) { border-color: var(--theme-accent); }
.action-button:disabled { opacity: 0.55; cursor: wait; }
.action-button:focus-visible,
.filter-bar input:focus-visible,
.link-button:focus-visible { outline: 2px solid var(--theme-accent); outline-offset: 2px; }

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

.search-field { flex: 1; min-width: 260px; }
.check-field { display: flex; align-items: center; gap: 6px; }

.filter-bar input {
  min-height: 40px;
  padding: $spacing-sm $spacing-md;
  color: $text-primary;
  font: inherit;
  background: $bg-secondary;
  border: 1px solid rgba(255, 255, 255, 0.11);
  border-radius: $radius-sm;
}

.result-count {
  margin: 0 $spacing-sm $spacing-sm auto;
  color: $text-muted;
  font-size: $font-size-xs;
  font-variant-numeric: tabular-nums;
}

.notice {
  margin: 0 0 $spacing-md;
  padding: $spacing-sm $spacing-md;
  color: $text-secondary;
  font-size: $font-size-xs;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: $radius-sm;
}

.notice--error { color: #fca5a5; border-color: rgba(248, 113, 113, 0.3); }

.table-wrap { overflow-x: auto; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: $radius-md; }

table { width: 100%; border-collapse: collapse; font-size: $font-size-sm; }
th, td { padding: $spacing-sm $spacing-md; text-align: left; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
th { color: $text-muted; font-size: 11px; font-weight: $font-weight-medium; }
tr:last-child td { border-bottom: 0; }
.num { text-align: right; }
.actions { text-align: right; }
.mono { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-variant-numeric: tabular-nums; }
.muted, .channel { color: $text-muted; font-size: $font-size-xs; }

.kind { padding: 2px 8px; font-size: 11px; border-radius: 999px; background: rgba(255, 255, 255, 0.06); }
.kind--anomaly,
.kind--capture { color: #fcd34d; background: rgba($accent-warning, 0.12); }

.link-button { padding: 0; color: var(--theme-accent-light); background: none; border: 0; cursor: pointer; }
.more { display: flex; justify-content: center; margin-top: $spacing-md; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

@media (max-width: $breakpoint-md) {
  .page-header, .filter-bar { display: grid; }
  .search-field { min-width: 0; }
  .result-count { margin: $spacing-sm 0 0; }
}
</style>
