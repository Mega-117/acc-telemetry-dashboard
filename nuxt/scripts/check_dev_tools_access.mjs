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

const hud = read('app/pages/hud.vue')
assert.match(hud, /definePageMeta\s*\(/, 'hud.vue must define page meta')
assert.match(hud, /middleware:\s*['"]hud-access['"]/, 'hud.vue must use hud-access middleware')
assert.match(hud, /<h1>HUD<\/h1>/, 'HUD page must use user-facing HUD label')
assert.doesNotMatch(hud, /middleware:\s*['"]dev-tools['"]/, 'HUD must not use dev-tools middleware')

const testHud = read('app/pages/test-hud.vue')
assert.match(testHud, /navigateTo\(['"]\/hud['"]\)/, 'test-hud.vue must redirect to /hud')
assert.doesNotMatch(testHud, /middleware:\s*['"]dev-tools['"]/, 'test-hud legacy redirect must not expose dev-tools access')

const hudMiddleware = read('app/middleware/hud-access.ts')
assert.match(hudMiddleware, /canAccessFeature\(['"]hud['"]/, 'hud-access middleware must use centralized HUD capability')
assert.doesNotMatch(hudMiddleware, /enablePilotHud|NUXT_PUBLIC_ENABLE_PILOT_HUD|useRuntimeConfig/, 'hud-access middleware must not depend on an env flag')
assert.match(hudMiddleware, /navigateTo\(['"]\/panoramica['"]\)/, 'hud-access middleware must redirect denied users to panoramica')

const featureAccess = read('app/utils/featureAccess.ts')
assert.match(featureAccess, /export function canAccessFeature/, 'feature access must expose a centralized helper')
assert.match(featureAccess, /AUTHENTICATED_APP_ROLES/, 'HUD access must be role-based for authenticated app users')
assert.doesNotMatch(featureAccess, /enablePilotHud|parsePublicFlag|NUXT_PUBLIC_ENABLE_PILOT_HUD/, 'HUD access must not depend on an env flag')

const voiceLab = read('app/pages/dev-voice-lab.vue')
assert.match(voiceLab, /definePageMeta\s*\(/, 'dev-voice-lab.vue must define page meta')
assert.doesNotMatch(voiceLab, /middleware:\s*['"]dev-tools['"]/, 'Voice Lab must stay reachable for filtered reference management')
assert.match(voiceLab, /hasFullVoiceLabAccess/, 'Voice Lab must expose a full-access gate')
assert.match(voiceLab, /hasFullVoiceLabAccess\s*=\s*computed\(\(\)\s*=>\s*isAdmin\.value\)/, 'Voice Lab full access must require admin even on localhost')
assert.doesNotMatch(voiceLab, /hasFullVoiceLabAccess\s*=\s*computed\(\(\)\s*=>\s*canUseDevTools\(\)\s*\|\|\s*isAdmin\.value\)/, 'Voice Lab full access must not be granted by localhost alone')
assert.match(voiceLab, /isReferenceOnlyMode/, 'Voice Lab must expose the normal-user reference-only mode')
assert.match(voiceLab, /v-if="hasFullVoiceLabAccess"/, 'Voice Lab full tools must be conditionally hidden')
const middleware = read('app/middleware/dev-tools.ts')
assert.match(middleware, /canUseDevTools/, 'dev-tools middleware must use shared access helper')
assert.match(middleware, /navigateTo\(['"]\/panoramica['"]\)/, 'dev-tools middleware must redirect to panoramica')
// Gate admin combinato (PIP-109): localhost da solo non basta, serve il ruolo.
assert.match(middleware, /useFirebaseAuth/, 'dev-tools middleware must check auth role')
assert.match(middleware, /isAdmin/, 'dev-tools middleware must gate on admin role')

const devAccess = read('app/composables/useDevToolsAccess.ts')
assert.match(devAccess, /canUseDevTools/, 'useDevToolsAccess must combine host access helper')
assert.match(devAccess, /isAdmin/, 'useDevToolsAccess must combine admin role')

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
