import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const nuxtRoot = path.resolve(scriptDir, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(nuxtRoot, relativePath), 'utf8')
}

const service = read('app/services/sync/ownerDataMaintenanceService.ts')
const checkpoint = read('app/services/sync/canonicalMigrationCheckpoint.ts')
const canonicalSummaryBridge = read('app/services/sync/canonicalSummaryBridge.ts')
const composable = read('app/composables/useOwnerDataMaintenance.ts')
const sync = read('app/composables/useElectronSync.ts')
const app = read('app/app.vue')
const titlebar = read('app/components/electron/ElectronTitlebar.vue')
const notification = read('app/components/electron/DataMaintenanceNotification.vue')

assert.match(service, /OWNER_DATA_MIGRATION_VERSION/)
assert.match(service, /advanceCanonicalMigrationCheckpoint/)
assert.match(service, /trackedRunTransaction/)
assert.match(checkpoint, /maintenance:\s*{\s*canonicalDataMigration/s)
assert.match(checkpoint, /health\.status !== 'repairing'/)
assert.match(checkpoint, /health\.lease\?\.id !== input\.leaseId/)
assert.match(checkpoint, /return 'regression_rejected'/)
assert.match(checkpoint, /return 'idempotent'/)
assert.match(service, /runOwnerDataMaintenanceGate/)
assert.match(service, /completeOwnerDataMaintenanceAfterLocalSync/)
assert.match(service, /auditOwnerData/)
assert.match(service, /reprocessOwnerCloudRawSummaries/)
assert.match(service, /rebuildOwnerProjections/)
assert.match(canonicalSummaryBridge, /reprocessTelemetrySummaries/)
assert.match(canonicalSummaryBridge, /electronAPI\.reprocessTelemetrySummaries/)
assert.match(service, /\|\s*'sync_pending'/)

assert.match(composable, /useOwnerDataMaintenance/)
assert.match(composable, /blocksSync/)
assert.match(composable, /runGate/)
assert.match(composable, /completeAfterLocalSync/)

assert.match(sync, /useOwnerDataMaintenance/)
assert.match(sync, /ownerDataMaintenance\.runGate/)
assert.match(sync, /trigger === 'authReady'/)
assert.match(sync, /ownerDataMaintenance\.completeAfterLocalSync/)
assert.match(sync, /deferredChangedFiles/)
assert.match(sync, /Data maintenance is running, deferring trigger/)

const bootstrapIndex = sync.indexOf('async function executeRuntimeBootstrap')
const authReadyGateIndex = sync.indexOf('ownerDataMaintenance.runGate', bootstrapIndex)
const authReadySyncIndex = sync.indexOf("executeSyncTrigger('authReady'", authReadyGateIndex)
assert.ok(bootstrapIndex >= 0, 'authReady must use the runtime bootstrap coordinator')
assert.ok(authReadyGateIndex >= 0, 'authReady must call owner data maintenance gate')
assert.ok(authReadySyncIndex >= 0, 'runtime bootstrap must still invoke authReady sync')
assert.ok(
  authReadyGateIndex < authReadySyncIndex,
  'runtime bootstrap migration gate must run before authReady sync/scanning'
)

const directAutoReprocessPattern = /reprocessOwnerCloudRawSummaries|rebuildOwnerProjections/
assert.ok(!directAutoReprocessPattern.test(sync), 'useElectronSync must not call owner rebuild/reprocess directly')

assert.match(app, /useOwnerDataMaintenance/)
assert.match(app, /!\(window as any\)\.electronAPI/)
assert.match(app, /ownerDataMaintenance\.runGate/)
assert.match(app, /ElectronDataMaintenanceNotification/)

assert.match(titlebar, /dataMaintenance/)
assert.match(titlebar, /ElectronDataMaintenanceNotification/)
assert.match(notification, /progress-bar/)

console.log('[OWNER_MAINTENANCE_GATE_CHECK] OK')
