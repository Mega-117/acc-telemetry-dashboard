import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const nuxtRoot = path.resolve(scriptDir, '..')
const projectRoot = path.resolve(nuxtRoot, '..')

function read(relativePath) {
  return fs.readFileSync(path.resolve(projectRoot, relativePath), 'utf8')
}

const types = read('nuxt/app/types/overviewProjections.ts')
const gateway = read('nuxt/app/composables/useTelemetryGateway.ts')
const builder = read('nuxt/app/services/projections/buildOverviewProjection.ts')
const card = read('nuxt/app/components/cards/TrackPerformanceCard.vue')
const page = read('nuxt/app/components/pages/PanoramicaPage.vue')

for (const field of ['bestQualyGrip', 'bestRaceGrip', 'bestAvgRaceGrip']) {
  assert.ok(types.includes(`${field}: string | null`), `OverviewTrackProjection missing ${field}`)
  assert.ok(builder.includes(field), `buildOverviewProjection must propagate ${field}`)
}

for (const token of [
  'OVERVIEW_GRIP_PRIORITY',
  'OVERVIEW_GRIP_SCAN_ORDER',
  'buildOverviewBestTimesFromTrackBestDoc',
  'mergePendingOverviewBestsByTrack',
  'updateBestTimeWithGrip'
]) {
  assert.ok(gateway.includes(token), `useTelemetryGateway missing overview grip token: ${token}`)
}

assert.ok(
  gateway.includes('buildOverviewBestTimesFromTrackBestDoc(bestDocs[index], \'GT3\')'),
  'getOverviewProjection must use all-grip overview best selection'
)

assert.equal(
  /buildBestTimesFromTrackBestDoc\(bestDocs\[index\], 'GT3', 'Optimum'\)/.test(gateway),
  false,
  'Panoramica must not be locked to Optimum grip'
)

for (const token of [
  'bestQualyGrip?: string | null',
  'bestRaceGrip?: string | null',
  'avgTimeGrip?: string | null',
  'BEST AVG',
  'grip-badge',
  'OPT',
  'GRS'
]) {
  assert.ok(card.includes(token), `TrackPerformanceCard missing grip badge token: ${token}`)
}

for (const token of [
  ':best-qualy-grip="lastTrackBestQualyGrip"',
  ':best-race-grip="lastTrackBestRaceGrip"',
  ':avg-time-grip="lastTrackAvgTimeGrip"',
  ':best-qualy-grip="prevTrackBestQualyGrip"',
  ':best-race-grip="prevTrackBestRaceGrip"',
  ':avg-time-grip="prevTrackAvgTimeGrip"'
]) {
  assert.ok(page.includes(token), `PanoramicaPage missing card binding: ${token}`)
}

console.log('[OVERVIEW_GRIP_BADGES] OK')
