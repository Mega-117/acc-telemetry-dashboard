import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const nuxtRoot = path.resolve(scriptDir, '..')
const appVue = fs.readFileSync(path.join(nuxtRoot, 'app/app.vue'), 'utf8')
const overviewPage = fs.readFileSync(path.join(nuxtRoot, 'app/components/pages/PanoramicaPage.vue'), 'utf8')
const forbiddenSecondarySnapshotFiles = [
  'app/components/ui/SessionPickerModal.vue',
  'app/components/electron/ElectronTitlebar.vue'
]

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

assert.doesNotMatch(
  overviewPage,
  /Promise\.all\(\[\s*telemetryGateway\.getOverviewProjection[\s\S]*telemetryGateway\.getOverviewSnapshot/,
  'Panoramica must not load projection and raw overview snapshot together on startup'
)

assert.match(
  overviewPage,
  /activityTotals/,
  'Panoramica should render recent activity from overview projection activityTotals'
)

assert.match(
  overviewPage,
  /OverviewUpcomingRacesCard\s+:user-id="targetUserId"/,
  'Panoramica should render upcoming pilot races in the former recent activity slot'
)

assert.doesNotMatch(
  overviewPage,
  /recentActivityTitle|Attivita recenti/,
  'Panoramica should not render the legacy recent activity summary block'
)

assert.doesNotMatch(
  overviewPage,
  /getOverviewSnapshot\(/,
  'Panoramica must not call the raw overview snapshot in the startup path'
)

for (const relativePath of forbiddenSecondarySnapshotFiles) {
  const source = fs.readFileSync(path.join(nuxtRoot, relativePath), 'utf8')
  assert.ok(
    !source.includes('getOverviewSnapshot('),
    `${relativePath} must not call getOverviewSnapshot; use page/projection-specific loaders instead`
  )
}

console.log('[NO_STARTUP_RAW_PREFETCH_CHECK] OK')

