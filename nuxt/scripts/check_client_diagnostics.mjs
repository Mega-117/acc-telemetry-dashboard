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
const adminPage = read(nuxtRoot, 'app/pages/admin-diagnostics.vue')
const indexes = JSON.parse(read(frontendRoot, 'firestore.indexes.json'))

assert.match(rules, /match \/diagnostics\/\{eventId\}/, 'Firestore rules must define owner diagnostics subcollection')
assert.match(rules, /request\.resource\.data\.userId == userId/, 'diagnostic create must bind payload userId to owner path')
assert.match(rules, /request\.resource\.data\.receivedAt == request\.time/, 'diagnostic receipt timestamp must be server authoritative')
assert.match(rules, /request\.resource\.data\.severity in \['warning', 'error', 'fatal'\]/, 'diagnostic severity must be an allow-listed enum')
assert.match(rules, /allow get: if isOwner\(userId\) \|\| isAdmin\(\)/, 'owner may get a deterministic event for retry deduplication')
assert.match(rules, /allow list, delete: if isAdmin\(\)/, 'only admin may list/delete client diagnostics')
assert.match(rules, /allow update: if false/, 'client diagnostics must remain immutable')
assert.match(app, /useClientDiagnostics/, 'primary app runtime must start diagnostics uploader')
assert.match(diagnosticsComposable, /flushDiagnosticOutbox/, 'local outbox must use progressive idempotent flush')
assert.match(diagnosticsComposable, /receivedAt: serverTimestamp\(\)/, 'diagnostic uploads must use Firestore serverTimestamp')
assert.ok(indexes.fieldOverrides.some((field) => field.collectionGroup === 'diagnostics'
  && field.fieldPath === 'receivedAt'
  && field.indexes?.some((index) => index.order === 'ASCENDING'
    && index.queryScope === 'COLLECTION_GROUP')), 'diagnostics.receivedAt collection-group index must support cleanup')
assert.match(adminPage, /loadRecentClientDiagnostics/, 'admin page must use centralized diagnostics repository')
assert.match(adminPage, /countExpiredClientDiagnostics/, 'admin page must preview expired diagnostics')
assert.match(adminPage, /Conferma eliminazione/, 'admin cleanup must require an explicit second confirmation')
assert.match(diagnosticsRepository, /where\('receivedAt', '<=', Timestamp\.fromMillis\(cutoffMs\)\)/, 'cleanup must use authoritative receivedAt cutoff')
assert.match(diagnosticsRepository, /trackedWriteBatch/, 'cleanup must use tracked batch writes')

console.log('[CLIENT_DIAGNOSTICS] OK')
