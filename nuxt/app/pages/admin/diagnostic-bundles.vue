<script setup lang="ts">
import { PRODUCT } from '../../../shared/productIdentity'
import { computed, onMounted, ref } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import {
  downloadDiagnosticBundle,
  formatBundleSize,
  listDiagnosticBundles,
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
const totalBytes = computed(() => items.value.reduce((sum, item) => sum + item.size, 0))

async function load(append = false) {
  loading.value = true
  errorMessage.value = ''
  try {
    const page = await listDiagnosticBundles({ getToken }, {
      installationId: installationFilter.value,
      date: dateFilter.value,
      cursor: append ? cursor.value : null
    })
    items.value = append ? [...items.value, ...page.items] : page.items
    cursor.value = page.cursor
  } catch (error: any) {
    errorMessage.value = error?.message || 'Impossibile leggere i pacchetti.'
  } finally {
    loading.value = false
  }
}

async function download(item: DiagnosticBundleItem) {
  downloading.value = item.key
  errorMessage.value = ''
  try {
    const blob = await downloadDiagnosticBundle({ getToken }, item.key)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${item.installationId.slice(0, 8)}-${item.bundleId}.jsonl.gz`
    link.click()
    URL.revokeObjectURL(url)
  } catch (error: any) {
    errorMessage.value = error?.message || 'Scarico non riuscito.'
  } finally {
    downloading.value = ''
  }
}

function pickInstallation(item: DiagnosticBundleItem) {
  installationFilter.value = item.installationId
  void load()
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
          Cronologia compressa inviata da ogni installazione (un pacchetto al giorno e uno dopo ogni anomalia).
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
      <span class="result-count">{{ items.length }} pacchetti · {{ formatBundleSize(totalBytes) }}</span>
    </section>

    <p v-if="errorMessage" class="notice notice--error" role="alert">{{ errorMessage }}</p>
    <p v-else-if="!loading && items.length === 0" class="notice" role="status">Nessun pacchetto per questi filtri.</p>

    <div v-if="items.length" class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Ricevuto</th>
            <th>Tipo</th>
            <th>Installazione</th>
            <th>Giorno</th>
            <th class="num">Dimensione</th>
            <th><span class="sr-only">Azioni</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.key">
            <td>{{ formatTime(item.uploadedAt) }}</td>
            <td><span class="kind" :class="`kind--${item.kind}`">{{ item.kind === 'anomaly' ? 'anomalia' : item.kind === 'daily' ? 'giornaliero' : item.kind }}</span></td>
            <td>
              <button type="button" class="link-button mono" :title="item.installationId" @click="pickInstallation(item)">
                {{ item.installationId.slice(0, 8) }}…
              </button>
            </td>
            <td class="mono">{{ item.date }}</td>
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

.kind { padding: 2px 8px; font-size: 11px; border-radius: 999px; background: rgba(255, 255, 255, 0.06); }
.kind--anomaly { color: #fcd34d; background: rgba($accent-warning, 0.12); }

.link-button { padding: 0; color: var(--theme-accent-light); background: none; border: 0; cursor: pointer; }
.more { display: flex; justify-content: center; margin-top: $spacing-md; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

@media (max-width: $breakpoint-md) {
  .page-header, .filter-bar { display: grid; }
  .search-field { min-width: 0; }
  .result-count { margin: $spacing-sm 0 0; }
}
</style>
