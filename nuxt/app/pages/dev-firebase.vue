<script setup lang="ts">
import { computed } from 'vue'
import { useFirebaseMonitor } from '~/composables/useFirebaseTracker'

const {
  totals,
  callerBreakdown,
  pathBreakdown,
  scenarioBreakdown,
  recentScenarios,
  recentOperations,
  verboseLogging,
  resetFirebaseTracker,
  setFirebaseTrackerVerbose,
  printFirebaseSummary,
  exportFirebaseReport
} = useFirebaseMonitor()

const topCallers = computed(() => callerBreakdown.value.slice(0, 12))
const topPaths = computed(() => pathBreakdown.value.slice(0, 12))
const topScenarios = computed(() => scenarioBreakdown.value.slice(0, 12))
const recent = computed(() => recentOperations.value.slice(0, 80))
const recentScenarioRows = computed(() => recentScenarios.value.slice(0, 20))

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${seconds}s`
}

function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString('it-IT')
}

function downloadReport() {
  const payload = exportFirebaseReport()
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `firebase-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  link.click()
  URL.revokeObjectURL(url)
}

function sendSummaryToConsole() {
  printFirebaseSummary('dev-firebase')
}
</script>

<template>
  <LayoutPageContainer>
    <div class="firebase-monitor">
      <header class="page-header">
        <div>
          <h1 class="page-title">DEV Firebase Monitor</h1>
          <p class="page-subtitle">
            Monitor live di letture, scritture, listener e batch Firestore durante questa sessione app.
          </p>
        </div>
        <div class="actions">
          <button class="btn btn--secondary" @click="setFirebaseTrackerVerbose(!verboseLogging)">
            {{ verboseLogging ? 'Verbose ON' : 'Verbose OFF' }}
          </button>
          <button class="btn btn--secondary" @click="sendSummaryToConsole">Summary Console</button>
          <button class="btn btn--secondary" @click="downloadReport">Export JSON</button>
          <button class="btn btn--danger" @click="resetFirebaseTracker">Reset Counters</button>
        </div>
      </header>

      <section class="stats-grid">
        <article class="stat-card">
          <span class="stat-label">Billed Reads</span>
          <strong class="stat-value">{{ totals.billedReads }}</strong>
        </article>
        <article class="stat-card stat-card--warm">
          <span class="stat-label">Billed Writes</span>
          <strong class="stat-value">{{ totals.billedWrites }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">Read Ops</span>
          <strong class="stat-value">{{ totals.readOps + totals.queryOps + totals.countOps + totals.listenerSnapshots }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">Count Ops</span>
          <strong class="stat-value">{{ totals.countOps }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">Write Ops</span>
          <strong class="stat-value">{{ totals.writeOps + totals.deleteOps }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">Batch Commits</span>
          <strong class="stat-value">{{ totals.batchCommits }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">Realtime Snapshots</span>
          <strong class="stat-value">{{ totals.listenerSnapshots }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">Sessione</span>
          <strong class="stat-value">{{ formatDuration(totals.sessionDurationMs) }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">Start</span>
          <strong class="stat-value stat-value--small">{{ totals.sessionStartedAt }}</strong>
        </article>
      </section>

      <section class="panel-grid">
        <article class="panel">
          <div class="panel-header">
            <h2>Top Scenarios</h2>
            <span>{{ scenarioBreakdown.length }} scenari</span>
          </div>
          <div v-if="topScenarios.length === 0" class="empty-state">Nessuno scenario tracciato ancora.</div>
          <div v-else class="table">
            <div class="table-head">
              <span>Scenario</span>
              <span>Reads</span>
              <span>Writes</span>
              <span>Ops</span>
            </div>
            <div v-for="item in topScenarios" :key="item.id" class="table-row">
              <span class="mono">{{ item.name }}</span>
              <span>{{ item.billedReads }}</span>
              <span>{{ item.billedWrites }}</span>
              <span>{{ item.operations }}</span>
            </div>
          </div>
        </article>

        <article class="panel">
          <div class="panel-header">
            <h2>Top Caller</h2>
            <span>{{ callerBreakdown.length }} caller</span>
          </div>
          <div v-if="topCallers.length === 0" class="empty-state">Nessuna operazione tracciata ancora.</div>
          <div v-else class="table">
            <div class="table-head">
              <span>Caller</span>
              <span>Reads</span>
              <span>Writes</span>
              <span>Ops</span>
            </div>
            <div v-for="item in topCallers" :key="item.caller" class="table-row">
              <span class="mono">{{ item.caller }}</span>
              <span>{{ item.billedReads }}</span>
              <span>{{ item.billedWrites }}</span>
              <span>{{ item.operations }}</span>
            </div>
          </div>
        </article>

        <article class="panel">
          <div class="panel-header">
            <h2>Top Path Bucket</h2>
            <span>{{ pathBreakdown.length }} bucket</span>
          </div>
          <div v-if="topPaths.length === 0" class="empty-state">Nessun path ancora registrato.</div>
          <div v-else class="table">
            <div class="table-head">
              <span>Path</span>
              <span>Reads</span>
              <span>Writes</span>
              <span>Ops</span>
            </div>
            <div v-for="item in topPaths" :key="item.pathBucket" class="table-row">
              <span class="mono">{{ item.pathBucket }}</span>
              <span>{{ item.billedReads }}</span>
              <span>{{ item.billedWrites }}</span>
              <span>{{ item.operations }}</span>
            </div>
          </div>
        </article>
      </section>

      <section class="panel panel--full">
        <div class="panel-header">
          <h2>Recent Scenarios</h2>
          <span>{{ recentScenarios.length }} scenari in memoria</span>
        </div>
        <div v-if="recentScenarioRows.length === 0" class="empty-state">Nessuno scenario recente.</div>
        <div v-else class="table table--recent">
          <div class="table-head">
            <span>Ora</span>
            <span>Scenario</span>
            <span>Reads</span>
            <span>Writes</span>
            <span>Ops</span>
            <span>Durata</span>
            <span>Metadata</span>
          </div>
          <div v-for="item in recentScenarioRows" :key="item.id" class="table-row">
            <span>{{ formatTimestamp(item.startedAt) }}</span>
            <span class="mono">{{ item.name }}</span>
            <span>{{ item.billedReads }}</span>
            <span>{{ item.billedWrites }}</span>
            <span>{{ item.operations }}</span>
            <span>{{ item.durationMs }}ms</span>
            <span class="mono path-cell">{{ JSON.stringify(item.metadata || {}) }}</span>
          </div>
        </div>
      </section>

      <section class="panel panel--full">
        <div class="panel-header">
          <h2>Recent Operations</h2>
          <span>{{ recentOperations.length }} operazioni in memoria</span>
        </div>
        <div v-if="recent.length === 0" class="empty-state">Nessuna operazione recente.</div>
        <div v-else class="table table--recent">
          <div class="table-head">
            <span>Ora</span>
            <span>Tipo</span>
            <span>Caller</span>
            <span>Path</span>
            <span>Reads</span>
            <span>Writes</span>
            <span>Durata</span>
          </div>
          <div v-for="item in recent" :key="item.id" class="table-row">
            <span>{{ formatTimestamp(item.startedAt) }}</span>
            <span class="mono">{{ item.type }}</span>
            <span class="mono">{{ item.caller }}</span>
            <span class="mono path-cell">{{ item.path }}</span>
            <span>{{ item.billedReads }}</span>
            <span>{{ item.billedWrites }}</span>
            <span>{{ item.durationMs }}ms</span>
          </div>
        </div>
      </section>
    </div>
  </LayoutPageContainer>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

.firebase-monitor {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
}

.page-title {
  font-family: 'Outfit', $font-primary;
  font-size: 28px;
  color: #fff;
  margin: 0 0 8px;
}

.page-subtitle {
  margin: 0;
  color: rgba(255, 255, 255, 0.6);
  max-width: 760px;
}

.actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.btn {
  border: none;
  border-radius: 10px;
  padding: 10px 16px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s ease;

  &--secondary {
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
  }

  &--danger {
    background: rgba(225, 6, 0, 0.22);
    color: #fff;
  }
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.stat-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 18px;

  &--warm {
    border-color: rgba(255, 122, 69, 0.35);
    background: rgba(255, 122, 69, 0.08);
  }
}

.stat-label {
  display: block;
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 10px;
}

.stat-value {
  color: #fff;
  font-size: 28px;
  font-weight: 700;

  &--small {
    font-size: 13px;
    word-break: break-all;
  }
}

.panel-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.panel {
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 18px;

  &--full {
    width: 100%;
  }
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 14px;

  h2 {
    margin: 0;
    font-size: 18px;
    color: #fff;
  }

  span {
    color: rgba(255, 255, 255, 0.5);
    font-size: 12px;
  }
}

.empty-state {
  color: rgba(255, 255, 255, 0.45);
  padding: 12px 0;
}

.table {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.table-head,
.table-row {
  display: grid;
  grid-template-columns: minmax(0, 2fr) 80px 80px 70px;
  gap: 12px;
  align-items: center;
}

.table-head {
  color: rgba(255, 255, 255, 0.45);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.table-row {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 10px;
  padding: 10px 12px;
  color: rgba(255, 255, 255, 0.88);
  font-size: 13px;
}

.table--recent .table-head,
.table--recent .table-row {
  grid-template-columns: 90px 120px 150px minmax(0, 3fr) 70px 70px 80px;
}

.mono {
  font-family: 'JetBrains Mono', 'Consolas', monospace;
}

.path-cell {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 1100px) {
  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .panel-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .page-header {
    flex-direction: column;
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }

  .table-head,
  .table-row,
  .table--recent .table-head,
  .table--recent .table-row {
    grid-template-columns: 1fr;
  }

  .path-cell {
    white-space: normal;
  }
}
</style>
