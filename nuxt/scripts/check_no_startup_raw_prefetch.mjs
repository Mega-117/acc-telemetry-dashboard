import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const nuxtRoot = path.resolve(scriptDir, '..')
const appVue = fs.readFileSync(path.join(nuxtRoot, 'app/app.vue'), 'utf8')

assert.ok(
  !appVue.includes('getOverviewSnapshot('),
  'app.vue must not call getOverviewSnapshot during dashboard startup'
)

assert.ok(
  !appVue.includes('prefetchAllTrackBests'),
  'app.vue must not prefetch all trackBests during dashboard startup'
)

assert.ok(
  !appVue.includes('app.dashboard.prefetch'),
  'app.vue must not use the legacy app.dashboard.prefetch scenario'
)

assert.match(
  appVue,
  /app\.dashboard\.maintenanceGate/,
  'app.vue should keep only the lightweight dashboard maintenance gate scenario'
)

console.log('[NO_STARTUP_RAW_PREFETCH_CHECK] OK')
