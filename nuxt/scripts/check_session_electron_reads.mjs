import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const nuxtRoot = path.resolve(scriptDir, '..')
const pagerPath = path.join(nuxtRoot, 'app', 'composables', 'useSessionPager.ts')
const source = fs.readFileSync(pagerPath, 'utf8')

assert.ok(
  !source.includes('function sessionExistsInCloud'),
  'useSessionPager must not restore per-local-session cloud existence checks.'
)

assert.ok(
  !/users\/\$\{targetUserId\}\/sessions\/\$\{sessionId\}/.test(source),
  'Electron /sessioni must not getDoc users/{uid}/sessions/{sessionId} for every local JSON.'
)

assert.ok(
  source.includes('function countLocalOnlySessions'),
  'useSessionPager should classify local-only sessions with lightweight local/index data.'
)

assert.ok(
  source.includes('function loadCloudIdentitySet'),
  'useSessionPager should use the user sessionIndex identity set instead of per-session reads.'
)

assert.ok(
  source.includes('fetchedAtLeastOneCloudPage'),
  'Electron online merge should fetch at least one cloud page before deciding the merged page from local files.'
)

console.log('[SESSION_ELECTRON_READS] OK')
