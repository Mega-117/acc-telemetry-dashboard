import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const nuxtRoot = path.resolve(scriptDir, '..')

const sessionDetailSource = fs.readFileSync(
  path.join(nuxtRoot, 'app/components/pages/SessionDetailPage.vue'),
  'utf8'
)
const telemetrySource = fs.readFileSync(
  path.join(nuxtRoot, 'app/composables/useTelemetryData.ts'),
  'utf8'
)

assert.match(
  sessionDetailSource,
  /selectedStint\.value\?\.type === 'R'\s*\?\s*selectedStint\.value\?\.fuelStart \?\? null\s*:\s*null/,
  'Session Detail must pass stint fuelStart, not best-lap fuel, to getTheoreticalTimes for race stints.'
)

assert.match(
  telemetrySource,
  /const stintReferenceFuelBucket = getRaceFuelBucket\(stintFuelStart\)/,
  'getTheoreticalTimes must derive the race reference bucket from stintFuelStart.'
)

assert.match(
  telemetrySource,
  /const raceReference = resolveRaceReference\(bests, stintReferenceFuelBucket\)/,
  'Race BEST theoretical reference must use the stint starting fuel bucket.'
)

assert.match(
  telemetrySource,
  /const avgRaceReference = resolveAvgRaceReference\(bests, stintReferenceFuelBucket\)/,
  'Race AVG theoretical reference must use the same stint starting fuel bucket.'
)

assert.match(
  telemetrySource,
  /theoQualy: applyTempAdjustment\(bests\.bestQualy, bests\.bestQualyTemp\)/,
  'Qualifying theoretical reference must remain bestQualy with temperature adjustment.'
)

assert.match(
  sessionDetailSource,
  /selectedStint\?\.type === 'Q' \? '—' : \(theoreticalTimes\.theoAvgRace/,
  'Qualifying AVG theoretical must remain disabled.'
)

assert.match(
  sessionDetailSource,
  /data-testid="stint-reference-fuel"/,
  'Race stint UI must expose the fuel-start reference label.'
)

console.log('[SESSION_DETAIL_RACE_THEORETICAL_BUCKETS] OK')
