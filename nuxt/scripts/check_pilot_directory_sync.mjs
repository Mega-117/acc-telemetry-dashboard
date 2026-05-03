import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const nuxtRoot = path.resolve(scriptDir, '..')
const appRoot = path.join(nuxtRoot, 'app')

function read(relativePath) {
  return fs.readFileSync(path.join(nuxtRoot, relativePath), 'utf8')
}

const serviceSource = read('app/services/pilotDirectoryProjectionService.ts')
const provisioningSource = read('app/services/auth/userProvisioningService.ts')
const ownerRepairSource = read('app/services/sync/ownerDataRepairService.ts')
const deltaSource = read('app/services/sync/syncUserProjectionDeltaService.ts')
const rebuildSource = read('app/services/sync/projectionRebuildService.ts')
const electronSyncSource = read('app/composables/useElectronSync.ts')
const pilotsPageSource = read('app/pages/piloti/index.vue')
const devRebuildSource = read('app/pages/dev-rebuild.vue')
const packageSource = read('package.json')

assert.equal(serviceSource.includes('buildPilotDirectoryDocument'), true, 'pilotDirectory service must own full directory document construction')
assert.equal(serviceSource.includes('writePilotDirectoryFromUser'), true, 'pilotDirectory service must expose full user->directory writer')
assert.equal(serviceSource.includes('repairPilotDirectoryFromUser'), true, 'pilotDirectory service must expose repair from users/{uid}')
assert.equal(serviceSource.includes('updatePilotDirectoryActivity'), true, 'pilotDirectory service must expose partial activity/runtime update')

assert.equal(provisioningSource.includes('writePilotDirectoryFromUser'), true, 'auth provisioning must use centralized pilotDirectory writer')
assert.equal(ownerRepairSource.includes('writePilotDirectoryFromUser'), true, 'owner rebuild/repair must use centralized pilotDirectory writer')
assert.equal(deltaSource.includes('updatePilotDirectoryActivity'), true, 'sync delta must use partial pilotDirectory activity update')
assert.equal(rebuildSource.includes('updatePilotDirectoryActivity'), true, 'projection rebuild must use partial pilotDirectory activity update')
assert.equal(electronSyncSource.includes('updatePilotDirectoryActivity'), true, 'Electron suite version update must use partial pilotDirectory runtime update')

assert.equal(deltaSource.includes('coachId'), false, 'sync delta must not write coachId')
assert.equal(deltaSource.includes("role:"), false, 'sync delta must not write role')
assert.equal(rebuildSource.includes('coachId'), false, 'projection rebuild partial directory update must not write coachId')
assert.equal(rebuildSource.includes("role:"), false, 'projection rebuild partial directory update must not write role')
assert.equal(electronSyncSource.includes('coachId'), false, 'Electron suite version update must not write coachId')

assert.equal(pilotsPageSource.includes("collection(db, 'users')"), false, '/piloti must not read heavy users collection')
assert.equal(pilotsPageSource.includes('aggiungi il campo <code>coachId</code>'), false, '/piloti must not suggest users-only coachId edits')
assert.equal(pilotsPageSource.includes('pilotDirectory'), true, '/piloti empty state must mention directory alignment')

assert.equal(devRebuildSource.includes('repairPilotDirectoryFromUser'), true, '/dev-rebuild must expose dev repair for pilotDirectory divergence')
assert.equal(devRebuildSource.includes('DevPilotDirectoryRepair'), true, 'dev repair must be tracked as its own Firebase scenario caller')
assert.equal(packageSource.includes('"check:pilot-directory-sync"'), true, 'package.json must expose check:pilot-directory-sync')

const appFiles = []
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (entry.isFile() && /\.(ts|vue)$/.test(entry.name)) appFiles.push(full)
  }
}
walk(appRoot)

const forbiddenFullBuilders = []
for (const filePath of appFiles) {
  const normalized = filePath.replaceAll('\\', '/')
  if (normalized.endsWith('/utils/pilotDirectoryFields.ts')) continue
  if (normalized.endsWith('/services/pilotDirectoryProjectionService.ts')) continue
  const source = fs.readFileSync(filePath, 'utf8')
  if (source.includes('buildPilotDirectoryDocument')) {
    forbiddenFullBuilders.push(path.relative(nuxtRoot, filePath).replaceAll('\\', '/'))
  }
}

assert.deepEqual(forbiddenFullBuilders, [], 'full pilotDirectory construction must stay centralized')

console.log('[PILOT_DIRECTORY_SYNC] OK')
