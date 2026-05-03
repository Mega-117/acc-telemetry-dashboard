<script setup lang="ts">
import { computed, ref } from 'vue'
import { db } from '~/config/firebase'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { useElectronSync } from '~/composables/useElectronSync'
import { trackedGetDoc, trackedSetDoc } from '~/composables/useFirebaseTracker'
import { repairPilotDirectoryFromUser, type PilotDirectoryRepairResult } from '~/services/pilotDirectoryProjectionService'
import {
  auditOwnerData,
  reprocessOwnerCloudRawSummaries,
  rebuildOwnerProjections,
  type OwnerCloudSummaryReprocessReport,
  type OwnerDataAuditReport,
  type OwnerProjectionRebuildReport
} from '~/services/sync/ownerDataRepairService'

definePageMeta({
  middleware: 'dev-tools'
})

const { currentUser } = useFirebaseAuth()
const { isElectron, syncTelemetryFiles } = useElectronSync()

const isLoading = ref(false)
const error = ref<string | null>(null)
const auditReport = ref<OwnerDataAuditReport | null>(null)
const rebuildReport = ref<OwnerProjectionRebuildReport | null>(null)
const cloudReprocessResult = ref<OwnerCloudSummaryReprocessReport | null>(null)
const localReprocessResult = ref<any | null>(null)
const directoryRepairUid = ref('')
const directoryRepairResult = ref<PilotDirectoryRepairResult | null>(null)

const isDevHost = computed(() => {
  if (import.meta.dev) return true
  if (typeof window === 'undefined') return false
  return ['localhost', '127.0.0.1'].includes(window.location.hostname)
})

const canUseTool = computed(() => !!currentUser.value?.uid && isDevHost.value)
const canRebuild = computed(() => !!auditReport.value?.canRebuildProjections && !isLoading.value)
const canReprocessCloud = computed(() => !!currentUser.value?.uid && canUseTool.value && !isLoading.value)
const canRepairDirectory = computed(() => !!directoryRepairUid.value.trim() && canUseTool.value && !isLoading.value)
const permissionIssues = computed(() => {
  const permissions = auditReport.value?.permissions
  if (!permissions) return []
  return Object.entries(permissions)
    .filter(([, status]) => status !== 'ok')
    .map(([area, status]) => `${area}: ${status}`)
})

async function runAudit() {
  if (!currentUser.value?.uid || !canUseTool.value) return
  isLoading.value = true
  error.value = null
  try {
    auditReport.value = await auditOwnerData(currentUser.value.uid)
  } catch (e: any) {
    error.value = e?.message || 'Audit fallito'
  } finally {
    isLoading.value = false
  }
}

async function runRebuild() {
  if (!currentUser.value?.uid || !canUseTool.value) return
  const ok = confirm('Rigenerare stats, sessionIndex, trackBests, trackDetailProjections e pilotDirectory per questo utente?')
  if (!ok) return

  isLoading.value = true
  error.value = null
  try {
    rebuildReport.value = await rebuildOwnerProjections(currentUser.value.uid)
    auditReport.value = await auditOwnerData(currentUser.value.uid)
  } catch (e: any) {
    error.value = e?.message || 'Rebuild fallito'
  } finally {
    isLoading.value = false
  }
}

async function runCloudSummaryReprocessAndRebuild() {
  if (!currentUser.value?.uid || !canUseTool.value) return
  const ok = confirm('Ricalcolare tutti i summary dai rawChunks cloud e poi rigenerare tutte le projection? Verranno scritte solo le sessioni con dati cambiati.')
  if (!ok) return

  isLoading.value = true
  error.value = null
  try {
    cloudReprocessResult.value = await reprocessOwnerCloudRawSummaries(currentUser.value.uid, { forceAll: true })
    rebuildReport.value = await rebuildOwnerProjections(currentUser.value.uid)
    auditReport.value = await auditOwnerData(currentUser.value.uid)
  } catch (e: any) {
    error.value = e?.message || 'Reprocess cloud fallito'
  } finally {
    isLoading.value = false
  }
}

async function reprocessLocalAndSync() {
  if (!currentUser.value?.uid || !canUseTool.value || typeof window === 'undefined') return
  const electronAPI = (window as any).electronAPI
  if (!electronAPI?.reprocessTelemetrySummaries) {
    error.value = 'Reprocess locale disponibile solo dentro Electron.'
    return
  }
  const ok = confirm('Ricalcolare i summary dei file locali e poi avviare Force Sync?')
  if (!ok) return

  isLoading.value = true
  error.value = null
  try {
    localReprocessResult.value = await electronAPI.reprocessTelemetrySummaries({})
    await syncTelemetryFiles()
    auditReport.value = await auditOwnerData(currentUser.value.uid)
  } catch (e: any) {
    error.value = e?.message || 'Reprocess locale fallito'
  } finally {
    isLoading.value = false
  }
}

