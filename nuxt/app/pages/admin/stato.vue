<script setup lang="ts">
import { PRODUCT } from '../../../shared/productIdentity'
import { computed, onMounted, ref } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { loadAdminCockpitSnapshot, type AdminCockpitSnapshot } from '~/repositories/adminCockpitRepository'
import {
  listRecentDiagnosticBundles,
  resolveDiagnosticsOrigin,
  saveDiagnosticBundle,
  type DiagnosticBundleItem,
} from '~/repositories/diagnosticBundlesRepository'
import { loadClientDiagnosticsPage } from '~/repositories/clientDiagnosticsRepository'
import { ACTIVE_WINDOW_DAYS } from '~/utils/adminInstallationScope'
import { buildStatusSummary, type StatusErrorEvent, type StatusIssue } from '~/utils/adminStatusSummary'
import { formatItalianDiagnosticDate } from '~/utils/diagnosticsPresentation'

definePageMeta({
  layout: 'coach',
  middleware: ['admin-only'],
})

useHead({ title: `Stato · ${PRODUCT.displayName}` })

const { currentUser } = useFirebaseAuth()
const getToken = async () => (await currentUser.value?.getIdToken()) ?? null
// PIP-567: durante i collaudi il pannello puo' puntare a un Worker locale (NUXT_PUBLIC_DIAGNOSTICS_INGEST_URL).
const bundleDeps = { getToken, origin: resolveDiagnosticsOrigin(useRuntimeConfig().public.diagnosticsIngestUrl) }

const loading = ref(true)
const nowMs = ref(Date.now())
const snapshot = ref<AdminCockpitSnapshot | null>(null)
const bundles = ref<DiagnosticBundleItem[]>([])
const bundlesComplete = ref(true)
const errors = ref<StatusErrorEvent[]>([])
// Una fonte che non risponde non nasconde le altre: si dice quale manca.
const missingSources = ref<string[]>([])
// PIP-591 (X-A05-37): errori oltre la prima pagina o installazioni oltre il limite di lettura.
// Con dati incompleti la pagina non dice mai "Tutto ok".
const errorsTruncated = ref(false)
const incomplete = computed(() => missingSources.value.length > 0 || !bundlesComplete.value
  || errorsTruncated.value || snapshot.value?.coverageLimited === true)
const verdictLevel = computed(() => (summary.value.level === 'ok' && incomplete.value ? 'warn' : summary.value.level))
const downloading = ref('')
const downloadError = ref('')
const showTests = ref(false)

const names = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {}
  for (const row of snapshot.value?.rows || []) {
    const pilot = row.pilot
    const full = [pilot.firstName, pilot.lastName].filter(Boolean).join(' ').trim()
    const name = pilot.nickname && pilot.nickname !== 'Profilo non disponibile' ? pilot.nickname : full
    if (name) map[pilot.uid] = name
  }
  for (const event of errors.value) {
    if (event.userId && !map[event.userId] && event.pilotNickname) map[event.userId] = event.pilotNickname
  }
  return map
})

const summary = computed(() => buildStatusSummary({
  installations: (snapshot.value?.rows || []).flatMap((row) => (row.installation ? [row.installation] : [])),
  bundles: bundles.value,
  errors: errors.value,
  names: names.value,
  nowMs: nowMs.value,
}))

const headline = computed(() => {
  const count = summary.value.issues.length
  if (summary.value.level === 'ok') return incomplete.value ? 'Nessun problema nei dati letti, ma sono incompleti' : 'Tutto ok'
  if (summary.value.level === 'problem') {
    const broken = summary.value.issues.filter((issue) => issue.level === 'problem').length
    return broken === 1 ? 'C’è un problema' : `Ci sono ${broken} problemi`
  }
  return count === 1 ? 'Una cosa da guardare' : `${count} cose da guardare`
})

async function load() {
  loading.value = true
  missingSources.value = []
  errorsTruncated.value = false
  downloadError.value = ''
  nowMs.value = Date.now()
  const day = 86_400_000
  const filters = {
    startIso: new Date(nowMs.value - ACTIVE_WINDOW_DAYS * day).toISOString(),
    endExclusiveIso: new Date(nowMs.value + 60_000).toISOString(),
  }
  // Errori e fatali filtrati dal server: avvisi e info non consumano la pagina.
  const loadSeverity = (severity: 'error' | 'fatal') => loadClientDiagnosticsPage({ filters: { ...filters, severity } })
  const [cockpit, recent, diagnostics] = await Promise.allSettled([
    loadAdminCockpitSnapshot(),
    listRecentDiagnosticBundles(bundleDeps, { days: ACTIVE_WINDOW_DAYS, nowMs: nowMs.value }),
    Promise.all([loadSeverity('error'), loadSeverity('fatal')]),
  ])
  if (cockpit.status === 'fulfilled') snapshot.value = cockpit.value
  else missingSources.value.push('stato delle installazioni')
  if (recent.status === 'fulfilled') {
    bundles.value = recent.value.items
    bundlesComplete.value = recent.value.complete
  } else missingSources.value.push('pacchetti diagnostici')
  if (diagnostics.status === 'fulfilled') {
    errorsTruncated.value = diagnostics.value.some((page) => page.nextCursor !== null)
    errors.value = diagnostics.value.flatMap((page) => page.events)
      .filter((event) => event.severity === 'error' || event.severity === 'fatal')
      .map((event) => ({ userId: event.userId, pilotNickname: event.pilotNickname, code: event.code, severity: event.severity, receivedAt: event.receivedAt }))
  } else missingSources.value.push('errori segnalati')
  loading.value = false
}

