<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { useFirebaseMonitor } from '~/composables/useFirebaseTracker'

const {
  totals,
  callerBreakdown,
  pathBreakdown,
  scenarioBreakdown,
  recentOperations,
  recentScenarios,
  resetFirebaseTracker
} = useFirebaseMonitor()

const topScenarios = computed(() => scenarioBreakdown.value.slice(0, 6))
const topCallers = computed(() => callerBreakdown.value.slice(0, 5))
const topPaths = computed(() => pathBreakdown.value.slice(0, 5))
const recentOps = computed(() => recentOperations.value.slice(0, 8))
const recentScenarioRows = computed(() => recentScenarios.value.slice(0, 6))
const isExpanded = ref(false)

const totalReadOps = computed(() => (
  totals.value.readOps +
  totals.value.queryOps +
  totals.value.countOps +
  totals.value.listenerSnapshots
))

onMounted(() => {
  try {
    isExpanded.value = window.localStorage.getItem('acc.firebaseProbe.expanded') === '1'
  } catch {
    isExpanded.value = false
  }
})

watch(isExpanded, (value) => {
  try {
    window.localStorage.setItem('acc.firebaseProbe.expanded', value ? '1' : '0')
  } catch {}
})

function toggleProbe() {
  isExpanded.value = !isExpanded.value
}

function formatMetadata(metadata: Record<string, unknown> | undefined) {
  if (!metadata || Object.keys(metadata).length === 0) return '{}'
  return JSON.stringify(metadata)
}
</script>

<template>
  <aside class="firebase-probe" :class="{ 'firebase-probe--collapsed': !isExpanded }" data-testid="firebase-probe">
    <button
      v-if="!isExpanded"
      type="button"
      class="probe-fab"
      data-testid="firebase-probe-toggle"
      title="Apri Firebase Probe"
      @click="toggleProbe"
    >
      <span>FB</span>
      <strong>{{ totals.billedReads }}/{{ totals.billedWrites }}</strong>
    </button>

    <div v-else class="probe-panel">
    <div class="probe-header">
      <strong>Firebase Probe</strong>
      <div class="probe-actions">
        <button type="button" data-testid="firebase-probe-reset" @click="resetFirebaseTracker">
          Reset
        </button>
        <button type="button" data-testid="firebase-probe-toggle" @click="toggleProbe">
          Riduci
        </button>
      </div>
    </div>

    <div class="probe-grid" data-testid="firebase-probe-counters">
      <span>Reads</span>
      <strong data-testid="firebase-probe-reads">{{ totals.billedReads }}</strong>
      <span>Writes</span>
      <strong data-testid="firebase-probe-writes">{{ totals.billedWrites }}</strong>
      <span>Read ops</span>
      <strong data-testid="firebase-probe-read-ops">{{ totalReadOps }}</strong>
      <span>Count ops</span>
      <strong data-testid="firebase-probe-count-ops">{{ totals.countOps }}</strong>
      <span>Write ops</span>
      <strong data-testid="firebase-probe-write-ops">{{ totals.writeOps + totals.deleteOps }}</strong>
      <span>Realtime</span>
      <strong data-testid="firebase-probe-realtime">{{ totals.listenerSnapshots }}</strong>
    </div>

    <details open>
      <summary>Scenarios</summary>
      <div data-testid="firebase-probe-scenarios" class="probe-list">
        <div v-if="topScenarios.length === 0" class="empty">none</div>
        <div v-for="item in topScenarios" :key="item.id" class="probe-row">
          <span>{{ item.name }}</span>
          <strong>R{{ item.billedReads }} W{{ item.billedWrites }} O{{ item.operations }}</strong>
        </div>
      </div>
    </details>

    <details>
      <summary>Callers</summary>
      <div data-testid="firebase-probe-callers" class="probe-list">
        <div v-if="topCallers.length === 0" class="empty">none</div>
        <div v-for="item in topCallers" :key="item.caller" class="probe-row">
          <span>{{ item.caller }}</span>
          <strong>R{{ item.billedReads }} W{{ item.billedWrites }} O{{ item.operations }}</strong>
        </div>
      </div>
    </details>

    <details>
      <summary>Paths</summary>
      <div data-testid="firebase-probe-paths" class="probe-list">
        <div v-if="topPaths.length === 0" class="empty">none</div>
        <div v-for="item in topPaths" :key="item.pathBucket" class="probe-row">
          <span>{{ item.pathBucket }}</span>
          <strong>R{{ item.billedReads }} W{{ item.billedWrites }} O{{ item.operations }}</strong>
        </div>
      </div>
    </details>

    <details>
      <summary>Recent scenarios</summary>
      <div data-testid="firebase-probe-recent-scenarios" class="probe-list">
        <div v-if="recentScenarioRows.length === 0" class="empty">none</div>
        <div v-for="item in recentScenarioRows" :key="item.id" class="probe-row probe-row--stacked">
          <span>{{ item.name }} R{{ item.billedReads }} W{{ item.billedWrites }} O{{ item.operations }}</span>
          <small>{{ formatMetadata(item.metadata) }}</small>
        </div>
      </div>
    </details>

    <details>
      <summary>Recent ops</summary>
      <div data-testid="firebase-probe-ops" class="probe-list">
        <div v-if="recentOps.length === 0" class="empty">none</div>
        <div v-for="item in recentOps" :key="item.id" class="probe-row probe-row--stacked">
          <span>{{ item.type }} · {{ item.caller }} · R{{ item.billedReads }} W{{ item.billedWrites }}</span>
          <small>{{ item.path }}</small>
        </div>
      </div>
    </details>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.firebase-probe {
  position: fixed;
  right: 14px;
  bottom: 14px;
  z-index: 9999;
  color: #dffcff;
  font-size: 12px;
}