async function runPilotDirectoryRepair() {
  const uid = directoryRepairUid.value.trim()
  if (!uid || !canUseTool.value) return
  const ok = confirm(`Riallineare pilotDirectory/${uid} leggendo users/${uid}? Serve essere owner o admin secondo le rules Firebase.`)
  if (!ok) return

  isLoading.value = true
  error.value = null
  directoryRepairResult.value = null
  try {
    directoryRepairResult.value = await repairPilotDirectoryFromUser({
      db,
      uid,
      getDocFn: (ref) => trackedGetDoc(ref, 'DevPilotDirectoryRepair'),
      setDocFn: (ref, data, options) => options
        ? trackedSetDoc(ref, data, options, 'DevPilotDirectoryRepair')
        : trackedSetDoc(ref, data, 'DevPilotDirectoryRepair')
    })
    if (directoryRepairResult.value.reason === 'missing_user') {
      error.value = `users/${uid} non esiste. Directory non aggiornata.`
    }
  } catch (e: any) {
    error.value = e?.message || 'Repair pilotDirectory fallito'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <LayoutPageContainer>
    <div class="dev-rebuild">
      <header class="page-header">
        <div>
          <h1 class="page-title">DEV Owner Rebuild</h1>
          <p class="page-subtitle">
            Audit e rebuild controllato dei dati derivati Firebase dell'utente loggato.
          </p>
        </div>
        <NuxtLink to="/dev-firebase" class="link-button">Firebase Monitor</NuxtLink>
      </header>

      <div v-if="!canUseTool" class="notice notice--danger">
        Strumento disponibile solo in sviluppo/localhost e con utente autenticato.
      </div>

      <div class="actions">
        <button class="btn btn--secondary" :disabled="isLoading || !canUseTool" @click="runAudit">
          Audit only
        </button>
        <button class="btn btn--primary" :disabled="!canRebuild" @click="runRebuild">
          Rebuild projections
        </button>
        <button class="btn btn--primary" :disabled="!canReprocessCloud" @click="runCloudSummaryReprocessAndRebuild">
          Reprocess cloud raw summaries + rebuild projections
        </button>
        <button class="btn btn--secondary" :disabled="isLoading || !canUseTool || !isElectron" @click="reprocessLocalAndSync">
          Reprocess local files + sync
        </button>
      </div>

      <section class="card card--full repair-panel">
        <div>
          <h2>Repair pilotDirectory</h2>
          <p>
            Riallinea un documento <code>pilotDirectory</code> usando <code>users</code> come fonte completa.
            Utile quando coachId/ruolo/profilo sono stati modificati fuori dall'app.
          </p>
        </div>
        <div class="repair-form">
          <input
            v-model="directoryRepairUid"
            class="repair-input"
            type="text"
            placeholder="UID pilota"
            :disabled="isLoading || !canUseTool"
          />
          <button class="btn btn--primary" :disabled="!canRepairDirectory" @click="runPilotDirectoryRepair">
            Repair directory
          </button>
        </div>
        <pre v-if="directoryRepairResult">{{ JSON.stringify(directoryRepairResult, null, 2) }}</pre>
      </section>

      <div v-if="isLoading" class="notice">Operazione in corso...</div>
      <div v-if="error" class="notice notice--danger">{{ error }}</div>

      <section v-if="auditReport" class="grid">
        <article class="card">
          <h2>Sessioni</h2>
          <dl>
            <div><dt>Totali</dt><dd>{{ auditReport.sessions.total }}</dd></div>
            <div><dt>Canoniche</dt><dd>{{ auditReport.sessions.canonical }}</dd></div>
            <div><dt>Legacy</dt><dd>{{ auditReport.sessions.legacy }}</dd></div>
            <div><dt>Missing canonical</dt><dd>{{ auditReport.sessions.missingCanonical }}</dd></div>
            <div><dt>Incomplete cloud-only</dt><dd>{{ auditReport.sessions.incompleteCloudOnly }}</dd></div>
            <div><dt>Zero laps</dt><dd>{{ auditReport.sessions.zeroLaps }}</dd></div>
          </dl>
        </article>

        <article class="card">
          <h2>Raw chunks</h2>
          <dl>
            <div><dt>Presenti</dt><dd>{{ auditReport.rawChunks.present }}</dd></div>
            <div><dt>Mancanti</dt><dd>{{ auditReport.rawChunks.missing }}</dd></div>
            <div><dt>Sconosciuti</dt><dd>{{ auditReport.rawChunks.unknown }}</dd></div>
            <div><dt>Probe</dt><dd>{{ auditReport.rawChunks.probed }}</dd></div>
          </dl>
        </article>

        <article class="card">
          <h2>Projection</h2>
          <dl>
            <div><dt>stats schema</dt><dd>{{ auditReport.projections.statsSchemaVersion }}</dd></div>
            <div><dt>sessionIndex schema</dt><dd>{{ auditReport.projections.sessionIndexSchemaVersion }}</dd></div>
            <div><dt>trackBests docs</dt><dd>{{ auditReport.projections.trackBestsDocs }}</dd></div>
            <div><dt>trackDetail docs</dt><dd>{{ auditReport.projections.trackDetailProjectionDocs }}</dd></div>
            <div><dt>missing trackBests</dt><dd>{{ auditReport.projections.missingTrackBests.length }}</dd></div>
            <div><dt>missing trackDetail</dt><dd>{{ auditReport.projections.missingTrackDetailProjections.length }}</dd></div>
          </dl>
        </article>

        <article class="card">
          <h2>Permessi</h2>
          <div v-if="permissionIssues.length === 0" class="ok">OK</div>
          <ul v-else class="issue-list">
            <li v-for="item in permissionIssues" :key="item">{{ item }}</li>
          </ul>
        </article>
      </section>

      <section v-if="auditReport?.issues.length" class="card card--full">
        <h2>Issues</h2>
        <div class="issue-table">
          <div class="issue-row issue-row--head">
            <span>Severity</span>
            <span>Code</span>
            <span>Target</span>
            <span>Messaggio</span>
          </div>
          <div v-for="item in auditReport.issues" :key="`${item.code}:${item.sessionId || item.trackId || item.message}`" class="issue-row">
            <span>{{ item.severity }}</span>
            <span class="mono">{{ item.code }}</span>
            <span class="mono">{{ item.sessionId || item.trackId || '-' }}</span>
            <span>{{ item.message }}</span>
          </div>
        </div>
      </section>

      <section v-if="rebuildReport" class="card card--full">
        <h2>Ultimo rebuild</h2>
        <pre>{{ JSON.stringify(rebuildReport, null, 2) }}</pre>
      </section>

      <section v-if="cloudReprocessResult" class="card card--full">
        <h2>Ultimo reprocess cloud raw</h2>
        <pre>{{ JSON.stringify(cloudReprocessResult, null, 2) }}</pre>
      </section>

      <section v-if="localReprocessResult" class="card card--full">
        <h2>Ultimo reprocess locale</h2>
        <pre>{{ JSON.stringify(localReprocessResult, null, 2) }}</pre>
      </section>
    </div>
  </LayoutPageContainer>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

.dev-rebuild {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.page-title {
  margin: 0 0 8px;
  color: #fff;
  font-family: 'Outfit', $font-primary;
  font-size: 28px;
}

.page-subtitle {
  margin: 0;
  color: rgba(255, 255, 255, 0.6);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.repair-panel {
  display: grid;
  gap: 14px;

  p {
    margin: 0;
    color: rgba(255, 255, 255, 0.62);
    line-height: 1.55;
  }
}

.repair-form {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.repair-input {
  min-width: min(360px, 100%);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}

.btn,
.link-button {
  border: 0;
  border-radius: 10px;
  padding: 10px 16px;
  font-weight: 700;
  cursor: pointer;
  text-decoration: none;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn--primary {
  background: #59d99d;
  color: #07140e;
}

.btn--secondary,
.link-button {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.notice {
  padding: 14px 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.8);
}

.notice--danger {
  border-color: rgba(255, 100, 100, 0.35);
  background: rgba(255, 100, 100, 0.1);
  color: #ffb0b0;
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.card {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.035);
  padding: 18px;

  h2 {
    margin: 0 0 14px;
    color: #fff;
    font-size: 18px;
  }
}

.card--full {
  width: 100%;
}

dl {
  display: grid;
  gap: 8px;
  margin: 0;
}

dl div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

dt {
  color: rgba(255, 255, 255, 0.58);
}

dd {
  margin: 0;
  color: #fff;
  font-weight: 700;
}

.ok {
  color: #59d99d;
  font-weight: 700;
}

.issue-list {
  margin: 0;
  padding-left: 18px;
  color: #ffcf8a;
}

.issue-table {
  display: grid;
  gap: 8px;
}

.issue-row {
  display: grid;
  grid-template-columns: 90px 190px minmax(130px, 1fr) minmax(0, 2fr);
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.035);
  color: rgba(255, 255, 255, 0.85);
}

.issue-row--head {
  background: transparent;
  color: rgba(255, 255, 255, 0.45);
  text-transform: uppercase;
  font-size: 12px;
  letter-spacing: 0.06em;
}

.mono,
pre {
  font-family: 'JetBrains Mono', 'Consolas', monospace;
}

pre {
  overflow: auto;
  color: rgba(255, 255, 255, 0.8);
  white-space: pre-wrap;
}

@media (max-width: 900px) {
  .page-header {
    flex-direction: column;
  }

  .grid,
  .issue-row {
    grid-template-columns: 1fr;
  }
}
</style>