async function download(issue: StatusIssue) {
  if (!issue.bundle) return
  downloading.value = issue.id
  downloadError.value = ''
  try {
    await saveDiagnosticBundle(bundleDeps, issue.bundle)
  } catch (error: any) {
    downloadError.value = error?.message || 'Scarico non riuscito.'
  } finally {
    downloading.value = ''
  }
}

function when(iso: string) {
  return formatItalianDiagnosticDate(iso)
}

onMounted(load)
</script>

<template>
  <div class="status-page">
    <header class="page-header">
      <div>
        <p class="context-line">Amministrazione · ultimi {{ ACTIVE_WINDOW_DAYS }} giorni</p>
        <h1>Stato</h1>
        <p>Cosa si è rotto o va guardato nelle installazioni dei piloti.</p>
      </div>
      <button type="button" class="refresh-button" :disabled="loading" @click="load">
        {{ loading ? 'Controllo…' : 'Aggiorna' }}
      </button>
    </header>

    <section
      class="verdict"
      :class="loading ? 'verdict--loading' : `verdict--${verdictLevel}`"
      role="status"
      aria-live="polite"
    >
      <span class="verdict__light" aria-hidden="true"></span>
      <div>
        <strong>{{ loading ? 'Sto controllando…' : headline }}</strong>
        <p v-if="!loading">
          Pacchetti ricevuti da {{ summary.reporting.sendingBundles }} installazioni su {{ summary.reporting.active }} attive
          <template v-if="summary.windows.windows10 + summary.windows.windows11 > 0">
            · Windows 10: {{ summary.windows.windows10 }} · Windows 11: {{ summary.windows.windows11 }}
          </template>
        </p>
      </div>
    </section>

    <p v-if="!loading && summary.reporting.active > summary.reporting.sendingBundles" class="note">
      {{ summary.reporting.active - summary.reporting.sendingBundles }} installazioni attive non mandano ancora pacchetti
      (versione precedente alla diagnostica): per loro si vedono solo stato ed errori.
    </p>
    <p v-if="missingSources.length" class="note note--warn" role="alert">
      Non sono riuscito a leggere: {{ missingSources.join(', ') }}. Quello che vedi è incompleto.
    </p>
    <p v-if="!bundlesComplete" class="note">Molti pacchetti: ho letto solo i primi 2000.</p>
    <p v-if="!loading && errorsTruncated" class="note">Molti errori: ho letto solo i più recenti. Gli altri sono in Diagnostica.</p>
    <p v-if="!loading && snapshot?.coverageLimited" class="note">Molte installazioni: ne ho lette solo una parte. Le altre sono nel Cockpit.</p>
    <p v-if="downloadError" class="note note--warn" role="alert">{{ downloadError }}</p>

    <ul v-if="!loading && summary.issues.length" class="issues">
      <li v-for="issue in summary.issues" :key="issue.id" class="issue" :class="`issue--${issue.level}`">
        <span class="issue__dot" aria-hidden="true"></span>
        <div class="issue__body">
          <strong>{{ issue.title }}</strong>
          <p class="issue__meta">
            {{ issue.who }}<template v-if="issue.os"> · {{ issue.os }}</template>
            · {{ issue.count === 1 ? '1 volta' : `${issue.count} volte` }} · ultima {{ when(issue.lastAt) }}
          </p>
          <p class="issue__detail">{{ issue.detail }}</p>
        </div>
        <button
          v-if="issue.bundle"
          type="button"
          class="issue__action"
          :disabled="downloading === issue.id"
          @click="download(issue)"
        >
          {{ downloading === issue.id ? 'Scarico…' : 'Scarica pacchetto' }}
        </button>
        <NuxtLink v-else-if="!issue.installationId" to="/admin-diagnostics" class="issue__action">Apri Diagnostica</NuxtLink>
        <NuxtLink v-else to="/admin/cockpit" class="issue__action">Apri Cockpit</NuxtLink>
      </li>
    </ul>
    <p v-else-if="!loading" class="empty">
      {{ incomplete ? 'Nessun problema nei dati letti.' : `Nessun problema negli ultimi ${ACTIVE_WINDOW_DAYS} giorni.` }}
    </p>

    <section v-if="!loading && summary.testIssues.length" class="tests">
      <button type="button" class="tests__toggle" :aria-expanded="showTests" @click="showTests = !showTests">
        {{ showTests ? 'Nascondi' : 'Mostra' }} account di prova ({{ summary.testIssues.length }})
      </button>
      <ul v-if="showTests" class="issues issues--muted">
        <li v-for="issue in summary.testIssues" :key="issue.id" class="issue" :class="`issue--${issue.level}`">
          <span class="issue__dot" aria-hidden="true"></span>
          <div class="issue__body">
            <strong>{{ issue.title }}</strong>
            <p class="issue__meta">
              {{ issue.who }}<template v-if="issue.os"> · {{ issue.os }}</template>
              · {{ issue.count === 1 ? '1 volta' : `${issue.count} volte` }} · ultima {{ when(issue.lastAt) }}
            </p>
          </div>
          <button
            v-if="issue.bundle"
            type="button"
            class="issue__action"
            :disabled="downloading === issue.id"
            @click="download(issue)"
          >
            {{ downloading === issue.id ? 'Scarico…' : 'Scarica pacchetto' }}
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/scss/variables' as *;