.firebase-probe--collapsed {
  width: auto;
  max-height: none;
  overflow: visible;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
}

.probe-panel {
  width: min(360px, calc(100vw - 28px));
  max-height: min(70vh, 620px);
  overflow: auto;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid rgba(45, 212, 191, 0.36);
  background: rgba(8, 13, 20, 0.94);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(12px);
}

.probe-fab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  padding: 9px 12px;
  border-radius: 999px;
  border: 1px solid rgba(45, 212, 191, 0.42);
  background:
    radial-gradient(circle at 20% 20%, rgba(45, 212, 191, 0.24), transparent 42%),
    rgba(8, 13, 20, 0.9);
  box-shadow: 0 16px 38px rgba(0, 0, 0, 0.34);
}

.probe-fab span {
  color: #071016;
  background: #5eead4;
  border-radius: 999px;
  padding: 4px 6px;
  font-size: 10px;
  font-weight: 1000;
  letter-spacing: 0.04em;
}

.probe-fab strong {
  color: #dffcff;
  font-size: 12px;
}

.probe-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.probe-header strong {
  font-size: 13px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.probe-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

button {
  border: 1px solid rgba(45, 212, 191, 0.42);
  border-radius: 999px;
  padding: 5px 10px;
  color: #dffcff;
  background: rgba(45, 212, 191, 0.12);
  cursor: pointer;
  font-weight: 800;
}

.probe-grid {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 6px 12px;
  margin-bottom: 10px;
  padding: 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.045);
}

.probe-grid span,
summary,
.probe-row small {
  color: rgba(223, 252, 255, 0.62);
}

.probe-grid strong,
.probe-row strong {
  color: #fff;
}

details {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 7px;
  margin-top: 7px;
}

summary {
  cursor: pointer;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.probe-list {
  display: grid;
  gap: 5px;
  margin-top: 7px;
}

.probe-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  padding: 6px 7px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.045);
}

.probe-row span,
.probe-row small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.probe-row--stacked {
  grid-template-columns: 1fr;
}

.empty {
  color: rgba(223, 252, 255, 0.45);
  font-style: italic;
}
</style>
