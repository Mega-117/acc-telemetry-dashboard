import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const nuxtRoot = path.resolve(scriptDir, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(nuxtRoot, relativePath), 'utf8')
}

const requiredFiles = [
  'app/pages/dev.vue',
  'app/pages/dev-firebase.vue',
  'app/pages/dev-rebuild.vue',
  'app/pages/dev-cleanup.vue',
  'app/pages/dev-data-audit.vue',
  'app/pages/dev-upload.vue'
]

for (const relativePath of requiredFiles) {
  const source = read(relativePath)
  assert.match(source, /definePageMeta\s*\(/, `${relativePath} must define page meta`)
  assert.match(source, /middleware:\s*['"]dev-tools['"]/, `${relativePath} must use dev-tools middleware`)
}

const middleware = read('app/middleware/dev-tools.ts')
assert.match(middleware, /canUseDevTools/, 'dev-tools middleware must use shared access helper')
assert.match(middleware, /navigateTo\(['"]\/panoramica['"]\)/, 'dev-tools middleware must redirect to panoramica')

const appVue = read('app/app.vue')
assert.match(appVue, /canUseDevTools/, 'app.vue must use shared dev tools access helper')
assert.match(appVue, /showDevFirebaseProbe/, 'DevFirebaseProbe visibility must be gated by computed access')
assert.doesNotMatch(appVue, /isDevRuntime\s*=\s*import\.meta\.dev/, 'DevFirebaseProbe must not be gated only by import.meta.dev')

const tracker = read('app/composables/useFirebaseTracker.ts')
assert.match(tracker, /canUseDevTools/, 'Firebase tracker debug API must use shared access helper')
assert.match(tracker, /typeof window !== 'undefined' && canUseDevTools\(\)/, 'window.__firebase must be gated')

const access = read('app/utils/devToolsAccess.ts')
assert.match(access, /import\.meta\.dev/, 'dev tools access must allow npm run dev')
assert.match(access, /localhost/, 'dev tools access must allow localhost')
assert.match(access, /127\.0\.0\.1/, 'dev tools access must allow 127.0.0.1')

console.log('[DEV_TOOLS_ACCESS_CHECK] OK')
