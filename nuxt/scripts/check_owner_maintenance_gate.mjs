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
const composable = read('app/composables/useOwnerDataMaintenance.ts')
const sync = read('app/composables/useElectronSync.ts')
const app = read('app/app.vue')
const titlebar = read('app/components/electron/ElectronTitlebar.vue')
const notification = read('app/components/electron/DataMaintenanceNotification.vue')

assert.match(service, /OWNER_DATA_MIGRATION_VERSION/)
assert.match(service, /maintenance:\s*{\s*canonicalDataMigration/s)
assert.match(service, /runOwnerDataMaintenanceGate/)
assert.match(service, /completeOwnerDataMaintenanceAfterLocalSync/)
assert.match(service, /auditOwnerData/)
assert.match(service, /reprocessOwnerCloudRawSummaries/)
assert.match(service, /rebuildOwnerProjections/)
assert.match(service, /reprocessTelemetrySummaries/)
assert.match(service, /status:\s*'sync_pending'/)

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

const authReadyGateIndex = sync.indexOf('ownerDataMaintenance.runGate')
const scanIndex = sync.indexOf("queueService.setStatus('scanning')")
assert.ok(authReadyGateIndex >= 0, 'authReady must call owner data maintenance gate')
assert.ok(scanIndex >= 0, 'sync must still scan after the gate')
assert.ok(authReadyGateIndex < scanIndex, 'owner data maintenance gate must run before scanning')

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
