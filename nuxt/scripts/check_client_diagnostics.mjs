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
const adminPage = read(nuxtRoot, 'app/pages/admin-diagnostics.vue')

assert.match(rules, /match \/diagnostics\/\{eventId\}/, 'Firestore rules must define owner diagnostics subcollection')
assert.match(rules, /request\.resource\.data\.userId == userId/, 'diagnostic create must bind payload userId to owner path')
assert.match(rules, /allow get: if isOwner\(userId\) \|\| isAdmin\(\)/, 'owner may get a deterministic event for retry deduplication')
assert.match(rules, /allow list, delete: if isAdmin\(\)/, 'only admin may list/delete client diagnostics')
assert.match(rules, /allow update: if false/, 'client diagnostics must remain immutable')
assert.match(app, /useClientDiagnostics/, 'primary app runtime must start diagnostics uploader')
assert.match(diagnosticsComposable, /flushDiagnosticOutbox/, 'local outbox must use progressive idempotent flush')
assert.match(adminPage, /loadRecentClientDiagnostics/, 'admin page must use centralized diagnostics repository')

console.log('[CLIENT_DIAGNOSTICS] OK')
