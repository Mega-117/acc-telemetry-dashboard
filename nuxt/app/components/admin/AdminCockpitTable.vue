<script setup lang="ts">
import { getClientHeartbeatStatus } from '~/services/monitoring/clientHeartbeatService'
import type { AdminCockpitRow } from '~/repositories/adminCockpitRepository'

const props = defineProps<{
  rows: AdminCockpitRow[]
  loading?: boolean
  error?: string
}>()

const emit = defineEmits<{
  retry: []
}>()

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return 'Non disponibile'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function pilotName(row: AdminCockpitRow): string {
  const fullName = [row.pilot.firstName, row.pilot.lastName].filter(Boolean).join(' ')
  return fullName || row.pilot.nickname || 'Utente'
}

function contactState(value: string | null | undefined) {
  const status = getClientHeartbeatStatus(value)
  if (status === 'recent') return { tone: 'success', label: 'Contatto recente' }
  if (status === 'stale') return { tone: 'warning', label: 'Contatto oltre 60 min' }
  return { tone: 'neutral', label: 'Contatto sconosciuto' }
}

function semanticTone(value: string | null | undefined): string {
  const normalized = String(value || '').toLowerCase()
  if (['healthy', 'ready', 'completed', 'current'].some((state) => normalized.includes(state))) {
    return 'success'
  }
  if (['degraded', 'error', 'failed', 'blocked'].some((state) => normalized.includes(state))) {
    return 'danger'
  }
  if (['pending', 'partial', 'repair', 'running', 'migrat'].some((state) => normalized.includes(state))) {
    return 'warning'
  }
  return 'neutral'
}

function diagnosticCodes(row: AdminCockpitRow): string[] {
  if (!row.installation) return []
  return [...new Set([
    row.installation.health.reasonCode,
    row.installation.migration.code,
  ].filter((value): value is string => Boolean(value)))]
}

const skeletonRows = Array.from({ length: 6 }, (_, index) => index)
</script>

<template>
  <section class="table-panel" aria-labelledby="cockpit-table-title">
    <div class="table-panel__heading">
      <div>
        <h2 id="cockpit-table-title">Installazioni runtime</h2>
        <p>Fotografia read-only ordinata per ultimo contatto.</p>
      </div>
      <span class="row-count">{{ rows.length }} righe</span>
    </div>

    <div v-if="error" class="state-panel state-panel--error" role="alert">
      <div>
        <strong>Fotografia non disponibile</strong>
        <p>{{ error }}</p>
      </div>
      <button type="button" @click="emit('retry')">Riprova</button>
    </div>

    <div v-else-if="!loading && rows.length === 0" class="state-panel" role="status">
      <strong>Nessun report runtime</strong>
      <p>Le installazioni compariranno dopo il primo report della RuntimeWindow.</p>
    </div>

    <div v-else class="table-scroll" tabindex="0" aria-label="Tabella installazioni; scorri orizzontalmente per tutte le colonne">
      <table :aria-busy="loading ? 'true' : 'false'">
        <thead>
          <tr>
            <th scope="col">Utente</th>
            <th scope="col">Installazione</th>
            <th scope="col">Versioni</th>
            <th scope="col">Avvio</th>
            <th scope="col">Ultimo contatto</th>
            <th scope="col">Update</th>
            <th scope="col">Health e migrazione</th>
            <th scope="col">Errori sintetici</th>
          </tr>
        </thead>
        <tbody v-if="loading">
          <tr v-for="index in skeletonRows" :key="index" class="skeleton-row" aria-hidden="true">
            <td v-for="column in 8" :key="column"><span class="skeleton-line"></span></td>
          </tr>
        </tbody>
        <tbody v-else>
          <tr v-for="row in props.rows" :key="row.rowId" :class="{ 'row--missing': !row.installation }">
            <td>
              <div class="pilot-cell">
                <strong>{{ pilotName(row) }}</strong>
                <span class="mono">{{ row.pilot.uid }}</span>
                <span>{{ row.pilot.role || 'ruolo sconosciuto' }} · {{ row.installationCount }} installazioni</span>
                <span v-if="!row.directoryAvailable" class="text-warning">Fuori dalla finestra directory</span>
              </div>
            </td>
            <template v-if="row.installation">
              <td>
                <code>{{ row.installation.installationId }}</code>
                <span class="secondary">{{ row.installation.channel || 'canale sconosciuto' }}</span>
              </td>
              <td>
                <strong class="mono">{{ row.installation.suiteVersion || 'n/d' }}</strong>
                <span class="secondary mono">
                  L {{ row.installation.components.launcher || '—' }} ·
                  W {{ row.installation.components.webapp || '—' }}
                </span>
                <span class="secondary mono">
                  G {{ row.installation.components.logger || '—' }} ·
                  K {{ row.installation.components.kokoroRuntime || '—' }}
                </span>
              </td>
              <td>
                <time class="mono" :datetime="row.installation.startedAt || undefined">
                  {{ formatTimestamp(row.installation.startedAt) }}
                </time>
              </td>
              <td>
                <time class="mono" :datetime="row.installation.lastContactAt || undefined">
                  {{ formatTimestamp(row.installation.lastContactAt) }}
                </time>
                <span class="status-line">
                  <i class="status-dot" :class="`status-dot--${contactState(row.installation.lastContactAt).tone}`"></i>
                  {{ contactState(row.installation.lastContactAt).label }}
                </span>
              </td>
              <td>
                <span class="status-line">
                  <i class="status-dot" :class="`status-dot--${semanticTone(row.installation.updateState)}`"></i>
                  {{ row.installation.updateState }}
                </span>
                <time v-if="row.installation.lastCheckAt" class="secondary mono" :datetime="row.installation.lastCheckAt">
                  Check {{ formatTimestamp(row.installation.lastCheckAt) }}
                </time>
              </td>
              <td>
                <span class="status-line">
                  <i class="status-dot" :class="`status-dot--${semanticTone(row.installation.health.status)}`"></i>
                  {{ row.installation.health.status }} · {{ row.installation.health.phase }}
                </span>
                <span class="secondary">
                  Migrazione {{ row.installation.migration.status }} ·
                  <span class="tabular">{{ row.installation.migration.progress }}%</span>
                </span>
                <span class="secondary">{{ row.installation.migration.phase }}</span>
              </td>
              <td>
                <span v-if="diagnosticCodes(row).length === 0" class="secondary">Nessun codice</span>
                <code v-for="code in diagnosticCodes(row)" v-else :key="code">{{ code }}</code>
              </td>
            </template>
            <td v-else colspan="7">
              <span class="status-line">
                <i class="status-dot status-dot--neutral"></i>
                Nessun report per-installazione nella fotografia corrente
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="!error" class="scroll-hint">Su finestre strette, scorri la tabella orizzontalmente.</p>
  </section>
