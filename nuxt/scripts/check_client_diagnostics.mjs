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
const adminPage = read(nuxtRoot, 'app/pages/admin-diagnostics.vue')
const indexes = JSON.parse(read(frontendRoot, 'firestore.indexes.json'))

assert.match(rules, /match \/diagnostics\/\{eventId\}/, 'Firestore rules must define owner diagnostics subcollection')
assert.match(rules, /request\.resource\.data\.userId == userId/, 'diagnostic create must bind payload userId to owner path')
assert.match(rules, /request\.resource\.data\.receivedAt == request\.time/, 'diagnostic receipt timestamp must be server authoritative')
assert.match(rules, /allow list, delete: if isAdmin\(\)/, 'only admin may list/delete client diagnostics')
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
assert.match(adminPage, /Elimina errori più vecchi di 30 giorni/, 'admin cleanup must be a direct action')
assert.doesNotMatch(adminPage, /Conferma eliminazione|confirm\(/, 'admin cleanup must not require confirmation')
assert.doesNotMatch(adminPage, /event\.userId|selected\.userId/, 'admin UI must never render diagnostic UID')
for (const token of ['Oggi', 'Ultimi 7 giorni', 'Ultimi 30 giorni', 'Intervallo personalizzato', 'Precedente', 'Successiva', 'Azzera filtri', 'Riprova']) {
  assert.ok(adminPage.includes(token), 'admin diagnostics UI missing state/control: ' + token)
}
assert.match(adminPage, /color-scheme: dark/, 'diagnostic dropdowns must declare a readable dark color scheme')
assert.match(diagnosticsPresentation, /Europe\/Rome/, 'date boundaries and formatting must use the Italian timezone')
assert.match(diagnosticsRepository, /where\('occurredAt', '>=', options\.filters\.startIso\)/, 'period start must be inclusive')
assert.match(diagnosticsRepository, /where\('occurredAt', '<', options\.filters\.endExclusiveIso\)/, 'period end must include the entire selected final day')
assert.match(diagnosticsRepository, /orderBy\('occurredAt', 'desc'\)/, 'diagnostics must use the deployed newest-first time index')
assert.match(diagnosticsPresentation, /filterAndPaginateDiagnostics/, 'AND filters, total and pagination must remain pure and index-independent')
assert.match(diagnosticsRepository, /where\(documentId\(\), 'in', uidBatch\)/, 'nicknames must resolve from pilotDirectory without copying profile data')
assert.match(diagnosticsRepository, /where\('receivedAt', '<=', Timestamp\.fromMillis\(cutoffMs\)\)/, 'cleanup must use authoritative receivedAt cutoff')
assert.match(diagnosticsRepository, /trackedWriteBatch/, 'cleanup must use tracked batch writes')

console.log('[CLIENT_DIAGNOSTICS] OK')