.status-page { color: $text-primary; max-width: 960px; }

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

.page-header p:last-child { margin: $spacing-sm 0 0; color: $text-secondary; font-size: $font-size-sm; }

.refresh-button,
.issue__action,
.tests__toggle {
  min-height: 44px;
  padding: $spacing-sm $spacing-md;
  color: $text-primary;
  font: inherit;
  font-weight: $font-weight-medium;
  text-decoration: none;
  white-space: nowrap;
  background: rgba(var(--theme-accent-rgb), 0.1);
  border: 1px solid rgba(var(--theme-accent-rgb), 0.38);
  border-radius: $radius-sm;
  cursor: pointer;
}

.refresh-button:disabled,
.issue__action:disabled { opacity: 0.55; cursor: wait; }

.refresh-button:focus-visible,
.issue__action:focus-visible,
.tests__toggle:focus-visible { outline: 2px solid var(--theme-accent); outline-offset: 2px; }

.verdict {
  --light: #6b7280;
  display: flex;
  align-items: center;
  gap: $spacing-md;
  margin-bottom: $spacing-md;
  padding: $spacing-lg;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid color-mix(in srgb, var(--light) 45%, transparent);
  border-radius: $radius-md;
}

.verdict--ok { --light: #22c55e; }
.verdict--warn { --light: #eab308; }
.verdict--problem { --light: #ef4444; }

.verdict__light {
  flex: none;
  width: 22px;
  height: 22px;
  background: var(--light);
  border-radius: 50%;
  box-shadow: 0 0 18px color-mix(in srgb, var(--light) 60%, transparent);
}

.verdict strong { display: block; font-size: 24px; font-weight: $font-weight-semibold; }
.verdict p { margin: $spacing-xs 0 0; color: $text-secondary; font-size: $font-size-sm; }

.note {
  margin: 0 0 $spacing-sm;
  padding: $spacing-sm $spacing-md;
  color: $text-secondary;
  font-size: $font-size-xs;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: $radius-sm;
}

.note--warn { color: #fcd34d; border-color: rgba($accent-warning, 0.3); }

.issues { display: grid; gap: $spacing-sm; margin: $spacing-md 0; padding: 0; list-style: none; }
.issues--muted { opacity: 0.8; }

.issue {
  --dot: #eab308;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: $spacing-md;
  padding: $spacing-md;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-left: 3px solid var(--dot);
  border-radius: $radius-sm;
}

.issue--problem { --dot: #ef4444; }

.issue__dot { width: 10px; height: 10px; background: var(--dot); border-radius: 50%; }
.issue__body strong { font-size: $font-size-base; }
.issue__meta { margin: 2px 0 0; color: $text-secondary; font-size: $font-size-xs; }
.issue__detail { margin: 2px 0 0; color: $text-muted; font-size: $font-size-xs; }

.empty { margin: $spacing-md 0; color: $text-secondary; }

.tests { margin-top: $spacing-lg; }
.tests__toggle { background: transparent; }

@media (max-width: $breakpoint-md) {
  .page-header { display: grid; }
  .issue { grid-template-columns: auto 1fr; }
  .issue__action { grid-column: 1 / -1; justify-self: start; }
}
</style>
