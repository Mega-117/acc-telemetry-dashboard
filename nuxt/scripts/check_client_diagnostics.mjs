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
assert.match(rules, /allow read, delete: if isAdmin\(\)/, 'only admin may read/delete client diagnostics')
assert.match(app, /useClientDiagnostics/, 'primary app runtime must start diagnostics uploader')
assert.match(diagnosticsComposable, /acknowledgeDiagnostics/, 'local events must be acknowledged only after upload')
assert.match(adminPage, /loadRecentClientDiagnostics/, 'admin page must use centralized diagnostics repository')

console.log('[CLIENT_DIAGNOSTICS] OK')
