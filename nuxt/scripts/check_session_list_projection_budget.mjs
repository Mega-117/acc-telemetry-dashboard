import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const nuxtRoot = path.resolve(scriptDir, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(nuxtRoot, relativePath), 'utf8')
}

const service = read('app/services/sync/sessionListProjectionService.ts')
const pager = read('app/composables/useSessionPager.ts')
const rebuild = read('app/services/sync/projectionRebuildService.ts')
const delta = read('app/services/sync/syncUserProjectionDeltaService.ts')
const sessioni = read('app/components/pages/SessioniPage.vue')
const rules = fs.readFileSync(path.resolve(nuxtRoot, '..', 'firestore.rules'), 'utf8')

assert.match(service, /SESSION_LIST_PROJECTION_SCHEMA_VERSION\s*=\s*1/, 'Session list projection must expose schema version 1.')
assert.match(service, /SESSION_LIST_PROJECTION_PAGE_SIZE\s*=\s*100/, 'Session list projection must page entries at 100 per document.')
assert.match(service, /users\/\$\{uid\}\/sessionListMeta\/v1/, 'Session list projection must use the sessionListMeta/v1 document.')
assert.match(service, /users\/\$\{uid\}\/sessionListPages\/\$\{page\.pageKey\}/, 'Session list projection must write paged list documents.')
assert.match(service, /trackKey/, 'Session list projection entries must include normalized trackKey.')
assert.match(service, /carKey/, 'Session list projection entries must include normalized carKey.')
assert.match(service, /carCategory/, 'Session list projection entries must include carCategory.')

const lightweightIndex = pager.indexOf('const lightweightSource = await loadLightweightSessionSource')
const heavyOwnerIndex = pager.indexOf('if (isOwner && isElectron.value && globalOnline.value)')
assert.ok(lightweightIndex >= 0, 'SessionPager must try the lightweight session source.')
assert.ok(heavyOwnerIndex >= 0, 'SessionPager must keep the existing heavy fallback.')
assert.ok(lightweightIndex < heavyOwnerIndex, 'SessionPager must try projection/sessionIndex before the heavy sessions query fallback.')
assert.match(pager, /loadSessionListProjection/, 'SessionPager must read session list projection.')
assert.match(pager, /loadCompleteSessionIndex/, 'SessionPager must fallback to complete sessionIndex only when complete.')
assert.match(pager, /pageFromAllSessions/, 'Projection-backed filtering must paginate locally.')

assert.match(rebuild, /writeSessionListProjectionDocuments/, 'Full projection rebuild must write session list projection.')
assert.match(delta, /applySessionListProjectionDeltas/, 'Incremental sync must update session list projection.')
assert.match(sessioni, /filterReloadTimer/, 'Session filters must debounce reloads.')
assert.match(sessioni, /setTimeout\(\(\) => \{\s*void reloadFirstPage\(true\)\s*\}, 300\)/s, 'Session filters must use a 300ms debounce.')
assert.match(rules, /match \/sessionListMeta\/\{docId\}/, 'Firestore rules must allow sessionListMeta access.')
assert.match(rules, /match \/sessionListPages\/\{pageId\}/, 'Firestore rules must allow sessionListPages access.')

console.log('[SESSION_LIST_PROJECTION_BUDGET] OK')
