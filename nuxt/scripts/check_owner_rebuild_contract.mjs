import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const nuxtRoot = path.resolve(scriptDir, '..')
const projectRoot = path.resolve(nuxtRoot, '..')

function read(relativePath) {
  return fs.readFileSync(path.resolve(projectRoot, relativePath), 'utf8')
}

const rules = read('firestore.rules')
const service = read('nuxt/app/services/sync/ownerDataRepairService.ts')
const page = read('nuxt/app/pages/dev-rebuild.vue')
const gateway = read('nuxt/app/composables/useTelemetryGateway.ts')
const trackDetailBuilder = read('nuxt/app/services/projections/buildTrackDetailProjection.ts')
const trackDetailWriter = read('nuxt/app/services/sync/trackDetailProjectionService.ts')
const projectionRebuild = read('nuxt/app/services/sync/projectionRebuildService.ts')
const sessionIndexProjection = read('nuxt/app/services/sync/sessionIndexProjectionService.ts')
const trackBestsProjection = read('nuxt/app/services/sync/trackBestsProjectionService.ts')

for (const required of [
  'match /pilotDirectory/{userId}',
  'match /trackDetailProjections/{trackId}',
  'match /activities/{activityId}'
]) {
  assert.ok(rules.includes(required), `Missing Firestore rules block: ${required}`)
}

for (const required of [
  'auditOwnerData',
  'reprocessOwnerCloudRawSummaries',
  'forceAll',
  'rebuildOwnerProjections',
  'reconstructRawPayloadFromChunks',
  'writeUserProjectionDocuments',
  'applyTrackBestsProjectionDeltas',
  'BEST_RULES_VERSION',
  'trackedGetDocs',
  'trackedSetDoc',
  'trackedDeleteDoc'
]) {
  assert.ok(service.includes(required), `Owner rebuild service missing contract token: ${required}`)
}

for (const required of [
  'Audit only',
  'Rebuild projections',
  'Reprocess cloud raw summaries + rebuild projections',
  'Reprocess local files + sync',
  'reprocessOwnerCloudRawSummaries',
  'rebuildOwnerProjections',
  'auditOwnerData'
]) {
  assert.ok(page.includes(required), `dev-rebuild page missing UI/contract token: ${required}`)
}

assert.ok(
  gateway.includes('Promise.allSettled') && gateway.includes('projection_read_failed'),
  'Track detail projection reads must fail soft into controlled fallback'
)

assert.ok(
  projectionRebuild.includes('sanitizeForFirestore'),
  'Projection rebuild writes must sanitize undefined values before Firestore setDoc'
)

assert.equal(
  /\|\|\s*undefined/.test(sessionIndexProjection),
  false,
  'sessionIndex projection must not write undefined fallback values'
)

assert.ok(
  trackDetailWriter.includes('sanitizeForFirestore'),
  'trackDetail projection writes must sanitize undefined best fields before Firestore setDoc'
)

assert.equal(
  /best(?:Qualy|Race|AvgRace)Temp\s*=\s*sessionBest\.best(?:Qualy|Race|AvgRace)Temp(?!\s*\?\?)/.test(trackBestsProjection),
  false,
  'trackBests projection must normalize missing temperature fields to null'
)

const forbiddenLegacyBestLapFallbacks = [
  /summary\.bestLap\s*&&\s*session\.meta\.session_type/,
  /session\.meta\.session_type\s*===.*summary\.bestLap/,
  /best_qualy_ms[\s\S]{0,120}bestLap/
]

for (const [name, source] of [
  ['useTelemetryGateway.ts', gateway],
  ['buildTrackDetailProjection.ts', trackDetailBuilder],
  ['trackDetailProjectionService.ts', trackDetailWriter]
]) {
  for (const pattern of forbiddenLegacyBestLapFallbacks) {
    assert.equal(pattern.test(source), false, `${name} still contains bestLap-as-qualy fallback`)
  }
}

console.log('[OWNER_REBUILD_CONTRACT] OK')
