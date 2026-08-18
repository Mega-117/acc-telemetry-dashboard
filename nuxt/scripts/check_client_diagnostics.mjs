import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const nuxtRoot = path.resolve(scriptDir, '..')
const frontendRoot = path.resolve(nuxtRoot, '..')
const read = (root, relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const rules = read(frontendRoot, 'firestore.rules')
const app = read(nuxtRoot, 'app/app.vue')
const diagnosticsComposable = read(nuxtRoot, 'app/composables/useClientDiagnostics.ts')
const diagnosticsRepository = read(nuxtRoot, 'app/repositories/clientDiagnosticsRepository.ts')
const diagnosticsPresentation = read(nuxtRoot, 'app/utils/diagnosticsPresentation.ts')
const diagnosticsEstimate = read(nuxtRoot, 'app/utils/diagnosticsCostEstimate.ts')
const firebaseTracker = read(nuxtRoot, 'app/composables/useFirebaseTracker.ts')
const firebaseProbe = read(nuxtRoot, 'app/components/dev/FirebaseProbe.vue')
const firebaseDevPage = read(nuxtRoot, 'app/pages/dev-firebase.vue')
const adminPage = read(nuxtRoot, 'app/pages/admin-diagnostics.vue')
const indexes = JSON.parse(read(frontendRoot, 'firestore.indexes.json'))
const retention = JSON.parse(read(frontendRoot, 'firebase.retention.local.json'))

assert.match(rules, /match \/diagnostics\/\{eventId\}/, 'Firestore rules must define owner diagnostics subcollection')
assert.match(rules, /request\.resource\.data\.userId == userId/, 'diagnostic create must bind payload userId to owner path')
assert.match(rules, /request\.resource\.data\.receivedAt == request\.time/, 'diagnostic receipt timestamp must be server authoritative')
assert.match(rules, /request\.query\.limit <= 1001/, 'admin diagnostics list must be bounded by Rules')
assert.match(rules, /allow delete: if isAdmin\(\)/, 'only admin may delete client diagnostics')
assert.match(rules, /allow update: if false/, 'client diagnostics must remain immutable')
assert.match(app, /useClientDiagnostics/, 'primary app runtime must start diagnostics uploader')
assert.match(diagnosticsComposable, /flushDiagnosticOutbox/, 'local outbox must use progressive idempotent flush')
assert.match(diagnosticsComposable, /receivedAt: serverTimestamp\(\)/, 'diagnostic uploads must use Firestore serverTimestamp')
assert.ok(indexes.fieldOverrides.some(field => field.collectionGroup === 'diagnostics'
  && field.fieldPath === 'receivedAt'
  && field.indexes?.some(index => index.order === 'ASCENDING'
    && index.queryScope === 'COLLECTION_GROUP')), 'diagnostics.receivedAt collection-group index must support cleanup')
assert.match(adminPage, /loadClientDiagnosticsPage/, 'admin page must use centralized paginated diagnostics repository')
assert.match(adminPage, /CLIENT_DIAGNOSTICS_PAGE_SIZE/, 'admin page must expose the shared 50-item page size')
assert.match(adminPage, /Elimina errori più vecchi di 30 giorni/, 'admin cleanup action must remain visible')
assert.match(adminPage, /CONFERMA ESPLICITA RICHIESTA/, 'admin cleanup must require explicit confirmation')
assert.match(adminPage, /cancelCleanup/, 'admin cleanup must support zero-write cancellation')
assert.match(adminPage, /Continua pulizia/, 'admin cleanup must expose bounded resume progress')
assert.doesNotMatch(adminPage, /event\.userId|selected\.userId/, 'admin UI must never render diagnostic UID')
for (const token of ['Oggi', 'Ultimi 7 giorni', 'Ultimi 30 giorni', 'Intervallo personalizzato', 'Precedente', 'Successiva', 'Azzera filtri', 'Riprova']) {
  assert.ok(adminPage.includes(token), 'admin diagnostics UI missing state/control: ' + token)
}
assert.match(adminPage, /color-scheme: dark/, 'diagnostic dropdowns must declare a readable dark color scheme')
assert.match(diagnosticsPresentation, /Europe\/Rome/, 'date boundaries and formatting must use the Italian timezone')
assert.match(diagnosticsRepository, /where\('receivedAt', '>=', Timestamp\.fromMillis\(startMs\)\)/, 'period start must use authoritative receivedAt')
assert.match(diagnosticsRepository, /where\('receivedAt', '<', Timestamp\.fromMillis\(endExclusiveMs\)\)/, 'period end must include the final Europe/Rome day through receivedAt')
assert.match(diagnosticsRepository, /where\('component', '==', filters\.component\)/, 'component filter must run server-side')
assert.match(diagnosticsRepository, /where\('severity', '==', filters\.severity\)/, 'severity filter must run server-side')
assert.match(diagnosticsRepository, /orderBy\('receivedAt', 'desc'\)/, 'diagnostics must order by server-owned receivedAt')
assert.match(diagnosticsRepository, /orderBy\(documentId\(\), 'desc'\)/, 'diagnostics cursor must have a deterministic path tie-breaker')
assert.match(diagnosticsRepository, /startAfter\(Timestamp\.fromMillis\(cursor\.receivedAtMs\), cursor\.path\)/, 'diagnostics pages must advance by stable cursor')
assert.match(diagnosticsRepository, /limit\(CLIENT_DIAGNOSTICS_MAX_COUNT \+ 1\)/, 'diagnostics count must be capped and observable')
assert.match(diagnosticsRepository, /limit\(pageSize\)/, 'every diagnostics page query must have an explicit limit')
assert.doesNotMatch(diagnosticsRepository, /where\('occurredAt'|orderBy\('occurredAt'/, 'occurredAt must never govern query ordering or retention')
assert.match(diagnosticsRepository, /where\(documentId\(\), 'in', uidBatch\)/, 'nicknames must resolve from pilotDirectory without copying profile data')
assert.match(diagnosticsRepository, /where\('receivedAt', '<=', Timestamp\.fromMillis\(cutoffMs\)\)/, 'cleanup must use authoritative receivedAt cutoff')
assert.match(diagnosticsRepository, /trackedWriteBatch/, 'cleanup must use tracked batch writes')
assert.match(diagnosticsRepository, /CLIENT_DIAGNOSTICS_CLEANUP_MAX_BATCHES_PER_ACTION = 5/, 'cleanup must cap batches per action')
assert.match(diagnosticsEstimate, /non la fattura Firebase/, 'cost estimator must disclose that estimates are not billing')
assert.match(diagnosticsEstimate, /index-entry reads, retry, listener/, 'cost estimator must disclose exclusions')
for (const [name, source] of Object.entries({ diagnosticsRepository, diagnosticsEstimate, firebaseTracker, firebaseProbe, firebaseDevPage, adminPage })) {
  assert.doesNotMatch(source, /\bbilled\s+(?:reads?|writes?)\b|billedReads|billedWrites/i, name + ' must use estimated read/write terminology in identifiers, comments and labels')
}
const diagnosticsIndexKeys = indexes.indexes
  .filter(index => index.collectionGroup === 'diagnostics' && index.queryScope === 'COLLECTION_GROUP')
  .map(index => index.fields.map(field => `${field.fieldPath}:${field.order || field.arrayConfig}`).join('|'))
  .sort()
const requiredDiagnosticsIndexKeys = [
  'receivedAt:DESCENDING|__name__:DESCENDING',
  'component:ASCENDING|receivedAt:DESCENDING|__name__:DESCENDING',
  'severity:ASCENDING|receivedAt:DESCENDING|__name__:DESCENDING',
  'component:ASCENDING|severity:ASCENDING|receivedAt:DESCENDING|__name__:DESCENDING',
  'component:ASCENDING|receivedAt:ASCENDING',
  'severity:ASCENDING|receivedAt:ASCENDING',
  'component:ASCENDING|severity:ASCENDING|receivedAt:ASCENDING'
].sort()
assert.deepEqual(
  diagnosticsIndexKeys,
  requiredDiagnosticsIndexKeys,
  'diagnostics indexes must exactly cover default/filtered pages and all implicitly receivedAt-ascending filtered counts'
)
const diagnosticsRetention = retention.policies.find(policy => policy.collectionGroup === 'diagnostics')
assert.equal(diagnosticsRetention?.authorityField, 'receivedAt', 'retention authority must be receivedAt')
assert.equal(diagnosticsRetention?.maxAgeDays, 30, 'retention age must remain 30 days')
assert.equal(diagnosticsRetention?.ttl?.enabled, false, 'local metadata must never claim TTL is enabled')
assert.equal(diagnosticsRetention?.ttl?.cloudStatus, 'not-active', 'TTL cloud status must remain explicitly inactive')

console.log('[CLIENT_DIAGNOSTICS] OK')