</template>

<style scoped lang="scss">
@use '@/assets/scss/variables' as *;

.table-panel {
  overflow: hidden;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: $radius-md;
}

.table-panel__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: $spacing-md;
  padding: $spacing-md;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

h2 {
  margin: 0;
  color: $text-primary;
  font-family: $font-primary;
  font-size: $font-size-lg;
  font-weight: $font-weight-semibold;
  letter-spacing: -0.02em;
}

.table-panel__heading p,
.state-panel p {
  margin: $spacing-xs 0 0;
  color: $text-muted;
  font-size: $font-size-xs;
}

.row-count,
.tabular {
  font-variant-numeric: tabular-nums;
}

.row-count {
  color: $text-muted;
  font-size: $font-size-xs;
}

.table-scroll {
  overflow-x: auto;
  outline: none;
}

.table-scroll:focus-visible {
  box-shadow: inset 0 0 0 2px var(--theme-accent);
}

table {
  width: 100%;
  min-width: 1320px;
  border-collapse: collapse;
  color: $text-secondary;
  font-family: $font-primary;
  font-size: $font-size-xs;
}

th,
td {
  padding: $spacing-sm $spacing-md;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid rgba(255, 255, 255, 0.065);
}

th {
  position: sticky;
  top: 0;
  z-index: $z-base;
  color: $text-muted;
  font-weight: $font-weight-medium;
  white-space: nowrap;
  background: $bg-secondary;
}

tbody tr {
  transition: background-color 80ms ease-out;
}

@media (hover: hover) and (pointer: fine) {
  tbody tr:hover {
    background: rgba(var(--theme-accent-rgb), 0.055);
  }
}

tbody tr:last-child td {
  border-bottom: 0;
}

td > strong,
td > span,
td > time,
td > code {
  display: block;
}

.pilot-cell {
  display: grid;
  min-width: 180px;
  gap: $spacing-xs;
}

.pilot-cell strong {
  color: $text-primary;
  font-weight: $font-weight-medium;
}

.mono,
code {
  font-family: ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', monospace;
  font-variant-numeric: tabular-nums slashed-zero;
}

code {
  max-width: 220px;
  overflow: hidden;
  color: #c4b5fd;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.secondary {
  margin-top: $spacing-xs;
  color: $text-muted;
}

.status-line {
  display: inline-flex;
  align-items: center;
  gap: $spacing-sm;
  color: $text-secondary;
  white-space: nowrap;
}

.status-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: $radius-full;
  background: $text-disabled;
}

.status-dot--success { background: $accent-success; }
.status-dot--warning { background: $accent-warning; }
.status-dot--danger { background: $accent-danger; }
.status-dot--neutral { background: $text-muted; }
.text-warning { color: #fbbf24; }
.row--missing { background: rgba(255, 255, 255, 0.012); }

.state-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-md;
  min-height: 120px;
  padding: $spacing-lg;
  color: $text-secondary;
}

.state-panel strong {
  color: $text-primary;
}

.state-panel--error {
  border-left: 2px solid $accent-danger;
}

.state-panel button {
  min-height: 44px;
  padding: $spacing-sm $spacing-md;
  color: $text-primary;
  font: inherit;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: $radius-sm;
  cursor: pointer;
}

.state-panel button:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}

.skeleton-line {
  display: block;
  width: 100%;
  height: 12px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.075);
  animation: skeleton-pulse 1.2s ease-in-out infinite;
}

@keyframes skeleton-pulse {
  50% { opacity: 0.45; }
}

.scroll-hint {
  display: none;
  margin: 0;
  padding: $spacing-sm $spacing-md;
  color: $text-muted;
  font-size: 11px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

@media (max-width: $breakpoint-xl) {
  .scroll-hint { display: block; }
}

@media (prefers-reduced-motion: reduce) {
  tbody tr { transition: none; }
  .skeleton-line { animation-duration: 2.4s; }
}
</style>
