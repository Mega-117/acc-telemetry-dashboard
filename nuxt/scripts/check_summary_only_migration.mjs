import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const nuxtRoot = path.resolve(scriptDir, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(nuxtRoot, relativePath), 'utf8')
}

const upload = read('app/services/sync/sessionUploadService.ts')
const scan = read('app/services/sync/syncScanService.ts')
const sync = read('app/composables/useElectronSync.ts')
const maintenance = read('app/services/sync/syncMaintenanceService.ts')
const ownerMaintenance = read('app/services/sync/ownerDataMaintenanceService.ts')
const ownerRepair = read('app/services/sync/ownerDataRepairService.ts')
const notification = read('app/components/electron/DataMaintenanceNotification.vue')

for (const required of [
  'rawDataHash',
  'summaryHash',
  'calculateRawDataHash',
  'calculateSummaryHash',
  'cloneWithoutDerivedSummary',
  'delete cloned.summary',
  'delete cloned.summaryRulesVersion',
  'rawDataUnchanged',
  'chunksNeedUpdate = false',
  "reason: isRulesMigration ? 'summary_rules_migration'"
]) {
  assert.ok(upload.includes(required), `sessionUploadService missing summary-only contract token: ${required}`)
}

assert.ok(
  upload.indexOf('rawDataUnchanged && needsRulesMigration') < upload.indexOf('await deleteOldChunks(uid, sessionId)'),
  'summary-only migration must be decided before deleting raw chunks'
)

for (const required of [
  'calculateRawDataHash',
  'calculateSummaryHash',
  'rawDataHash',
  'summaryHash'
]) {
  assert.ok(scan.includes(required), `syncScanService missing registry hash token: ${required}`)
}

for (const required of ['rawDataHash', 'summaryHash']) {
  assert.ok(sync.includes(required), `useElectronSync missing registry hash token: ${required}`)
}

assert.equal(
  /import\s+\{\s*migrateLegacyCloudSummaries\s*\}/.test(maintenance),
  false,
  'syncMaintenanceService must not import legacy cloud summary migration in the normal flow'
)
assert.match(maintenance, /runLegacyMigration\s*=\s*false/)
assert.match(sync, /runLegacyMigration:\s*false/)

assert.ok(
  ownerMaintenance.includes('verifyOwnerMigrationLightweight'),
  'owner maintenance must use lightweight final verification'
)
assert.ok(
  ownerRepair.includes('maintenance.ownerData.lightweightVerify'),
  'owner repair must expose lightweight verification scenario'
)

for (const message of [
  'Controllo dati pilota',
  'Aggiorno Best/AVG',
  'Sincronizzo sessioni aggiornate',
  'Ricostruisco riferimenti storici',
  'Aggiornamento dati completato'
]) {
  assert.ok(ownerMaintenance.includes(message) || notification.includes(message), `Missing user-facing migration message: ${message}`)
}

console.log('[SUMMARY_ONLY_MIGRATION_CHECK] OK')
